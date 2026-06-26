import re
import sqlite3
import time
from pathlib import Path

_DB_PATH = str(Path(__file__).parent.parent.parent / "data" / "pending-global.db")

_MUTABLE = [
    "received_date", "received_time", "mail_for", "oem_dealer",
    "end_customer", "kva_rating", "quantity", "backup_time",
    "reply_to", "assigned_to", "status", "remarks", "priority", "inquiry_code",
    "submission_date", "submitted_to", "submitted_by",
]


def _conn(path=None):
    c = sqlite3.connect(path or _DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db(path=None):
    with _conn(path) as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS pending (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                sr_no         INTEGER,
                inquiry_code    TEXT DEFAULT '',
                received_date TEXT DEFAULT '',
                received_time TEXT DEFAULT '',
                mail_for      TEXT DEFAULT '',
                oem_dealer    TEXT DEFAULT '',
                end_customer  TEXT DEFAULT '',
                kva_rating    TEXT DEFAULT '',
                quantity      TEXT DEFAULT '',
                backup_time   TEXT DEFAULT '',
                reply_to      TEXT DEFAULT '',
                assigned_to   TEXT DEFAULT '',
                status           TEXT DEFAULT 'pending',
                remarks          TEXT DEFAULT '',
                priority         TEXT DEFAULT 'relaxed',
                submission_date  TEXT DEFAULT '',
                submitted_to     TEXT DEFAULT '',
                submitted_by     TEXT DEFAULT '',
                created_at       INTEGER,
                created_by       TEXT DEFAULT ''
            )
        """)
        for col, default in [
            ("remarks", "''"), ("priority", "'relaxed'"),
            ("inquiry_code", "''"),
            ("submission_date", "''"), ("submitted_to", "''"), ("submitted_by", "''"),
        ]:
            try:
                c.execute(f"ALTER TABLE pending ADD COLUMN {col} TEXT DEFAULT {default}")
            except Exception:
                pass


def _next_sr(path=None) -> int:
    with _conn(path) as c:
        row = c.execute("SELECT MAX(sr_no) FROM pending").fetchone()
        return (row[0] or 0) + 1


def suggest_next_inquiry_code(path=None) -> dict:
    init_db(path)
    with _conn(path) as c:
        rows = c.execute(
            "SELECT inquiry_code FROM pending WHERE inquiry_code != '' ORDER BY id DESC LIMIT 1"
        ).fetchone()
    last = dict(rows)["inquiry_code"] if rows else ""
    if not last:
        return {"last": "", "suggestion": ""}
    m = re.match(r"^(.*?)(\d+)$", last)
    if m:
        prefix, num = m.group(1), m.group(2)
        suggestion = f"{prefix}{str(int(num) + 1).zfill(len(num))}"
    else:
        suggestion = last + "1"
    return {"last": last, "suggestion": suggestion}


def push_row(data: dict, username: str, path=None) -> int:
    init_db(path)
    sr = _next_sr(path)
    with _conn(path) as c:
        cur = c.execute(
            """INSERT INTO pending
               (sr_no, inquiry_code, received_date, received_time, mail_for, oem_dealer,
                end_customer, kva_rating, quantity, backup_time, reply_to,
                assigned_to, status, remarks, priority,
                submission_date, submitted_to, created_at, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                sr,
                data.get("inquiry_code", ""),
                data.get("received_date", ""),
                data.get("received_time", ""),
                data.get("mail_for", ""),
                data.get("oem_dealer", ""),
                data.get("end_customer", ""),
                data.get("kva_rating", ""),
                data.get("quantity", ""),
                data.get("backup_time", ""),
                data.get("reply_to", ""),
                data.get("assigned_to", ""),
                data.get("status", "pending"),
                data.get("remarks", ""),
                data.get("priority", "relaxed"),
                data.get("submission_date", ""),
                data.get("submitted_to", ""),
                int(time.time() * 1000),
                username,
            ),
        )
        return cur.lastrowid


def list_rows(path=None) -> list:
    init_db(path)
    with _conn(path) as c:
        return [dict(r) for r in c.execute("SELECT * FROM pending ORDER BY sr_no").fetchall()]


def list_mine(username: str, path=None) -> list:
    init_db(path)
    with _conn(path) as c:
        return [
            dict(r) for r in c.execute(
                "SELECT * FROM pending WHERE assigned_to = ? ORDER BY sr_no", (username,)
            ).fetchall()
        ]


def update_row(row_id: int, data: dict, path=None):
    init_db(path)
    fields = [k for k in data if k in _MUTABLE]
    if not fields:
        return
    sets = ", ".join(f"{f} = ?" for f in fields)
    with _conn(path) as c:
        c.execute(f"UPDATE pending SET {sets} WHERE id = ?", [data[f] for f in fields] + [row_id])


def delete_row(row_id: int, path=None):
    init_db(path)
    with _conn(path) as c:
        c.execute("DELETE FROM pending WHERE id = ?", (row_id,))
