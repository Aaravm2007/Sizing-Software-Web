import sqlite3
import time
from pathlib import Path

_DB_PATH = str(Path(__file__).parent.parent.parent / "data" / "inquiry.db")

_COLS = [
    "sr_no", "inquiry_date", "type", "sales_person", "solution_provider",
    "project_customer", "ups_make", "ups_model", "ups_kva", "actual_load_kva",
    "load_kw", "power_factor", "inverter_efficiency", "dc_voltage", "backup_min",
    "cell_chemistry", "ageing_pct", "design_margin_pct", "dod_margin_pct",
    "derating_pct", "capacity_ah", "centre_tap", "cell_type", "part_code",
    "qty_system", "rate_system", "price_system", "rack_dim", "qty",
    "per_rack_price", "price", "custom_cost_desc", "custom_cost_price",
    "datasheet", "sizing_sheet", "gad", "battery_compliance", "warranty",
    "remarks", "solution_by", "entry_by", "data_upload_by",
    "submission_date", "submitted_to", "created_at", "quote_code", "sol_no",
]


def _conn():
    c = sqlite3.connect(_DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_inquiry_db():
    col_defs = ", ".join(
        f'"{c}" {"INTEGER" if c in ("sr_no", "created_at") else "TEXT"}'
        for c in _COLS
    )
    with _conn() as c:
        c.execute(f'CREATE TABLE IF NOT EXISTS inquiry ({col_defs})')
        c.execute('CREATE TABLE IF NOT EXISTS inquiry_meta (next_id INTEGER DEFAULT 1)')
        if not c.execute('SELECT 1 FROM inquiry_meta').fetchone():
            c.execute('INSERT INTO inquiry_meta VALUES (1)')
        for col in ["quote_code", "sol_no"]:
            try:
                c.execute(f'ALTER TABLE inquiry ADD COLUMN "{col}" TEXT')
            except Exception:
                pass


def _next_sr() -> int:
    with _conn() as c:
        row = c.execute('SELECT MAX(sr_no) FROM inquiry').fetchone()
        return (row[0] or 0) + 1


def push_row(data: dict) -> str:
    init_inquiry_db()
    sr = _next_sr()
    data = {**data, "sr_no": sr, "created_at": int(time.time() * 1000)}
    cols = [k for k in data if k in _COLS]
    ph = ", ".join("?" * len(cols))
    qs = ", ".join(f'"{c}"' for c in cols)
    with _conn() as c:
        c.execute(f'INSERT INTO inquiry ({qs}) VALUES ({ph})', [data[k] for k in cols])
    return str(sr)


def list_rows() -> list:
    init_inquiry_db()
    with _conn() as c:
        rows = [dict(r) for r in c.execute('SELECT * FROM inquiry ORDER BY sr_no').fetchall()]
    for r in rows:
        r["_id"] = str(r["sr_no"])
    return rows


def update_row(sr_no: int, data: dict):
    init_inquiry_db()
    fields = [k for k in data if k in _COLS and k != "sr_no"]
    if not fields:
        return
    sets = ", ".join(f'"{f}" = ?' for f in fields)
    with _conn() as c:
        c.execute(f'UPDATE inquiry SET {sets} WHERE sr_no = ?', [data[f] for f in fields] + [sr_no])


def delete_row(sr_no: int):
    init_inquiry_db()
    with _conn() as c:
        c.execute('DELETE FROM inquiry WHERE sr_no = ?', (sr_no,))


def sync_inquiry_for_quote(quote_code: str, items: list):
    """Re-derive rack/custom fields for each system row in inquiry.
    items: list of _row_to_dict dicts ordered by sr_no ascending.
    """
    init_inquiry_db()
    system_items = [i for i in items if str(i.get("item_type", "system")) == "system"]
    rack_items   = [i for i in items if str(i.get("item_type", "")) == "rack"]
    custom_items = [i for i in items if str(i.get("item_type", "")) == "custom"]

    for sys_item in system_items:
        sol_no = str(sys_item.get("sol_no", ""))
        sys_sr = int(sys_item.get("sr_no", 0))

        # racks that appear after this system and before the next system
        next_sys_sr = min(
            (int(s.get("sr_no", 0)) for s in system_items if int(s.get("sr_no", 0)) > sys_sr),
            default=999999
        )
        my_racks = [r for r in rack_items
                    if sys_sr < int(r.get("sr_no", 0)) < next_sys_sr]
        my_customs = [r for r in custom_items
                      if sys_sr < int(r.get("sr_no", 0)) < next_sys_sr]

        # build update fields
        fields: dict = {}
        if my_racks:
            first_rack = my_racks[0]
            total_rack_price = sum(
                float(r.get("quote_price", 0)) * int(r.get("quantity", 1))
                for r in my_racks
            )
            fields["rack_dim"] = str(first_rack.get("modular_rack", ""))
            fields["qty"] = str(sum(int(r.get("quantity", 1)) for r in my_racks))
            fields["per_rack_price"] = str(first_rack.get("quote_price", ""))
            fields["price"] = str(round(total_rack_price, 2))
        else:
            fields["rack_dim"] = ""
            fields["qty"] = ""
            fields["per_rack_price"] = ""
            fields["price"] = ""

        if my_customs:
            fields["custom_cost_desc"] = " + ".join(
                str(c.get("modular_rack", "")) for c in my_customs
            )
            fields["custom_cost_price"] = str(round(
                sum(float(c.get("quote_price", 0)) * int(c.get("quantity", 1)) for c in my_customs), 2
            ))
        else:
            fields["custom_cost_desc"] = ""
            fields["custom_cost_price"] = ""

        with _conn() as conn:
            row = conn.execute(
                'SELECT sr_no FROM inquiry WHERE quote_code = ? AND sol_no = ?',
                (quote_code, sol_no)
            ).fetchone()
            if row:
                sets = ", ".join(f'"{f}" = ?' for f in fields)
                conn.execute(
                    f'UPDATE inquiry SET {sets} WHERE quote_code = ? AND sol_no = ?',
                    [fields[f] for f in fields] + [quote_code, sol_no]
                )
