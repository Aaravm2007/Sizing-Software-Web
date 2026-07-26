import re
import time

from pg import get_conn, dict_cur

_MUTABLE = [
    "received_date", "received_time", "mail_for", "oem_dealer",
    "end_customer", "kva_rating", "quantity", "backup_time",
    "reply_to", "assigned_to", "status", "remarks", "priority", "inquiry_code",
    "submission_date", "submitted_to", "submitted_by",
]

_ORDER = "ORDER BY CASE WHEN status='completed' THEN 1 ELSE 0 END ASC, inquiry_code ASC"


def init_db(path=None):
    """Schema is created by pg.init_all_tables(); kept for call-site compatibility."""


def suggest_next_inquiry_code(path=None) -> dict:
    with get_conn() as conn:
        cur = dict_cur(conn)
        cur.execute(
            "SELECT inquiry_code FROM pending WHERE inquiry_code != '' ORDER BY id DESC LIMIT 1"
        )
        row = cur.fetchone()
    last = row["inquiry_code"] if row else ""
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
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COALESCE(MAX(sr_no), 0) + 1 FROM pending")
        sr = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO pending
               (sr_no, inquiry_code, received_date, received_time, mail_for, oem_dealer,
                end_customer, kva_rating, quantity, backup_time, reply_to,
                assigned_to, status, remarks, priority,
                submission_date, submitted_to, created_at, created_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id""",
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
        return cur.fetchone()[0]


def list_rows(path=None) -> list:
    with get_conn() as conn:
        cur = dict_cur(conn)
        cur.execute(f"SELECT * FROM pending {_ORDER}")
        return [dict(r) for r in cur.fetchall()]


def list_mine(username: str, path=None) -> list:
    with get_conn() as conn:
        cur = dict_cur(conn)
        cur.execute(f"SELECT * FROM pending WHERE assigned_to = %s {_ORDER}", (username,))
        return [dict(r) for r in cur.fetchall()]


def update_row(row_id: int, data: dict, path=None):
    fields = [k for k in data if k in _MUTABLE]
    if not fields:
        return
    sets = ", ".join(f"{f} = %s" for f in fields)
    with get_conn() as conn:
        conn.cursor().execute(
            f"UPDATE pending SET {sets} WHERE id = %s", [data[f] for f in fields] + [row_id]
        )


def delete_row(row_id: int, path=None):
    with get_conn() as conn:
        conn.cursor().execute("DELETE FROM pending WHERE id = %s", (row_id,))
