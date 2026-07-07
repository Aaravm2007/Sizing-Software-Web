import sqlite3
import tempfile
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel

APP_DIR = Path(__file__).parent.parent.parent.parent
BACKEND_DIR = Path(__file__).parent.parent
TEMPLATE = str(APP_DIR / "templates" / "Costing_sheet_template.xlsx")

import sys as _sys
_sys.path.insert(0, str(APP_DIR))
_sys.path.insert(0, str(BACKEND_DIR))
from auth import get_current_user, get_admin_user, get_expert_user
from user_db import get_user_costing_db

router = APIRouter()

# ── column names (exact order matching tree table) ───────────────────────────

COLUMNS = [
    "Duration",
    "Battery Pack", "Voltage", "Ampheres capacity", "KW calculation",
    "Cell Voltage", "Cell Capacity",
    "Combination of Cells in Series", "Combination of Cells in parallel",
    "Total No Of Cells", "FOB Cost Of Cells", "Total FOB Cost of Cells",
    "Clearing & Customs ", "Total Landed cost In India ",
    "Cost In INR( Rs 87)-(1)", "BMS/PCM cost",
    "Clearing & Customs", "Total Landed cost In India",
    "Cost In INR( Rs 87)-(2)", "Cabinet ( INR)", "Bus Bar", "Holder/caps",
    "Wire & Gasket & Other Assesorries", "Terminals+ Connectors", "MCB/Fuse",
    "Lugs & Slew", "Nut Bolts", "Fiber glass +rod", "Awg cables",
    "Shipping Charges", "Packaging cost with safety packs",
    "Total Other Chargers(3)", "Landing cost of material (1+2+3)",
    "Production Labour & Assembly overheads", "Warranty  & Service provision",
    "Total Cost of Pack (A)", "Margin @10 % On Cost",
    "Estimated Sales Cost-(B)", "Margin @15% On Cost",
    "Estimated Sales Cost-(B+5)", "Per Kw Pricing @ cost (A)",
    "Per Kw pricing @ ist level profit (B)",
    "Per Kw pricing @ 2nd evel profit (B+5)",
    "BMS/PCM", "LFP/NCM", "Centre tap/non centre tap",
    "Cylindrical/ Prismatic", "Application", "Soft pack/ Metal enclosure",
    "If Metal enclosure - Tower- type/rack- mountable",
    "Brand and type of cell", "Installation indoor or outdoor",
    "Battery Partcode",
    "Dollar Rate",
    "Creation Date",
    "Created By",
]


def _get_conn(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def _ensure_tree(db_path: str):
    conn = _get_conn(db_path)
    cols_sql = ", ".join(f'"{c}" TEXT' for c in COLUMNS)
    conn.execute(f'CREATE TABLE IF NOT EXISTS tree ({cols_sql})')
    existing = {row[1] for row in conn.execute("PRAGMA table_info(tree)").fetchall()}
    for col in ["Dollar Rate", "Creation Date", "Created By"]:
        if col not in existing:
            conn.execute(f'ALTER TABLE tree ADD COLUMN "{col}" TEXT DEFAULT ""')
    conn.commit()
    conn.close()


# ── Pydantic ─────────────────────────────────────────────────────────────────

class CostingRow(BaseModel):
    duration: str = ""
    battery_pack: str = ""
    voltage: Any = 0
    ampere_capacity: Any = 0
    kw_calculation: Any = 0
    cell_voltage: Any = 0
    cell_capacity: Any = 0
    cells_in_series: Any = 0
    cells_in_parallel: Any = 0
    total_cells: Any = 0
    fob_cost: Any = 0
    total_fob: Any = 0
    clearing_customs_1: Any = 0
    total_landed_1: Any = 0
    cost_inr_1: Any = 0
    bms_pcm_cost: Any = 0
    clearing_customs_2: Any = 0
    total_landed_2: Any = 0
    cost_inr_2: Any = 0
    cabinet: Any = 0
    bus_bar: Any = 0
    holder_caps: Any = 0
    wire_gasket: Any = 0
    terminals: Any = 0
    mcb_fuse: Any = 0
    lugs_slew: Any = 0
    nut_bolts: Any = 0
    fiber_glass: Any = 0
    awg_cables: Any = 0
    shipping: Any = 0
    packaging: Any = 0
    total_other: Any = 0
    landing_cost: Any = 0
    labour: Any = 0
    warranty: Any = 0
    total_cost: Any = 0
    margin_10: Any = 0
    est_sales_b: Any = 0
    margin_15: Any = 0
    est_sales_b5: Any = 0
    per_kw_cost: Any = 0
    per_kw_profit1: Any = 0
    per_kw_profit2: Any = 0
    bms_pcm_type: str = ""
    cell_chemistry: str = ""
    centre_tap: str = ""
    cell_type: str = ""
    application: str = ""
    enclosure: str = ""
    mount: str = ""
    brand: str = ""
    installation: str = ""
    partcode: str = ""
    dollar_rate: str = ""
    creation_date: str = ""
    created_by: str = ""


def _row_to_model(row: tuple) -> dict:
    keys = [
        "duration", "battery_pack", "voltage", "ampere_capacity", "kw_calculation",
        "cell_voltage", "cell_capacity", "cells_in_series", "cells_in_parallel",
        "total_cells", "fob_cost", "total_fob", "clearing_customs_1", "total_landed_1",
        "cost_inr_1", "bms_pcm_cost", "clearing_customs_2", "total_landed_2",
        "cost_inr_2", "cabinet", "bus_bar", "holder_caps", "wire_gasket", "terminals",
        "mcb_fuse", "lugs_slew", "nut_bolts", "fiber_glass", "awg_cables", "shipping",
        "packaging", "total_other", "landing_cost", "labour", "warranty", "total_cost",
        "margin_10", "est_sales_b", "margin_15", "est_sales_b5", "per_kw_cost",
        "per_kw_profit1", "per_kw_profit2", "bms_pcm_type", "cell_chemistry",
        "centre_tap", "cell_type", "application", "enclosure", "mount", "brand",
        "installation", "partcode", "dollar_rate", "creation_date", "created_by",
    ]
    return dict(zip(keys, row))


def _model_to_values(d: CostingRow) -> list:
    return [
        d.duration, d.battery_pack, d.voltage, d.ampere_capacity, d.kw_calculation,
        d.cell_voltage, d.cell_capacity, d.cells_in_series, d.cells_in_parallel,
        d.total_cells, d.fob_cost, d.total_fob, d.clearing_customs_1, d.total_landed_1,
        d.cost_inr_1, d.bms_pcm_cost, d.clearing_customs_2, d.total_landed_2,
        d.cost_inr_2, d.cabinet, d.bus_bar, d.holder_caps, d.wire_gasket, d.terminals,
        d.mcb_fuse, d.lugs_slew, d.nut_bolts, d.fiber_glass, d.awg_cables, d.shipping,
        d.packaging, d.total_other, d.landing_cost, d.labour, d.warranty, d.total_cost,
        d.margin_10, d.est_sales_b, d.margin_15, d.est_sales_b5, d.per_kw_cost,
        d.per_kw_profit1, d.per_kw_profit2, d.bms_pcm_type, d.cell_chemistry,
        d.centre_tap, d.cell_type, d.application, d.enclosure, d.mount, d.brand,
        d.installation, d.partcode, d.dollar_rate, d.creation_date, d.created_by,
    ]


class SearchRequest(BaseModel):
    duration: str
    keyword: str


class RowIndexRequest(BaseModel):
    row_index: int


class MassUpdateRequest(BaseModel):
    field: str           # internal key e.g. "fob_cost"
    percent: float       # e.g. 10.0 = +10%, -5.0 = -5%
    admin_password: str  # re-confirmed by user


# ── mass-update helpers ───────────────────────────────────────────────────────

# internal key → Firebase field name
_FB = {
    "fob_cost":            "FOB Cost Of Cells",
    "bms_pcm_cost":        "BMS or PCM cost",
    "cabinet":             "Cabinet",
    "bus_bar":             "Bus Bar",
    "holder_caps":         "Holder or Caps",
    "wire_gasket":         "Wire & Gasket & Other Assesorries",
    "terminals":           "Terminals+ Connectors",
    "mcb_fuse":            "MCB or Fuse",
    "lugs_slew":           "Lugs & Slew",
    "nut_bolts":           "Nut Bolts",
    "fiber_glass":         "Fiber glass +rod",
    "awg_cables":          "Awg cables",
    "shipping":            "Shipping Charges",
    "packaging":           "Packaging cost with safety packs",
    "clearing_customs_1":  "Clearing & Customs 1",
    "clearing_customs_2":  "Clearing & Customs 2",
}

_OTHER_COMPONENTS = {
    "cabinet", "bus_bar", "holder_caps", "wire_gasket", "terminals",
    "mcb_fuse", "lugs_slew", "nut_bolts", "fiber_glass", "awg_cables",
    "shipping", "packaging",
}


def _f(product: dict, key: str) -> float:
    return float(product.get(key) or 0)


def _apply_mass_update(product: dict, field: str, multiplier: float) -> dict:
    """Return {firebase_field: new_value} for all affected fields."""
    updates: dict = {}
    fb_name = _FB[field]

    if field == "fob_cost":
        old_fob = _f(product, "FOB Cost Of Cells")
        old_total_fob = _f(product, "Total FOB Cost of Cells")
        old_cost_inr_1 = _f(product, "Cost In INR-(1)")

        new_fob = old_fob * multiplier
        new_total_fob = old_total_fob * multiplier
        ratio = new_total_fob / old_total_fob if old_total_fob else 1
        new_cost_inr_1 = old_cost_inr_1 * ratio

        updates["FOB Cost Of Cells"] = round(new_fob, 4)
        updates["Total FOB Cost of Cells"] = round(new_total_fob, 2)
        updates["Cost In INR-(1)"] = round(new_cost_inr_1, 2)

        old_landing = _f(product, "Landing cost of material (1+2+3)")
        new_landing = old_landing - old_cost_inr_1 + new_cost_inr_1

    elif field == "bms_pcm_cost":
        old_bms = _f(product, "BMS or PCM cost")
        old_cost_inr_2 = _f(product, "Cost In INR-(2)")

        new_bms = old_bms * multiplier
        new_cost_inr_2 = old_cost_inr_2 * multiplier

        updates["BMS or PCM cost"] = round(new_bms, 2)
        updates["Cost In INR-(2)"] = round(new_cost_inr_2, 2)

        old_landing = _f(product, "Landing cost of material (1+2+3)")
        new_landing = old_landing - old_cost_inr_2 + new_cost_inr_2

    elif field == "clearing_customs_1":
        old_cc = _f(product, "Clearing & Customs 1")
        new_cc = old_cc * multiplier
        old_landed = _f(product, "Total Landed cost In India 1")
        new_landed = old_landed - old_cc + new_cc
        old_cost_inr_1 = _f(product, "Cost In INR-(1)")
        delta_inr = new_landed - old_landed
        new_cost_inr_1 = old_cost_inr_1 + delta_inr

        updates["Clearing & Customs 1"] = round(new_cc, 2)
        updates["Total Landed cost In India 1"] = round(new_landed, 2)
        updates["Cost In INR-(1)"] = round(new_cost_inr_1, 2)

        old_landing = _f(product, "Landing cost of material (1+2+3)")
        old_c1 = _f(product, "Cost In INR-(1)")
        new_landing = old_landing - old_c1 + new_cost_inr_1

    elif field == "clearing_customs_2":
        old_cc = _f(product, "Clearing & Customs 2")
        new_cc = old_cc * multiplier
        old_landed = _f(product, "Total Landed cost In India 2")
        new_landed = old_landed - old_cc + new_cc
        old_cost_inr_2 = _f(product, "Cost In INR-(2)")
        delta_inr = new_landed - old_landed
        new_cost_inr_2 = old_cost_inr_2 + delta_inr

        updates["Clearing & Customs 2"] = round(new_cc, 2)
        updates["Total Landed cost In India 2"] = round(new_landed, 2)
        updates["Cost In INR-(2)"] = round(new_cost_inr_2, 2)

        old_landing = _f(product, "Landing cost of material (1+2+3)")
        old_c2 = _f(product, "Cost In INR-(2)")
        new_landing = old_landing - old_c2 + new_cost_inr_2

    elif field in _OTHER_COMPONENTS:
        old_val = _f(product, fb_name)
        new_val = old_val * multiplier
        updates[fb_name] = round(new_val, 2)

        old_total_other = _f(product, "Total Other Chargers(3)")
        new_total_other = old_total_other - old_val + new_val
        updates["Total Other Chargers(3)"] = round(new_total_other, 2)

        old_landing = _f(product, "Landing cost of material (1+2+3)")
        new_landing = old_landing - old_total_other + new_total_other

    else:
        raise ValueError(f"Unknown field: {field!r}")

    # cascade landing → total_cost → margins
    updates["Landing cost of material (1+2+3)"] = round(new_landing, 2)
    new_warranty = new_landing * 0.1
    new_labour   = new_landing * 0.1
    new_total    = new_landing + new_warranty + new_labour
    updates["Warranty  & Service provision"]              = round(new_warranty, 2)
    updates["Production Labour & Assembly overheads"]     = round(new_labour, 2)
    updates["Total Cost of Pack (A)"]                     = round(new_total, 2)
    m10  = new_total * 0.1;  updates["Margin @10 % On Cost"]  = round(m10, 2)
    m15  = new_total * 0.15; updates["Margin @15% On Cost"]   = round(m15, 2)
    esb  = new_total + m10;  updates["Estimated Sales Cost-(B)"]   = round(esb, 2)
    esb5 = new_total + m15;  updates["Estimated Sales Cost-(B+5)"] = round(esb5, 2)
    kw   = _f(product, "KW calculation")
    if kw > 0:
        updates["Per Kw Pricing @ cost (A)"]                   = round(new_total / kw, 2)
        updates["Per Kw pricing @ ist level profit (B)"]        = round(esb / kw, 2)
        updates["Per Kw pricing @ 2nd evel profit (B+5)"]       = round(esb5 / kw, 2)

    return updates


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/durations")
def get_durations(_=Depends(get_current_user)):
    try:
        import sys
        sys.path.insert(0, str(APP_DIR))
        from basefunctions import get_all_durations
        return get_all_durations()
    except Exception as e:
        return []


@router.get("/tree")
def get_tree(user=Depends(get_current_user)):
    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    cur = conn.cursor()
    cur.execute("SELECT * FROM tree")
    rows = cur.fetchall()
    conn.close()
    return [_row_to_model(r) for r in rows]


@router.post("/tree/search")
def search_add(body: SearchRequest, user=Depends(get_current_user)):
    """Search Firebase products/{duration} by Battery Pack keyword, add matching rows to costing.db."""
    try:
        import sys
        sys.path.insert(0, str(APP_DIR))
        from basefunctions import search_data_by_keyword
        products = search_data_by_keyword(body.duration, "Battery Pack", body.keyword)
    except Exception as e:
        raise HTTPException(500, f"Firebase error: {e}")

    if not products:
        raise HTTPException(404, f"No products found for duration={body.duration!r} keyword={body.keyword!r}")

    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    quoted = [f'"{c}"' for c in COLUMNS]
    placeholders = ",".join(["?"] * len(COLUMNS))
    query = f'INSERT INTO tree ({",".join(quoted)}) VALUES ({placeholders})'

    for product in products:
        if not product.get("active"):
            continue
        values = [
            body.duration,
            product.get("Battery Pack", ""),
            product.get("Voltage", 0),
            product.get("Ampheres capacity", 0),
            product.get("KW calculation", 0),
            product.get("Cell Voltage", 0),
            product.get("Cell Capacity", 0),
            product.get("Combination of Cells in Series", 0),
            product.get("Combination of Cells in parallel", 0),
            product.get("Total No Of Cells", 0),
            product.get("FOB Cost Of Cells", 0),
            product.get("Total FOB Cost of Cells", 0),
            product.get("Clearing & Customs 1", 0),
            product.get("Total Landed cost In India 1", 0),
            product.get("Cost In INR-(1)", 0),
            product.get("BMS or PCM cost", 0),
            product.get("Clearing & Customs 2", 0),
            product.get("Total Landed cost In India 2", 0),
            product.get("Cost In INR-(2)", 0),
            product.get("Cabinet", 0),
            product.get("Bus Bar", 0),
            product.get("Holder or Caps", 0),
            product.get("Wire & Gasket & Other Assesorries", 0),
            product.get("Terminals+ Connectors", 0),
            product.get("MCB or Fuse", 0),
            product.get("Lugs & Slew", 0),
            product.get("Nut Bolts", 0),
            product.get("Fiber glass +rod", 0),
            product.get("Awg cables", 0),
            product.get("Shipping Charges", 0),
            product.get("Packaging cost with safety packs", 0),
            product.get("Total Other Chargers(3)", 0),
            product.get("Landing cost of material (1+2+3)", 0),
            product.get("Production Labour & Assembly overheads", 0),
            product.get("Warranty  & Service provision", 0),
            product.get("Total Cost of Pack (A)", 0),
            product.get("Margin @10 % On Cost", 0),
            product.get("Estimated Sales Cost-(B)", 0),
            product.get("Margin @15% On Cost", 0),
            product.get("Estimated Sales Cost-(B+5)", 0),
            product.get("Per Kw Pricing @ cost (A)", 0),
            product.get("Per Kw pricing @ ist level profit (B)", 0),
            product.get("Per Kw pricing @ 2nd evel profit (B+5)", 0),
            product.get("BMS or PCM", ""),
            product.get("Cell Chemistry", ""),
            product.get("Centre tapping", ""),
            product.get("Type of Cell", ""),
            product.get("Application", ""),
            product.get("Enclosure", ""),
            product.get("Mount", ""),
            product.get("Brand and type of cell", ""),
            product.get("Installation indoor or outdoor", ""),
            product.get("Battery Partcode", ""),
            product.get("Dollar Rate", ""),
            product.get("Creation Date", ""),
            product.get("Created By", ""),
        ]
        conn.execute(query, values)

    conn.commit()
    conn.close()
    return {"detail": f"Added {len(products)} row(s)"}


@router.post("/tree/insert", status_code=201)
def insert_row(body: CostingRow, user=Depends(get_current_user)):
    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    quoted = [f'"{c}"' for c in COLUMNS]
    placeholders = ",".join(["?"] * len(COLUMNS))
    conn.execute(
        f'INSERT INTO tree ({",".join(quoted)}) VALUES ({placeholders})',
        _model_to_values(body),
    )
    conn.commit()
    conn.close()
    return {"detail": "inserted"}


@router.put("/tree/{row_index}")
def update_row(row_index: int, body: CostingRow, user=Depends(get_current_user)):
    body.created_by = user.get("username", "")
    body.creation_date = datetime.now().strftime("%d.%m.%y")
    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    cur = conn.cursor()
    cur.execute("SELECT rowid FROM tree LIMIT -1 OFFSET ?", (row_index,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Row not found")
    rowid = row[0]
    set_clause = ", ".join(f'"{c}"=?' for c in COLUMNS)
    cur.execute(f'UPDATE tree SET {set_clause} WHERE rowid=?', _model_to_values(body) + [rowid])
    conn.commit()
    conn.close()
    return {"detail": "updated"}


@router.delete("/tree/{row_index}")
def delete_row(row_index: int, user=Depends(get_current_user)):
    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    cur = conn.cursor()
    cur.execute("SELECT rowid FROM tree LIMIT -1 OFFSET ?", (row_index,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Row not found")
    cur.execute("DELETE FROM tree WHERE rowid=?", (row[0],))
    conn.commit()
    conn.close()
    return {"detail": "deleted"}


@router.delete("/tree")
def clear_tree(user=Depends(get_current_user)):
    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    conn.execute("DELETE FROM tree")
    conn.commit()
    conn.close()
    return {"detail": "cleared"}


@router.post("/tree/{row_index}/duplicate", status_code=201)
def duplicate_row(row_index: int, user=Depends(get_current_user)):
    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    cur = conn.cursor()
    cur.execute("SELECT * FROM tree LIMIT -1 OFFSET ?", (row_index,))
    row = cur.fetchone()
    if row is None:
        conn.close()
        raise HTTPException(404, "Row not found")
    quoted = [f'"{c}"' for c in COLUMNS]
    placeholders = ",".join(["?"] * len(COLUMNS))
    vals = [row[i] for i in range(len(COLUMNS))]
    conn.execute(f'INSERT INTO tree ({",".join(quoted)}) VALUES ({placeholders})', vals)
    conn.commit()
    conn.close()
    return {"detail": "duplicated"}


@router.post("/tree/{row_index}/save-to-firebase")
def save_to_firebase(row_index: int, user=Depends(get_expert_user)):
    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    cur = conn.cursor()
    cur.execute("SELECT * FROM tree LIMIT -1 OFFSET ?", (row_index,))
    row = cur.fetchone()
    conn.close()
    if not row is None and len(row) == 0:
        raise HTTPException(404, "Row not found")
    if row is None:
        raise HTTPException(404, "Row not found")

    try:
        import sys
        sys.path.insert(0, str(APP_DIR))
        from basefunctions import save_product_to_firebase
        d = _row_to_model(row)
        product = {
            "Duration": d["duration"],
            "Battery Pack": d["battery_pack"],
            "Voltage": d["voltage"],
            "Ampheres capacity": d["ampere_capacity"],
            "KW calculation": d["kw_calculation"],
            "Cell Voltage": d["cell_voltage"],
            "Cell Capacity": d["cell_capacity"],
            "Combination of Cells in Series": d["cells_in_series"],
            "Combination of Cells in parallel": d["cells_in_parallel"],
            "Total No Of Cells": d["total_cells"],
            "FOB Cost Of Cells": d["fob_cost"],
            "Total FOB Cost of Cells": d["total_fob"],
            "Clearing & Customs 1": d["clearing_customs_1"],
            "Total Landed cost In India 1": d["total_landed_1"],
            "Cost In INR-(1)": d["cost_inr_1"],
            "BMS or PCM cost": d["bms_pcm_cost"],
            "Clearing & Customs 2": d["clearing_customs_2"],
            "Total Landed cost In India 2": d["total_landed_2"],
            "Cost In INR-(2)": d["cost_inr_2"],
            "Cabinet": d["cabinet"],
            "Bus Bar": d["bus_bar"],
            "Holder or Caps": d["holder_caps"],
            "Wire & Gasket & Other Assesorries": d["wire_gasket"],
            "Terminals+ Connectors": d["terminals"],
            "MCB or Fuse": d["mcb_fuse"],
            "Lugs & Slew": d["lugs_slew"],
            "Nut Bolts": d["nut_bolts"],
            "Fiber glass +rod": d["fiber_glass"],
            "Awg cables": d["awg_cables"],
            "Shipping Charges": d["shipping"],
            "Packaging cost with safety packs": d["packaging"],
            "Total Other Chargers(3)": d["total_other"],
            "Landing cost of material (1+2+3)": d["landing_cost"],
            "Production Labour & Assembly overheads": d["labour"],
            "Warranty  & Service provision": d["warranty"],
            "Total Cost of Pack (A)": d["total_cost"],
            "Margin @10 % On Cost": d["margin_10"],
            "Estimated Sales Cost-(B)": d["est_sales_b"],
            "Margin @15% On Cost": d["margin_15"],
            "Estimated Sales Cost-(B+5)": d["est_sales_b5"],
            "Per Kw Pricing @ cost (A)": d["per_kw_cost"],
            "Per Kw pricing @ ist level profit (B)": d["per_kw_profit1"],
            "Per Kw pricing @ 2nd evel profit (B+5)": d["per_kw_profit2"],
            "BMS or PCM": d["bms_pcm_type"],
            "Cell Chemistry": d["cell_chemistry"],
            "Centre tapping": d["centre_tap"],
            "Type of Cell": d["cell_type"],
            "Application": d["application"],
            "Enclosure": d["enclosure"],
            "Mount": d["mount"],
            "Brand and type of cell": d["brand"],
            "Installation indoor or outdoor": d["installation"],
            "Battery Partcode": d["partcode"],
            "Dollar Rate": d.get("dollar_rate", ""),
            "Creation Date": datetime.now().strftime("%d.%m.%y"),
            "Created By": user.get("username", ""),
            "active": True,
        }
        save_product_to_firebase(product)
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"detail": "saved to Firebase"}


@router.post("/tree/{row_index}/deactivate-in-firebase")
def deactivate_in_firebase(row_index: int, user=Depends(get_expert_user)):
    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    cur = conn.cursor()
    cur.execute("SELECT * FROM tree LIMIT -1 OFFSET ?", (row_index,))
    row = cur.fetchone()
    conn.close()
    if row is None:
        raise HTTPException(404, "Row not found")

    d = _row_to_model(row)
    duration = (d.get("duration") or "").strip()
    battery_pack = (d.get("battery_pack") or "").strip().lower()
    partcode = (d.get("partcode") or "").strip().lower()
    creation_date = (d.get("creation_date") or "").strip().lower()
    dollar_rate = str(d.get("dollar_rate") or "").strip().lower()
    created_by = (d.get("created_by") or "").strip().lower()

    if not duration or not battery_pack:
        raise HTTPException(400, "Row has no duration or battery_pack — cannot match in Firebase")

    try:
        from firebase_admin import db as fdb
        ref = fdb.reference(f"products/{duration}")
        all_products = ref.get()
    except Exception as e:
        raise HTTPException(500, f"Firebase error: {e}")

    if not isinstance(all_products, dict):
        return {"deactivated": 0, "reason": "no products in this duration bucket"}

    # collect only active entries under this duration
    candidates = [
        (pid, prod) for pid, prod in all_products.items()
        if isinstance(prod, dict) and prod.get("active")
    ]

    def _norm(v) -> str:
        return str(v or "").strip().lower()

    # tiebreaker chain — narrow until 1 remains or exhausted
    def _filter(lst, key_fb, local_val):
        if not local_val:
            return lst
        matched = [(pid, p) for pid, p in lst if _norm(p.get(key_fb)) == local_val]
        return matched if matched else lst  # don't narrow if nothing matches

    candidates = _filter(candidates, "Battery Pack", battery_pack)
    candidates = _filter(candidates, "Battery Partcode", partcode)
    candidates = _filter(candidates, "Creation Date", creation_date)

    # dollar rate OR created_by
    if len(candidates) > 1:
        by_rate = [
            (pid, p) for pid, p in candidates
            if _norm(p.get("Dollar Rate")) == dollar_rate and dollar_rate
        ]
        by_creator = [
            (pid, p) for pid, p in candidates
            if _norm(p.get("Created By")) == created_by and created_by
        ]
        combined = {pid: p for pid, p in by_rate + by_creator}.items()
        combined = list(combined)
        if combined:
            candidates = combined

    # word-similarity tiebreaker on remaining numeric fields
    if len(candidates) > 1:
        fb_numeric = [
            ("FOB Cost Of Cells", "fob_cost"),
            ("BMS or PCM cost", "bms_pcm_cost"),
            ("Total Cost of Pack (A)", "total_cost"),
            ("Cell Capacity", "cell_capacity"),
            ("Ampheres capacity", "ampere_capacity"),
        ]
        def _score(prod: dict) -> int:
            return sum(
                1 for fb_key, local_key in fb_numeric
                if _norm(prod.get(fb_key)) == _norm(d.get(local_key))
            )
        candidates = sorted(candidates, key=lambda x: _score(x[1]), reverse=True)

    if not candidates:
        return {"deactivated": 0, "reason": "no matching active record found"}

    target_pid = candidates[0][0]
    try:
        fdb.reference(f"products/{duration}/{target_pid}").update({"active": False})
    except Exception as e:
        raise HTTPException(500, f"Firebase update failed: {e}")

    return {"deactivated": 1, "firebase_id": str(target_pid)}


class SnapshotLoad(BaseModel):
    snapshot: str  # raw data_snapshot JSON string


@router.post("/load-snapshot")
def load_snapshot(body: SnapshotLoad, user=Depends(get_expert_user)):
    """Clear tree and load rows from a project file snapshot."""
    import json as _json
    try:
        data = _json.loads(body.snapshot)
    except Exception:
        raise HTTPException(400, "Invalid snapshot JSON")

    columns = data.get("columns", [])
    rows = data.get("rows", [])
    if not columns or not rows:
        raise HTTPException(400, "Snapshot has no data")

    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    conn.execute("DELETE FROM tree")

    quoted = [f'"{c}"' for c in COLUMNS]
    placeholders = ",".join(["?"] * len(COLUMNS))
    insert_q = f'INSERT INTO tree ({",".join(quoted)}) VALUES ({placeholders})'

    col_idx = {c: i for i, c in enumerate(columns)}

    def _get(row, col_name):
        i = col_idx.get(col_name)
        return row[i] if i is not None and i < len(row) else ""

    for row in rows:
        values = [_get(row, c) for c in COLUMNS]
        conn.execute(insert_q, values)

    conn.commit()
    conn.close()
    return {"detail": f"Loaded {len(rows)} row(s)"}


class PreviewRequest(BaseModel):
    battery_config: str
    backup_minutes: float = 0  # filter to matching duration if > 0


class PreviewRangeRequest(BaseModel):
    battery_config: str
    backup_minutes: float = 0
    range_ah: float = 0  # show config-range, config, config+range


def _product_values(duration: str, product: dict) -> list:
    return [
        duration,
        product.get("Battery Pack", ""),
        product.get("Voltage", 0),
        product.get("Ampheres capacity", 0),
        product.get("KW calculation", 0),
        product.get("Cell Voltage", 0),
        product.get("Cell Capacity", 0),
        product.get("Combination of Cells in Series", 0),
        product.get("Combination of Cells in parallel", 0),
        product.get("Total No Of Cells", 0),
        product.get("FOB Cost Of Cells", 0),
        product.get("Total FOB Cost of Cells", 0),
        product.get("Clearing & Customs 1", 0),
        product.get("Total Landed cost In India 1", 0),
        product.get("Cost In INR-(1)", 0),
        product.get("BMS or PCM cost", 0),
        product.get("Clearing & Customs 2", 0),
        product.get("Total Landed cost In India 2", 0),
        product.get("Cost In INR-(2)", 0),
        product.get("Cabinet", 0),
        product.get("Bus Bar", 0),
        product.get("Holder or Caps", 0),
        product.get("Wire & Gasket & Other Assesorries", 0),
        product.get("Terminals+ Connectors", 0),
        product.get("MCB or Fuse", 0),
        product.get("Lugs & Slew", 0),
        product.get("Nut Bolts", 0),
        product.get("Fiber glass +rod", 0),
        product.get("Awg cables", 0),
        product.get("Shipping Charges", 0),
        product.get("Packaging cost with safety packs", 0),
        product.get("Total Other Chargers(3)", 0),
        product.get("Landing cost of material (1+2+3)", 0),
        product.get("Production Labour & Assembly overheads", 0),
        product.get("Warranty  & Service provision", 0),
        product.get("Total Cost of Pack (A)", 0),
        product.get("Margin @10 % On Cost", 0),
        product.get("Estimated Sales Cost-(B)", 0),
        product.get("Margin @15% On Cost", 0),
        product.get("Estimated Sales Cost-(B+5)", 0),
        product.get("Per Kw Pricing @ cost (A)", 0),
        product.get("Per Kw pricing @ ist level profit (B)", 0),
        product.get("Per Kw pricing @ 2nd evel profit (B+5)", 0),
        product.get("BMS or PCM", ""),
        product.get("Cell Chemistry", ""),
        product.get("Centre tapping", ""),
        product.get("Type of Cell", ""),
        product.get("Application", ""),
        product.get("Enclosure", ""),
        product.get("Mount", ""),
        product.get("Brand and type of cell", ""),
        product.get("Installation indoor or outdoor", ""),
        product.get("Battery Partcode", ""),
        product.get("Dollar Rate", ""),
        product.get("Creation Date", ""),
        product.get("Created By", ""),
    ]


@router.post("/preview")
def preview_costing(body: PreviewRequest, user=Depends(get_current_user)):
    """Clear tree and load all products matching battery_config across all Firebase durations."""
    keyword = body.battery_config.strip().lower()
    if not keyword:
        raise HTTPException(400, "battery_config required")
    try:
        import sys
        sys.path.insert(0, str(APP_DIR))
        from basefunctions import get_all_durations
        from firebase_admin import db as fdb
        durations = get_all_durations()
    except Exception as e:
        raise HTTPException(503, f"Firebase error: {e}")

    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    conn.execute("DELETE FROM tree")
    quoted = [f'"{c}"' for c in COLUMNS]
    placeholders = ",".join(["?"] * len(COLUMNS))
    insert_q = f'INSERT INTO tree ({",".join(quoted)}) VALUES ({placeholders})'

    # filter to duration matching backup_minutes, fallback to all if none found
    target_minutes = int(body.backup_minutes) if body.backup_minutes > 0 else None
    if target_minutes:
        filtered = [d for d in durations if ''.join(filter(str.isdigit, d)) == str(target_minutes)]
        search_durations = filtered if filtered else durations
    else:
        search_durations = durations

    inserted = 0
    for duration in search_durations:
        try:
            products = fdb.reference(f"products/{duration}").get()
            if not products:
                continue
            items = products.items() if isinstance(products, dict) else enumerate(products)
            for _, product in items:
                if not isinstance(product, dict):
                    continue
                bp = str(product.get("Battery Pack", "")).lower()
                if keyword in bp and product.get("active"):
                    conn.execute(insert_q, _product_values(duration, product))
                    inserted += 1
        except Exception:
            continue

    # if filtered search found nothing, retry with all durations
    if inserted == 0 and search_durations != durations:
        for duration in durations:
            try:
                products = fdb.reference(f"products/{duration}").get()
                if not products:
                    continue
                items = products.items() if isinstance(products, dict) else enumerate(products)
                for _, product in items:
                    if not isinstance(product, dict):
                        continue
                    bp = str(product.get("Battery Pack", "")).lower()
                    if keyword in bp and product.get("active"):
                        conn.execute(insert_q, _product_values(duration, product))
                        inserted += 1
            except Exception:
                continue

    conn.commit()
    conn.close()
    return {"loaded": inserted, "durations_searched": len(search_durations)}


@router.post("/preview-range")
def preview_costing_range(body: PreviewRangeRequest, user=Depends(get_current_user)):
    """Clear tree and load products for config-range, config, config+range for given duration."""
    import re
    base_config = body.battery_config.strip()
    if not base_config:
        raise HTTPException(400, "battery_config required")

    range_ah = body.range_ah
    m = re.search(r'(\d+(?:\.\d+)?)\s*[Aa][Hh]', base_config)
    if m and range_ah > 0:
        ah = float(m.group(1))
        def make_config(delta: float) -> str:
            new_ah = ah + delta
            formatted = str(int(new_ah)) if new_ah == int(new_ah) else str(new_ah)
            return re.sub(r'\d+(?:\.\d+)?\s*[Aa][Hh]', f'{formatted}Ah', base_config)
        configs = [make_config(-range_ah), base_config, make_config(range_ah)]
    else:
        configs = [base_config]

    try:
        import sys
        sys.path.insert(0, str(APP_DIR))
        from basefunctions import get_all_durations
        from firebase_admin import db as fdb
        durations = get_all_durations()
    except Exception as e:
        raise HTTPException(503, f"Firebase error: {e}")

    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    conn.execute("DELETE FROM tree")
    quoted = [f'"{c}"' for c in COLUMNS]
    placeholders = ",".join(["?"] * len(COLUMNS))
    insert_q = f'INSERT INTO tree ({",".join(quoted)}) VALUES ({placeholders})'

    target_minutes = int(body.backup_minutes) if body.backup_minutes > 0 else None
    if target_minutes:
        filtered = [d for d in durations if ''.join(filter(str.isdigit, d)) == str(target_minutes)]
        search_durations = filtered if filtered else durations
    else:
        search_durations = durations

    inserted = 0
    for duration in search_durations:
        try:
            products = fdb.reference(f"products/{duration}").get()
            if not products:
                continue
            items = products.items() if isinstance(products, dict) else enumerate(products)
            for _, product in items:
                if not isinstance(product, dict):
                    continue
                bp = str(product.get("Battery Pack", "")).lower()
                if any(cfg.lower() in bp for cfg in configs) and product.get("active"):
                    conn.execute(insert_q, _product_values(duration, product))
                    inserted += 1
        except Exception:
            continue

    # if the specific duration had no matches, retry across all durations
    if inserted == 0 and search_durations != durations:
        for duration in durations:
            try:
                products = fdb.reference(f"products/{duration}").get()
                if not products:
                    continue
                items = products.items() if isinstance(products, dict) else enumerate(products)
                for _, product in items:
                    if not isinstance(product, dict):
                        continue
                    bp = str(product.get("Battery Pack", "")).lower()
                    if any(cfg.lower() in bp for cfg in configs) and product.get("active"):
                        conn.execute(insert_q, _product_values(duration, product))
                        inserted += 1
            except Exception:
                continue

    conn.commit()
    conn.close()
    return {"loaded": inserted, "durations_searched": len(search_durations), "configs": configs}


class FindCostingReq(BaseModel):
    battery_config: str
    backup_minutes: float = 0
    centre_tap: str = ""
    cell_type: str = ""
    range_ah: float = 0


@router.post("/find")
def find_costing(body: FindCostingReq, _=Depends(get_current_user)):
    """Read-only Firebase search — does NOT touch the costing tree."""
    import re
    base_config = body.battery_config.strip()
    if not base_config:
        raise HTTPException(400, "battery_config required")

    range_ah = body.range_ah
    m = re.search(r'(\d+(?:\.\d+)?)\s*[Aa][Hh]', base_config)
    if m and range_ah > 0:
        ah = float(m.group(1))
        def _make(delta: float) -> str:
            nah = ah + delta
            fmt = str(int(nah)) if nah == int(nah) else str(nah)
            return re.sub(r'\d+(?:\.\d+)?\s*[Aa][Hh]', f'{fmt}Ah', base_config)
        keywords = list({_make(-range_ah).lower(), base_config.lower(), _make(range_ah).lower()})
    else:
        keywords = [base_config.lower()]
    try:
        import sys
        sys.path.insert(0, str(APP_DIR))
        from basefunctions import get_all_durations
        from firebase_admin import db as fdb
        durations = get_all_durations()
    except Exception as e:
        raise HTTPException(503, f"Firebase error: {e}")

    target_minutes = int(body.backup_minutes) if body.backup_minutes > 0 else None
    if target_minutes:
        filtered = [d for d in durations if ''.join(filter(str.isdigit, d)) == str(target_minutes)]
        search_durations = filtered if filtered else durations
    else:
        search_durations = durations

    results = []
    for duration in search_durations:
        try:
            products = fdb.reference(f"products/{duration}").get()
            if not products:
                continue
            items = products.items() if isinstance(products, dict) else enumerate(products)
            for _, product in items:
                if not isinstance(product, dict):
                    continue
                bp = str(product.get("Battery Pack", "")).lower()
                if not any(kw in bp for kw in keywords):
                    continue
                if not product.get("active"):
                    continue
                if body.centre_tap:
                    ct = str(product.get("Centre tap/non centre tap", "")).strip().lower()
                    if ct and body.centre_tap.lower() not in ct:
                        continue
                if body.cell_type:
                    cy = str(product.get("Cylindrical/ Prismatic", "")).strip().lower()
                    if cy and body.cell_type.lower() not in cy:
                        continue
                results.append({
                    "duration":           duration,
                    "battery_pack":       product.get("Battery Pack", ""),
                    "voltage":            product.get("Voltage", ""),
                    "ampere_capacity":    product.get("Ampheres capacity", ""),
                    "kw_calculation":     product.get("KW calculation", ""),
                    "cell_voltage":       product.get("Cell Voltage", ""),
                    "cell_capacity":      product.get("Cell Capacity", ""),
                    "cells_in_series":    product.get("Combination of Cells in Series", ""),
                    "cells_in_parallel":  product.get("Combination of Cells in parallel", ""),
                    "total_cells":        product.get("Total No Of Cells", ""),
                    "fob_cost":           product.get("FOB Cost Of Cells", ""),
                    "total_fob":          product.get("Total FOB Cost of Cells", ""),
                    "clearing_customs_1": product.get("Clearing & Customs 1", ""),
                    "total_landed_1":     product.get("Total Landed cost In India 1", ""),
                    "cost_inr_1":         product.get("Cost In INR-(1)", ""),
                    "bms_pcm_cost":       product.get("BMS or PCM cost", ""),
                    "clearing_customs_2": product.get("Clearing & Customs 2", ""),
                    "total_landed_2":     product.get("Total Landed cost In India 2", ""),
                    "cost_inr_2":         product.get("Cost In INR-(2)", ""),
                    "cabinet":            product.get("Cabinet", ""),
                    "bus_bar":            product.get("Bus Bar", ""),
                    "holder_caps":        product.get("Holder or Caps", ""),
                    "wire_gasket":        product.get("Wire & Gasket & Other Assesorries", ""),
                    "terminals":          product.get("Terminals+ Connectors", ""),
                    "mcb_fuse":           product.get("MCB or Fuse", ""),
                    "lugs_slew":          product.get("Lugs & Slew", ""),
                    "nut_bolts":          product.get("Nut Bolts", ""),
                    "fiber_glass":        product.get("Fiber glass +rod", ""),
                    "awg_cables":         product.get("Awg cables", ""),
                    "shipping":           product.get("Shipping Charges", ""),
                    "packaging":          product.get("Packaging cost with safety packs", ""),
                    "total_other":        product.get("Total Other Chargers(3)", ""),
                    "landing_cost":       product.get("Landing cost of material (1+2+3)", ""),
                    "labour":             product.get("Production Labour & Assembly overheads", ""),
                    "warranty":           product.get("Warranty  & Service provision", ""),
                    "total_cost":         product.get("Total Cost of Pack (A)", ""),
                    "margin_10":          product.get("Margin @10 % On Cost", ""),
                    "est_sales_b":        product.get("Estimated Sales Cost-(B)", ""),
                    "margin_15":          product.get("Margin @15% On Cost", ""),
                    "est_sales_b5":       product.get("Estimated Sales Cost-(B+5)", ""),
                    "per_kw_cost":        product.get("Per Kw Pricing @ cost (A)", ""),
                    "per_kw_b":           product.get("Per Kw pricing @ ist level profit (B)", ""),
                    "per_kw_b5":          product.get("Per Kw pricing @ 2nd evel profit (B+5)", ""),
                    "bms_pcm":            product.get("BMS or PCM", ""),
                    "cell_chemistry":     product.get("Cell Chemistry", ""),
                    "centre_tap":         product.get("Centre tapping", ""),
                    "cell_type":          product.get("Type of Cell", ""),
                    "application":        product.get("Application", ""),
                    "enclosure":          product.get("Enclosure", ""),
                    "mount":              product.get("Mount", ""),
                    "brand":              product.get("Brand and type of cell", ""),
                    "installation":       product.get("Installation indoor or outdoor", ""),
                    "partcode":           product.get("Battery Partcode", ""),
                    "dollar_rate":        product.get("Dollar Rate", ""),
                    "creation_date":      product.get("Creation Date", ""),
                    "created_by":         product.get("Created By", ""),
                })
        except Exception:
            continue

    return {"results": results, "count": len(results)}


@router.post("/tree/bulk-restore")
def bulk_restore(rows: List[CostingRow], user=Depends(get_current_user)):
    """Clear tree and restore a saved list of rows."""
    db = get_user_costing_db(user["username"])
    _ensure_tree(db)
    conn = _get_conn(db)
    conn.execute("DELETE FROM tree")
    quoted = [f'"{c}"' for c in COLUMNS]
    placeholders = ",".join(["?"] * len(COLUMNS))
    insert_q = f'INSERT INTO tree ({",".join(quoted)}) VALUES ({placeholders})'
    for row in rows:
        conn.execute(insert_q, _model_to_values(row))
    conn.commit()
    conn.close()
    return {"restored": len(rows)}


@router.post("/mass-update")
def mass_update(body: MassUpdateRequest, user=Depends(get_admin_user)):
    from config import settings as _settings
    if body.admin_password != _settings.ADMIN_PASSWORD:
        raise HTTPException(403, "Incorrect admin password")
    if body.field not in _FB:
        raise HTTPException(400, f"Field '{body.field}' not supported for mass update")
    if body.percent == 0:
        raise HTTPException(400, "Percent cannot be 0")

    multiplier = 1 + (body.percent / 100)

    try:
        import sys
        sys.path.insert(0, str(APP_DIR))
        from basefunctions import get_all_durations
        from firebase_admin import db
        durations = get_all_durations()
    except Exception as e:
        raise HTTPException(503, f"Firebase error: {e}")

    updated_count = 0
    errors = []

    for duration in durations:
        try:
            ref = db.reference(f"products/{duration}")
            products = ref.get()
            if not products:
                continue
            items = products.items() if isinstance(products, dict) else enumerate(products)
            for pid, product in items:
                if not isinstance(product, dict):
                    continue
                if not product.get("active"):
                    continue
                try:
                    changes = _apply_mass_update(product, body.field, multiplier)
                    db.reference(f"products/{duration}/{pid}").update(changes)
                    updated_count += 1
                except Exception as e:
                    errors.append(f"{duration}/{pid}: {e}")
        except Exception as e:
            errors.append(f"{duration}: {e}")

    return {
        "updated": updated_count,
        "durations": len(durations),
        "errors": errors[:10],
    }


@router.get("/mass-update/preview")
def mass_update_preview(_=Depends(get_current_user)):
    """Return count of products per duration."""
    try:
        import sys
        sys.path.insert(0, str(APP_DIR))
        from basefunctions import get_all_durations
        from firebase_admin import db
        durations = get_all_durations()
        result = []
        for d in durations:
            products = db.reference(f"products/{d}").get()
            count = len(products) if isinstance(products, dict) else (len(products) if isinstance(products, list) else 0)
            result.append({"duration": d, "count": count})
        return result
    except Exception as e:
        raise HTTPException(503, str(e))


# COSTING EXPORT DISABLED — do not re-enable without authorisation
# @router.get("/export")
# def export_costing(user=Depends(get_current_user)):
#     db = get_user_costing_db(user["username"])
#     _ensure_tree(db)
#     try:
#         import openpyxl
#         wb = openpyxl.load_workbook(TEMPLATE)
#         ws = wb.active
#
#         conn = _get_conn(db)
#         cur = conn.cursor()
#         cur.execute("SELECT * FROM tree")
#         rows = cur.fetchall()
#         conn.close()
#
#         for c_idx, row in enumerate(rows, start=2):
#             for r_idx, val in enumerate(row, start=3):
#                 ws.cell(row=r_idx, column=c_idx).value = val
#
#         tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
#         wb.save(tmp.name)
#         return FileResponse(
#             tmp.name,
#             media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
#             filename="costing_export.xlsx",
#         )
#     except Exception as e:
#         raise HTTPException(500, str(e))


# COSTING EXPORT DISABLED — do not re-enable without authorisation
# class WizardCostingExportBody(BaseModel):
#     rows: list[dict]
#     project_name: str = ""
#
#
# def _build_wizard_costing_excel(body: "WizardCostingExportBody") -> str:
#     import openpyxl
#     wb = openpyxl.load_workbook(TEMPLATE)
#     ws = wb.active
#
#     for c_idx, r in enumerate(body.rows, start=2):
#         cr = CostingRow(
#             duration=r.get("duration", ""),
#             battery_pack=r.get("battery_pack", ""),
#             voltage=r.get("voltage", 0),
#             ampere_capacity=r.get("ampere_capacity", 0),
#             kw_calculation=r.get("kw_calculation", 0),
#             cell_voltage=r.get("cell_voltage", 0),
#             cell_capacity=r.get("cell_capacity", 0),
#             cells_in_series=r.get("cells_in_series", 0),
#             cells_in_parallel=r.get("cells_in_parallel", 0),
#             total_cells=r.get("total_cells", 0),
#             fob_cost=r.get("fob_cost", 0),
#             total_fob=r.get("total_fob", 0),
#             clearing_customs_1=r.get("clearing_customs_1", 0),
#             total_landed_1=r.get("total_landed_1", 0),
#             cost_inr_1=r.get("cost_inr_1", 0),
#             bms_pcm_cost=r.get("bms_pcm_cost", 0),
#             clearing_customs_2=r.get("clearing_customs_2", 0),
#             total_landed_2=r.get("total_landed_2", 0),
#             cost_inr_2=r.get("cost_inr_2", 0),
#             cabinet=r.get("cabinet", 0),
#             bus_bar=r.get("bus_bar", 0),
#             holder_caps=r.get("holder_caps", 0),
#             wire_gasket=r.get("wire_gasket", 0),
#             terminals=r.get("terminals", 0),
#             mcb_fuse=r.get("mcb_fuse", 0),
#             lugs_slew=r.get("lugs_slew", 0),
#             nut_bolts=r.get("nut_bolts", 0),
#             fiber_glass=r.get("fiber_glass", 0),
#             awg_cables=r.get("awg_cables", 0),
#             shipping=r.get("shipping", 0),
#             packaging=r.get("packaging", 0),
#             total_other=r.get("total_other", 0),
#             landing_cost=r.get("landing_cost", 0),
#             labour=r.get("labour", 0),
#             warranty=r.get("warranty", 0),
#             total_cost=r.get("total_cost", 0),
#             margin_10=r.get("margin_10", 0),
#             est_sales_b=r.get("est_sales_b", 0),
#             margin_15=r.get("margin_15", 0),
#             est_sales_b5=r.get("est_sales_b5", 0),
#             per_kw_cost=r.get("per_kw_cost", 0),
#             per_kw_profit1=r.get("per_kw_profit1") or r.get("per_kw_b", 0),
#             per_kw_profit2=r.get("per_kw_profit2") or r.get("per_kw_b5", 0),
#             bms_pcm_type=r.get("bms_pcm_type") or r.get("bms_pcm", ""),
#             cell_chemistry=r.get("cell_chemistry", ""),
#             centre_tap=r.get("centre_tap", ""),
#             cell_type=r.get("cell_type", ""),
#             application=r.get("application", ""),
#             enclosure=r.get("enclosure", ""),
#             mount=r.get("mount", ""),
#             brand=r.get("brand", ""),
#             installation=r.get("installation", ""),
#             partcode=r.get("partcode", ""),
#             dollar_rate=r.get("dollar_rate", ""),
#             creation_date=r.get("creation_date", ""),
#             created_by=r.get("created_by", ""),
#         )
#         for r_idx, val in enumerate(_model_to_values(cr), start=3):
#             ws.cell(row=r_idx, column=c_idx).value = val
#
#     tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
#     wb.save(tmp.name)
#     return tmp.name
#
#
# @router.post("/export-wizard")
# def export_costing_wizard(body: WizardCostingExportBody, user=Depends(get_current_user)):
#     db = get_user_costing_db(user["username"])
#     _ensure_tree(db)
#     try:
#         xlsx_path = _build_wizard_costing_excel(body)
#         fname = f"{body.project_name or 'costing'}_costing.xlsx"
#         return FileResponse(xlsx_path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
#                             filename=fname)
#     except Exception as e:
#         raise HTTPException(500, str(e))
#
#
# @router.post("/export-wizard/pdf")
# def export_costing_wizard_pdf(body: WizardCostingExportBody, user=Depends(get_current_user)):
#     db = get_user_costing_db(user["username"])
#     _ensure_tree(db)
#     try:
#         xlsx_path = _build_wizard_costing_excel(body)
#         pdf_path = xlsx_path.replace(".xlsx", ".pdf")
#         import win32com.client
#         excel = win32com.client.Dispatch("Excel.Application")
#         excel.Visible = False
#         excel.DisplayAlerts = False
#         try:
#             wb = excel.Workbooks.Open(os.path.abspath(xlsx_path))
#             for sheet in wb.Sheets:
#                 sheet.PageSetup.Zoom = False
#                 sheet.PageSetup.FitToPagesWide = 1
#                 sheet.PageSetup.FitToPagesTall = False
#             wb.ExportAsFixedFormat(0, os.path.abspath(pdf_path))
#             wb.Close(False)
#         finally:
#             excel.Quit()
#         os.unlink(xlsx_path)
#     except ImportError:
#         raise HTTPException(501, "PDF export requires Microsoft Excel installed on the server")
#     except Exception as e:
#         raise HTTPException(500, str(e))
#     fname = f"{body.project_name or 'costing'}_costing.pdf"
#     return FileResponse(pdf_path, media_type="application/pdf", filename=fname)
