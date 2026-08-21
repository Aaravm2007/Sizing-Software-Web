import time
from pathlib import Path

from pg import get_conn, dict_cur

# db_path values are legacy per-user sqlite paths (data/{username}/pending.db),
# now used only as scope tokens; each legacy table-per-pending-code becomes
# rows in the shared pending_items table keyed by (username, pending_code).

# Column schema shared by every pending-item entry — mirrors the inquiry sheet
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
    "datasheet_name", "gad_name", "cell_certificate_name", "battery_compliance_name",
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

_INT_COLS = {"id", "exported_at", "parent_id"}


def _user(db_path: str) -> str:
    return Path(db_path).parent.name


def _code(pending_code: str) -> str:
    # legacy sqlite table names had '-' mapped to '_'; keep the same key shape
    # so pre-migration rows stay addressable
    return pending_code.replace("-", "_")


def _txt(v):
    return v if v is None or isinstance(v, str) else str(v)


def init_item_table(pending_code: str, db_path: str):
    """Schema is created by pg.init_all_tables(); kept for call-site compatibility."""


def log_export(pending_code: str, data: dict, db_path: str, ts: int = None) -> int:
    allowed = [k for k in data if k in _ITEM_COLS and k not in ("id", "exported_at")]
    values = [data[k] if k in _INT_COLS else _txt(data[k]) for k in allowed]
    cols = ["username", "pending_code"] + allowed + ["exported_at"]
    vals = [_user(db_path), _code(pending_code)] + values + [ts or int(time.time() * 1000)]
    cols_sql = ", ".join(f'"{c}"' for c in cols)
    ph = ", ".join(["%s"] * len(vals))
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(f'INSERT INTO pending_items ({cols_sql}) VALUES ({ph}) RETURNING id', vals)
        return cur.fetchone()[0]


def log_export_bulk(pending_code: str, entries: list, db_path: str, ts: int = None) -> list:
    ts = ts or int(time.time() * 1000)
    return [log_export(pending_code, data, db_path, ts=ts) for data in entries]


def list_exports(pending_code: str, db_path: str) -> list:
    with get_conn() as conn:
        cur = dict_cur(conn)
        cur.execute(
            "SELECT * FROM pending_items WHERE username = %s AND pending_code = %s"
            " ORDER BY exported_at DESC",
            (_user(db_path), _code(pending_code)),
        )
        rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r.pop("username", None)
        r.pop("pending_code", None)
    return rows


def update_export_sol_no(pending_code: str, export_id: int, sol_no: str, db_path: str):
    with get_conn() as conn:
        conn.cursor().execute(
            "UPDATE pending_items SET sol_no = %s"
            " WHERE username = %s AND pending_code = %s AND id = %s",
            (_txt(sol_no), _user(db_path), _code(pending_code), export_id),
        )


def update_export_parent(pending_code: str, export_id: int, parent_id: int, db_path: str):
    with get_conn() as conn:
        conn.cursor().execute(
            "UPDATE pending_items SET parent_id = %s"
            " WHERE username = %s AND pending_code = %s AND id = %s",
            (parent_id, _user(db_path), _code(pending_code), export_id),
        )


def clear_export_link(pending_code: str, export_id: int, db_path: str):
    with get_conn() as conn:
        conn.cursor().execute(
            "UPDATE pending_items SET sol_no = NULL, parent_id = NULL"
            " WHERE username = %s AND pending_code = %s AND id = %s",
            (_user(db_path), _code(pending_code), export_id),
        )


def delete_export(pending_code: str, export_id: int, db_path: str):
    with get_conn() as conn:
        conn.cursor().execute(
            "DELETE FROM pending_items WHERE username = %s AND pending_code = %s AND id = %s",
            (_user(db_path), _code(pending_code), export_id),
        )


def list_all_tables(db_path: str) -> list:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT DISTINCT pending_code FROM pending_items WHERE username = %s",
            (_user(db_path),),
        )
        return [r[0] for r in cur.fetchall()]


_BUCKET = {
    "quote_word": "Quote", "quote_pdf": "Quote",
    "sizing_excel": "Sizing", "sizing_pdf": "Sizing",
    "datasheet": "Datasheet",
    "gad": "GAD",
    "cell_certificate": "Cell Certificate",
    "battery_compliance": "Battery Compliance",
}

_LABEL_ORDER = ["Quote", "Sizing", "Datasheet", "GAD", "Cell Certificate", "Battery Compliance"]


def export_summary_all(db_path: str) -> dict:
    """Return {pending_code: [label, ...]} always in Quote→Sizing→Datasheet→GAD order."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT pending_code, export_type FROM pending_items WHERE username = %s",
            (_user(db_path),),
        )
        rows = cur.fetchall()
    seen: dict = {}
    for code, export_type in rows:
        label = _BUCKET.get(export_type)
        if label:
            seen.setdefault(code, set()).add(label)
    return {
        code: [l for l in _LABEL_ORDER if l in labels]
        for code, labels in seen.items()
        if labels
    }
