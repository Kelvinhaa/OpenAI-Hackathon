import os
from slowapi import Limiter
from slowapi.util import get_remote_address
from backends.database import SessionLocal


def rate_limit_storage_uri() -> str:
    redis_url = os.getenv("REDIS_URL", "").strip()
    if redis_url:
        return redis_url

    if os.getenv("APP_ENV", "development").lower() in {"prod", "production"}:
        raise RuntimeError("REDIS_URL must be configured when APP_ENV is production")

    return "memory://"


limiter = Limiter(
    key_func=get_remote_address,
    strategy="sliding-window-counter",
    storage_uri=rate_limit_storage_uri(),
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
