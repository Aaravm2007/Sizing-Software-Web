import sqlite3
import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

APP_DIR = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(APP_DIR))

from auth import get_current_user, get_admin_user, get_expert_user

router = APIRouter()

DB_PATH = APP_DIR / "formulas.db"

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

def _conn():
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    return con


def _init():
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS cell_voltages (
                chemistry TEXT PRIMARY KEY,
                nominal   REAL NOT NULL,
                max_v     REAL NOT NULL,
                end_v     REAL NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS dc_to_cells (
                dc_voltage  INTEGER PRIMARY KEY,
                num_cells   INTEGER NOT NULL
            )
        """)
        if not con.execute("SELECT 1 FROM cell_voltages LIMIT 1").fetchone():
            con.executemany("INSERT INTO cell_voltages VALUES (?,?,?,?)", DEFAULT_CELL_VOLTAGES)
        if not con.execute("SELECT 1 FROM dc_to_cells LIMIT 1").fetchone():
            con.executemany("INSERT INTO dc_to_cells VALUES (?,?)", DEFAULT_DC_TO_CELLS)
        con.execute("""
            CREATE TABLE IF NOT EXISTS quote_rates (
                key         TEXT PRIMARY KEY,
                value       REAL NOT NULL,
                description TEXT
            )
        """)
        if not con.execute("SELECT 1 FROM quote_rates LIMIT 1").fetchone():
            con.executemany("INSERT INTO quote_rates VALUES (?,?,?)", DEFAULT_QUOTE_RATES)
        con.execute("""
            CREATE TABLE IF NOT EXISTS modular_rack_rates (
                key   TEXT PRIMARY KEY,
                price REAL NOT NULL
            )
        """)
        if not con.execute("SELECT 1 FROM modular_rack_rates LIMIT 1").fetchone():
            con.executemany("INSERT INTO modular_rack_rates VALUES (?,?)", DEFAULT_MODULAR_RACKS)
        con.commit()


_init()

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
    with _conn() as con:
        rows = con.execute("SELECT * FROM cell_voltages ORDER BY chemistry").fetchall()
    return [dict(r) for r in rows]


@router.post("/cell-voltages", status_code=201)
def create_cell_voltage(body: CellVoltageIn, _=Depends(get_expert_user)):
    try:
        with _conn() as con:
            con.execute(
                "INSERT INTO cell_voltages VALUES (?,?,?,?)",
                (body.chemistry.upper(), body.nominal, body.max_v, body.end_v),
            )
            con.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"Chemistry '{body.chemistry}' already exists")
    return {"detail": "created"}


@router.put("/cell-voltages/{chemistry}")
def update_cell_voltage(chemistry: str, body: CellVoltageIn, _=Depends(get_expert_user)):
    with _conn() as con:
        cur = con.execute(
            "UPDATE cell_voltages SET nominal=?, max_v=?, end_v=? WHERE chemistry=?",
            (body.nominal, body.max_v, body.end_v, chemistry.upper()),
        )
        con.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, f"Chemistry '{chemistry}' not found")
    return {"detail": "updated"}


@router.delete("/cell-voltages/{chemistry}")
def delete_cell_voltage(chemistry: str, _=Depends(get_expert_user)):
    with _conn() as con:
        cur = con.execute("DELETE FROM cell_voltages WHERE chemistry=?", (chemistry.upper(),))
        con.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, f"Chemistry '{chemistry}' not found")
    return {"detail": "deleted"}


# ── dc → cells mapping ─────────────────────────────────────────────────────────

@router.get("/dc-cells")
def list_dc_cells(_=Depends(get_current_user)):
    with _conn() as con:
        rows = con.execute("SELECT * FROM dc_to_cells ORDER BY dc_voltage").fetchall()
    return [dict(r) for r in rows]


@router.post("/dc-cells", status_code=201)
def create_dc_cell(body: DcCellIn, _=Depends(get_expert_user)):
    try:
        with _conn() as con:
            con.execute("INSERT INTO dc_to_cells VALUES (?,?)", (body.dc_voltage, body.num_cells))
            con.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"DC voltage {body.dc_voltage}V already exists")
    return {"detail": "created"}


@router.put("/dc-cells/{dc_voltage}")
def update_dc_cell(dc_voltage: int, body: DcCellIn, _=Depends(get_expert_user)):
    with _conn() as con:
        cur = con.execute(
            "UPDATE dc_to_cells SET num_cells=? WHERE dc_voltage=?",
            (body.num_cells, dc_voltage),
        )
        con.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, f"{dc_voltage}V not found")
    return {"detail": "updated"}


@router.delete("/dc-cells/{dc_voltage}")
def delete_dc_cell(dc_voltage: int, _=Depends(get_expert_user)):
    with _conn() as con:
        cur = con.execute("DELETE FROM dc_to_cells WHERE dc_voltage=?", (dc_voltage,))
        con.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, f"{dc_voltage}V not found")
    return {"detail": "deleted"}


# ── backup time presets ────────────────────────────────────────────────────────

def _fb_db():
    from firebase_admin import db as fdb
    return fdb

class BackupTimeIn(BaseModel):
    name: str  # e.g. "900min"

@router.get("/backup-times")
def list_backup_times(_=Depends(get_current_user)):
    try:
        fdb = _fb_db()
        products = fdb.reference("products").get() or {}
        presets = fdb.reference("duration_presets").get() or {}
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
        raise HTTPException(503, f"Firebase error: {e}")

@router.post("/backup-times", status_code=201)
def add_backup_time(body: BackupTimeIn, _=Depends(get_expert_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name required")
    if not any(c.isdigit() for c in name):
        raise HTTPException(400, "Name must contain a number")
    try:
        fdb = _fb_db()
        fdb.reference(f"duration_presets/{name}").set(True)
        return {"detail": "created", "name": name}
    except Exception as e:
        raise HTTPException(503, f"Firebase error: {e}")

@router.delete("/backup-times/{name}")
def delete_backup_time(name: str, _=Depends(get_expert_user)):
    try:
        fdb = _fb_db()
        products = fdb.reference(f"products/{name}").get()
        if products:
            if isinstance(products, dict):
                count = sum(1 for p in products.values() if isinstance(p, dict) and p.get("active", True) is not False)
            elif isinstance(products, list):
                count = sum(1 for p in products if isinstance(p, dict) and p.get("active", True) is not False)
            else:
                count = 0
            if count > 0:
                raise HTTPException(400, f"Cannot delete '{name}': {count} active product(s) are associated with this duration")
        ref = fdb.reference(f"duration_presets/{name}")
        if ref.get() is None:
            raise HTTPException(404, f"Preset '{name}' not found")
        ref.delete()
        return {"detail": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Firebase error: {e}")


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
    with _conn() as con:
        rows = con.execute("SELECT key, value, description FROM quote_rates ORDER BY rowid").fetchall()
    return [{"key": r["key"], "value": r["value"], "description": r["description"]} for r in rows]

@router.put("/quote-rates")
def update_quote_rate(body: QuoteRateUpdate, _=Depends(get_expert_user)):
    with _conn() as con:
        con.execute("UPDATE quote_rates SET value=? WHERE key=?", (body.value, body.key))
        if con.execute("SELECT changes()").fetchone()[0] == 0:
            raise HTTPException(404, "Rate key not found")
        con.commit()
    return {"detail": "saved"}

@router.get("/modular-rack-rates")
def get_modular_rack_rates():
    with _conn() as con:
        rows = con.execute("SELECT key, price FROM modular_rack_rates ORDER BY rowid").fetchall()
    return [{"key": r["key"], "price": r["price"]} for r in rows]

@router.post("/modular-rack-rates", status_code=201)
def add_modular_rack_rate(body: ModularRackUpdate, _=Depends(get_expert_user)):
    with _conn() as con:
        try:
            con.execute("INSERT INTO modular_rack_rates (key, price) VALUES (?,?)", (body.new_key, body.price))
            con.commit()
        except Exception:
            raise HTTPException(409, "Key already exists")
    return {"detail": "added"}

@router.delete("/modular-rack-rates")
def delete_modular_rack_rate(key: str, _=Depends(get_expert_user)):
    with _conn() as con:
        con.execute("DELETE FROM modular_rack_rates WHERE key=?", (key,))
        if con.execute("SELECT changes()").fetchone()[0] == 0:
            raise HTTPException(404, "Rack key not found")
        con.commit()
    return {"detail": "deleted"}

@router.put("/modular-rack-rates")
def update_modular_rack_rate(body: ModularRackUpdate, _=Depends(get_expert_user)):
    with _conn() as con:
        con.execute(
            "UPDATE modular_rack_rates SET key=?, price=? WHERE key=?",
            (body.new_key, body.price, body.old_key),
        )
        if con.execute("SELECT changes()").fetchone()[0] == 0:
            raise HTTPException(404, "Rack key not found")
        con.commit()
    return {"detail": "saved"}
