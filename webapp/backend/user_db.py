import re
from pathlib import Path
from fastapi import HTTPException

_APP_DIR = Path(__file__).parent.parent.parent  # project root
_SAFE_USERNAME = re.compile(r'^[a-zA-Z0-9_-]+$')


def _sanitize_username(username: str) -> str:
    if not username or not _SAFE_USERNAME.match(username):
        raise HTTPException(status_code=400, detail="Invalid username")
    return username


def _user_dir(username: str) -> Path:
    username = _sanitize_username(username)
    d = _APP_DIR / "data" / username
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_user_sizing_db(username: str) -> str:
    return str(_user_dir(username) / "sizing.db")


def get_user_costing_db(username: str) -> str:
    return str(_user_dir(username) / "costing.db")


def get_user_temp_db(username: str) -> str:
    return str(_user_dir(username) / "temp.db")


def get_user_wizard_temp_db(username: str) -> str:
    return str(_user_dir(username) / "wizard_temp.db")


def get_user_inquiry_db(username: str) -> str:
    return str(_user_dir(username) / "inquiry.db")


def get_user_pending_db(username: str) -> str:
    return str(_user_dir(username) / "pending.db")
