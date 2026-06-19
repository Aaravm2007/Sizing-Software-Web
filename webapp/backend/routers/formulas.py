import math
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

# name, expression, description, sort_order
DEFAULT_SIZING_FORMULAS = [
    ("load",
     "actual_kw / inverter_eff if actual_kw > 0 else (actual_kva * power_factor / inverter_eff if actual_kva > 0 else ups_kva * power_factor / inverter_eff)",
     "Calculated Load (kW)", 1),
    ("max_charging_voltage",
     "num_cells * cell_max",
     "Max Charging Voltage (V)", 2),
    ("end_cell_voltage",
     "num_cells * cell_end",
     "End Cell Voltage (V)", 3),
    ("energy_required",
     "(load * backup_minutes) / 60",
     "Energy Required (kWh)", 4),
    ("capacity_required",
     "(energy_required * 1000) / end_cell_voltage if end_cell_voltage > 0 else 0",
     "Capacity Required (Ah)", 5),
    ("cap_with_ageing",
     "capacity_required * (1 + ageing_percent / 100)",
     "Cap req w/ Ageing (Ah)", 6),
    ("cap_with_design_margin",
     "cap_with_ageing * (1 + design_margin_percent / 100)",
     "Cap req w/ Design Margin (Ah)", 7),
    ("cap_with_dod",
     "cap_with_design_margin / (dod_margin_percent / 100) if dod_margin_percent > 0 else cap_with_design_margin",
     "Cap req w/ DOD Margin (Ah)", 8),
    ("cap_with_derating",
     "cap_with_dod * (1 + derating_factor_percent / 100)",
     "Cap req w/ Derating (Ah)", 9),
    ("backup_time",
     "floor((backup_minutes / cap_with_derating) * nearest_capacity) if cap_with_derating > 0 else 0",
     "Backup Time (Min)", 10),
    ("total_energy",
     "(nominal_dc_voltage * nearest_capacity) / 1000",
     "Total Available Energy (kWh)", 11),
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
        con.execute("""
            CREATE TABLE IF NOT EXISTS sizing_formulas (
                name        TEXT PRIMARY KEY,
                expression  TEXT NOT NULL,
                description TEXT,
                sort_order  INTEGER
            )
        """)
        if not con.execute("SELECT 1 FROM cell_voltages LIMIT 1").fetchone():
            con.executemany("INSERT INTO cell_voltages VALUES (?,?,?,?)", DEFAULT_CELL_VOLTAGES)
        if not con.execute("SELECT 1 FROM dc_to_cells LIMIT 1").fetchone():
            con.executemany("INSERT INTO dc_to_cells VALUES (?,?)", DEFAULT_DC_TO_CELLS)
        if not con.execute("SELECT 1 FROM sizing_formulas LIMIT 1").fetchone():
            con.executemany(
                "INSERT INTO sizing_formulas VALUES (?,?,?,?)",
                DEFAULT_SIZING_FORMULAS,
            )
        con.commit()


_init()

# ── safe formula eval ─────────────────────────────────────────────────────────

_MATH_NS = {k: getattr(math, k) for k in dir(math) if not k.startswith("_")}
_MATH_NS.update({"abs": abs, "round": round, "int": int, "float": float,
                 "min": min, "max": max})


def eval_formula(expression: str, ctx: dict) -> float:
    ns = {**_MATH_NS, **ctx}
    try:
        result = eval(compile(expression, "<formula>", "eval"), {"__builtins__": {}}, ns)
        return float(result)
    except Exception as e:
        raise ValueError(f"Formula error ({expression!r}): {e}")


def load_sizing_formulas() -> dict:
    """Return {name: expression} ordered by sort_order."""
    with _conn() as con:
        rows = con.execute(
            "SELECT name, expression FROM sizing_formulas ORDER BY sort_order"
        ).fetchall()
    return {r["name"]: r["expression"] for r in rows}


# ── schemas ────────────────────────────────────────────────────────────────────

class CellVoltageIn(BaseModel):
    chemistry: str
    nominal:   float
    max_v:     float
    end_v:     float


class DcCellIn(BaseModel):
    dc_voltage: int
    num_cells:  int


class SizingFormulaIn(BaseModel):
    expression: str


# ── cell voltages ──────────────────────────────────────────────────────────────

@router.get("/cell-voltages")
def list_cell_voltages(_=Depends(get_current_user)):
    with _conn() as con:
        rows = con.execute("SELECT * FROM cell_voltages ORDER BY chemistry").fetchall()
    return [dict(r) for r in rows]


@router.post("/cell-voltages", status_code=201)
def create_cell_voltage(body: CellVoltageIn, _=Depends(get_admin_user)):
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
def update_cell_voltage(chemistry: str, body: CellVoltageIn, _=Depends(get_admin_user)):
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
def delete_cell_voltage(chemistry: str, _=Depends(get_admin_user)):
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
def create_dc_cell(body: DcCellIn, _=Depends(get_admin_user)):
    try:
        with _conn() as con:
            con.execute("INSERT INTO dc_to_cells VALUES (?,?)", (body.dc_voltage, body.num_cells))
            con.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"DC voltage {body.dc_voltage}V already exists")
    return {"detail": "created"}


@router.put("/dc-cells/{dc_voltage}")
def update_dc_cell(dc_voltage: int, body: DcCellIn, _=Depends(get_admin_user)):
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
def delete_dc_cell(dc_voltage: int, _=Depends(get_admin_user)):
    with _conn() as con:
        cur = con.execute("DELETE FROM dc_to_cells WHERE dc_voltage=?", (dc_voltage,))
        con.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, f"{dc_voltage}V not found")
    return {"detail": "deleted"}


# ── sizing formulas ────────────────────────────────────────────────────────────

@router.get("/sizing-formulas")
def list_sizing_formulas(_=Depends(get_current_user)):
    with _conn() as con:
        rows = con.execute(
            "SELECT name, expression, description, sort_order FROM sizing_formulas ORDER BY sort_order"
        ).fetchall()
    return [dict(r) for r in rows]


@router.put("/sizing-formulas/{name}")
def update_sizing_formula(name: str, body: SizingFormulaIn, _=Depends(get_admin_user)):
    # validate expression parses before saving
    try:
        compile(body.expression, "<formula>", "eval")
    except SyntaxError as e:
        raise HTTPException(400, f"Syntax error in formula: {e}")
    with _conn() as con:
        cur = con.execute(
            "UPDATE sizing_formulas SET expression=? WHERE name=?",
            (body.expression, name),
        )
        con.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, f"Formula '{name}' not found")
    return {"detail": "updated"}


@router.post("/sizing-formulas/{name}/reset")
def reset_sizing_formula(name: str, _=Depends(get_admin_user)):
    defaults = {row[0]: row[1] for row in DEFAULT_SIZING_FORMULAS}
    if name not in defaults:
        raise HTTPException(404, f"Formula '{name}' not found")
    with _conn() as con:
        con.execute(
            "UPDATE sizing_formulas SET expression=? WHERE name=?",
            (defaults[name], name),
        )
        con.commit()
    return {"detail": "reset", "expression": defaults[name]}


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
                "product_count": len(products[n]) if isinstance(products.get(n), dict) else (len(products[n]) if isinstance(products.get(n), list) else 0),
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
        ref = fdb.reference(f"duration_presets/{name}")
        if ref.get() is None:
            raise HTTPException(404, f"Preset '{name}' not found")
        ref.delete()
        return {"detail": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Firebase error: {e}")
