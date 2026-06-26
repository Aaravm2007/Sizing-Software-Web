import os
import json
import firebase_admin
from firebase_admin import credentials, db
from pathlib import Path
from dotenv import load_dotenv

_initialized = False

def init_firebase():
    global _initialized
    if _initialized:
        return
    try:
        firebase_admin.get_app()
        _initialized = True
        return
    except ValueError:
        pass

    app_dir = Path(__file__).parent.parent.parent
    load_dotenv(app_dir / ".env")

    creds_json = os.environ.get("GOOGLE_CREDENTIALS", "")
    db_url = os.environ.get("DATABASE_URL", "https://sizing-software-default-rtdb.asia-southeast1.firebasedatabase.app")

    if not creds_json:
        raise RuntimeError("GOOGLE_CREDENTIALS env var not set — Firebase auth unavailable")

    cred = credentials.Certificate(json.loads(creds_json))
    try:
        firebase_admin.initialize_app(cred, {"databaseURL": db_url})
    except ValueError:
        pass  # already initialized (e.g. uvicorn reload)
    _initialized = True


def get_db():
    init_firebase()
    return db
