import sqlite3
import time
from pathlib import Path

_DB = str(Path(__file__).parent.parent / "data" / "po_tracking.db")
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

_CREATE_PO = """
CREATE TABLE IF NOT EXISTS po_tracking (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    sr_no                INTEGER,
    inquiry_code         TEXT DEFAULT '',
    customer_name        TEXT DEFAULT '',
    project_name         TEXT DEFAULT '',
    po_no                TEXT DEFAULT '',
    po_date              TEXT DEFAULT '',
    solution             TEXT DEFAULT '',
    inquiry_qty          TEXT DEFAULT '',
    po_qty               TEXT DEFAULT '',
    unit_price           TEXT DEFAULT '',
    total_price          TEXT DEFAULT '',
    total_qty            TEXT DEFAULT '',
    balance_qty          TEXT DEFAULT '',
    total_dispatch_qty   TEXT DEFAULT '',
    total_pending_qty    TEXT DEFAULT '',
    cell_used            TEXT DEFAULT '',
    cells_per_rack       TEXT DEFAULT '',
    total_cells_required TEXT DEFAULT '',
    remarks              TEXT DEFAULT '',
    po_uploaded_by       TEXT DEFAULT '',
    completion_date           TEXT DEFAULT '',
    expected_completion_date  TEXT DEFAULT '',
    days_to_complete          TEXT DEFAULT '',
    document_filename         TEXT DEFAULT '',
    rounded_off_price         TEXT DEFAULT '',
    price_lost_roundoff       TEXT DEFAULT '',
    terms_and_conditions      TEXT DEFAULT '',
    created_at           INTEGER
)
"""

_CREATE_DISPATCH = """
CREATE TABLE IF NOT EXISTS po_dispatches (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id          INTEGER NOT NULL,
    dispatch_date  TEXT DEFAULT '',
    dispatch_code  TEXT DEFAULT '',
    dispatch_qty   REAL DEFAULT 0,
    created_at     INTEGER
)
"""


def _conn():
    Path(_DB).parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(_DB)
    c.row_factory = sqlite3.Row
    return c


def init_po_db():
    with _conn() as c:
        c.execute(_CREATE_PO)
        c.execute(_CREATE_DISPATCH)
        # migrate new columns on existing DBs (ignore errors if already present)
        PO_DOCS_DIR.mkdir(parents=True, exist_ok=True)
        for col in ["inquiry_code", "inquiry_qty", "expected_completion_date", "dispatch_no", "dispatch_date",
                    "document_filename", "rounded_off_price", "price_lost_roundoff", "terms_and_conditions"]:
            try:
                c.execute(f'ALTER TABLE po_tracking ADD COLUMN "{col}" TEXT DEFAULT \'\'')
            except Exception:
                pass


def _next_sr_no(c) -> int:
    row = c.execute("SELECT MAX(sr_no) FROM po_tracking").fetchone()
    return (row[0] or 0) + 1


# ── PO CRUD ──────────────────────────────────────────────────────────────────

def list_po() -> list:
    with _conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM po_tracking ORDER BY sr_no").fetchall()]


def get_po(po_id: int) -> dict | None:
    with _conn() as c:
        r = c.execute("SELECT * FROM po_tracking WHERE id = ?", (po_id,)).fetchone()
        return dict(r) if r else None


def create_po(data: dict) -> int:
    with _conn() as c:
        sr = _next_sr_no(c)
        fields = {k: v for k, v in data.items() if k in _COLS and k not in ("sr_no", "id", "created_at")}
        fields["sr_no"] = sr
        fields["created_at"] = int(time.time() * 1000)
        cols = ", ".join(f'"{k}"' for k in fields)
        ph = ", ".join("?" * len(fields))
        cur = c.execute(f"INSERT INTO po_tracking ({cols}) VALUES ({ph})", list(fields.values()))
        return cur.lastrowid


def update_po(po_id: int, data: dict):
    allowed = {k: v for k, v in data.items() if k in _COLS and k not in ("id", "sr_no", "created_at")}
    if not allowed:
        return
    set_clause = ", ".join(f'"{k}" = ?' for k in allowed)
    with _conn() as c:
        c.execute(f"UPDATE po_tracking SET {set_clause} WHERE id = ?", [*allowed.values(), po_id])


def delete_po(po_id: int):
    with _conn() as c:
        c.execute("DELETE FROM po_tracking WHERE id = ?", (po_id,))
        c.execute("DELETE FROM po_dispatches WHERE po_id = ?", (po_id,))


# ── DISPATCH CRUD ─────────────────────────────────────────────────────────────

def list_dispatches(po_id: int) -> list:
    with _conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM po_dispatches WHERE po_id = ? ORDER BY id", (po_id,)
        ).fetchall()]


def _recalc_totals(c, po_id: int) -> dict:
    total_disp = c.execute(
        "SELECT COALESCE(SUM(dispatch_qty), 0) FROM po_dispatches WHERE po_id = ?", (po_id,)
    ).fetchone()[0]
    po_row = c.execute("SELECT po_qty FROM po_tracking WHERE id = ?", (po_id,)).fetchone()
    po_qty = float(po_row["po_qty"] or 0) if po_row and po_row["po_qty"] else 0
    balance = po_qty - total_disp
    c.execute(
        "UPDATE po_tracking SET total_dispatch_qty = ?, balance_qty = ?, total_pending_qty = ? WHERE id = ?",
        (str(int(total_disp) if total_disp == int(total_disp) else total_disp),
         str(int(balance) if balance == int(balance) else balance),
         str(int(balance) if balance == int(balance) else balance),
         po_id),
    )
    return {"total_dispatch_qty": total_disp, "balance_qty": balance}


def create_dispatch(po_id: int, data: dict) -> dict:
    qty = float(data.get("dispatch_qty") or 0)
    with _conn() as c:
        c.execute(
            "INSERT INTO po_dispatches (po_id, dispatch_date, dispatch_code, dispatch_qty, created_at) VALUES (?, ?, ?, ?, ?)",
            (po_id, data.get("dispatch_date", ""), data.get("dispatch_code", ""), qty, int(time.time() * 1000)),
        )
        return _recalc_totals(c, po_id)


def delete_dispatch(dispatch_id: int, po_id: int) -> dict:
    with _conn() as c:
        c.execute("DELETE FROM po_dispatches WHERE id = ? AND po_id = ?", (dispatch_id, po_id))
        return _recalc_totals(c, po_id)


# ── PO document helpers ───────────────────────────────────────────────────────

def set_po_document(po_id: int, stored_filename: str):
    with _conn() as c:
        c.execute("UPDATE po_tracking SET document_filename = ? WHERE id = ?", (stored_filename, po_id))


def get_po_document_filename(po_id: int) -> str | None:
    with _conn() as c:
        r = c.execute("SELECT document_filename FROM po_tracking WHERE id = ?", (po_id,)).fetchone()
        return r["document_filename"] if r and r["document_filename"] else None
