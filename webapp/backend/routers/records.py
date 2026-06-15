import uuid
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent))
from auth import get_current_user
from firebase_init import get_db

router = APIRouter()

RECORDS_PATH = "/records"


class RecordCreate(BaseModel):
    type: str          # "sizing" | "costing" | "quotation"
    name: str
    customer: str = ""
    data: Dict[str, Any]


class RecordUpdate(BaseModel):
    name: Optional[str] = None
    customer: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


@router.post("", status_code=201)
def create_record(body: RecordCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    record_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": record_id,
        "type": body.type,
        "name": body.name,
        "customer": body.customer,
        "created_by": user.get("username", "unknown"),
        "created_at": now,
        "updated_at": now,
        "template_version": "1",
        "data": body.data,
    }
    db.reference(f"{RECORDS_PATH}/{record_id}").set(record)
    return record


@router.get("")
def list_records(user: dict = Depends(get_current_user)):
    db = get_db()
    snapshot = db.reference(RECORDS_PATH).get()
    if not snapshot:
        return []
    records = list(snapshot.values())
    records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return records


@router.get("/{record_id}")
def get_record(record_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    record = db.reference(f"{RECORDS_PATH}/{record_id}").get()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.put("/{record_id}")
def update_record(record_id: str, body: RecordUpdate, user: dict = Depends(get_current_user)):
    db = get_db()
    ref = db.reference(f"{RECORDS_PATH}/{record_id}")
    existing = ref.get()
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    patch: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.name is not None:
        patch["name"] = body.name
    if body.customer is not None:
        patch["customer"] = body.customer
    if body.data is not None:
        patch["data"] = body.data
    ref.update(patch)
    return {**existing, **patch}


@router.delete("/{record_id}")
def delete_record(record_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    ref = db.reference(f"{RECORDS_PATH}/{record_id}")
    if not ref.get():
        raise HTTPException(status_code=404, detail="Record not found")
    ref.delete()
    return {"deleted": record_id}
