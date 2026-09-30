import io
import os
import re
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
import psycopg2

from auth import get_expert_user
from pg import get_conn, dict_cur

router = APIRouter()

APP_DIR = Path(__file__).parent.parent.parent.parent


def _exact_costing_match(partcode: str) -> Optional[dict]:
    """Search every duration's product bucket for a Battery Partcode that
    matches exactly (case/whitespace-insensitive). Same data source as
    POST /api/costing/find, just an exact key instead of a fuzzy keyword."""
    partcode = (partcode or "").strip().lower()
    if not partcode:
        return None
    try:
        sys.path.insert(0, str(APP_DIR))
        from basefunctions import get_all_durations
        import pgfire
        durations = get_all_durations()
    except Exception:
        return None

    for duration in durations:
        try:
            products = pgfire.get("products", duration)
            if not products:
                continue
            items = products.items() if isinstance(products, dict) else enumerate(products)
            for _, product in items:
                if not isinstance(product, dict) or not product.get("active"):
                    continue
                if str(product.get("Battery Partcode", "")).strip().lower() == partcode:
                    return {
                        "partcode": product.get("Battery Partcode", ""),
                        "est_sales_b": product.get("Estimated Sales Cost-(B)", 0) or 0,
                    }
        except Exception:
            continue
    return None


# ── schemas ──────────────────────────────────────────────────────────────────

class OemCreate(BaseModel):
    name: str


class SheetCreate(BaseModel):
    label: str


class SheetUpdate(BaseModel):
    label: Optional[str] = None
    sort_order: Optional[int] = None


PRODUCT_FIELDS = [
    "ups_model", "nominal_dc_voltage", "backup_requirement_min", "chemistry",
    "centre_tap", "cell_type", "ups_rating_kva", "power_factor",
    "inverter_efficiency", "end_cell_voltage", "max_charging_voltage",
    "calculated_load_kw", "energy_required_kwh", "capacity_required_ah",
    "nearest_capacity_ah", "total_available_energy_kwh", "kwh_approx",
    "ah_approx", "backup_min_bol", "configuration", "price_with_cabinet_bms",
    "costing_tree_id", "sort_order",
]


class ProductUpdate(BaseModel):
    class Config:
        extra = "ignore"
    ups_model: Optional[str] = None
    nominal_dc_voltage: Optional[float] = None
    backup_requirement_min: Optional[float] = None
    chemistry: Optional[str] = None
    centre_tap: Optional[str] = None
    cell_type: Optional[str] = None
    ups_rating_kva: Optional[float] = None
    power_factor: Optional[float] = None
    inverter_efficiency: Optional[float] = None
    end_cell_voltage: Optional[float] = None
    max_charging_voltage: Optional[float] = None
    calculated_load_kw: Optional[float] = None
    energy_required_kwh: Optional[float] = None
    capacity_required_ah: Optional[float] = None
    nearest_capacity_ah: Optional[float] = None
    total_available_energy_kwh: Optional[float] = None
    kwh_approx: Optional[float] = None
    ah_approx: Optional[float] = None
    backup_min_bol: Optional[float] = None
    configuration: Optional[str] = None
    price_with_cabinet_bms: Optional[float] = None
    original_price: Optional[float] = None
    costing_tree_id: Optional[int] = None
    sort_order: Optional[int] = None


# ── OEMs ─────────────────────────────────────────────────────────────────────

@router.get("")
def list_oems(_=Depends(get_expert_user)):
    with get_conn() as con:
        cur = dict_cur(con)
        cur.execute("SELECT id, name, created_at FROM oems ORDER BY name")
        return [dict(r) for r in cur.fetchall()]


@router.post("", status_code=201)
def create_oem(body: OemCreate, _=Depends(get_expert_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name required")
    with get_conn() as con:
        cur = con.cursor()
        try:
            cur.execute(
                "INSERT INTO oems (name, created_at) VALUES (%s, %s) RETURNING id",
                (name, int(time.time() * 1000)),
            )
        except Exception:
            raise HTTPException(409, f"OEM '{name}' already exists")
        return {"id": cur.fetchone()[0], "name": name}


@router.delete("/{oem_id}")
def delete_oem(oem_id: int, _=Depends(get_expert_user)):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("DELETE FROM oems WHERE id = %s", (oem_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "OEM not found")
    return {"detail": "deleted"}


# ── sheets (pages) ────────────────────────────────────────────────────────────

@router.get("/{oem_id}/sheets")
def list_sheets(oem_id: int, _=Depends(get_expert_user)):
    with get_conn() as con:
        cur = dict_cur(con)
        cur.execute(
            "SELECT * FROM oem_sheets WHERE oem_id = %s ORDER BY sort_order, id",
            (oem_id,),
        )
        return [dict(r) for r in cur.fetchall()]


@router.post("/{oem_id}/sheets", status_code=201)
def create_sheet(oem_id: int, body: SheetCreate, _=Depends(get_expert_user)):
    label = body.label.strip()
    if not label:
        raise HTTPException(400, "Label required")
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM oem_sheets WHERE oem_id = %s", (oem_id,))
        next_order = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO oem_sheets (oem_id, label, sort_order) VALUES (%s, %s, %s) RETURNING id",
            (oem_id, label, next_order),
        )
        return {"id": cur.fetchone()[0], "label": label, "sort_order": next_order}


@router.patch("/sheets/{sheet_id}")
def update_sheet(sheet_id: int, body: SheetUpdate, _=Depends(get_expert_user)):
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if not fields:
        return {"detail": "nothing to update"}
    sets = ", ".join(f"{k} = %s" for k in fields)
    with get_conn() as con:
        cur = con.cursor()
        cur.execute(f"UPDATE oem_sheets SET {sets} WHERE id = %s", list(fields.values()) + [sheet_id])
        if cur.rowcount == 0:
            raise HTTPException(404, "Sheet not found")
    return {"detail": "updated"}


@router.delete("/sheets/{sheet_id}")
def delete_sheet(sheet_id: int, _=Depends(get_expert_user)):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("DELETE FROM oem_sheets WHERE id = %s", (sheet_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Sheet not found")
    return {"detail": "deleted"}


# ── products (columns) ────────────────────────────────────────────────────────

@router.get("/sheets/{sheet_id}/products")
def list_products(sheet_id: int, _=Depends(get_expert_user)):
    with get_conn() as con:
        cur = dict_cur(con)
        cur.execute(
            "SELECT * FROM oem_products WHERE sheet_id = %s ORDER BY sort_order, id",
            (sheet_id,),
        )
        return [dict(r) for r in cur.fetchall()]


@router.post("/sheets/{sheet_id}/auto-match")
def auto_match_sheet(sheet_id: int, _=Depends(get_expert_user)):
    """For every product on this sheet with a Configuration but no price yet,
    try an exact costing partcode match and fill it in."""
    with get_conn() as con:
        cur = dict_cur(con)
        cur.execute(
            "SELECT id, configuration FROM oem_products WHERE sheet_id = %s AND configuration != '' AND price_with_cabinet_bms IS NULL",
            (sheet_id,),
        )
        candidates = [dict(r) for r in cur.fetchall()]

    matched = 0
    with get_conn() as con:
        cur = con.cursor()
        for row in candidates:
            match = _exact_costing_match(row["configuration"])
            if match and match["est_sales_b"]:
                cur.execute(
                    "UPDATE oem_products SET price_with_cabinet_bms = %s WHERE id = %s",
                    (float(match["est_sales_b"]), row["id"]),
                )
                matched += 1

    return {"checked": len(candidates), "matched": matched}


@router.post("/sheets/{sheet_id}/products", status_code=201)
def create_product(sheet_id: int, _=Depends(get_expert_user)):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM oem_products WHERE sheet_id = %s", (sheet_id,))
        next_order = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO oem_products (sheet_id, sort_order) VALUES (%s, %s) RETURNING id",
            (sheet_id, next_order),
        )
        return {"id": cur.fetchone()[0]}


@router.patch("/products/{product_id}")
def update_product(product_id: int, body: ProductUpdate, _=Depends(get_expert_user)):
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if not fields:
        return {"detail": "nothing to update"}
    sets = ", ".join(f'"{k}" = %s' for k in fields)
    with get_conn() as con:
        cur = con.cursor()
        cur.execute(f'UPDATE oem_products SET {sets} WHERE id = %s', list(fields.values()) + [product_id])
        if cur.rowcount == 0:
            raise HTTPException(404, "Product not found")
    return {"detail": "updated"}


@router.post("/products/{product_id}/revert-price")
def revert_product_price(product_id: int, _=Depends(get_expert_user)):
    """Restore price_with_cabinet_bms from original_price and clear original_price.
    No-op if the item has no margin applied (original_price is NULL)."""
    with get_conn() as con:
        cur = con.cursor()
        cur.execute(
            """UPDATE oem_products SET price_with_cabinet_bms = original_price, original_price = NULL
               WHERE id = %s AND original_price IS NOT NULL""",
            (product_id,),
        )
    return {"detail": "reverted"}


@router.delete("/products/{product_id}")
def delete_product(product_id: int, _=Depends(get_expert_user)):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("DELETE FROM oem_products WHERE id = %s", (product_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Product not found")
    return {"detail": "deleted"}


# ── product extras (modular rack / custom cost line items) ────────────────────

class ExtraCreate(BaseModel):
    item_type: str  # 'rack' | 'custom'
    description: str = ""
    quantity: int = 1
    price: float = 0


@router.get("/sheets/{sheet_id}/extras")
def list_sheet_extras(sheet_id: int, _=Depends(get_expert_user)):
    """All extras for every product on this sheet, in one call."""
    with get_conn() as con:
        cur = dict_cur(con)
        cur.execute(
            """SELECT e.* FROM oem_product_extras e
               JOIN oem_products p ON p.id = e.product_id
               WHERE p.sheet_id = %s
               ORDER BY e.product_id, e.sort_order, e.id""",
            (sheet_id,),
        )
        return [dict(r) for r in cur.fetchall()]


@router.post("/products/{product_id}/extras", status_code=201)
def add_extra(product_id: int, body: ExtraCreate, _=Depends(get_expert_user)):
    if body.item_type not in ("rack", "custom"):
        raise HTTPException(400, "item_type must be 'rack' or 'custom'")
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT 1 FROM oem_products WHERE id = %s", (product_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Product not found")
        cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM oem_product_extras WHERE product_id = %s", (product_id,))
        next_order = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO oem_product_extras (product_id, item_type, description, quantity, price, sort_order)
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
            (product_id, body.item_type, body.description, body.quantity, body.price, next_order),
        )
        return {"id": cur.fetchone()[0]}


class ExtraUpdate(BaseModel):
    price: Optional[float] = None
    original_price: Optional[float] = None


@router.patch("/extras/{extra_id}")
def update_extra(extra_id: int, body: ExtraUpdate, _=Depends(get_expert_user)):
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if not fields:
        return {"detail": "nothing to update"}
    sets = ", ".join(f'"{k}" = %s' for k in fields)
    with get_conn() as con:
        cur = con.cursor()
        cur.execute(f'UPDATE oem_product_extras SET {sets} WHERE id = %s', list(fields.values()) + [extra_id])
        if cur.rowcount == 0:
            raise HTTPException(404, "Extra not found")
    return {"detail": "updated"}


@router.post("/extras/{extra_id}/revert-price")
def revert_extra_price(extra_id: int, _=Depends(get_expert_user)):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute(
            """UPDATE oem_product_extras SET price = original_price, original_price = NULL
               WHERE id = %s AND original_price IS NOT NULL""",
            (extra_id,),
        )
    return {"detail": "reverted"}


@router.delete("/extras/{extra_id}")
def delete_extra(extra_id: int, _=Depends(get_expert_user)):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("DELETE FROM oem_product_extras WHERE id = %s", (extra_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Extra not found")
    return {"detail": "deleted"}


# ── import from xlsx ──────────────────────────────────────────────────────────

# normalized row-label -> product field. Matching is done against the row's
# label cell after collapsing whitespace and lowercasing, so trailing spaces /
# minor wording drift between OEM files don't break the match.
_LABEL_MAP = {
    "ups model name": "ups_model",
    "nominal dc voltage (v)": "nominal_dc_voltage",
    "back up requirement(min)": "backup_requirement_min",
    "chemistry": "chemistry",
    "ups is centre tap or not (2 wire or 3 wire system)": "centre_tap",
    "cell type": "cell_type",
    "ups rating (kva)": "ups_rating_kva",
    "power factor": "power_factor",
    "inverter efficiency": "inverter_efficiency",
    "end cell voltage(v)": "end_cell_voltage",
    "maximum charging voltage(v)": "max_charging_voltage",
    "calculated load in kw": "calculated_load_kw",
    "energy required(kwh)": "energy_required_kwh",
    "capacity required (ah)": "capacity_required_ah",
    "nearest available capacity(ah)": "nearest_capacity_ah",
    "total available energy (kwh)": "total_available_energy_kwh",
    "kwh approx": "kwh_approx",
    "ah": "ah_approx",
    "available approximate back up (min) at bol": "backup_min_bol",
    "configuration": "configuration",
    "price with cabinet & bms (exclusive gst)": "price_with_cabinet_bms",
}

_NUMERIC_FIELDS = {
    "nominal_dc_voltage", "backup_requirement_min", "ups_rating_kva",
    "power_factor", "inverter_efficiency", "end_cell_voltage",
    "max_charging_voltage", "calculated_load_kw", "energy_required_kwh",
    "capacity_required_ah", "nearest_capacity_ah", "total_available_energy_kwh",
    "kwh_approx", "ah_approx", "backup_min_bol", "price_with_cabinet_bms",
}


def _norm_label(v) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip().lower()


def _locate(ws):
    """Find which row each known field lives on, and which columns actually
    have product data. Returns ({field: row_number}, [col_index, ...])."""
    row_for_field: dict = {}
    for row in ws.iter_rows():
        label_cell = row[0]
        key = _LABEL_MAP.get(_norm_label(label_cell.value))
        if key:
            row_for_field[key] = row[0].row

    if not row_for_field:
        return {}, []

    max_col = max(ws.max_column, 2)
    active_cols = []
    for col in range(2, max_col + 1):
        if any(ws.cell(row=r, column=col).value not in (None, "") for r in row_for_field.values()):
            active_cols.append(col)
    return row_for_field, active_cols


def _parse_sheet(ws) -> list:
    """Return one dict per product column found in this worksheet, or [] if
    the sheet doesn't look like a product-page (no recognised row labels)."""
    row_for_field, active_cols = _locate(ws)
    if not row_for_field:
        return []

    products = []
    for col_idx in active_cols:
        product: dict = {}
        for field, row_num in row_for_field.items():
            val = ws.cell(row=row_num, column=col_idx).value
            if val is None or str(val).strip() == "":
                continue
            if field in _NUMERIC_FIELDS:
                try:
                    product[field] = float(val)
                except (TypeError, ValueError):
                    continue
            else:
                product[field] = str(val).strip()
        if product:
            products.append(product)
    return products


@router.post("/{oem_id}/import")
async def import_sheet_file(oem_id: int, file: UploadFile = File(...), _=Depends(get_expert_user)):
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(501, "openpyxl not installed")

    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT 1 FROM oems WHERE id = %s", (oem_id,))
        if not cur.fetchone():
            raise HTTPException(404, "OEM not found")

    raw = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
    except Exception as e:
        raise HTTPException(400, f"Could not read file: {e}")

    sheets_created = 0
    products_created = 0
    products_matched = 0

    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM oem_sheets WHERE oem_id = %s", (oem_id,))
        next_sheet_order = cur.fetchone()[0]

        for ws in wb.worksheets:
            products = _parse_sheet(ws)
            if not products:
                continue

            cur.execute(
                "INSERT INTO oem_sheets (oem_id, label, sort_order) VALUES (%s, %s, %s) RETURNING id",
                (oem_id, ws.title, next_sheet_order),
            )
            sheet_id = cur.fetchone()[0]
            next_sheet_order += 1
            sheets_created += 1

            for i, product in enumerate(products):
                if product.get("configuration") and not product.get("price_with_cabinet_bms"):
                    match = _exact_costing_match(product["configuration"])
                    if match:
                        product["price_with_cabinet_bms"] = float(match["est_sales_b"]) or None
                        if product["price_with_cabinet_bms"]:
                            products_matched += 1

                cols = ", ".join(f'"{k}"' for k in product)
                phs = ", ".join(["%s"] * len(product))
                cur.execute(
                    f'INSERT INTO oem_products (sheet_id, sort_order, {cols}) VALUES (%s, %s, {phs})',
                    [sheet_id, i] + list(product.values()),
                )
                products_created += 1

        if sheets_created:
            cur.execute(
                "UPDATE oems SET template_file = %s WHERE id = %s",
                (psycopg2.Binary(raw), oem_id),
            )

    return {"sheets_created": sheets_created, "products_created": products_created, "products_matched": products_matched}


@router.get("/sheets/{sheet_id}/export")
def export_sheet(sheet_id: int, _=Depends(get_expert_user)):
    """Re-export a sheet in the visual format of the OEM's originally
    imported reference file — same styling/letterhead, current DB values."""
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(501, "openpyxl not installed")

    with get_conn() as con:
        cur = dict_cur(con)
        cur.execute(
            """SELECT s.id, s.label, o.name AS oem_name, o.template_file
               FROM oem_sheets s JOIN oems o ON o.id = s.oem_id
               WHERE s.id = %s""",
            (sheet_id,),
        )
        sheet = cur.fetchone()
        if not sheet:
            raise HTTPException(404, "Sheet not found")
        if not sheet["template_file"]:
            raise HTTPException(404, "No reference file imported for this OEM yet")

        cur.execute("SELECT * FROM oem_products WHERE sheet_id = %s ORDER BY sort_order, id", (sheet_id,))
        products = [dict(r) for r in cur.fetchall()]
        cur.execute(
            """SELECT e.* FROM oem_product_extras e
               JOIN oem_products p ON p.id = e.product_id
               WHERE p.sheet_id = %s
               ORDER BY e.product_id, e.sort_order, e.id""",
            (sheet_id,),
        )
        extras = [dict(r) for r in cur.fetchall()]

    wb = openpyxl.load_workbook(io.BytesIO(bytes(sheet["template_file"])))
    ws = wb[sheet["label"]] if sheet["label"] in wb.sheetnames else wb.worksheets[0]

    row_for_field, active_cols = _locate(ws)
    if not row_for_field:
        raise HTTPException(400, "Reference file's sheet format not recognised")

    n_products = len(products)

    # extend columns (copy last active column's styling) if there are now
    # more products than the template originally had
    if n_products > len(active_cols):
        last_col = active_cols[-1] if active_cols else 1
        template_max_row = ws.max_row
        for i in range(n_products - len(active_cols)):
            new_col = last_col + 1 + i
            for r in range(1, template_max_row + 1):
                src = ws.cell(row=r, column=last_col)
                dst = ws.cell(row=r, column=new_col)
                dst._style = src._style
            active_cols.append(new_col)

    cols = active_cols[:max(n_products, 1)] if n_products else []

    # clear any leftover template columns beyond current product count
    for stale_col in active_cols[n_products:]:
        for row_num in row_for_field.values():
            ws.cell(row=row_num, column=stale_col).value = None

    for field, row_num in row_for_field.items():
        for i, product in enumerate(products):
            ws.cell(row=row_num, column=cols[i]).value = product.get(field)

    # extras + total price — not part of the original format, appended below it
    extras_by_product: dict = {}
    for e in extras:
        extras_by_product.setdefault(e["product_id"], []).append(e)

    extras_row = ws.max_row + 2
    total_row = extras_row + 1
    ws.cell(row=extras_row, column=1).value = "Modular Rack / Custom Costs"
    ws.cell(row=total_row, column=1).value = "Total Price"
    for i, product in enumerate(products):
        lines = extras_by_product.get(product["id"], [])
        text = "\n".join(f'{e["description"]} x{e["quantity"]} - Rs.{e["price"] * e["quantity"]:,.0f}' for e in lines)
        ws.cell(row=extras_row, column=cols[i]).value = text
        extra_total = sum(e["price"] * e["quantity"] for e in lines)
        total = (product.get("price_with_cabinet_bms") or 0) + extra_total
        ws.cell(row=total_row, column=cols[i]).value = total

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp.close()
    wb.save(tmp.name)

    safe_name = re.sub(r"[^\w.-]", "_", f"{sheet['oem_name']}_{sheet['label']}")
    return FileResponse(
        tmp.name,
        filename=f"{safe_name}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(os.unlink, tmp.name),
    )
