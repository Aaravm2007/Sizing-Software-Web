import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from firebase_init import get_db

router = APIRouter()

APPROVALS_PATH = "/approvals"
ARCHIVE_PATH   = "/approvals_archive"


def _get_role(username: str) -> str:
    try:
        db = get_db()
        data = db.reference(f"allowed_users/{username}").get()
        if isinstance(data, dict):
            return data.get("role", "u")
    except Exception:
        pass
    return "u"


def _require_expert(user: dict):
    if _get_role(user.get("username", "")) != "e":
        raise HTTPException(403, "Expert access required")


# ── schemas ───────────────────────────────────────────────────────────────────

class ApprovalCreate(BaseModel):
    type: str
    name: str
    data: Any
    message: str = ""

class MessageCreate(BaseModel):
    text: str

class DenyReq(BaseModel):
    message: str = ""

class ReviseReq(BaseModel):
    data: Any
    message: str = ""

class ResubmitReq(BaseModel):
    data: Any
    message: str = ""


# ── helpers ───────────────────────────────────────────────────────────────────

def _add_message(ticket_id: str, author: str, role: str, text: str):
    if not text.strip():
        return
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    mid = str(uuid.uuid4())
    db.reference(f"{APPROVALS_PATH}/{ticket_id}/messages/{mid}").set(
        {"id": mid, "author": author, "role": role, "text": text.strip(), "sent_at": now}
    )


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create_approval(body: ApprovalCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    tid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    username = user.get("username", "unknown")
    role = _get_role(username)

    ticket = {
        "id": tid,
        "submitted_by": username,
        "submitted_at": now,
        "type": body.type,
        "name": body.name,
        "data": body.data,
        "status": "pending",
        "claimed_by": None,
        "claimed_at": None,
        "revised_data": None,
        "messages": {},
    }
    db.reference(f"{APPROVALS_PATH}/{tid}").set(ticket)
    if body.message.strip():
        _add_message(tid, username, role, body.message)
    return db.reference(f"{APPROVALS_PATH}/{tid}").get()


@router.get("")
def list_approvals(user: dict = Depends(get_current_user)):
    db = get_db()
    username = user.get("username", "")
    role = _get_role(username)
    snap = db.reference(APPROVALS_PATH).get()
    if not snap:
        return []
    tickets = list(snap.values())
    tickets.sort(key=lambda t: t.get("submitted_at", ""), reverse=True)
    if role == "e":
        return tickets
    return [t for t in tickets if t.get("submitted_by") == username]


@router.get("/archive")
def list_archive(user: dict = Depends(get_current_user)):
    db = get_db()
    username = user.get("username", "")
    role = _get_role(username)
    snap = db.reference(ARCHIVE_PATH).get()
    if not snap:
        return []
    items = list(snap.values())
    items.sort(key=lambda t: t.get("approved_at", ""), reverse=True)
    if role == "e":
        return items
    return [t for t in items if t.get("submitted_by") == username]


@router.get("/{tid}")
def get_approval(tid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    ticket = db.reference(f"{APPROVALS_PATH}/{tid}").get()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    username = user.get("username", "")
    if _get_role(username) != "e" and ticket.get("submitted_by") != username:
        raise HTTPException(403, "Access denied")
    return ticket


@router.post("/{tid}/claim")
def claim_approval(tid: str, user: dict = Depends(get_current_user)):
    _require_expert(user)
    db = get_db()
    ref = db.reference(f"{APPROVALS_PATH}/{tid}")
    ticket = ref.get()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.get("status") != "pending":
        raise HTTPException(400, f"Cannot claim a ticket with status '{ticket['status']}'")
    username = user.get("username", "")
    now = datetime.now(timezone.utc).isoformat()
    ref.update({"status": "in_review", "claimed_by": username, "claimed_at": now})
    _add_message(tid, username, "e", f"[Claimed by {username}] I am now reviewing this.")
    return ref.get()


@router.post("/{tid}/approve")
def approve_approval(tid: str, user: dict = Depends(get_current_user)):
    _require_expert(user)
    db = get_db()
    ref = db.reference(f"{APPROVALS_PATH}/{tid}")
    ticket = ref.get()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    username = user.get("username", "")
    now = datetime.now(timezone.utc).isoformat()
    # Keep final data (revised version if present, else original) — strip messages/revised_data
    final_data = ticket.get("revised_data") or ticket.get("data")
    archive = {
        "id": tid,
        "submitted_by": ticket.get("submitted_by", ""),
        "submitted_at": ticket.get("submitted_at", ""),
        "type": ticket.get("type", ""),
        "name": ticket.get("name", ""),
        "status": "approved",
        "approved_by": username,
        "approved_at": now,
        "data": final_data,
    }
    db.reference(f"{ARCHIVE_PATH}/{tid}").set(archive)
    ref.delete()
    return archive


@router.post("/{tid}/deny")
def deny_approval(tid: str, body: DenyReq, user: dict = Depends(get_current_user)):
    _require_expert(user)
    db = get_db()
    ref = db.reference(f"{APPROVALS_PATH}/{tid}")
    ticket = ref.get()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    username = user.get("username", "")
    now = datetime.now(timezone.utc).isoformat()
    ref.update({"status": "denied", "denied_by": username, "denied_at": now})
    text = f"[Denied by {username}]{': ' + body.message.strip() if body.message.strip() else ''}"
    _add_message(tid, username, "e", text)
    return ref.get()


@router.post("/{tid}/revise")
def revise_approval(tid: str, body: ReviseReq, user: dict = Depends(get_current_user)):
    _require_expert(user)
    db = get_db()
    ref = db.reference(f"{APPROVALS_PATH}/{tid}")
    ticket = ref.get()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    username = user.get("username", "")
    now = datetime.now(timezone.utc).isoformat()
    ref.update({"status": "revised", "revised_data": body.data,
                "revised_by": username, "revised_at": now})
    text = f"[Revised by {username}]{': ' + body.message.strip() if body.message.strip() else ' — please review and re-submit if satisfied'}"
    _add_message(tid, username, "e", text)
    return ref.get()


@router.post("/{tid}/resubmit")
def resubmit_approval(tid: str, body: ResubmitReq, user: dict = Depends(get_current_user)):
    db = get_db()
    ref = db.reference(f"{APPROVALS_PATH}/{tid}")
    ticket = ref.get()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    username = user.get("username", "")
    if ticket.get("submitted_by") != username:
        raise HTTPException(403, "Only the original submitter can re-submit")
    if ticket.get("status") not in ("denied", "revised"):
        raise HTTPException(400, f"Cannot re-submit a ticket with status '{ticket['status']}'")
    now = datetime.now(timezone.utc).isoformat()
    ref.update({
        "status": "pending",
        "data": body.data,
        "revised_data": None,
        "claimed_by": None,
        "claimed_at": None,
        "resubmitted_at": now,
    })
    _add_message(tid, username, "u",
                 f"[Re-submitted]{': ' + body.message.strip() if body.message.strip() else ''}")
    return ref.get()


@router.post("/{tid}/messages")
def send_message(tid: str, body: MessageCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    ticket = db.reference(f"{APPROVALS_PATH}/{tid}").get()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    username = user.get("username", "")
    role = _get_role(username)
    if role != "e" and ticket.get("submitted_by") != username:
        raise HTTPException(403, "Access denied")
    if not body.text.strip():
        raise HTTPException(400, "Message cannot be empty")
    now = datetime.now(timezone.utc).isoformat()
    mid = str(uuid.uuid4())
    msg = {"id": mid, "author": username, "role": role,
           "text": body.text.strip(), "sent_at": now}
    db.reference(f"{APPROVALS_PATH}/{tid}/messages/{mid}").set(msg)
    return msg
