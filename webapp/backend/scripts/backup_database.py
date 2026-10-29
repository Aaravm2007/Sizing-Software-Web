"""
Back up the live Postgres database to a single, always-overwritten dump file.

Usage:
    python scripts/backup_database.py

Writes db_backups/latest.dump (repo root). Re-running replaces it — this is a
single-slot backup, not a history. Restore it with revert_database.py.
"""
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

from backup_utils import ROOT, run_pg_dump

load_dotenv(ROOT / ".env")

BACKUP_FILE = ROOT / "db_backups" / "latest.dump"


def main():
    print(f"Backing up -> {BACKUP_FILE} ...")
    try:
        run_pg_dump(BACKUP_FILE)
    except RuntimeError as e:
        sys.exit(str(e))

    size_mb = BACKUP_FILE.stat().st_size / (1024 * 1024)
    print(f"Backup written: {BACKUP_FILE} ({size_mb:.2f} MB) at {datetime.now():%Y-%m-%d %H:%M:%S}")


if __name__ == "__main__":
    main()
