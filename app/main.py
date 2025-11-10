from __future__ import annotations

import asyncio
from typing import Dict

import httpx
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .models import MockCreate, MockDefinition, MockUpdate, ProxySettings, RequestLog, ServerInfo
from .state import ServerState

ALLOWED_METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
    "HEAD",
]

state = ServerState()
app = FastAPI(title="Mock Server with Monitor")

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def configure_shutdown_event() -> None:
    if state.shutdown_event is None:
        state.set_shutdown_event(asyncio.Event())


api_router = APIRouter(prefix="/api")


@api_router.get("/mocks", response_model=list[MockDefinition])
def list_mocks() -> list[MockDefinition]:
    return state.mocks.list()


@api_router.post("/mocks", response_model=MockDefinition, status_code=201)
def create_mock(payload: MockCreate) -> MockDefinition:
    return state.mocks.create(payload)


@api_router.put("/mocks/{mock_id:path}", response_model=MockDefinition)
def update_mock(mock_id: str, payload: MockUpdate) -> MockDefinition:
    return state.mocks.update(mock_id, payload)


@api_router.delete("/mocks/{mock_id:path}", status_code=204)
def delete_mock(mock_id: str) -> Response:
    state.mocks.delete(mock_id)
    return Response(status_code=204)


@api_router.delete("/mocks", status_code=204)
def clear_mocks() -> Response:
    state.mocks.clear()
    return Response(status_code=204)


@api_router.get("/logs", response_model=list[RequestLog])
async def list_logs() -> list[RequestLog]:
    return await state.logs.list()


@api_router.get("/settings/proxy", response_model=ProxySettings)
def get_proxy_settings() -> ProxySettings:
    return state.proxy_settings


@api_router.post("/settings/proxy", response_model=ProxySettings)
def set_proxy_settings(payload: ProxySettings) -> ProxySettings:
    state.proxy_settings = payload
    return state.proxy_settings


@api_router.get("/info", response_model=ServerInfo)
def server_info() -> ServerInfo:
    return ServerInfo(proxy=state.proxy_settings, mocks=list_mocks())


@api_router.post("/server/shutdown", status_code=202)
async def shutdown_server() -> dict[str, str]:
    await state.request_shutdown()
    return {"message": "Shutdown signal sent"}


app.include_router(api_router)
app.mount("/dashboard", StaticFiles(directory="frontend", html=True), name="dashboard")


@app.get("/", include_in_schema=False)
async def root_redirect() -> Response:
    return RedirectResponse(url="/dashboard/")


@app.api_route("/{full_path:path}", methods=ALLOWED_METHODS, include_in_schema=False)
async def handle_request(full_path: str, request: Request) -> Response:
    if full_path.startswith("api/") or full_path == "api":
        raise HTTPException(status_code=404, detail="Not Found")

    method = request.method.upper()
    path = "/" + full_path if not full_path.startswith("/") else full_path

    mock = state.mocks.find_match(method, path)
    body_bytes = await request.body()
    request_body = body_bytes.decode("utf-8", errors="replace") if body_bytes else None
    request_headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in HOP_BY_HOP_HEADERS and k.lower() != "host"
    }

    if mock:
        if mock.delay_ms:
            await asyncio.sleep(mock.delay_ms / 1000)
        headers: Dict[str, str] = dict(mock.headers)
        if mock.content_type:
            headers["content-type"] = mock.content_type
        response = Response(content=mock.body, status_code=mock.status_code, headers=headers)
        await state.logs.add(
            method=method,
            path=path,
            status_code=mock.status_code,
            source="mock",
            request_headers=request_headers,
            request_body=request_body,
            response_headers=headers,
            response_body=mock.body,
        )
        return response

    proxy_target = state.proxy_settings.target_url
    if not proxy_target:
        raise HTTPException(status_code=404, detail="No mock matched and proxy not configured")

    target = proxy_target.rstrip("/")
    url = target + path
    if request.url.query:
        url = f"{url}?{request.url.query}"

    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            proxied = await client.request(
                method,
                url,
                headers=request_headers,
                content=body_bytes if body_bytes else None,
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    response_headers = {
        k: v for k, v in proxied.headers.items() if k.lower() not in HOP_BY_HOP_HEADERS
    }
    response_body = proxied.text

    await state.logs.add(
        method=method,
        path=path,
        status_code=proxied.status_code,
        source="proxy",
        request_headers=request_headers,
        request_body=request_body,
        response_headers=response_headers,
        response_body=response_body,
    )

    return Response(
        content=proxied.content,
        status_code=proxied.status_code,
        headers=response_headers,
    )


async def _serve(app: FastAPI, host: str, port: int) -> None:
    import uvicorn

    shutdown_event = state.shutdown_event
    if shutdown_event is None:
        shutdown_event = asyncio.Event()
        state.set_shutdown_event(shutdown_event)

    config = uvicorn.Config(app, host=host, port=port, log_level="info")
    server = uvicorn.Server(config)

    async def watch_shutdown() -> None:
        await shutdown_event.wait()
        server.should_exit = True

    asyncio.create_task(watch_shutdown())
    await server.serve()


def run(host: str = "0.0.0.0", port: int = 8000) -> None:
    asyncio.run(_serve(app, host, port))


if __name__ == "__main__":
    run()
