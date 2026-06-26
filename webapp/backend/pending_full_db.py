import sqlite3
import time
from pathlib import Path

_DB = str(Path(__file__).parent.parent / "data" / "pending_full_data.db")

_CREATE = """
    CREATE TABLE IF NOT EXISTS export_history (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        inquiry_code        TEXT NOT NULL,
        exported_by         TEXT DEFAULT '',
        export_type         TEXT DEFAULT '',
        exported_at         INTEGER,
        ups_make            TEXT DEFAULT '',
        ups_model           TEXT DEFAULT '',
        ups_kva             TEXT DEFAULT '',
        actual_load_kva     TEXT DEFAULT '',
        load_kw             TEXT DEFAULT '',
        power_factor        TEXT DEFAULT '',
        inverter_efficiency TEXT DEFAULT '',
        dc_voltage          TEXT DEFAULT '',
        backup_min          TEXT DEFAULT '',
        cell_chemistry      TEXT DEFAULT '',
        ageing_pct          TEXT DEFAULT '',
        design_margin_pct   TEXT DEFAULT '',
        dod_margin_pct      TEXT DEFAULT '',
        derating_pct        TEXT DEFAULT '',
        capacity_ah         TEXT DEFAULT '',
        part_code           TEXT DEFAULT '',
        cell_type           TEXT DEFAULT '',
        ageing_type         TEXT DEFAULT '',
        backup_time_min     TEXT DEFAULT '',
        centre_tap          TEXT DEFAULT '',
        quote_code          TEXT DEFAULT '',
        qty_system          TEXT DEFAULT '',
        rate_system         TEXT DEFAULT '',
        price_system        TEXT DEFAULT '',
        sales_person        TEXT DEFAULT '',
        solution_provider   TEXT DEFAULT '',
        project_customer    TEXT DEFAULT '',
        rack_dim            TEXT DEFAULT '',
        qty                 TEXT DEFAULT '',
        per_rack_price      TEXT DEFAULT '',
        price               TEXT DEFAULT '',
        rack1_dim           TEXT DEFAULT '',
        rack1_qty           TEXT DEFAULT '',
        rack1_rate          TEXT DEFAULT '',
        rack1_price         TEXT DEFAULT '',
        rack2_dim           TEXT DEFAULT '',
        rack2_qty           TEXT DEFAULT '',
        rack2_rate          TEXT DEFAULT '',
        rack2_price         TEXT DEFAULT '',
        custom_cost_desc    TEXT DEFAULT '',
        custom_cost_price   TEXT DEFAULT '',
        cc1_desc            TEXT DEFAULT '',
        cc1_price           TEXT DEFAULT '',
        cc2_desc            TEXT DEFAULT '',
        cc2_price           TEXT DEFAULT '',
        cc3_desc            TEXT DEFAULT '',
        cc3_price           TEXT DEFAULT '',
        cc4_desc            TEXT DEFAULT '',
        cc4_price           TEXT DEFAULT '',
        cc5_desc            TEXT DEFAULT '',
        cc5_price           TEXT DEFAULT '',
        submission_date     TEXT DEFAULT '',
        submitted_to        TEXT DEFAULT '',
        datasheet_name      TEXT DEFAULT '',
        gad_name            TEXT DEFAULT '',
        remarks             TEXT DEFAULT '',
        sol_no              TEXT DEFAULT '',
        type                TEXT DEFAULT '',
        dollar_rate         TEXT DEFAULT '',
        warranty_years      TEXT DEFAULT '5',
        quote_format        TEXT DEFAULT '',
        base_partcode       TEXT DEFAULT '',
        UNIQUE(inquiry_code, exported_by, exported_at)
    )
"""

_INDEX = "CREATE INDEX IF NOT EXISTS idx_inquiry_code ON export_history(inquiry_code)"

_DATA_COLS = [
    "export_type", "ups_make", "ups_model", "ups_kva", "actual_load_kva",
    "load_kw", "power_factor", "inverter_efficiency", "dc_voltage", "backup_min",
    "cell_chemistry", "ageing_pct", "design_margin_pct", "dod_margin_pct",
    "derating_pct", "capacity_ah", "part_code", "cell_type", "ageing_type",
    "backup_time_min", "centre_tap", "quote_code", "qty_system", "rate_system",
    "price_system", "sales_person", "solution_provider", "project_customer",
    "rack_dim", "qty", "per_rack_price", "price",
    "rack1_dim", "rack1_qty", "rack1_rate", "rack1_price",
    "rack2_dim", "rack2_qty", "rack2_rate", "rack2_price",
    "custom_cost_desc", "custom_cost_price",
    "cc1_desc", "cc1_price",
    "cc2_desc", "cc2_price",
    "cc3_desc", "cc3_price",
    "cc4_desc", "cc4_price",
    "cc5_desc", "cc5_price",
    "submission_date", "submitted_to",
    "datasheet_name", "gad_name", "remarks", "sol_no", "type",
    "dollar_rate", "warranty_years", "quote_format", "base_partcode",
]


def _conn():
    Path(_DB).parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(_DB)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


def init_db():
    with _conn() as c:
        c.execute(_CREATE)
        c.execute(_INDEX)
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
                c.execute(f'ALTER TABLE export_history ADD COLUMN "{col}" TEXT DEFAULT \'\'')
            except Exception:
                pass


def log_export(inquiry_code: str, exported_by: str, data: dict) -> int:
    allowed = [k for k in _DATA_COLS if k in data]
    ts = int(time.time() * 1000)
    cols = ["inquiry_code", "exported_by", "exported_at"] + allowed
    vals = [inquiry_code, exported_by, ts] + [data[k] for k in allowed]
    cols_sql = ", ".join(cols)
    ph = ", ".join("?" * len(vals))
    with _conn() as c:
        cur = c.execute(
            f"INSERT OR IGNORE INTO export_history ({cols_sql}) VALUES ({ph})",
            vals,
        )
        return cur.lastrowid


def list_by_code(inquiry_code: str) -> list:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM export_history WHERE inquiry_code = ? ORDER BY exported_at DESC",
            (inquiry_code,),
        ).fetchall()
    return [dict(r) for r in rows]


_BUCKET = {
    "quote_word": "Quote", "quote_pdf": "Quote",
    "sizing_excel": "Sizing", "sizing_pdf": "Sizing",
    "datasheet": "Datasheet",
    "gad": "GAD",
}
_LABEL_ORDER = ["Quote", "Sizing", "Datasheet", "GAD"]


def export_summary_global() -> dict:
    """Return {inquiry_code: [label, ...]} aggregated across all users."""
    with _conn() as c:
        rows = c.execute("SELECT inquiry_code, export_type FROM export_history").fetchall()
    seen: dict[str, set] = {}
    for r in rows:
        code = r["inquiry_code"]
        label = _BUCKET.get(r["export_type"])
        if code and label:
            seen.setdefault(code, set()).add(label)
    return {
        code: [l for l in _LABEL_ORDER if l in labels]
        for code, labels in seen.items()
    }
