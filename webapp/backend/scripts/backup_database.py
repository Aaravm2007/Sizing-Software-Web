"""
Back up the live Postgres database to a single, always-overwritten dump file.

Usage:
    python scripts/backup_database.py

Writes db_backups/latest.dump (repo root). Re-running replaces it — this is a
single-slot backup, not a history. Restore it with revert_database.py.
"""
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
import os

ROOT = Path(__file__).parent.parent.parent.parent
load_dotenv(ROOT / ".env")

BACKUP_DIR = ROOT / "db_backups"
BACKUP_FILE = BACKUP_DIR / "latest.dump"


def find_pg_bin(name: str) -> str:
    exe = name + (".exe" if sys.platform == "win32" else "")
    found = shutil.which(exe)
    if found:
        return found
    if sys.platform == "win32":
        for d in sorted(Path("C:/Program Files/PostgreSQL").glob("*/bin")):
            candidate = d / exe
            if candidate.exists():
                return str(candidate)
    sys.exit(f"Could not find {exe} — install PostgreSQL client tools or add its bin/ to PATH.")


def dsn_parts():
    dsn = os.environ.get("PG_DSN", "")
    if not dsn:
        sys.exit("PG_DSN not set in .env")
    u = urlparse(dsn)
    return {
        "host": u.hostname or "localhost",
        "port": str(u.port or 5432),
        "user": u.username or "",
        "password": u.password or "",
        "dbname": (u.path or "/").lstrip("/"),
    }


def main():
    pg_dump = find_pg_bin("pg_dump")
    parts = dsn_parts()
    BACKUP_DIR.mkdir(exist_ok=True)

    env = os.environ.copy()
    env["PGPASSWORD"] = parts["password"]

    cmd = [
        pg_dump, "-Fc", "--no-owner",
        "-h", parts["host"], "-p", parts["port"], "-U", parts["user"],
        "-d", parts["dbname"], "-f", str(BACKUP_FILE),
    ]
    print(f"Backing up '{parts['dbname']}' -> {BACKUP_FILE} ...")
    result = subprocess.run(cmd, env=env)
    if result.returncode != 0:
        sys.exit("pg_dump failed — see output above.")

    size_mb = BACKUP_FILE.stat().st_size / (1024 * 1024)
    print(f"Backup written: {BACKUP_FILE} ({size_mb:.2f} MB) at {datetime.now():%Y-%m-%d %H:%M:%S}")


if __name__ == "__main__":
    main()
