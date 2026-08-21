"""
Revert the live Postgres database to the latest backup made by backup_database.py.

Usage:
    python scripts/revert_database.py

Always asks for a typed confirmation before running — this is destructive:
it drops and recreates every object in the database from the dump,
discarding anything written since the last backup.
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

BACKUP_FILE = ROOT / "db_backups" / "latest.dump"


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
    if not BACKUP_FILE.exists():
        sys.exit(f"No backup found at {BACKUP_FILE} — run backup_database.py first.")

    pg_restore = find_pg_bin("pg_restore")
    parts = dsn_parts()

    backed_at = datetime.fromtimestamp(BACKUP_FILE.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
    answer = input(
        f"This will ERASE the current '{parts['dbname']}' database and replace it with "
        f"{BACKUP_FILE} (backed up {backed_at}). Type YES to continue: "
    )
    if answer.strip() != "YES":
        sys.exit("Aborted.")

    env = os.environ.copy()
    env["PGPASSWORD"] = parts["password"]

    cmd = [
        pg_restore, "--clean", "--if-exists", "--no-owner",
        "-h", parts["host"], "-p", parts["port"], "-U", parts["user"],
        "-d", parts["dbname"], str(BACKUP_FILE),
    ]
    print(f"Restoring '{parts['dbname']}' from {BACKUP_FILE} ...")
    result = subprocess.run(cmd, env=env)
    if result.returncode != 0:
        sys.exit("pg_restore reported errors — see output above (some are harmless 'does not exist' notices on --clean).")

    print("Revert complete.")


if __name__ == "__main__":
    main()
