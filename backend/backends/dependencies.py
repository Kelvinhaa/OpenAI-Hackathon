import os
from slowapi import Limiter
from slowapi.util import get_remote_address
from backends.database import SessionLocal

limiter = Limiter(
    key_func=get_remote_address,
    strategy="sliding-window-counter",
    storage_uri=os.getenv("REDIS_URL", "memory://"),
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()