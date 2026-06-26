import sys
import re
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent))
from auth import get_current_user, get_expert_user
from po_db import (
    init_po_db, list_po, get_po, create_po, update_po, delete_po,
    list_dispatches, create_dispatch, delete_dispatch,
    set_po_document, get_po_document_filename, PO_DOCS_DIR,
)

init_po_db()
router = APIRouter()


class POEntry(BaseModel):
    inquiry_code: Optional[str] = None
    customer_name: Optional[str] = None
    project_name: Optional[str] = None
    po_no: Optional[str] = None
    po_date: Optional[str] = None
    solution: Optional[str] = None
    inquiry_qty: Optional[str] = None
    po_qty: Optional[str] = None
    unit_price: Optional[str] = None
    total_price: Optional[str] = None
    total_qty: Optional[str] = None
    cell_used: Optional[str] = None
    cells_per_rack: Optional[str] = None
    total_cells_required: Optional[str] = None
    remarks: Optional[str] = None
    po_uploaded_by: Optional[str] = None
    completion_date: Optional[str] = None
    expected_completion_date: Optional[str] = None
    days_to_complete: Optional[str] = None


class DispatchBody(BaseModel):
    dispatch_date: str = ""
    dispatch_code: str = ""
    dispatch_qty: str = ""


# ── PO endpoints ──────────────────────────────────────────────────────────────

@router.get("")
def get_all(_=Depends(get_current_user)):
    return list_po()


@router.post("")
def create(body: POEntry, user=Depends(get_current_user)):
    data = {k: (v if v is not None else "") for k, v in body.model_dump().items()}
    if not data.get("po_uploaded_by"):
        data["po_uploaded_by"] = user["username"]
    return {"id": create_po(data)}


@router.patch("/{po_id}")
def update(po_id: int, body: POEntry, _=Depends(get_expert_user)):
    if not get_po(po_id):
        raise HTTPException(404, "Not found")
    update_po(po_id, body.model_dump(exclude_unset=True))
    return {"detail": "updated"}


@router.delete("/{po_id}")
def delete(po_id: int, _=Depends(get_expert_user)):
    if not get_po(po_id):
        raise HTTPException(404, "Not found")
    delete_po(po_id)
    return {"detail": "deleted"}


# ── Dispatch endpoints ────────────────────────────────────────────────────────

@router.get("/{po_id}/dispatches")
def get_dispatches(po_id: int, _=Depends(get_current_user)):
    return list_dispatches(po_id)


@router.post("/{po_id}/dispatches")
def add_dispatch(po_id: int, body: DispatchBody, _=Depends(get_current_user)):
    if not get_po(po_id):
        raise HTTPException(404, "PO not found")
    totals = create_dispatch(po_id, body.model_dump())
    return totals  # includes balance_qty so frontend can check if 0


@router.delete("/{po_id}/dispatches/{dispatch_id}")
def remove_dispatch(po_id: int, dispatch_id: int, _=Depends(get_expert_user)):
    totals = delete_dispatch(dispatch_id, po_id)
    return totals


# ── PO document endpoints ────────────────────────────────────────────────────

@router.post("/{po_id}/upload")
async def upload_document(po_id: int, file: UploadFile = File(...), _=Depends(get_current_user)):
    po = get_po(po_id)
    if not po:
        raise HTTPException(404, "PO not found")

    orig = Path(file.filename or "document")
    stem = re.sub(r"[^\w\-]", "_", orig.stem)
    ext  = orig.suffix or ""

    po_no  = re.sub(r"[^\w\-]", "_", po.get("po_no", "") or "")
    inq    = re.sub(r"[^\w\-]", "_", po.get("inquiry_code", "") or "")
    suffix = f"_{po_no}" if po_no else f"_{po_id}"
    if inq:
        suffix += f"_{inq}"
    stored_name = f"{stem}{suffix}{ext}"

    # delete old file if one exists
    old = get_po_document_filename(po_id)
    if old:
        old_path = PO_DOCS_DIR / old
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    PO_DOCS_DIR.mkdir(parents=True, exist_ok=True)
    dest = PO_DOCS_DIR / stored_name
    content = await file.read()
    dest.write_bytes(content)

    set_po_document(po_id, stored_name)
    return {"filename": stored_name}


@router.get("/{po_id}/download")
def download_document(po_id: int, _=Depends(get_current_user)):
    po = get_po(po_id)
    if not po:
        raise HTTPException(404, "PO not found")

    stored_name = get_po_document_filename(po_id)
    if not stored_name:
        raise HTTPException(404, "No document attached to this PO")

    path = PO_DOCS_DIR / stored_name
    if not path.exists():
        raise HTTPException(404, "Document file not found on server")

    # strip _{po_no}_{inq} suffix to recover original filename
    orig = Path(stored_name)
    stem = orig.stem
    po_no = re.sub(r"[^\w\-]", "_", po.get("po_no", "") or "")
    inq   = re.sub(r"[^\w\-]", "_", po.get("inquiry_code", "") or "")
    suffix_to_strip = f"_{po_no}_{inq}" if (po_no and inq) else (f"_{po_no}" if po_no else f"_{po_id}")
    if stem.endswith(suffix_to_strip):
        stem = stem[: -len(suffix_to_strip)]
    clean_name = stem + orig.suffix

    media = "application/pdf" if orig.suffix.lower() == ".pdf" else "application/octet-stream"
    return FileResponse(str(path), media_type=media, filename=clean_name)
