import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import pgfire
from auth import get_current_user
from routers.auth import _get_role

router = APIRouter()

# Single lifecycle root: archived (approved) tickets live alongside active ones,
# distinguished by status — no physical move on approval.
ROOT = "approvals"


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
    ticket = pgfire.get(ROOT, ticket_id)
    if not ticket:
        return
    now = datetime.now(timezone.utc).isoformat()
    mid = str(uuid.uuid4())
    messages = ticket.get("messages") or {}
    messages[mid] = {"id": mid, "author": author, "role": role,
                     "text": text.strip(), "sent_at": now}
    pgfire.update(ROOT, ticket_id, {"messages": messages})


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create_approval(body: ApprovalCreate, user: dict = Depends(get_current_user)):
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
    pgfire.set(ROOT, tid, ticket)
    if body.message.strip():
        _add_message(tid, username, role, body.message)
    return pgfire.get(ROOT, tid)


@router.get("")
def list_approvals(user: dict = Depends(get_current_user)):
    username = user.get("username", "")
    role = _get_role(username)
    snap = pgfire.get(ROOT)
    if not snap:
        return []
    tickets = [t for t in snap.values() if t.get("status") != "approved"]
    tickets.sort(key=lambda t: t.get("submitted_at", ""), reverse=True)
    if role == "e":
        return tickets
    return [t for t in tickets if t.get("submitted_by") == username]


@router.get("/archive")
def list_archive(user: dict = Depends(get_current_user)):
    username = user.get("username", "")
    role = _get_role(username)
    snap = pgfire.get(ROOT)
    if not snap:
        return []
    items = [t for t in snap.values() if t.get("status") == "approved"]
    items.sort(key=lambda t: t.get("approved_at", ""), reverse=True)
    if role == "e":
        return items
    return [t for t in items if t.get("submitted_by") == username]


@router.get("/{tid}")
def get_approval(tid: str, user: dict = Depends(get_current_user)):
    ticket = pgfire.get(ROOT, tid)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    username = user.get("username", "")
    if _get_role(username) != "e" and ticket.get("submitted_by") != username:
        raise HTTPException(403, "Access denied")
    return ticket


@router.post("/{tid}/claim")
def claim_approval(tid: str, user: dict = Depends(get_current_user)):
    _require_expert(user)
    ticket = pgfire.get(ROOT, tid)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.get("status") != "pending":
        raise HTTPException(400, f"Cannot claim a ticket with status '{ticket['status']}'")
    username = user.get("username", "")
    now = datetime.now(timezone.utc).isoformat()
    pgfire.update(ROOT, tid, {"status": "in_review", "claimed_by": username, "claimed_at": now})
    _add_message(tid, username, "e", f"[Claimed by {username}] I am now reviewing this.")
    return pgfire.get(ROOT, tid)


@router.post("/{tid}/approve")
def approve_approval(tid: str, user: dict = Depends(get_current_user)):
    _require_expert(user)
    ticket = pgfire.get(ROOT, tid)
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
    pgfire.set(ROOT, tid, archive)
    return archive


@router.post("/{tid}/deny")
def deny_approval(tid: str, body: DenyReq, user: dict = Depends(get_current_user)):
    _require_expert(user)
    ticket = pgfire.get(ROOT, tid)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    username = user.get("username", "")
    now = datetime.now(timezone.utc).isoformat()
    pgfire.update(ROOT, tid, {"status": "denied", "denied_by": username, "denied_at": now})
    text = f"[Denied by {username}]{': ' + body.message.strip() if body.message.strip() else ''}"
    _add_message(tid, username, "e", text)
    return pgfire.get(ROOT, tid)


@router.post("/{tid}/revise")
def revise_approval(tid: str, body: ReviseReq, user: dict = Depends(get_current_user)):
    _require_expert(user)
    ticket = pgfire.get(ROOT, tid)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    username = user.get("username", "")
    now = datetime.now(timezone.utc).isoformat()
    pgfire.update(ROOT, tid, {"status": "revised", "revised_data": body.data,
                              "revised_by": username, "revised_at": now})
    text = f"[Revised by {username}]{': ' + body.message.strip() if body.message.strip() else ' — please review and re-submit if satisfied'}"
    _add_message(tid, username, "e", text)
    return pgfire.get(ROOT, tid)


@router.post("/{tid}/resubmit")
def resubmit_approval(tid: str, body: ResubmitReq, user: dict = Depends(get_current_user)):
    ticket = pgfire.get(ROOT, tid)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    username = user.get("username", "")
    if ticket.get("submitted_by") != username:
        raise HTTPException(403, "Only the original submitter can re-submit")
    if ticket.get("status") not in ("denied", "revised"):
        raise HTTPException(400, f"Cannot re-submit a ticket with status '{ticket['status']}'")
    now = datetime.now(timezone.utc).isoformat()
    pgfire.update(ROOT, tid, {
        "status": "pending",
        "data": body.data,
        "revised_data": None,
        "claimed_by": None,
        "claimed_at": None,
        "resubmitted_at": now,
    })
    _add_message(tid, username, "u",
                 f"[Re-submitted]{': ' + body.message.strip() if body.message.strip() else ''}")
    return pgfire.get(ROOT, tid)


@router.post("/{tid}/messages")
def send_message(tid: str, body: MessageCreate, user: dict = Depends(get_current_user)):
    ticket = pgfire.get(ROOT, tid)
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
    messages = ticket.get("messages") or {}
    messages[mid] = msg
    pgfire.update(ROOT, tid, {"messages": messages})
    return msg
