import sqlite3
import time
from pathlib import Path

# Column schema shared by every pending-item table — mirrors the inquiry sheet
_ITEM_COLS = [
    "id", "export_type", "exported_at",
    # sizing
    "ups_make", "ups_model", "ups_kva", "actual_load_kva", "load_kw",
    "power_factor", "inverter_efficiency", "dc_voltage", "backup_min",
    "cell_chemistry", "ageing_pct", "design_margin_pct", "dod_margin_pct",
    "derating_pct", "capacity_ah", "part_code", "cell_type", "ageing_type",
    "backup_time_min", "centre_tap",
    # quotation — system
    "quote_code", "qty_system", "rate_system", "price_system",
    "sales_person", "solution_provider", "project_customer",
    # quotation — rack (legacy single-field kept for old rows)
    "rack_dim", "qty", "per_rack_price", "price",
    # quotation — rack slots
    "rack1_dim", "rack1_qty", "rack1_rate", "rack1_price",
    "rack2_dim", "rack2_qty", "rack2_rate", "rack2_price",
    # quotation — custom cost (legacy)
    "custom_cost_desc", "custom_cost_price",
    # quotation — custom cost slots
    "cc1_desc", "cc1_price",
    "cc2_desc", "cc2_price",
    "cc3_desc", "cc3_price",
    "cc4_desc", "cc4_price",
    "cc5_desc", "cc5_price",
    "submission_date", "submitted_to",
    # datasheet / gad
    "datasheet_name", "gad_name",
    # misc
    "remarks",
    # system attribution
    "sol_no",
    # inquiry type
    "type",
    # parent-child
    "parent_id",
    # warranty / dollar rate
    "dollar_rate", "warranty_years", "quote_format", "base_partcode",
]

_CREATE_SQL = """
    CREATE TABLE IF NOT EXISTS "{tbl}" (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        export_type        TEXT DEFAULT '',
        exported_at        INTEGER,
        ups_make           TEXT DEFAULT '',
        ups_model          TEXT DEFAULT '',
        ups_kva            TEXT DEFAULT '',
        actual_load_kva    TEXT DEFAULT '',
        load_kw            TEXT DEFAULT '',
        power_factor       TEXT DEFAULT '',
        inverter_efficiency TEXT DEFAULT '',
        dc_voltage         TEXT DEFAULT '',
        backup_min         TEXT DEFAULT '',
        cell_chemistry     TEXT DEFAULT '',
        ageing_pct         TEXT DEFAULT '',
        design_margin_pct  TEXT DEFAULT '',
        dod_margin_pct     TEXT DEFAULT '',
        derating_pct       TEXT DEFAULT '',
        capacity_ah        TEXT DEFAULT '',
        part_code          TEXT DEFAULT '',
        cell_type          TEXT DEFAULT '',
        ageing_type        TEXT DEFAULT '',
        backup_time_min    TEXT DEFAULT '',
        centre_tap         TEXT DEFAULT '',
        quote_code         TEXT DEFAULT '',
        qty_system         TEXT DEFAULT '',
        rate_system        TEXT DEFAULT '',
        price_system       TEXT DEFAULT '',
        sales_person       TEXT DEFAULT '',
        solution_provider  TEXT DEFAULT '',
        project_customer   TEXT DEFAULT '',
        rack_dim           TEXT DEFAULT '',
        qty                TEXT DEFAULT '',
        per_rack_price     TEXT DEFAULT '',
        price              TEXT DEFAULT '',
        rack1_dim          TEXT DEFAULT '',
        rack1_qty          TEXT DEFAULT '',
        rack1_rate         TEXT DEFAULT '',
        rack1_price        TEXT DEFAULT '',
        rack2_dim          TEXT DEFAULT '',
        rack2_qty          TEXT DEFAULT '',
        rack2_rate         TEXT DEFAULT '',
        rack2_price        TEXT DEFAULT '',
        custom_cost_desc   TEXT DEFAULT '',
        custom_cost_price  TEXT DEFAULT '',
        cc1_desc           TEXT DEFAULT '',
        cc1_price          TEXT DEFAULT '',
        cc2_desc           TEXT DEFAULT '',
        cc2_price          TEXT DEFAULT '',
        cc3_desc           TEXT DEFAULT '',
        cc3_price          TEXT DEFAULT '',
        cc4_desc           TEXT DEFAULT '',
        cc4_price          TEXT DEFAULT '',
        cc5_desc           TEXT DEFAULT '',
        cc5_price          TEXT DEFAULT '',
        submission_date    TEXT DEFAULT '',
        submitted_to       TEXT DEFAULT '',
        datasheet_name     TEXT DEFAULT '',
        gad_name           TEXT DEFAULT '',
        remarks            TEXT DEFAULT '',
        sol_no             TEXT DEFAULT '',
        type               TEXT DEFAULT '',
        parent_id          INTEGER DEFAULT NULL,
        dollar_rate        TEXT DEFAULT '',
        warranty_years     TEXT DEFAULT '5',
        quote_format       TEXT DEFAULT '',
        base_partcode      TEXT DEFAULT ''
    )
"""


def _tbl(pending_code: str) -> str:
    return pending_code.replace("-", "_")


def _conn(db_path: str):
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    return c


def init_item_table(pending_code: str, db_path: str):
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    tbl = _tbl(pending_code)
    with _conn(db_path) as c:
        c.execute(_CREATE_SQL.format(tbl=tbl))
        for col in [
            "sales_person", "solution_provider", "project_customer",
            "rack1_dim", "rack1_qty", "rack1_rate", "rack1_price",
            "rack2_dim", "rack2_qty", "rack2_rate", "rack2_price",
            "cc1_desc", "cc1_price",
            "cc2_desc", "cc2_price",
            "cc3_desc", "cc3_price",
            "cc4_desc", "cc4_price",
            "cc5_desc", "cc5_price",
            "sol_no", "type",
            "dollar_rate", "warranty_years", "quote_format", "base_partcode",
        ]:
            try:
                c.execute(f'ALTER TABLE "{tbl}" ADD COLUMN "{col}" TEXT DEFAULT \'\'')
            except Exception:
                pass
        try:
            c.execute(f'ALTER TABLE "{tbl}" ADD COLUMN parent_id INTEGER DEFAULT NULL')
        except Exception:
            pass


def log_export(pending_code: str, data: dict, db_path: str) -> int:
    init_item_table(pending_code, db_path)
    tbl = _tbl(pending_code)
    allowed = [k for k in data if k in _ITEM_COLS and k not in ("id", "exported_at")]
    allowed_with_ts = allowed + ["exported_at"]
    values = [data[k] for k in allowed] + [int(time.time() * 1000)]
    cols_sql = ", ".join(f'"{c}"' for c in allowed_with_ts)
    ph = ", ".join("?" * len(allowed_with_ts))
    with _conn(db_path) as c:
        cur = c.execute(f'INSERT INTO "{tbl}" ({cols_sql}) VALUES ({ph})', values)
        return cur.lastrowid


def log_export_bulk(pending_code: str, entries: list[dict], db_path: str) -> list[int]:
    init_item_table(pending_code, db_path)
    tbl = _tbl(pending_code)
    ts = int(time.time() * 1000)
    ids = []
    with _conn(db_path) as c:
        for data in entries:
            allowed = [k for k in data if k in _ITEM_COLS and k not in ("id", "exported_at")]
            allowed_with_ts = allowed + ["exported_at"]
            values = [data[k] for k in allowed] + [ts]
            cols_sql = ", ".join(f'"{col}"' for col in allowed_with_ts)
            ph = ", ".join("?" * len(allowed_with_ts))
            cur = c.execute(f'INSERT INTO "{tbl}" ({cols_sql}) VALUES ({ph})', values)
            ids.append(cur.lastrowid)
    return ids


def list_exports(pending_code: str, db_path: str) -> list:
    init_item_table(pending_code, db_path)
    tbl = _tbl(pending_code)
    with _conn(db_path) as c:
        return [dict(r) for r in c.execute(f'SELECT * FROM "{tbl}" ORDER BY exported_at DESC').fetchall()]


def update_export_sol_no(pending_code: str, export_id: int, sol_no: str, db_path: str):
    tbl = _tbl(pending_code)
    with _conn(db_path) as c:
        c.execute(f'UPDATE "{tbl}" SET sol_no = ? WHERE id = ?', (sol_no, export_id))


def update_export_parent(pending_code: str, export_id: int, parent_id: int, db_path: str):
    tbl = _tbl(pending_code)
    with _conn(db_path) as c:
        c.execute(f'UPDATE "{tbl}" SET parent_id = ? WHERE id = ?', (parent_id, export_id))


def clear_export_link(pending_code: str, export_id: int, db_path: str):
    tbl = _tbl(pending_code)
    with _conn(db_path) as c:
        c.execute(f'UPDATE "{tbl}" SET sol_no = NULL, parent_id = NULL WHERE id = ?', (export_id,))


def delete_export(pending_code: str, export_id: int, db_path: str):
    tbl = _tbl(pending_code)
    with _conn(db_path) as c:
        c.execute(f'DELETE FROM "{tbl}" WHERE id = ?', (export_id,))


def list_all_tables(db_path: str) -> list[str]:
    if not Path(db_path).exists():
        return []
    with _conn(db_path) as c:
        rows = c.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    return [r[0] for r in rows]


_BUCKET = {
    "quote_word": "Quote", "quote_pdf": "Quote",
    "sizing_excel": "Sizing", "sizing_pdf": "Sizing",
    "datasheet": "Datasheet",
    "gad": "GAD",
}

_LABEL_ORDER = ["Quote", "Sizing", "Datasheet", "GAD"]


def export_summary_all(db_path: str) -> dict:
    """Return {table_name: [label, ...]} always in Quote→Sizing→Datasheet→GAD order."""
    if not Path(db_path).exists():
        return {}
    with _conn(db_path) as c:
        tables = [r[0] for r in c.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()]
    result = {}
    with _conn(db_path) as c:
        for tbl in tables:
            rows = c.execute(f'SELECT export_type FROM "{tbl}"').fetchall()
            seen = {_BUCKET[r[0]] for r in rows if r[0] in _BUCKET}
            labels = [l for l in _LABEL_ORDER if l in seen]
            if labels:
                result[tbl] = labels
    return result
