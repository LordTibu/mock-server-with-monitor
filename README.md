# Mock Server with Monitor

A self-contained mock server designed for lightweight devices such as a Raspberry Pi. It lets you define mocked routes on the fly, proxy unmatched traffic to a real backend, and monitor every request from a web dashboard that is accessible on the local network.

## Features

- **Dynamic mocks** – add, edit, or delete routes while the server is running.
- **Proxy fallback** – forward unmatched requests to a configurable upstream target.
- **Request monitor** – capture requests and responses (including proxied ones) for inspection.
- **Dashboard UI** – manage mocks and proxy settings from any device on the network.
- **Remote shutdown** – stop the server safely from the dashboard or API.

## Getting started

### Requirements

- Python 3.10+
- pip

Install the dependencies:

```bash
pip install -r requirements.txt
```

Start the server:

```bash
python -m app.main
```

By default the server listens on `0.0.0.0:8000`, making the dashboard reachable at `http://<raspberry-pi-ip>:8000/dashboard/` from any device in the same network.

## Dashboard overview

The dashboard is a single-page interface served directly by the FastAPI application.

- **Proxy settings** – set the upstream base URL used for unmatched requests.
- **Mocked routes** – view, edit, or delete existing mocks. Creating a new mock requires an HTTP method, path, status code, optional headers/body, and optional artificial delay.
- **Recent requests** – inspect the latest requests including headers and bodies for both the request and response. The table refreshes automatically every five seconds.
- **Server control** – send a shutdown signal that gracefully stops the FastAPI process.

## Management API

All management actions are exposed under the `/api` prefix.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/info` | Retrieve proxy settings and current mocks. |
| `GET` | `/api/mocks` | List all mocks. |
| `POST` | `/api/mocks` | Create a mock. |
| `PUT` | `/api/mocks/{id}` | Update a mock. |
| `DELETE` | `/api/mocks/{id}` | Delete a mock. |
| `DELETE` | `/api/mocks` | Remove all mocks. |
| `GET` | `/api/logs` | Fetch recent request logs. |
| `GET` | `/api/settings/proxy` | Get the proxy target. |
| `POST` | `/api/settings/proxy` | Set the proxy target. |
| `POST` | `/api/server/shutdown` | Trigger a graceful shutdown. |

Mock identifiers use the format `METHOD::/path`. When calling update or delete endpoints, URL-encode the identifier (the dashboard handles this automatically).

> **Note**
> Paths that start with `/api` are reserved for the management API and cannot be mocked.

## Request handling

1. Incoming HTTP requests are matched against defined mocks using the HTTP method and exact path.
2. If a mock exists, the stored response (with optional delay) is returned.
3. If no mock matches and a proxy target is configured, the request is forwarded to that target and the response is relayed back.
4. Every interaction—mocked or proxied—is logged and visible from the dashboard.

Logs are kept in memory with a default limit of 200 entries. Adjust this value inside `app/state.py` if you need a larger or smaller window.

## Graceful shutdown

The shutdown endpoint sets an internal flag that instructs the running Uvicorn server to exit. When deployed as a systemd service or supervised process on Raspberry Pi, ensure that restarting logic is in place if you need automatic restarts after shutdown.

## Development tips

- Static dashboard files live in the `frontend/` directory.
- The FastAPI application is defined in `app/main.py`. Adjust the server host/port by editing the `run()` function or by importing `run` in your own launcher.
- Extend the `MockStore` and `RequestLogStore` classes in `app/state.py` for custom persistence or advanced matching rules.

Enjoy mocking!
