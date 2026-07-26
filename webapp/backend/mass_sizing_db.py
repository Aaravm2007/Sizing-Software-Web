import time

from pg import get_conn, dict_cur

# meta
_META_COLS = ["sr_no", "position", "created_at", "created_by", "partcode"]

# sizing inputs (mirror sizingEngine.ts's SizingInputs)
_INPUT_COLS = [
    "ups_make", "ups_model", "ups_rating_kva", "actual_load_kva", "actual_load_kw",
    "power_factor", "inverter_efficiency", "nominal_dc_voltage", "backup_requirement_min",
    "cell_chemistry", "ageing_type", "ageing_pct", "design_margin_pct", "dod_margin_pct",
    "derating_pct", "nearest_capacity_ah",
]

# sizing outputs (mirror sizingEngine.ts's SizingOutputs) — always client-calculated, stored as-is
_OUTPUT_COLS = [
    "calculated_load_kw", "number_of_cells", "max_charging_voltage", "end_cell_voltage",
    "energy_required_kwh", "capacity_required_ah", "cap_with_ageing_ah",
    "cap_with_design_margin_ah", "cap_with_dod_ah", "cap_with_derating_ah",
    "backup_time_min", "total_available_energy_kwh", "offered_battery_config",
]

_COLS = _META_COLS + _INPUT_COLS + _OUTPUT_COLS

_GLOBAL_SEARCH_COLS = ["ups_make", "ups_model", "cell_chemistry", "offered_battery_config", "partcode"]

_TEXT_COLS = {c for c in _COLS if c not in ("sr_no", "position", "created_at")}


def _clean(data: dict) -> dict:
    """Stringify values headed for TEXT columns (frontend may send numbers)."""
    return {
        k: (str(v) if k in _TEXT_COLS and v is not None and not isinstance(v, str) else v)
        for k, v in data.items()
    }


def init_mass_sizing_db(db_path=None):
    """Schema is created by pg.init_all_tables(); kept for call-site compatibility."""


def _next_position(cur) -> float:
    cur.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM mass_sizing")
    return cur.fetchone()[0]


def _build_where(search: str):
    if not search.strip():
        return "", []
    q = f"%{search.strip()}%"
    or_conds = " OR ".join(f'"{c}" ILIKE %s' for c in _GLOBAL_SEARCH_COLS)
    return f"WHERE ({or_conds})", [q] * len(_GLOBAL_SEARCH_COLS)


def list_page(page: int, limit: int, search: str, db_path=None) -> list:
    where, params = _build_where(search)
    offset = (page - 1) * limit
    sql = f'SELECT * FROM mass_sizing {where} ORDER BY position ASC, sr_no ASC LIMIT %s OFFSET %s'
    with get_conn() as conn:
        cur = dict_cur(conn)
        cur.execute(sql, params + [limit, offset])
        return [dict(r) for r in cur.fetchall()]


def count_rows(search: str, db_path=None) -> int:
    where, params = _build_where(search)
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(f'SELECT COUNT(*) FROM mass_sizing {where}', params)
        return cur.fetchone()[0]


def export_rows(search: str, db_path=None) -> list:
    where, params = _build_where(search)
    sql = f'SELECT * FROM mass_sizing {where} ORDER BY position ASC, sr_no ASC'
    with get_conn() as conn:
        cur = dict_cur(conn)
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def insert_row(data: dict, username: str, db_path=None) -> int:
    with get_conn() as conn:
        cur = conn.cursor()
        data = _clean({
            **data,
            "position": _next_position(cur),
            "created_at": time.time() * 1000,
            "created_by": username,
        })
        cols = [k for k in data if k in _COLS and k != "sr_no"]
        ph = ", ".join(["%s"] * len(cols))
        qs = ", ".join(f'"{c}"' for c in cols)
        cur.execute(
            f'INSERT INTO mass_sizing ({qs}) VALUES ({ph}) RETURNING sr_no',
            [data[k] for k in cols],
        )
        return cur.fetchone()[0]


def update_row(sr_no: int, data: dict, db_path=None):
    data = _clean(data)
    fields = [k for k in data if k in _COLS and k != "sr_no"]
    if not fields:
        return
    sets = ", ".join(f'"{f}" = %s' for f in fields)
    with get_conn() as conn:
        conn.cursor().execute(
            f'UPDATE mass_sizing SET {sets} WHERE sr_no = %s',
            [data[f] for f in fields] + [sr_no],
        )


def bulk_update_rows(updates: list, db_path=None):
    """updates: [{sr_no, ...fields}], one transaction for all of them (fill-drag / paste)."""
    with get_conn() as conn:
        cur = conn.cursor()
        for u in updates:
            sr_no = u.get("sr_no")
            if sr_no is None:
                continue
            u = _clean(u)
            fields = [k for k in u if k in _COLS and k != "sr_no"]
            if not fields:
                continue
            sets = ", ".join(f'"{f}" = %s' for f in fields)
            cur.execute(
                f'UPDATE mass_sizing SET {sets} WHERE sr_no = %s',
                [u[f] for f in fields] + [sr_no],
            )


def delete_row(sr_no: int, db_path=None):
    with get_conn() as conn:
        conn.cursor().execute('DELETE FROM mass_sizing WHERE sr_no = %s', (sr_no,))


def duplicate_row(sr_no: int, username: str, db_path=None) -> int:
    """Clone a row, inserting it directly after the original in display order."""
    with get_conn() as conn:
        cur = dict_cur(conn)
        cur.execute('SELECT * FROM mass_sizing WHERE sr_no = %s', (sr_no,))
        src = cur.fetchone()
        if not src:
            raise ValueError("Row not found")
        src = dict(src)
        cur.execute(
            'SELECT position FROM mass_sizing WHERE position > %s ORDER BY position ASC LIMIT 1',
            (src["position"],),
        )
        next_row = cur.fetchone()
        new_position = (src["position"] + next_row["position"]) / 2 if next_row else src["position"] + 1

        data = {k: v for k, v in src.items() if k in _COLS and k not in ("sr_no", "position", "created_at", "created_by")}
        data["position"] = new_position
        data["created_at"] = time.time() * 1000
        data["created_by"] = username
        cols = list(data.keys())
        ph = ", ".join(["%s"] * len(cols))
        qs = ", ".join(f'"{col}"' for col in cols)
        cur.execute(
            f'INSERT INTO mass_sizing ({qs}) VALUES ({ph}) RETURNING sr_no',
            [data[col] for col in cols],
        )
        return cur.fetchone()["sr_no"]


def bulk_import_rows(rows: list, username: str, db_path=None) -> int:
    """Bulk-insert many rows in one transaction (CSV/Excel import). Returns count inserted."""
    with get_conn() as conn:
        cur = conn.cursor()
        pos = _next_position(cur)
        count = 0
        for row in rows:
            data = _clean({k: v for k, v in row.items() if k in _COLS and k != "sr_no"})
            data["position"] = pos
            data["created_at"] = time.time() * 1000
            data["created_by"] = username
            cols = list(data.keys())
            ph = ", ".join(["%s"] * len(cols))
            qs = ", ".join(f'"{col}"' for col in cols)
            cur.execute(f'INSERT INTO mass_sizing ({qs}) VALUES ({ph})', [data[col] for col in cols])
            pos += 1
            count += 1
        return count
