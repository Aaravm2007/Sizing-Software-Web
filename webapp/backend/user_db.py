import re
from pathlib import Path
from fastapi import HTTPException

# These paths are legacy per-user sqlite locations, now used only as scope
# tokens: the *_db modules parse the username (and temp-vs-wizard scope) back
# out of the path tail. No files or directories are created.

_APP_DIR = Path(__file__).parent.parent.parent  # project root
_SAFE_USERNAME = re.compile(r'^[a-zA-Z0-9_-]+$')


def _sanitize_username(username: str) -> str:
    if not username or not _SAFE_USERNAME.match(username):
        raise HTTPException(status_code=400, detail="Invalid username")
    return username


def _user_dir(username: str) -> Path:
    return _APP_DIR / "data" / _sanitize_username(username)


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
