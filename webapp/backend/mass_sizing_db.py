import sqlite3
import time
from pathlib import Path

_DB_PATH = str(Path(__file__).parent.parent.parent / "data" / "mass_sizing.db")

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


def _conn(db_path=None):
    c = sqlite3.connect(db_path or _DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_mass_sizing_db(db_path=None):
    Path(db_path or _DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    col_defs = ", ".join(
        f'"{c}" {"INTEGER" if c == "sr_no" else "REAL" if c in ("position", "created_at") else "TEXT"}'
        for c in _COLS if c != "sr_no"
    )
    with _conn(db_path) as c:
        c.execute(f'CREATE TABLE IF NOT EXISTS mass_sizing (sr_no INTEGER PRIMARY KEY AUTOINCREMENT, {col_defs})')


def _next_position(db_path=None) -> float:
    with _conn(db_path) as c:
        row = c.execute("SELECT MAX(position) FROM mass_sizing").fetchone()
        return (row[0] or 0) + 1


def _build_where(search: str):
    if not search.strip():
        return "", []
    q = f"%{search.strip()}%"
    or_conds = " OR ".join(f'"{c}" LIKE ?' for c in _GLOBAL_SEARCH_COLS)
    return f"WHERE ({or_conds})", [q] * len(_GLOBAL_SEARCH_COLS)


def list_page(page: int, limit: int, search: str, db_path=None) -> list:
    init_mass_sizing_db(db_path)
    where, params = _build_where(search)
    offset = (page - 1) * limit
    sql = f'SELECT * FROM mass_sizing {where} ORDER BY position ASC, sr_no ASC LIMIT ? OFFSET ?'
    with _conn(db_path) as c:
        return [dict(r) for r in c.execute(sql, params + [limit, offset]).fetchall()]


def count_rows(search: str, db_path=None) -> int:
    init_mass_sizing_db(db_path)
    where, params = _build_where(search)
    with _conn(db_path) as c:
        return c.execute(f'SELECT COUNT(*) FROM mass_sizing {where}', params).fetchone()[0]


def export_rows(search: str, db_path=None) -> list:
    init_mass_sizing_db(db_path)
    where, params = _build_where(search)
    sql = f'SELECT * FROM mass_sizing {where} ORDER BY position ASC, sr_no ASC'
    with _conn(db_path) as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def insert_row(data: dict, username: str, db_path=None) -> int:
    init_mass_sizing_db(db_path)
    data = {
        **data,
        "position": _next_position(db_path),
        "created_at": time.time() * 1000,
        "created_by": username,
    }
    cols = [k for k in data if k in _COLS and k != "sr_no"]
    ph = ", ".join("?" * len(cols))
    qs = ", ".join(f'"{c}"' for c in cols)
    with _conn(db_path) as c:
        cur = c.execute(f'INSERT INTO mass_sizing ({qs}) VALUES ({ph})', [data[k] for k in cols])
        return cur.lastrowid


def update_row(sr_no: int, data: dict, db_path=None):
    init_mass_sizing_db(db_path)
    fields = [k for k in data if k in _COLS and k != "sr_no"]
    if not fields:
        return
    sets = ", ".join(f'"{f}" = ?' for f in fields)
    with _conn(db_path) as c:
        c.execute(f'UPDATE mass_sizing SET {sets} WHERE sr_no = ?', [data[f] for f in fields] + [sr_no])


def bulk_update_rows(updates: list, db_path=None):
    """updates: [{sr_no, ...fields}], one transaction for all of them (fill-drag / paste)."""
    init_mass_sizing_db(db_path)
    with _conn(db_path) as c:
        for u in updates:
            sr_no = u.get("sr_no")
            if sr_no is None:
                continue
            fields = [k for k in u if k in _COLS and k != "sr_no"]
            if not fields:
                continue
            sets = ", ".join(f'"{f}" = ?' for f in fields)
            c.execute(f'UPDATE mass_sizing SET {sets} WHERE sr_no = ?', [u[f] for f in fields] + [sr_no])


def delete_row(sr_no: int, db_path=None):
    init_mass_sizing_db(db_path)
    with _conn(db_path) as c:
        c.execute('DELETE FROM mass_sizing WHERE sr_no = ?', (sr_no,))


def duplicate_row(sr_no: int, username: str, db_path=None) -> int:
    """Clone a row, inserting it directly after the original in display order."""
    init_mass_sizing_db(db_path)
    with _conn(db_path) as c:
        src = c.execute('SELECT * FROM mass_sizing WHERE sr_no = ?', (sr_no,)).fetchone()
        if not src:
            raise ValueError("Row not found")
        src = dict(src)
        next_row = c.execute(
            'SELECT position FROM mass_sizing WHERE position > ? ORDER BY position ASC LIMIT 1',
            (src["position"],),
        ).fetchone()
        new_position = (src["position"] + next_row[0]) / 2 if next_row else src["position"] + 1

        data = {k: v for k, v in src.items() if k in _COLS and k not in ("sr_no", "position", "created_at", "created_by")}
        data["position"] = new_position
        data["created_at"] = time.time() * 1000
        data["created_by"] = username
        cols = list(data.keys())
        ph = ", ".join("?" * len(cols))
        qs = ", ".join(f'"{col}"' for col in cols)
        cur = c.execute(f'INSERT INTO mass_sizing ({qs}) VALUES ({ph})', [data[col] for col in cols])
        return cur.lastrowid


def bulk_import_rows(rows: list, username: str, db_path=None) -> int:
    """Bulk-insert many rows in one transaction (CSV/Excel import). Returns count inserted."""
    init_mass_sizing_db(db_path)
    pos = _next_position(db_path)
    with _conn(db_path) as c:
        count = 0
        for row in rows:
            data = {k: v for k, v in row.items() if k in _COLS and k != "sr_no"}
            data["position"] = pos
            data["created_at"] = time.time() * 1000
            data["created_by"] = username
            cols = list(data.keys())
            ph = ", ".join("?" * len(cols))
            qs = ", ".join(f'"{col}"' for col in cols)
            c.execute(f'INSERT INTO mass_sizing ({qs}) VALUES ({ph})', [data[col] for col in cols])
            pos += 1
            count += 1
        return count
