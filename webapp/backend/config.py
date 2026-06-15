import os
from pathlib import Path
from pydantic_settings import BaseSettings

APP_DIR = Path(__file__).parent.parent.parent  # Sizing-Software-Final - Copy/

class Settings(BaseSettings):
    # DB paths
    SIZING_DB: str = str(APP_DIR / "sizing.db")
    COSTING_DB: str = str(APP_DIR / "costing.db")
    TEMP_DB: str = str(APP_DIR / "temp.db")
    EMAIL_DB: str = str(APP_DIR / "email.db")

    # JWT — must be set via env var in production (generate: python -c "import secrets; print(secrets.token_hex(32))")
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Admin account — set via env vars, never hardcode
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = ""

    # Firebase
    FIREBASE_API_KEY: str = ""
    DATABASE_URL: str = "https://sizing-software-default-rtdb.asia-southeast1.firebasedatabase.app"

    # CORS — set FRONTEND_URL to Vercel domain in production
    # Add comma-separated extra origins in EXTRA_CORS_ORIGINS for dev (e.g. http://localhost:3000)
    FRONTEND_URL: str = "http://localhost:3000"
    EXTRA_CORS_ORIGINS: str = ""

    class Config:
        env_file = str(APP_DIR / ".env")
        extra = "ignore"

settings = Settings()

# Fail fast if critical secrets missing in non-dev environment
if not settings.SECRET_KEY:
    import sys
    print("FATAL: SECRET_KEY env var not set. Generate with: python -c \"import secrets; print(secrets.token_hex(32))\"", file=sys.stderr)
    sys.exit(1)

if not settings.ADMIN_PASSWORD:
    import sys
    print("FATAL: ADMIN_PASSWORD env var not set.", file=sys.stderr)
    sys.exit(1)
