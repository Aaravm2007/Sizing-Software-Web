import sys
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent))
from auth import get_expert_user
from mass_sizing_db import (
    init_mass_sizing_db, list_page, count_rows, export_rows,
    insert_row, update_row, bulk_update_rows, delete_row, duplicate_row,
    bulk_import_rows, _COLS,
)

init_mass_sizing_db()
router = APIRouter()


class RowIn(BaseModel):
    ups_make: str = ""
    ups_model: str = ""
    ups_rating_kva: str = ""
    actual_load_kva: str = ""
    actual_load_kw: str = ""
    power_factor: str = ""
    inverter_efficiency: str = ""
    nominal_dc_voltage: str = ""
    backup_requirement_min: str = ""
    cell_chemistry: str = ""
    ageing_type: str = "BOL"
    ageing_pct: str = ""
    design_margin_pct: str = ""
    dod_margin_pct: str = ""
    derating_pct: str = ""
    nearest_capacity_ah: str = ""
    calculated_load_kw: str = ""
    number_of_cells: str = ""
    max_charging_voltage: str = ""
    end_cell_voltage: str = ""
    energy_required_kwh: str = ""
    capacity_required_ah: str = ""
    cap_with_ageing_ah: str = ""
    cap_with_design_margin_ah: str = ""
    cap_with_dod_ah: str = ""
    cap_with_derating_ah: str = ""
    backup_time_min: str = ""
    total_available_energy_kwh: str = ""
    offered_battery_config: str = ""
    partcode: str = ""


class BulkUpdateEntry(BaseModel):
    sr_no: int
    fields: Dict[str, Any]


class BulkUpdateBody(BaseModel):
    updates: List[BulkUpdateEntry]


class ImportBody(BaseModel):
    rows: List[Dict[str, Any]]


def _parse_page_params(request: Request):
    params = dict(request.query_params)
    page = max(1, int(params.get("page", 1)))
    limit = min(500, max(1, int(params.get("limit", 200))))
    search = params.get("search", "")
    return page, limit, search


@router.get("")
def list_rows_endpoint(request: Request, _=Depends(get_expert_user)):
    page, limit, search = _parse_page_params(request)
    total = count_rows(search)
    rows = list_page(page, limit, search)
    return {"rows": rows, "total": total, "pages": max(1, -(-total // limit))}


@router.get("/export")
def export_endpoint(request: Request, _=Depends(get_expert_user)):
    _, _, search = _parse_page_params(request)
    return {"rows": export_rows(search)}


@router.post("", status_code=201)
def create_row(body: RowIn, user=Depends(get_expert_user)):
    sr_no = insert_row(body.dict(), user["username"])
    return {"sr_no": sr_no}


@router.patch("/bulk")
def patch_rows_bulk(body: BulkUpdateBody, _=Depends(get_expert_user)):
    updates = [{"sr_no": e.sr_no, **e.fields} for e in body.updates]
    bulk_update_rows(updates)
    return {"detail": "updated", "count": len(updates)}


@router.patch("/{sr_no}")
def patch_row(sr_no: int, body: Dict[str, Any], _=Depends(get_expert_user)):
    update_row(sr_no, body)
    return {"detail": "updated"}


@router.delete("/{sr_no}")
def delete_row_endpoint(sr_no: int, _=Depends(get_expert_user)):
    delete_row(sr_no)
    return {"detail": "deleted"}


@router.post("/{sr_no}/duplicate", status_code=201)
def duplicate_row_endpoint(sr_no: int, user=Depends(get_expert_user)):
    try:
        new_sr_no = duplicate_row(sr_no, user["username"])
    except ValueError:
        raise HTTPException(404, "Row not found")
    return {"sr_no": new_sr_no}


@router.post("/import", status_code=201)
def import_rows(body: ImportBody, user=Depends(get_expert_user)):
    count = bulk_import_rows(body.rows, user["username"])
    return {"detail": "imported", "count": count}
