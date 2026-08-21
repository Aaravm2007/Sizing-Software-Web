import time

from pg import get_conn, dict_cur

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
    "datasheet_name", "gad_name", "cell_certificate_name", "battery_compliance_name", "remarks", "sol_no", "type",
    "dollar_rate", "warranty_years", "quote_format", "base_partcode",
]


def init_db():
    """Schema is created by pg.init_all_tables(); kept for call-site compatibility."""


def log_export(inquiry_code: str, exported_by: str, data: dict) -> int:
    """Upsert keyed on (inquiry_code, exported_by, exported_at) — re-syncing an
    export whose data changed (e.g. sol_no relinked) overwrites the stale row
    instead of being silently ignored."""
    allowed = [k for k in _DATA_COLS if k in data]
    ts = data.get("exported_at") or int(time.time() * 1000)
    cols = ["inquiry_code", "exported_by", "exported_at"] + allowed
    vals = [inquiry_code, exported_by, ts] + [
        v if v is None or isinstance(v, str) else str(v)
        for v in (data[k] for k in allowed)
    ]
    cols_sql = ", ".join(f'"{c}"' for c in cols)
    ph = ", ".join(["%s"] * len(vals))
    update_sql = ", ".join(f'"{k}" = excluded."{k}"' for k in allowed)
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""INSERT INTO export_history ({cols_sql}) VALUES ({ph})
                ON CONFLICT (inquiry_code, exported_by, exported_at)
                DO UPDATE SET {update_sql}
                RETURNING id""" if allowed else
            f"""INSERT INTO export_history ({cols_sql}) VALUES ({ph})
                ON CONFLICT (inquiry_code, exported_by, exported_at) DO NOTHING
                RETURNING id""",
            vals,
        )
        row = cur.fetchone()
        return row[0] if row else 0


def delete_export(inquiry_code: str, exported_by: str, exported_at: int):
    with get_conn() as conn:
        conn.cursor().execute(
            "DELETE FROM export_history WHERE inquiry_code = %s AND exported_by = %s AND exported_at = %s",
            (inquiry_code, exported_by, exported_at),
        )


def list_by_code(inquiry_code: str) -> list:
    with get_conn() as conn:
        cur = dict_cur(conn)
        cur.execute(
            "SELECT * FROM export_history WHERE inquiry_code = %s ORDER BY exported_at DESC",
            (inquiry_code,),
        )
        return [dict(r) for r in cur.fetchall()]


_BUCKET = {
    "quote_word": "Quote", "quote_pdf": "Quote",
    "sizing_excel": "Sizing", "sizing_pdf": "Sizing",
    "datasheet": "Datasheet",
    "gad": "GAD",
    "cell_certificate": "Cell Certificate",
    "battery_compliance": "Battery Compliance",
}
_LABEL_ORDER = ["Quote", "Sizing", "Datasheet", "GAD", "Cell Certificate", "Battery Compliance"]


def export_summary_global() -> dict:
    """Return {inquiry_code: [label, ...]} aggregated across all users."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT inquiry_code, export_type FROM export_history")
        rows = cur.fetchall()
    seen: dict[str, set] = {}
    for code, export_type in rows:
        label = _BUCKET.get(export_type)
        if code and label:
            seen.setdefault(code, set()).add(label)
    return {
        code: [l for l in _LABEL_ORDER if l in labels]
        for code, labels in seen.items()
    }
