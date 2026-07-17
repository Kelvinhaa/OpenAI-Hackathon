import os

# These values must be present before importing the app so tests never load a
# developer's local database or Supabase configuration.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SUPABASE_URL"] = "http://supabase.test"
os.environ["ANTHROPIC_API_KEY"] = "test-key"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backends.auth import get_current_user_id
from backends.database import Base, get_db
from backends.main import app

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
def client(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'mindmappr-test.db'}",
        connect_args={"check_same_thread": False},
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
