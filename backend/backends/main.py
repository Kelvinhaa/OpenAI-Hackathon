import os
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from backends.database import test_db_connection
from backends.dependencies import limiter
from backends.routers.study import router as study_router

app = FastAPI(title="Mindmappr", redirect_slashes=False)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Port 3004 is the frontend's pinned dev port (see frontend/package.json). Both
# the localhost and 127.0.0.1 spellings are listed because they are distinct
# origins to the browser, and which one is used depends on how the developer
# typed the URL. Keep this default in sync with that pinned port: a missing
# origin surfaces in the UI as "Cannot reach the server", not as a CORS error.
_DEFAULT_CORS_ORIGINS = ",".join(
    [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3004",
        "http://127.0.0.1:3004",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://open-ai-hackathon-rho.vercel.app"
    ]
)


def _parse_cors_origins() -> list[str]:
    # Supports cors origin for deployment flexibility.
    raw_origins = os.getenv("CORS_ORIGINS", _DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

origins = _parse_cors_origins()
# Controls which can call API to each other (front to backend)
app.add_middleware(
    CORSMiddleware, 
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # This kinda allow GET, POST requrests
    allow_headers=["*"]
)
app.include_router(study_router)

# RESTAPI
# HTTP Request get method
@app.get("/")
def root():
    return {"status": "AI Study Assistant running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/db-test")
def db_test():
    try:
        test_db_connection()
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        return {"status": "error", "database": str(exc)}



if __name__ == "__main__":
    # 8001, not the conventional 8000: another Mindmappr checkout on this machine
    # runs its own FastAPI backend on 8000. Sharing the port is worse than it
    # sounds -- the two trust different Supabase projects, so a frontend that
    # reaches the wrong backend gets 401 "Invalid token" on every signed-in
    # request, which reads as a login bug rather than a wiring one.
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)