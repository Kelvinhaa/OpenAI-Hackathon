import pytest


def test_health_returns_ok(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_db_test_hides_database_connection_details(client, monkeypatch):
    from backends import main

    monkeypatch.setattr(
        main,
        "test_db_connection",
        lambda: (_ for _ in ()).throw(RuntimeError("postgresql://user:secret@db.internal")),
    )

    response = client.get("/db-test")

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}
    assert "secret" not in response.text


def test_production_rate_limiter_requires_redis(monkeypatch):
    from backends import dependencies

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("REDIS_URL", raising=False)

    with pytest.raises(RuntimeError, match="REDIS_URL"):
        dependencies.rate_limit_storage_uri()
