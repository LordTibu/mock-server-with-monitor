from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import uuid
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from fastapi import HTTPException

from .models import MockCreate, MockDefinition, MockUpdate, ProxySettings, RequestLog


class MockStore:
    def __init__(self, storage_path: Optional[Path] = None) -> None:
        self._mocks: Dict[str, MockDefinition] = {}
        self._storage_path = storage_path
        if self._storage_path is not None:
            self._storage_path.parent.mkdir(parents=True, exist_ok=True)
            self._load()

    def list(self) -> List[MockDefinition]:
        return list(self._mocks.values())

    def get_by_id(self, mock_id: str) -> MockDefinition:
        if mock_id not in self._mocks:
            raise HTTPException(status_code=404, detail="Mock not found")
        return self._mocks[mock_id]

    def find_match(self, method: str, path: str) -> Optional[MockDefinition]:
        key = self._build_key(method, path)
        return self._mocks.get(key)

    def create(self, payload: MockCreate) -> MockDefinition:
        data = payload.dict()
        data["method"] = data["method"].upper()
        mock_id = self._build_key(data["method"], data["path"])
        definition = MockDefinition(id=mock_id, **data)
        self._mocks[mock_id] = definition
        self._persist()
        return definition

    def update(self, mock_id: str, payload: MockUpdate) -> MockDefinition:
        definition = self.get_by_id(mock_id)
        data = definition.dict()
        update_data = payload.dict(exclude_unset=True)
        for key, value in update_data.items():
            data[key] = value
        data["method"] = data["method"].upper()
        updated = MockDefinition(**data)
        new_id = self._build_key(updated.method, updated.path)
        if new_id != mock_id:
            self._mocks.pop(mock_id, None)
        self._mocks[new_id] = updated
        self._persist()
        return updated

    def delete(self, mock_id: str) -> None:
        self._mocks.pop(mock_id, None)
        self._persist()

    def clear(self) -> None:
        self._mocks.clear()
        self._persist()

    @staticmethod
    def _build_key(method: str, path: str) -> str:
        return f"{method.upper()}::{path}"

    def _load(self) -> None:
        if self._storage_path is None or not self._storage_path.exists():
            return
        try:
            data = json.loads(self._storage_path.read_text())
        except (json.JSONDecodeError, OSError) as error:
            logging.warning("Failed to load mocks from %s: %s", self._storage_path, error)
            return
        if not isinstance(data, list):
            logging.warning("Invalid mock storage format in %s", self._storage_path)
            return
        for item in data:
            try:
                definition = MockDefinition(**item)
            except Exception as error:  # pragma: no cover - defensive
                logging.warning("Skipping invalid mock definition in %s: %s", self._storage_path, error)
                continue
            self._mocks[definition.id] = definition

    def _persist(self) -> None:
        if self._storage_path is None:
            return
        try:
            payload: Iterable[Dict[str, object]] = (
                definition.dict()
                for definition in sorted(self._mocks.values(), key=lambda mock: mock.id)
            )
            self._storage_path.write_text(json.dumps(list(payload), indent=2))
        except OSError as error:  # pragma: no cover - defensive
            logging.error("Failed to persist mocks to %s: %s", self._storage_path, error)


class RequestLogStore:
    def __init__(self, limit: int = 200) -> None:
        self._limit = limit
        self._entries: List[RequestLog] = []
        self._lock = asyncio.Lock()

    async def add(
        self,
        method: str,
        path: str,
        status_code: int,
        source: str,
        request_headers: Dict[str, str],
        request_body: Optional[str],
        response_headers: Dict[str, str],
        response_body: Optional[str],
    ) -> RequestLog:
        async with self._lock:
            entry = RequestLog(
                id=str(uuid.uuid4()),
                timestamp=dt.datetime.utcnow(),
                method=method,
                path=path,
                status_code=status_code,
                source=source,
                request_headers=request_headers,
                request_body=request_body,
                response_headers=response_headers,
                response_body=response_body,
            )
            self._entries.append(entry)
            if len(self._entries) > self._limit:
                self._entries = self._entries[-self._limit :]
            return entry

    async def list(self) -> List[RequestLog]:
        async with self._lock:
            return list(reversed(self._entries))


class ServerState:
    def __init__(self, storage_dir: Optional[Path] = None) -> None:
        self._storage_dir = storage_dir or Path("data")
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._proxy_settings_path = self._storage_dir / "proxy_settings.json"

        self.mocks = MockStore(self._storage_dir / "mocks.json")
        self.logs = RequestLogStore()
        self.proxy_settings = self._load_proxy_settings()
        self.shutdown_event: Optional[asyncio.Event] = None

    def set_shutdown_event(self, event: asyncio.Event) -> None:
        self.shutdown_event = event

    async def request_shutdown(self) -> None:
        if self.shutdown_event is None:
            raise HTTPException(status_code=500, detail="Shutdown event not configured")
        self.shutdown_event.set()

    def update_proxy_settings(self, payload: ProxySettings) -> ProxySettings:
        self.proxy_settings = payload
        self._persist_proxy_settings()
        return self.proxy_settings

    def _load_proxy_settings(self) -> ProxySettings:
        if not self._proxy_settings_path.exists():
            return ProxySettings()
        try:
            data = json.loads(self._proxy_settings_path.read_text())
        except (json.JSONDecodeError, OSError) as error:
            logging.warning(
                "Failed to load proxy settings from %s: %s", self._proxy_settings_path, error
            )
            return ProxySettings()
        try:
            return ProxySettings(**data)
        except Exception as error:  # pragma: no cover - defensive
            logging.warning(
                "Invalid proxy settings in %s. Using defaults. Error: %s",
                self._proxy_settings_path,
                error,
            )
            return ProxySettings()

    def _persist_proxy_settings(self) -> None:
        try:
            self._proxy_settings_path.write_text(
                json.dumps(self.proxy_settings.dict(), indent=2)
            )
        except OSError as error:  # pragma: no cover - defensive
            logging.error(
                "Failed to persist proxy settings to %s: %s",
                self._proxy_settings_path,
                error,
            )
