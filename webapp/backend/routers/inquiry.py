import sys
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent))
from auth import get_current_user, get_expert_user
from inquiry_db import push_row, list_rows, update_row, delete_row, init_inquiry_db
from user_db import get_user_inquiry_db

init_inquiry_db()
router = APIRouter()


class InquiryEntry(BaseModel):
    inquiry_date: str = ""
    type: str = ""
    sales_person: str = ""
    solution_provider: str = ""
    project_customer: str = ""
    ups_make: str = ""
    ups_model: str = ""
    ups_kva: str = ""
    actual_load_kva: str = ""
    load_kw: str = ""
    power_factor: str = ""
    inverter_efficiency: str = ""
    dc_voltage: str = ""
    backup_min: str = ""
    cell_chemistry: str = ""
    ageing_pct: str = ""
    design_margin_pct: str = ""
    dod_margin_pct: str = ""
    derating_pct: str = ""
    capacity_ah: str = ""
    part_code: str = ""
    qty: str = ""
    centre_tap: str = ""
    cell_type: str = ""
    qty_system: str = ""
    rate_system: str = ""
    price_system: str = ""
    submission_date: str = ""
    submitted_to: str = ""
    price: str = ""
    per_rack_price: str = ""
    rack_dim: str = ""
    custom_cost_desc: str = ""
    custom_cost_price: str = ""
    datasheet: str = "NO"
    sizing_sheet: str = "YES"
    gad: str = "NO"
    battery_compliance: str = "NO"
    warranty: str = "5 year"
    remarks: str = ""
    solution_by: str = ""
    entry_by: str = ""
    data_upload_by: str = ""


@router.get("/mine")
def list_my_entries(user=Depends(get_current_user)):
    db = get_user_inquiry_db(user["username"])
    init_inquiry_db(db)
    return list_rows(db_path=db)


@router.get("")
def list_entries(_=Depends(get_current_user)):
    return list_rows()


@router.post("", status_code=201)
def create_entry(body: InquiryEntry, _=Depends(get_current_user)):
    sr = push_row(body.dict())
    return {"sr_no": sr}


@router.patch("/{sr_no}")
def update_entry(sr_no: int, body: Dict[str, Any], _=Depends(get_expert_user)):
    update_row(sr_no, body)
    return {"ok": True}


@router.delete("/{sr_no}")
def delete_entry(sr_no: int, _=Depends(get_expert_user)):
    delete_row(sr_no)
    return {"ok": True}
