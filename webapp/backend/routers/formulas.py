import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

APP_DIR = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(APP_DIR))

from auth import get_current_user, get_admin_user, get_expert_user

router = APIRouter()


# ── defaults ──────────────────────────────────────────────────────────────────

DEFAULT_CELL_VOLTAGES = [
    ("LFP",  3.2, 3.6, 2.8),
    ("NPM",  3.6, 4.2, 3.0),
]

DEFAULT_DC_TO_CELLS = [
    (12, 4), (24, 8), (36, 11), (48, 15), (72, 23), (96, 30),
    (120, 38), (144, 45), (192, 60), (240, 75),
    (336, 105), (360, 112), (384, 120),
    (408, 128), (480, 150), (512, 160),
    (528, 165), (576, 180),
]

DEFAULT_QUOTE_RATES = [
    ("fire_suppression", 6100.0, "Fire Suppression System (per module)"),
    ("rmd_hvl",          6400.0, "Remote Monitoring Device HVL (per module)"),
    ("rmd_efl",          4850.0, "Remote Monitoring Device EFL (per module)"),
    ("subscription",     1500.0, "Subscription Charges (per year)"),
]

DEFAULT_MODULAR_RACKS = [
    ("W=600*D=1000*H=880",  30000.0),
    ("W=600*D=1000*H=1392", 40000.0),
    ("W=600*D=1000*H=1882", 49000.0),
    ("W=600*D=1000*H=1971", 64000.0),
    ("W=600*D=1000*H=2058", 69000.0),
    ("W=600*D=800*H=992",   30000.0),
    ("W=600*D=800*H=1704",  43000.0),
    ("W=600*D=1000*H=2325", 70000.0),
    ("W=600*D=1400*H=1882", 70000.0),
]


# ── db helpers ─────────────────────────────────────────────────────────────────

from pg import get_conn as _pg_conn, dict_cur as _dict_cur

# ── schemas ────────────────────────────────────────────────────────────────────

class CellVoltageIn(BaseModel):
    chemistry: str
    nominal:   float
    max_v:     float
    end_v:     float


class DcCellIn(BaseModel):
    dc_voltage: int
    num_cells:  int


# ── cell voltages ──────────────────────────────────────────────────────────────

@router.get("/cell-voltages")
def list_cell_voltages(_=Depends(get_current_user)):
    with _pg_conn() as con:
        cur = _dict_cur(con)
        cur.execute("SELECT * FROM cell_voltages ORDER BY chemistry")
        return [dict(r) for r in cur.fetchall()]


@router.post("/cell-voltages", status_code=201)
def create_cell_voltage(body: CellVoltageIn, _=Depends(get_expert_user)):
    import psycopg2
    try:
        with _pg_conn() as con:
            con.cursor().execute(
                "INSERT INTO cell_voltages VALUES (%s,%s,%s,%s)",
                (body.chemistry.upper(), body.nominal, body.max_v, body.end_v),
            )
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(409, f"Chemistry '{body.chemistry}' already exists")
    return {"detail": "created"}


@router.put("/cell-voltages/{chemistry}")
def update_cell_voltage(chemistry: str, body: CellVoltageIn, _=Depends(get_expert_user)):
    with _pg_conn() as con:
        cur = con.cursor()
        cur.execute(
            "UPDATE cell_voltages SET nominal=%s, max_v=%s, end_v=%s WHERE chemistry=%s",
            (body.nominal, body.max_v, body.end_v, chemistry.upper()),
        )
    if cur.rowcount == 0:
        raise HTTPException(404, f"Chemistry '{chemistry}' not found")
    return {"detail": "updated"}


@router.delete("/cell-voltages/{chemistry}")
def delete_cell_voltage(chemistry: str, _=Depends(get_expert_user)):
    with _pg_conn() as con:
        cur = con.cursor()
        cur.execute("DELETE FROM cell_voltages WHERE chemistry=%s", (chemistry.upper(),))
    if cur.rowcount == 0:
        raise HTTPException(404, f"Chemistry '{chemistry}' not found")
    return {"detail": "deleted"}


# ── dc → cells mapping ─────────────────────────────────────────────────────────

@router.get("/dc-cells")
def list_dc_cells(_=Depends(get_current_user)):
    with _pg_conn() as con:
        cur = _dict_cur(con)
        cur.execute("SELECT * FROM dc_to_cells ORDER BY dc_voltage")
        return [dict(r) for r in cur.fetchall()]


@router.post("/dc-cells", status_code=201)
def create_dc_cell(body: DcCellIn, _=Depends(get_expert_user)):
    import psycopg2
    try:
        with _pg_conn() as con:
            con.cursor().execute("INSERT INTO dc_to_cells VALUES (%s,%s)",
                                 (body.dc_voltage, body.num_cells))
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(409, f"DC voltage {body.dc_voltage}V already exists")
    return {"detail": "created"}


@router.put("/dc-cells/{dc_voltage}")
def update_dc_cell(dc_voltage: int, body: DcCellIn, _=Depends(get_expert_user)):
    with _pg_conn() as con:
        cur = con.cursor()
        cur.execute(
            "UPDATE dc_to_cells SET num_cells=%s WHERE dc_voltage=%s",
            (body.num_cells, dc_voltage),
        )
    if cur.rowcount == 0:
        raise HTTPException(404, f"{dc_voltage}V not found")
    return {"detail": "updated"}


@router.delete("/dc-cells/{dc_voltage}")
def delete_dc_cell(dc_voltage: int, _=Depends(get_expert_user)):
    with _pg_conn() as con:
        cur = con.cursor()
        cur.execute("DELETE FROM dc_to_cells WHERE dc_voltage=%s", (dc_voltage,))
    if cur.rowcount == 0:
        raise HTTPException(404, f"{dc_voltage}V not found")
    return {"detail": "deleted"}


# ── backup time presets ────────────────────────────────────────────────────────

class BackupTimeIn(BaseModel):
    name: str  # e.g. "900min"

@router.get("/backup-times")
def list_backup_times(_=Depends(get_current_user)):
    try:
        import pgfire
        products = pgfire.get("products") or {}
        presets = pgfire.get("duration_presets") or {}
        all_names = set(products.keys()) | set(presets.keys())
        sorted_names = sorted(all_names, key=lambda x: int("".join(filter(str.isdigit, x)) or "0"))
        preset_set = set(presets.keys())
        return [
            {
                "name": n,
                "has_products": n in products,
                "is_preset": n in preset_set,
                "product_count": sum(1 for p in products[n].values() if isinstance(p, dict) and p.get("active", True) is not False) if isinstance(products.get(n), dict) else (sum(1 for p in products[n] if isinstance(p, dict) and p.get("active", True) is not False) if isinstance(products.get(n), list) else 0),
            }
            for n in sorted_names
        ]
    except Exception as e:
        raise HTTPException(503, f"Database error: {e}")

@router.post("/backup-times", status_code=201)
def add_backup_time(body: BackupTimeIn, _=Depends(get_expert_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name required")
    if not any(c.isdigit() for c in name):
        raise HTTPException(400, "Name must contain a number")
    try:
        import pgfire
        pgfire.set("duration_presets", name, True)
        return {"detail": "created", "name": name}
    except Exception as e:
        raise HTTPException(503, f"Database error: {e}")

@router.delete("/backup-times/{name}")
def delete_backup_time(name: str, _=Depends(get_expert_user)):
    try:
        import pgfire
        products = pgfire.get("products", name)
        if products:
            if isinstance(products, dict):
                count = sum(1 for p in products.values() if isinstance(p, dict) and p.get("active", True) is not False)
            elif isinstance(products, list):
                count = sum(1 for p in products if isinstance(p, dict) and p.get("active", True) is not False)
            else:
                count = 0
            if count > 0:
                raise HTTPException(400, f"Cannot delete '{name}': {count} active product(s) are associated with this duration")
        if pgfire.get("duration_presets", name) is None:
            raise HTTPException(404, f"Preset '{name}' not found")
        pgfire.delete("duration_presets", name)
        return {"detail": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Database error: {e}")


# ── Quote rates ────────────────────────────────────────────────────────────────

class QuoteRateUpdate(BaseModel):
    key: str
    value: float

class ModularRackUpdate(BaseModel):
    old_key: str
    new_key: str
    price: float

@router.get("/quote-rates")
def get_quote_rates():
    with _pg_conn() as con:
        cur = _dict_cur(con)
        cur.execute("SELECT key, value, description FROM quote_rates ORDER BY key")
        return [{"key": r["key"], "value": r["value"], "description": r["description"]} for r in cur.fetchall()]

@router.put("/quote-rates")
def update_quote_rate(body: QuoteRateUpdate, _=Depends(get_expert_user)):
    with _pg_conn() as con:
        cur = con.cursor()
        cur.execute("UPDATE quote_rates SET value=%s WHERE key=%s", (body.value, body.key))
        if cur.rowcount == 0:
            raise HTTPException(404, "Rate key not found")
    return {"detail": "saved"}

@router.get("/costing-presets")
def get_costing_presets():
    with _pg_conn() as con:
        cur = _dict_cur(con)
        cur.execute("SELECT key, value, description FROM costing_presets ORDER BY key")
        return [{"key": r["key"], "value": r["value"], "description": r["description"]} for r in cur.fetchall()]

@router.put("/costing-presets")
def update_costing_preset(body: QuoteRateUpdate, _=Depends(get_expert_user)):
    with _pg_conn() as con:
        cur = con.cursor()
        cur.execute("UPDATE costing_presets SET value=%s WHERE key=%s", (body.value, body.key))
        if cur.rowcount == 0:
            raise HTTPException(404, "Preset key not found")
    return {"detail": "saved"}

@router.get("/modular-rack-rates")
def get_modular_rack_rates():
    with _pg_conn() as con:
        cur = _dict_cur(con)
        cur.execute("SELECT key, price FROM modular_rack_rates ORDER BY key")
        return [{"key": r["key"], "price": r["price"]} for r in cur.fetchall()]

@router.post("/modular-rack-rates", status_code=201)
def add_modular_rack_rate(body: ModularRackUpdate, _=Depends(get_expert_user)):
    try:
        with _pg_conn() as con:
            con.cursor().execute("INSERT INTO modular_rack_rates (key, price) VALUES (%s,%s)",
                                 (body.new_key, body.price))
    except Exception:
        raise HTTPException(409, "Key already exists")
    return {"detail": "added"}

@router.delete("/modular-rack-rates")
def delete_modular_rack_rate(key: str, _=Depends(get_expert_user)):
    with _pg_conn() as con:
        cur = con.cursor()
        cur.execute("DELETE FROM modular_rack_rates WHERE key=%s", (key,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Rack key not found")
    return {"detail": "deleted"}

@router.put("/modular-rack-rates")
def update_modular_rack_rate(body: ModularRackUpdate, _=Depends(get_expert_user)):
    with _pg_conn() as con:
        cur = con.cursor()
        cur.execute(
            "UPDATE modular_rack_rates SET key=%s, price=%s WHERE key=%s",
            (body.new_key, body.price, body.old_key),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Rack key not found")
    return {"detail": "saved"}
