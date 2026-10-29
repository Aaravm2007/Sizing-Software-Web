"""
Revert the live Postgres database from a backup dump file.

Usage:
    python scripts/revert_database.py                      # restores db_backups/latest.dump
    python scripts/revert_database.py path/to/some.dump     # restores a specific dump (e.g. a mass-update backup)

Always asks for a typed confirmation before running — this is destructive:
it drops and recreates every object in the database from the dump,
discarding anything written since that dump was taken.
"""
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

from backup_utils import ROOT, run_pg_restore

load_dotenv(ROOT / ".env")

DEFAULT_BACKUP_FILE = ROOT / "db_backups" / "latest.dump"


def main():
    backup_file = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BACKUP_FILE
    if not backup_file.exists():
        sys.exit(f"No backup found at {backup_file}")

    backed_at = datetime.fromtimestamp(backup_file.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
    answer = input(
        f"This will ERASE the current database and replace it with "
        f"{backup_file} (backed up {backed_at}). Type YES to continue: "
    )
    if answer.strip() != "YES":
        sys.exit("Aborted.")

    print(f"Restoring from {backup_file} ...")
    try:
        run_pg_restore(backup_file)
    except RuntimeError as e:
        sys.exit(f"{e}\n(some 'does not exist' notices from --clean are harmless)")

    print("Revert complete.")


if __name__ == "__main__":
    main()
