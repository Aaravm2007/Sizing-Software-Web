import sys
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent))
from auth import get_current_user, get_expert_user
from pending_db import push_row, list_rows, list_mine, update_row, delete_row, init_db, suggest_next_inquiry_code

init_db()
router = APIRouter()


class PendingEntry(BaseModel):
    inquiry_code: str = ""
    received_date: str = ""
    received_time: str = ""
    mail_for: str = ""
    oem_dealer: str = ""
    end_customer: str = ""
    kva_rating: str = ""
    quantity: str = ""
    backup_time: str = ""
    reply_to: str = ""
    assigned_to: str = ""
    status: str = "pending"
    remarks: str = ""
    priority: str = "relaxed"


class AssignBody(BaseModel):
    username: str


class StatusBody(BaseModel):
    status: str


@router.get("/next-inquiry-code")
def next_inquiry_code(_=Depends(get_current_user)):
    return suggest_next_inquiry_code()


@router.get("")
def get_all(_=Depends(get_current_user)):
    return list_rows()


@router.get("/mine")
def get_mine(user=Depends(get_current_user)):
    return list_mine(user["username"])


@router.post("", status_code=201)
def create(body: PendingEntry, user=Depends(get_expert_user)):
    row_id = push_row(body.dict(), user["username"])
    return {"id": row_id}


@router.put("/{row_id}")
def update(row_id: int, body: PendingEntry, user=Depends(get_expert_user)):
    update_row(row_id, body.dict())
    return {"detail": "updated"}


@router.patch("/{row_id}/status")
def set_status(row_id: int, body: StatusBody, user=Depends(get_current_user)):
    rows = list_rows()
    row = next((r for r in rows if r["id"] == row_id), None)
    if not row:
        raise HTTPException(404, "Not found")
    update_row(row_id, {"status": body.status})
    return {"detail": "updated"}


@router.post("/{row_id}/assign")
def assign(row_id: int, body: AssignBody, _=Depends(get_expert_user)):
    update_row(row_id, {"assigned_to": body.username})
    return {"detail": "assigned"}


@router.delete("/{row_id}")
def remove(row_id: int, _=Depends(get_expert_user)):
    delete_row(row_id)
    return {"detail": "deleted"}
