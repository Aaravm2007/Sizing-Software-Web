"""
Shared pg_dump/pg_restore plumbing used by both the manual backup scripts
(backup_database.py / revert_database.py) and the in-app auto-backup that
runs before a mass costing update.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent.parent.parent.parent


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
    raise RuntimeError(f"Could not find {exe} — install PostgreSQL client tools or add its bin/ to PATH.")


def dsn_parts() -> dict:
    dsn = os.environ.get("PG_DSN", "")
    if not dsn:
        raise RuntimeError("PG_DSN not set in .env")
    u = urlparse(dsn)
    return {
        "host": u.hostname or "localhost",
        "port": str(u.port or 5432),
        "user": u.username or "",
        "password": u.password or "",
        "dbname": (u.path or "/").lstrip("/"),
    }


def run_pg_dump(dest_path: Path) -> None:
    """Dump the live Postgres DB (custom format, no-owner) to dest_path."""
    pg_dump = find_pg_bin("pg_dump")
    parts = dsn_parts()
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["PGPASSWORD"] = parts["password"]

    cmd = [
        pg_dump, "-Fc", "--no-owner",
        "-h", parts["host"], "-p", parts["port"], "-U", parts["user"],
        "-d", parts["dbname"], "-f", str(dest_path),
    ]
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {result.stderr.strip() or result.stdout.strip()}")


def backup_for_mass_update(username: str) -> Path:
    """Timestamped, never-overwritten backup — one per mass-update call."""
    from datetime import datetime
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_user = "".join(c if c.isalnum() or c in "_-" else "_" for c in username)
    dest = ROOT / "db_backups" / "mass-update" / f"{stamp}_{safe_user}.dump"
    run_pg_dump(dest)
    return dest


def run_pg_restore(src_path: Path) -> None:
    """Restore the live Postgres DB (clean + no-owner) from src_path."""
    if not src_path.exists():
        raise RuntimeError(f"No backup found at {src_path}")
    pg_restore = find_pg_bin("pg_restore")
    parts = dsn_parts()

    env = os.environ.copy()
    env["PGPASSWORD"] = parts["password"]

    cmd = [
        pg_restore, "--clean", "--if-exists", "--no-owner",
        "-h", parts["host"], "-p", parts["port"], "-U", parts["user"],
        "-d", parts["dbname"], str(src_path),
    ]
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"pg_restore failed: {result.stderr.strip() or result.stdout.strip()}")
