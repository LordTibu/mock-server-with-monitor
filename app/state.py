from __future__ import annotations

import asyncio
import datetime as dt
import uuid
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException

from .models import MockCreate, MockDefinition, MockUpdate, ProxySettings, RequestLog


class MockStore:
    def __init__(self) -> None:
        self._mocks: Dict[str, MockDefinition] = {}

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
        return updated

    def delete(self, mock_id: str) -> None:
        self._mocks.pop(mock_id, None)

    def clear(self) -> None:
        self._mocks.clear()

    @staticmethod
    def _build_key(method: str, path: str) -> str:
        return f"{method.upper()}::{path}"


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
    def __init__(self) -> None:
        self.mocks = MockStore()
        self.logs = RequestLogStore()
        self.proxy_settings = ProxySettings()
        self.shutdown_event: Optional[asyncio.Event] = None

    def set_shutdown_event(self, event: asyncio.Event) -> None:
        self.shutdown_event = event

    async def request_shutdown(self) -> None:
        if self.shutdown_event is None:
            raise HTTPException(status_code=500, detail="Shutdown event not configured")
        self.shutdown_event.set()
