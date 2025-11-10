from __future__ import annotations

import datetime as dt
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class MockCreate(BaseModel):
    method: str = Field(..., description="HTTP method to mock, e.g. GET")
    path: str = Field(..., description="Exact request path to match, e.g. /api/users")
    status_code: int = Field(200, description="HTTP status code to return")
    body: str = Field("", description="Raw body returned by the mock")
    headers: Dict[str, str] = Field(default_factory=dict, description="Headers returned by the mock")
    delay_ms: int = Field(0, description="Artificial delay before responding, in milliseconds")
    content_type: Optional[str] = Field(None, description="Optional content-type override")


class MockUpdate(BaseModel):
    method: Optional[str] = None
    path: Optional[str] = None
    status_code: Optional[int] = None
    body: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    delay_ms: Optional[int] = None
    content_type: Optional[str] = None


class MockDefinition(MockCreate):
    id: str


class RequestLog(BaseModel):
    id: str
    timestamp: dt.datetime
    method: str
    path: str
    status_code: int
    source: str
    request_headers: Dict[str, str]
    request_body: Optional[str] = None
    response_headers: Dict[str, str] = Field(default_factory=dict)
    response_body: Optional[str] = None


class ProxySettings(BaseModel):
    target_url: Optional[str] = Field(
        None,
        description="Base URL used for proxying requests that do not have a mock."
    )


class ServerInfo(BaseModel):
    proxy: ProxySettings
    mocks: List[MockDefinition]
