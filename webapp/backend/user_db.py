from pathlib import Path

_APP_DIR = Path(__file__).parent.parent.parent  # project root


def _user_dir(username: str) -> Path:
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
