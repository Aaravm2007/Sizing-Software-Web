import time
from pathlib import Path

from pg import get_conn, dict_cur

PO_DOCS_DIR = Path(__file__).parent.parent / "data" / "po_documents"

_COLS = [
    "sr_no", "inquiry_code", "customer_name", "project_name", "po_no", "po_date",
    "solution", "inquiry_qty", "po_qty", "unit_price", "total_price",
    "total_qty", "balance_qty", "total_dispatch_qty", "total_pending_qty",
    "cell_used", "cells_per_rack", "total_cells_required",
    "remarks", "po_uploaded_by", "completion_date", "expected_completion_date", "days_to_complete",
    "document_filename", "rounded_off_price", "price_lost_roundoff", "terms_and_conditions",
    "created_at",
]


def init_po_db():
    PO_DOCS_DIR.mkdir(parents=True, exist_ok=True)


# ── PO CRUD ──────────────────────────────────────────────────────────────────

def list_po() -> list:
    with get_conn() as conn:
        cur = dict_cur(conn)
        cur.execute("SELECT * FROM po_tracking ORDER BY sr_no")
        return [dict(r) for r in cur.fetchall()]


def get_po(po_id: int) -> dict | None:
    with get_conn() as conn:
        cur = dict_cur(conn)
        cur.execute("SELECT * FROM po_tracking WHERE id = %s", (po_id,))
        r = cur.fetchone()
        return dict(r) if r else None


def create_po(data: dict) -> int:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COALESCE(MAX(sr_no), 0) + 1 FROM po_tracking")
        sr = cur.fetchone()[0]
        fields = {k: v for k, v in data.items() if k in _COLS and k not in ("sr_no", "id", "created_at")}
        fields["sr_no"] = sr
        fields["created_at"] = int(time.time() * 1000)
        cols = ", ".join(f'"{k}"' for k in fields)
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO po_tracking ({cols}) VALUES ({ph}) RETURNING id",
            list(fields.values()),
        )
        return cur.fetchone()[0]


def update_po(po_id: int, data: dict):
    allowed = {k: v for k, v in data.items() if k in _COLS and k not in ("id", "sr_no", "created_at")}
    if not allowed:
        return
    set_clause = ", ".join(f'"{k}" = %s' for k in allowed)
    with get_conn() as conn:
        conn.cursor().execute(
            f"UPDATE po_tracking SET {set_clause} WHERE id = %s", [*allowed.values(), po_id]
        )


def delete_po(po_id: int):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM po_tracking WHERE id = %s", (po_id,))
        cur.execute("DELETE FROM po_dispatches WHERE po_id = %s", (po_id,))


# ── DISPATCH CRUD ─────────────────────────────────────────────────────────────

def list_dispatches(po_id: int) -> list:
    with get_conn() as conn:
        cur = dict_cur(conn)
        cur.execute("SELECT * FROM po_dispatches WHERE po_id = %s ORDER BY id", (po_id,))
        return [dict(r) for r in cur.fetchall()]


def _recalc_totals(cur, po_id: int) -> dict:
    cur.execute(
        "SELECT COALESCE(SUM(dispatch_qty), 0) FROM po_dispatches WHERE po_id = %s", (po_id,)
    )
    total_disp = cur.fetchone()[0]
    cur.execute("SELECT po_qty FROM po_tracking WHERE id = %s", (po_id,))
    po_row = cur.fetchone()
    po_qty = float(po_row[0] or 0) if po_row and po_row[0] else 0
    balance = po_qty - total_disp
    cur.execute(
        "UPDATE po_tracking SET total_dispatch_qty = %s, balance_qty = %s, total_pending_qty = %s WHERE id = %s",
        (str(int(total_disp) if total_disp == int(total_disp) else total_disp),
         str(int(balance) if balance == int(balance) else balance),
         str(int(balance) if balance == int(balance) else balance),
         po_id),
    )
    return {"total_dispatch_qty": total_disp, "balance_qty": balance}


def create_dispatch(po_id: int, data: dict) -> dict:
    qty = float(data.get("dispatch_qty") or 0)
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO po_dispatches (po_id, dispatch_date, dispatch_code, dispatch_qty, created_at)"
            " VALUES (%s, %s, %s, %s, %s)",
            (po_id, data.get("dispatch_date", ""), data.get("dispatch_code", ""), qty, int(time.time() * 1000)),
        )
        return _recalc_totals(cur, po_id)


def delete_dispatch(dispatch_id: int, po_id: int) -> dict:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM po_dispatches WHERE id = %s AND po_id = %s", (dispatch_id, po_id))
        return _recalc_totals(cur, po_id)


# ── PO document helpers ───────────────────────────────────────────────────────

def set_po_document(po_id: int, stored_filename: str):
    with get_conn() as conn:
        conn.cursor().execute(
            "UPDATE po_tracking SET document_filename = %s WHERE id = %s", (stored_filename, po_id)
        )


def get_po_document_filename(po_id: int) -> str | None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT document_filename FROM po_tracking WHERE id = %s", (po_id,))
        r = cur.fetchone()
        return r[0] if r and r[0] else None
