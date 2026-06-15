import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent))
from auth import get_current_user
from firebase_init import get_db

router = APIRouter()
PATH = "inquiry_sheet"


class InquiryEntry(BaseModel):
    inquiry_date: str = ""
    type: str = ""
    sales_person: str = ""
    solution_provider: str = ""
    project_customer: str = ""
    ups_kva: str = ""
    load_kw: str = ""
    backup_min: str = ""
    dc_voltage: str = ""
    capacity_ah: str = ""
    part_code: str = ""
    qty: str = ""
    centre_tap: str = "NO"
    submission_date: str = ""
    submitted_to: str = ""
    price: str = ""
    per_rack_price: str = ""
    rack_dim: str = ""
    datasheet: str = "NO"
    sizing_sheet: str = "YES"
    gad: str = "NO"
    battery_compliance: str = "NO"
    warranty: str = "5 year"
    remarks: str = ""
    solution_by: str = ""
    entry_by: str = ""
    data_upload_by: str = ""


@router.get("")
def list_entries(_=Depends(get_current_user)):
    db = get_db()
    data = db.reference(PATH).get() or {}
    entries = []
    for k, v in data.items():
        v["_id"] = k
        entries.append(v)
    entries.sort(key=lambda x: x.get("sr_no", 0))
    return entries


@router.post("", status_code=201)
def create_entry(body: InquiryEntry, user=Depends(get_current_user)):
    db = get_db()
    data = db.reference(PATH).get() or {}
    next_sr = max((v.get("sr_no", 0) for v in data.values()), default=0) + 1
    entry = body.dict()
    entry["sr_no"] = next_sr
    entry["created_at"] = int(time.time() * 1000)
    entry["created_by"] = user["username"]
    ref = db.reference(PATH).push(entry)
    return {"_id": ref.key, "sr_no": next_sr}


@router.patch("/{entry_id}")
def update_entry(entry_id: str, body: Dict[str, Any], _=Depends(get_current_user)):
    db = get_db()
    ref = db.reference(f"{PATH}/{entry_id}")
    if not ref.get():
        raise HTTPException(404, "Entry not found")
    ref.update(body)
    return {"ok": True}


@router.delete("/{entry_id}")
def delete_entry(entry_id: str, _=Depends(get_current_user)):
    db = get_db()
    ref = db.reference(f"{PATH}/{entry_id}")
    if not ref.get():
        raise HTTPException(404, "Entry not found")
    ref.delete()
    return {"ok": True}
