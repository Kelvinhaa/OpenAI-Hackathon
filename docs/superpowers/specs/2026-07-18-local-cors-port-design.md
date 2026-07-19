# Local CORS Port Design

## Goal

Allow the local frontend at `http://127.0.0.1:3004` to call the FastAPI study endpoints without a browser CORS failure.

## Scope

Add `http://127.0.0.1:3004` to the backend's default CORS allowlist. Preserve the existing environment-driven `CORS_ORIGINS` override and all production origins. Do not widen the policy to every local port.

## Technical Design

The FastAPI app will continue deriving its allowlist from `CORS_ORIGINS`, falling back to the checked-in comma-separated default. The default will include the frontend's current origin alongside the existing `localhost` and port-3000/5500 origins.

The same change must be present in the active backend checkout before restarting its Uvicorn process. This is necessary because the active server currently runs from `~/Personal_Project/Mindmappr/backend`, rather than this workspace.

## Validation

Add a regression test asserting that a preflight request from `http://127.0.0.1:3004` receives a successful response and its matching `Access-Control-Allow-Origin` header. After restarting the active backend, repeat the live preflight and submit the study form from the local frontend.
