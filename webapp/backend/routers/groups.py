import io
import os
import sys
import uuid
import zipfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

APP_DIR     = Path(__file__).parent.parent.parent.parent   # Sizing-Software-Final - Copy/
BACKEND_DIR = Path(__file__).parent.parent                  # webapp/backend/
sys.path.insert(0, str(APP_DIR))
sys.path.insert(0, str(BACKEND_DIR))

from auth import get_current_user
from firebase_init import get_db

router = APIRouter()

GROUPS_PATH  = "/groups"
RECORDS_PATH = "/records"


# ── pydantic ──────────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str
    record_ids: list[str] = []
    datasheet_names: list[str] = []
    gad_names: list[str] = []
    audit_entry: str = ""

class GroupUpdate(BaseModel):
    name: Optional[str] = None

class AddRecordReq(BaseModel):
    record_id: str

class AddFileReq(BaseModel):
    filename: str


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create_group(body: GroupCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    gid  = str(uuid.uuid4())
    now  = datetime.now(timezone.utc).isoformat()
    group = {
        "id": gid, "name": body.name,
        "description": body.audit_entry,
        "created_by": user.get("username", "unknown"),
        "created_at": now, "updated_at": now,
        "record_ids": body.record_ids,
        "datasheet_names": body.datasheet_names,
        "gad_names": body.gad_names,
    }
    db.reference(f"{GROUPS_PATH}/{gid}").set(group)
    return group


@router.get("")
def list_groups(user: dict = Depends(get_current_user)):
    db = get_db()
    snap = db.reference(GROUPS_PATH).get()
    if not snap:
        return []
    groups = list(snap.values())
    groups.sort(key=lambda g: g.get("created_at", ""), reverse=True)
    return groups


@router.get("/{group_id}")
def get_group(group_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    group = db.reference(f"{GROUPS_PATH}/{group_id}").get()
    if not group:
        raise HTTPException(404, "Group not found")
    record_ids = group.get("record_ids") or []
    records = [r for rid in record_ids if (r := db.reference(f"{RECORDS_PATH}/{rid}").get())]
    return {**group, "records": records}


@router.put("/{group_id}")
def update_group(group_id: str, body: GroupUpdate, user: dict = Depends(get_current_user)):
    db = get_db()
    ref  = db.reference(f"{GROUPS_PATH}/{group_id}")
    existing = ref.get()
    if not existing:
        raise HTTPException(404, "Group not found")
    patch: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.name is not None: patch["name"] = body.name
    ref.update(patch)
    return {**existing, **patch}


@router.delete("/{group_id}")
def delete_group(group_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    ref = db.reference(f"{GROUPS_PATH}/{group_id}")
    if not ref.get():
        raise HTTPException(404, "Group not found")
    ref.delete()
    return {"deleted": group_id}


@router.post("/{group_id}/add-record")
def add_record_to_group(group_id: str, body: AddRecordReq, user: dict = Depends(get_current_user)):
    db  = get_db()
    ref = db.reference(f"{GROUPS_PATH}/{group_id}")
    grp = ref.get()
    if not grp:
        raise HTTPException(404, "Group not found")
    ids: list = list(grp.get("record_ids") or [])
    if body.record_id not in ids:
        ids.append(body.record_id)
    ref.update({"record_ids": ids, "updated_at": datetime.now(timezone.utc).isoformat()})
    return {"record_ids": ids}


@router.delete("/{group_id}/records/{record_id}")
def remove_record_from_group(group_id: str, record_id: str, user: dict = Depends(get_current_user)):
    db  = get_db()
    ref = db.reference(f"{GROUPS_PATH}/{group_id}")
    grp = ref.get()
    if not grp:
        raise HTTPException(404, "Group not found")
    ids: list = [r for r in (grp.get("record_ids") or []) if r != record_id]
    ref.update({"record_ids": ids, "updated_at": datetime.now(timezone.utc).isoformat()})
    return {"record_ids": ids}


class GroupPushReq(BaseModel):
    name: str
    record_ids: list[str]
    datasheet_names: list[str] = []
    gad_names: list[str] = []
    audit_entry: str


@router.post("/{group_id}/push")
def push_group(group_id: str, body: GroupPushReq, user: dict = Depends(get_current_user)):
    """Update an existing Firebase group: set record_ids, name, and APPEND audit entry to description."""
    db  = get_db()
    ref = db.reference(f"{GROUPS_PATH}/{group_id}")
    grp = ref.get()
    if not grp:
        raise HTTPException(404, "Group not found")
    existing_desc = grp.get("description") or ""
    new_desc = (existing_desc + "\n" + body.audit_entry).strip() if existing_desc else body.audit_entry
    now = datetime.now(timezone.utc).isoformat()
    ref.update({"name": body.name, "record_ids": body.record_ids,
                "datasheet_names": body.datasheet_names,
                "gad_names": body.gad_names,
                "description": new_desc, "updated_at": now})
    return ref.get()


@router.post("/{group_id}/add-datasheet")
def add_datasheet(group_id: str, body: AddFileReq, user: dict = Depends(get_current_user)):
    db  = get_db()
    ref = db.reference(f"{GROUPS_PATH}/{group_id}")
    grp = ref.get()
    if not grp:
        raise HTTPException(404, "Group not found")
    names: list = list(grp.get("datasheet_names") or [])
    if body.filename not in names:
        names.append(body.filename)
    ref.update({"datasheet_names": names, "updated_at": datetime.now(timezone.utc).isoformat()})
    return {"datasheet_names": names}


@router.delete("/{group_id}/datasheets/{filename:path}")
def remove_datasheet(group_id: str, filename: str, user: dict = Depends(get_current_user)):
    db  = get_db()
    ref = db.reference(f"{GROUPS_PATH}/{group_id}")
    grp = ref.get()
    if not grp:
        raise HTTPException(404, "Group not found")
    names: list = [n for n in (grp.get("datasheet_names") or []) if n != filename]
    ref.update({"datasheet_names": names, "updated_at": datetime.now(timezone.utc).isoformat()})
    return {"datasheet_names": names}


@router.post("/{group_id}/add-gad")
def add_gad(group_id: str, body: AddFileReq, user: dict = Depends(get_current_user)):
    db  = get_db()
    ref = db.reference(f"{GROUPS_PATH}/{group_id}")
    grp = ref.get()
    if not grp:
        raise HTTPException(404, "Group not found")
    names: list = list(grp.get("gad_names") or [])
    if body.filename not in names:
        names.append(body.filename)
    ref.update({"gad_names": names, "updated_at": datetime.now(timezone.utc).isoformat()})
    return {"gad_names": names}


@router.delete("/{group_id}/gads/{filename:path}")
def remove_gad(group_id: str, filename: str, user: dict = Depends(get_current_user)):
    db  = get_db()
    ref = db.reference(f"{GROUPS_PATH}/{group_id}")
    grp = ref.get()
    if not grp:
        raise HTTPException(404, "Group not found")
    names: list = [n for n in (grp.get("gad_names") or []) if n != filename]
    ref.update({"gad_names": names, "updated_at": datetime.now(timezone.utc).isoformat()})
    return {"gad_names": names}


# ── export helpers ────────────────────────────────────────────────────────────

def _safe_name(s: str) -> str:
    return "".join(c if c.isalnum() or c in " _-" else "_" for c in s).strip()


def _export_sizing(rec: dict) -> tuple[str, bytes]:
    """Returns (filename, bytes) for a sizing record. Handles single form or forms array."""
    from sql_handler import init_sizing_db, insert_sizing, delete_project
    from routers.sizing import _build_excel, _to_db_dict, SizingData

    rec_data = rec.get("data", {})
    # support both single form and forms array
    raw_forms = rec_data.get("forms") or ([rec_data["form"]] if rec_data.get("form") else [])
    if not raw_forms:
        raise ValueError("Sizing record has no form data")

    tmp_proj = f"__grpexp_{uuid.uuid4().hex[:8]}__"
    try:
        init_sizing_db(tmp_proj)
        for raw in raw_forms:
            data = SizingData(**{k: v for k, v in raw.items() if k in SizingData.model_fields})
            insert_sizing(tmp_proj, _to_db_dict(data))
        path = _build_excel(tmp_proj, None)
        with open(path, "rb") as f:
            content = f.read()
        try: os.unlink(path)
        except: pass
    finally:
        try: delete_project(tmp_proj)
        except: pass

    fname = _safe_name(rec.get("name", "sizing")) + ".xlsx"
    return fname, content


def _export_costing(rec: dict) -> tuple[str, bytes]:
    """Returns (filename, bytes) for a costing record — writes directly to template, no DB touch."""
    import openpyxl
    from routers.costing import CostingRow, _model_to_values

    TEMPLATE = str(APP_DIR / "templates" / "Costing_sheet_template.xlsx")
    rows_data = rec.get("data", {}).get("rows", [])

    wb = openpyxl.load_workbook(TEMPLATE)
    ws = wb.active

    for c_idx, row_dict in enumerate(rows_data, start=2):
        row_obj = CostingRow(**{k: v for k, v in row_dict.items() if k in CostingRow.model_fields})
        values  = _model_to_values(row_obj)
        for r_idx, val in enumerate(values, start=3):
            ws.cell(row=r_idx, column=c_idx).value = val

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    wb.save(tmp.name)
    tmp.close()
    with open(tmp.name, "rb") as f:
        content = f.read()
    try: os.unlink(tmp.name)
    except: pass

    fname = _safe_name(rec.get("name", "costing")) + "_costing.xlsx"
    return fname, content


def _export_quotation(rec: dict, as_pdf: bool = False) -> tuple[str, bytes]:
    """Returns (filename, bytes) for a quotation record."""
    from tempquotebase import add_new_quote, add_product_quote, delete_quote, clear_quotedata_table
    from routers.quotation import _generate_docx, TEMPLATE_MAP

    meta  = rec.get("data", {}).get("meta", {})
    items = rec.get("data", {}).get("items", [])
    fmt_name = meta.get("format_name", "High voltage")
    fname_tpl = TEMPLATE_MAP.get(fmt_name, fmt_name) or "Quote_format_High_Vtg.docx"

    tmp_code = f"GRPEXP-{uuid.uuid4().hex[:8]}"
    try:
        add_new_quote(tmp_code, meta.get("date", ""), meta.get("customer_name", ""),
                      meta.get("solution_provider", ""), fname_tpl)
        for item in items:
            add_product_quote(
                tmp_code, tmp_code, fname_tpl, meta.get("date", ""),
                meta.get("solution_provider", ""), meta.get("customer_name", ""),
                item.get("sr_no", 1), item.get("sol_no", 1),
                item.get("ups_rating", "-"), item.get("backup_requirement", "-"),
                item.get("calc_load", "-"), item.get("celltype", "-"),
                item.get("centre_tapping", "-"), item.get("batterypartcode", "-"),
                item.get("backup_time", "0"), item.get("quantity", 1),
                item.get("quote_price", 0), item.get("modular_rack", "-"),
            )
        docx_path = _generate_docx(tmp_code)

        if as_pdf:
            pdf_path = docx_path.replace(".docx", ".pdf")
            try:
                import win32com.client
                word = win32com.client.Dispatch("Word.Application")
                word.Visible = False
                doc = word.Documents.Open(os.path.abspath(docx_path))
                doc.SaveAs(os.path.abspath(pdf_path), FileFormat=17)
                doc.Close(); word.Quit()
                with open(pdf_path, "rb") as f:
                    content = f.read()
                try: os.unlink(pdf_path)
                except: pass
            except ImportError:
                # fall back to docx if Word not available
                with open(docx_path, "rb") as f:
                    content = f.read()
                as_pdf = False
            try: os.unlink(docx_path)
            except: pass
        else:
            with open(docx_path, "rb") as f:
                content = f.read()
            try: os.unlink(docx_path)
            except: pass
    finally:
        try: delete_quote(tmp_code)
        except: pass

    ext   = "pdf" if as_pdf else "docx"
    fname = _safe_name(rec.get("name", "quote")) + f"_quote.{ext}"
    return fname, content


# ── export endpoint ───────────────────────────────────────────────────────────

@router.get("/{group_id}/export")
def export_group(group_id: str, fmt: str = "native", user: dict = Depends(get_current_user)):
    """
    Export all records in a group as a ZIP file.
    fmt=native  → sizing.xlsx, costing.xlsx, quote.docx  (default)
    fmt=pdf     → quote as PDF (requires Microsoft Word on server), others still xlsx
    """
    db = get_db()
    group = db.reference(f"{GROUPS_PATH}/{group_id}").get()
    if not group:
        raise HTTPException(404, "Group not found")

    record_ids      = group.get("record_ids") or []
    datasheet_names = group.get("datasheet_names") or []
    gad_names       = group.get("gad_names") or []
    records = [r for rid in record_ids if (r := db.reference(f"{RECORDS_PATH}/{rid}").get())]

    if not records and not datasheet_names and not gad_names:
        raise HTTPException(400, "Group has no content to export")

    as_pdf = fmt == "pdf"
    errors: list[str] = []

    DS_DIR  = APP_DIR / "Datasheets"
    GAD_DIR = APP_DIR / "Gads"

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        seen_names: dict[str, int] = {}

        def _add(fname: str, content: bytes) -> None:
            if fname in seen_names:
                seen_names[fname] += 1
                base, ext = os.path.splitext(fname)
                fname2 = f"{base}_{seen_names[fname]}{ext}"
            else:
                seen_names[fname] = 0
                fname2 = fname
            zf.writestr(fname2, content)

        for rec in records:
            try:
                rec_type = rec.get("type")
                if rec_type == "sizing":
                    fname, content = _export_sizing(rec)
                elif rec_type == "costing":
                    fname, content = _export_costing(rec)
                elif rec_type == "quotation":
                    fname, content = _export_quotation(rec, as_pdf=as_pdf)
                else:
                    continue
                _add(fname, content)
            except Exception as e:
                errors.append(f"{rec.get('name', rec.get('id', '?'))}: {e}")

        for ds in datasheet_names:
            path = DS_DIR / ds
            if path.exists():
                try:
                    _add(f"Datasheets/{ds}", path.read_bytes())
                except Exception as e:
                    errors.append(f"Datasheet {ds}: {e}")

        for gad in gad_names:
            path = GAD_DIR / gad
            if path.exists():
                try:
                    _add(f"GADs/{gad}", path.read_bytes())
                except Exception as e:
                    errors.append(f"GAD {gad}: {e}")

    if errors and zip_buf.tell() <= 22:
        raise HTTPException(500, f"All exports failed: {'; '.join(errors)}")

    zip_buf.seek(0)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp.write(zip_buf.read())
    tmp.close()

    group_name = _safe_name(group.get("name", "group"))
    return FileResponse(
        tmp.name,
        media_type="application/zip",
        filename=f"{group_name}.zip",
    )
