"""Regression coverage for the local development CORS allowlist.

The frontend dev server is pinned to port 3004 (port 3000 is commonly taken by
another checkout). When that origin is missing from the committed allowlist the
browser blocks the response, `fetch` rejects with "Failed to fetch", and the UI
reports it as an unreachable backend -- so the symptom points at the server
while the cause is this list.
"""

import pytest

LOCAL_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3004",
    "http://127.0.0.1:3004",
]


@pytest.mark.parametrize("origin", LOCAL_DEV_ORIGINS)
def test_preflight_allows_local_dev_origin(client, origin):
    response = client.options(
        "/study",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize("origin", LOCAL_DEV_ORIGINS)
def test_actual_response_carries_allow_origin(client, origin):
    """Preflight alone is not enough -- the real response needs the header too.

    Uses the unlimited GET collection rather than POST /study: the limiter holds
    one in-memory counter for the whole app, so spending the POST budget here
    would 429 unrelated tests that run afterwards.
    """
    response = client.get("/study", headers={"Origin": origin})

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin


def test_preflight_rejects_unknown_origin():
    """The allowlist must stay a list -- never a wildcard echo."""
    from backends.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as unauthenticated_client:
        response = unauthenticated_client.options(
            "/study",
            headers={
                "Origin": "http://evil.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.headers.get("access-control-allow-origin") is None
