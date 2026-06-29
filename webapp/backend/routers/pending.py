import sys
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Literal

sys.path.insert(0, str(Path(__file__).parent.parent))
from auth import get_current_user, get_expert_user
from pending_db import push_row, list_rows, list_mine, update_row, delete_row, init_db, suggest_next_inquiry_code
from pending_user_db import init_item_table, log_export, log_export_bulk, list_exports, list_all_tables, export_summary_all, update_export_sol_no, update_export_parent, clear_export_link, delete_export
from pending_full_db import init_db as init_full_db, log_export as full_log_export, list_by_code as full_list_by_code, export_summary_global
from user_db import get_user_pending_db, get_user_inquiry_db, get_user_temp_db

init_db()
init_full_db()
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
    submission_date: str = ""
    submitted_to: str = ""


class AssignBody(BaseModel):
    username: str
    remarks: str = ""


class CompleteBody(BaseModel):
    submission_date: str = ""
    submitted_to: str = ""
    submitted_by: str = ""
    reply_to: str = ""


class StatusBody(BaseModel):
    status: Literal["pending", "submitted", "completed"]


class PriorityBody(BaseModel):
    priority: str


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
def create(body: PendingEntry, user=Depends(get_current_user)):
    row_id = push_row(body.dict(), user["username"])
    return {"id": row_id}


@router.put("/{row_id}")
def update(row_id: int, body: PendingEntry, user=Depends(get_expert_user)):
    update_row(row_id, body.dict())
    return {"detail": "updated"}


@router.patch("/{row_id}/priority")
def set_priority(row_id: int, body: PriorityBody, _=Depends(get_expert_user)):
    valid = {"urgent", "semi_urgent", "relaxed"}
    if body.priority not in valid:
        raise HTTPException(400, "Invalid priority")
    update_row(row_id, {"priority": body.priority})
    return {"detail": "updated"}


@router.patch("/{row_id}/status")
def set_status(row_id: int, body: StatusBody, user=Depends(get_current_user)):
    rows = list_rows()
    row = next((r for r in rows if r["id"] == row_id), None)
    if not row:
        raise HTTPException(404, "Not found")
    if user.get("role") != "expert" and row.get("assigned_to") != user["username"]:
        raise HTTPException(403, "Not authorized to change this row's status")
    update_row(row_id, {"status": body.status})
    return {"detail": "updated"}


@router.post("/{row_id}/assign")
def assign(row_id: int, body: AssignBody, _=Depends(get_expert_user)):
    fields: dict = {"assigned_to": body.username}
    if body.remarks:
        fields["remarks"] = body.remarks
    update_row(row_id, fields)
    return {"detail": "assigned"}


@router.post("/{row_id}/complete")
def mark_complete(row_id: int, body: CompleteBody = CompleteBody(), user=Depends(get_current_user)):
    rows = list_rows()
    row = next((r for r in rows if r["id"] == row_id), None)
    if not row:
        raise HTTPException(404, "Not found")
    if user.get("role") != "expert" and row.get("assigned_to") != user["username"]:
        raise HTTPException(403, "Not authorized to complete this row")

    inquiry_code = row.get("inquiry_code") or str(row.get("sr_no", row_id))

    # push per-user export history to the full DB
    db_path = get_user_pending_db(user["username"])
    exports = list_exports(inquiry_code, db_path)
    pushed = 0
    for exp in exports:
        full_log_export(inquiry_code, user["username"], exp)
        pushed += 1

    completion_fields: dict = {"status": "completed", "submitted_by": user["username"]}
    if body.submission_date: completion_fields["submission_date"] = body.submission_date
    if body.submitted_to:    completion_fields["submitted_to"]    = body.submitted_to
    if body.reply_to:        completion_fields["reply_to"]        = body.reply_to

    # merge completion fields into row so create_from_completion sees the final values
    completed_row = {**row, **completion_fields}

    # create/update global inquiry entries from export history
    inq_error = None
    try:
        from inquiry_db import create_from_completion
        create_from_completion(inquiry_code, exports, completed_row)
    except Exception as _e:
        inq_error = str(_e)
    update_row(row_id, completion_fields)
    result: dict = {"detail": "completed", "pushed": pushed}
    if inq_error:
        result["inq_error"] = inq_error
    return result


@router.delete("/{row_id}")
def remove(row_id: int, _=Depends(get_expert_user)):
    delete_row(row_id)
    return {"detail": "deleted"}


# ── per-user export history ────────────────────────────────────────────────────

class ExportEntry(BaseModel):
    pending_code: str
    export_type: str = ""
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
    cell_type: str = ""
    ageing_type: str = ""
    backup_time_min: str = ""
    centre_tap: str = ""
    quote_code: str = ""
    qty_system: str = ""
    rate_system: str = ""
    price_system: str = ""
    sales_person: str = ""
    solution_provider: str = ""
    project_customer: str = ""
    rack_dim: str = ""
    qty: str = ""
    per_rack_price: str = ""
    price: str = ""
    rack1_dim: str = ""
    rack1_qty: str = ""
    rack1_rate: str = ""
    rack1_price: str = ""
    rack2_dim: str = ""
    rack2_qty: str = ""
    rack2_rate: str = ""
    rack2_price: str = ""
    custom_cost_desc: str = ""
    custom_cost_price: str = ""
    cc1_desc: str = ""
    cc1_price: str = ""
    cc2_desc: str = ""
    cc2_price: str = ""
    cc3_desc: str = ""
    cc3_price: str = ""
    cc4_desc: str = ""
    cc4_price: str = ""
    cc5_desc: str = ""
    cc5_price: str = ""
    submission_date: str = ""
    submitted_to: str = ""
    datasheet_name: str = ""
    gad_name: str = ""
    remarks: str = ""
    sol_no: str = ""
    type: str = ""
    dollar_rate: str = ""
    warranty_years: str = ""
    quote_format: str = ""
    base_partcode: str = ""


@router.get("/my-export-summary")
def get_export_summary(user=Depends(get_current_user)):
    db = get_user_pending_db(user["username"])
    return export_summary_all(db)


@router.get("/export-summary")
def get_global_export_summary(_=Depends(get_current_user)):
    return export_summary_global()


_SIZING_MATCH_FIELDS = [
    "ups_make", "ups_model", "ups_kva", "actual_load_kva", "load_kw",
    "power_factor", "inverter_efficiency", "dc_voltage", "backup_min",
    "cell_chemistry", "ageing_pct", "design_margin_pct", "dod_margin_pct",
    "derating_pct", "capacity_ah", "ageing_type", "backup_time_min",
]

def _find_matching_sol(data: dict, pending_code: str, db: str) -> str | None:
    existing = list_exports(pending_code, db)
    quote_sols = [
        e for e in existing
        if e.get("export_type", "").startswith("quote_") and e.get("sol_no", "")
    ]
    for qe in sorted(quote_sols, key=lambda e: str(e.get("sol_no", ""))):
        compared = 0
        match = True
        for f in _SIZING_MATCH_FIELDS:
            sv = str(data.get(f, "") or "").strip()
            qv = str(qe.get(f, "") or "").strip()
            if not sv or not qv:
                continue
            compared += 1
            if sv != qv:
                match = False
                break
        if match and compared > 0:
            return str(qe["sol_no"])
    return None


@router.post("/my-exports")
def add_export(body: ExportEntry, user=Depends(get_current_user)):
    import time as _time
    db = get_user_pending_db(user["username"])
    init_item_table(body.pending_code, db)
    ts = int(_time.time() * 1000)
    data = body.dict()
    row_id = log_export(body.pending_code, data, db, ts=ts)
    if data.get("export_type", "").startswith("sizing_"):
        matched_sol = _find_matching_sol(data, body.pending_code, db)
        if matched_sol:
            update_export_sol_no(body.pending_code, row_id, matched_sol, db)
            data["sol_no"] = matched_sol
    full_log_export(body.pending_code, user["username"], {**data, "exported_at": ts})
    return {"id": row_id}


class BulkExportEntry(BaseModel):
    pending_code: str
    exports: list[dict]

@router.post("/my-exports/bulk", status_code=201)
def add_exports_bulk(body: BulkExportEntry, user=Depends(get_current_user)):
    import time as _time
    ts = int(_time.time() * 1000)
    db = get_user_pending_db(user["username"])
    ids = log_export_bulk(body.pending_code, body.exports, db, ts=ts)
    for exp in body.exports:
        full_log_export(body.pending_code, user["username"], {**exp, "exported_at": ts})
    return {"ids": ids}


@router.get("/my-exports/{pending_code}")
def get_exports(pending_code: str, user=Depends(get_current_user)):
    db = get_user_pending_db(user["username"])
    return list_exports(pending_code, db)


@router.get("/history/{inquiry_code}")
def get_full_history(inquiry_code: str, _=Depends(get_current_user)):
    return full_list_by_code(inquiry_code)


# ── quote export → pending_temp snapshot ──────────────────────────────────────

class ExportFromQuoteBody(BaseModel):
    pending_code: str
    quote_code: str
    export_type: str  # "quote_word" | "quote_pdf"


@router.post("/my-exports/from-quote", status_code=201)
def export_from_quote(body: ExportFromQuoteBody, user=Depends(get_current_user)):
    """Read all system rows from pending_temp (inquiry.db) for the given quote_code,
    log one export history record per system into the user's pending DB.
    Runs sync_inquiry_for_quote first to guarantee pending_temp is current.
    """
    from inquiry_db import sync_inquiry_for_quote, list_rows as inq_list_rows, init_inquiry_db
    from tempquotebase import get_all_quote_products, init_temp_db

    user_inq_db = get_user_inquiry_db(user["username"])
    tdb = get_user_temp_db(user["username"])
    init_temp_db(tdb)

    # on-demand sync so pending_temp reflects current quote state
    _ROW_KEYS = [
        "code","format","date","solution_provider","customer_name",
        "sr_no","sol_no","ups_rating","backup_requirement","calc_load",
        "celltype","centre_tapping","batterypartcode","backup_time",
        "quantity","quote_price","modular_rack","system_text","solution_text",
        "calc_load_unit","item_type","ageing_type",
    ]
    try:
        raw_items = get_all_quote_products(body.quote_code, tdb)
        items = [dict(zip(_ROW_KEYS, r)) for r in raw_items]
        sync_inquiry_for_quote(body.quote_code, items, user_inq_db)
    except Exception:
        pass

    init_inquiry_db(user_inq_db)
    inq_rows = [r for r in inq_list_rows(user_inq_db) if r.get("quote_code") == body.quote_code]

    # fallback: inquiry.db has no rows for this quote → build directly from temp.db items
    if not inq_rows and items:
        system_items = [i for i in items if (i.get("item_type") or "system") == "system"]
        rack_items   = [i for i in items if i.get("item_type") == "rack"]
        custom_items = [i for i in items if i.get("item_type") == "custom"]
        for sys_item in system_items:
            sys_sr = int(sys_item.get("sr_no", 0))
            next_sys_sr = min(
                (int(s.get("sr_no", 0)) for s in system_items if int(s.get("sr_no", 0)) > sys_sr),
                default=999999,
            )
            my_racks    = [r for r in rack_items   if sys_sr < int(r.get("sr_no", 0)) < next_sys_sr]
            my_customs  = [c for c in custom_items if sys_sr < int(c.get("sr_no", 0)) < next_sys_sr]
            rk: dict = {}
            for idx, rack in enumerate(my_racks[:2], 1):
                rp = float(rack.get("quote_price", 0)) * int(rack.get("quantity", 1))
                rk[f"rack{idx}_dim"]   = str(rack.get("modular_rack", ""))
                rk[f"rack{idx}_qty"]   = str(rack.get("quantity", ""))
                rk[f"rack{idx}_rate"]  = str(rack.get("quote_price", ""))
                rk[f"rack{idx}_price"] = str(round(rp, 2))
            for idx in range(len(my_racks[:2]) + 1, 3):
                rk[f"rack{idx}_dim"] = rk[f"rack{idx}_qty"] = rk[f"rack{idx}_rate"] = rk[f"rack{idx}_price"] = ""
            cc: dict = {}
            for idx, c in enumerate(my_customs[:5], 1):
                cp = float(c.get("quote_price", 0)) * int(c.get("quantity", 1))
                cc[f"cc{idx}_desc"]  = str(c.get("modular_rack", ""))
                cc[f"cc{idx}_price"] = str(round(cp, 2))
            for idx in range(len(my_customs[:5]) + 1, 6):
                cc[f"cc{idx}_desc"] = cc[f"cc{idx}_price"] = ""
            inq_rows.append({
                "sol_no":           str(sys_item.get("sol_no", "")),
                "type":             "",
                "quote_code":       body.quote_code,
                "ups_kva":          str(sys_item.get("ups_rating", "")),
                "part_code":        str(sys_item.get("batterypartcode", "")),
                "cell_type":        str(sys_item.get("celltype", "")),
                "centre_tap":       str(sys_item.get("centre_tapping", "")),
                "backup_time_min":  str(sys_item.get("backup_time", "")),
                "ageing_type":      str(sys_item.get("ageing_type", "BOL")),
                "qty_system":       str(sys_item.get("quantity", "")),
                "rate_system":      str(sys_item.get("quote_price", "")),
                "price_system":     str(round(float(sys_item.get("quote_price", 0)) * int(sys_item.get("quantity", 1)), 2)),
                "solution_provider": str(sys_item.get("solution_provider", "")),
                "project_customer": str(sys_item.get("customer_name", "")),
                **rk, **cc,
            })

    db_path = get_user_pending_db(user["username"])
    count = 0
    for inq_row in inq_rows:
        sol_no = str(inq_row.get("sol_no") or "")
        export_data = {
            "pending_code": body.pending_code,
            "export_type":  body.export_type,
            "sol_no":       sol_no,
            "type":         str(inq_row.get("type") or ""),
            "quote_code":   body.quote_code,
            "ups_kva":      str(inq_row.get("ups_kva") or ""),
            "part_code":    str(inq_row.get("part_code") or ""),
            "cell_type":    str(inq_row.get("cell_type") or ""),
            "ageing_type":  str(inq_row.get("ageing_type") or ""),
            "backup_time_min": str(inq_row.get("backup_time_min") or ""),
            "centre_tap":   str(inq_row.get("centre_tap") or ""),
            "qty_system":   str(inq_row.get("qty_system") or ""),
            "rate_system":  str(inq_row.get("rate_system") or ""),
            "price_system": str(inq_row.get("price_system") or ""),
            "sales_person": str(inq_row.get("sales_person") or ""),
            "solution_provider": str(inq_row.get("solution_provider") or ""),
            "project_customer":  str(inq_row.get("project_customer") or ""),
            "ups_make":     str(inq_row.get("ups_make") or ""),
            "ups_model":    str(inq_row.get("ups_model") or ""),
            "actual_load_kva": str(inq_row.get("actual_load_kva") or ""),
            "load_kw":      str(inq_row.get("load_kw") or ""),
            "power_factor": str(inq_row.get("power_factor") or ""),
            "inverter_efficiency": str(inq_row.get("inverter_efficiency") or ""),
            "dc_voltage":   str(inq_row.get("dc_voltage") or ""),
            "backup_min":   str(inq_row.get("backup_min") or ""),
            "cell_chemistry": str(inq_row.get("cell_chemistry") or ""),
            "ageing_pct":   str(inq_row.get("ageing_pct") or ""),
            "design_margin_pct": str(inq_row.get("design_margin_pct") or ""),
            "dod_margin_pct": str(inq_row.get("dod_margin_pct") or ""),
            "derating_pct": str(inq_row.get("derating_pct") or ""),
            "capacity_ah":  str(inq_row.get("capacity_ah") or ""),
            "rack1_dim":    str(inq_row.get("rack1_dim") or ""),
            "rack1_qty":    str(inq_row.get("rack1_qty") or ""),
            "rack1_rate":   str(inq_row.get("rack1_rate") or ""),
            "rack1_price":  str(inq_row.get("rack1_price") or ""),
            "rack2_dim":    str(inq_row.get("rack2_dim") or ""),
            "rack2_qty":    str(inq_row.get("rack2_qty") or ""),
            "rack2_rate":   str(inq_row.get("rack2_rate") or ""),
            "rack2_price":  str(inq_row.get("rack2_price") or ""),
            "cc1_desc":     str(inq_row.get("cc1_desc") or ""),
            "cc1_price":    str(inq_row.get("cc1_price") or ""),
            "cc2_desc":     str(inq_row.get("cc2_desc") or ""),
            "cc2_price":    str(inq_row.get("cc2_price") or ""),
            "cc3_desc":     str(inq_row.get("cc3_desc") or ""),
            "cc3_price":    str(inq_row.get("cc3_price") or ""),
            "cc4_desc":     str(inq_row.get("cc4_desc") or ""),
            "cc4_price":    str(inq_row.get("cc4_price") or ""),
            "cc5_desc":       str(inq_row.get("cc5_desc") or ""),
            "cc5_price":      str(inq_row.get("cc5_price") or ""),
            "dollar_rate":    str(inq_row.get("dollar_rate") or ""),
            "warranty_years": str(inq_row.get("warranty") or "5"),
            "quote_format":   str(inq_row.get("quote_format") or ""),
            "base_partcode":  str(inq_row.get("base_partcode") or ""),
        }
        import time as _time
        ts = int(_time.time() * 1000)
        init_item_table(body.pending_code, db_path)
        log_export(body.pending_code, export_data, db_path, ts=ts)
        full_log_export(body.pending_code, user["username"], {**export_data, "exported_at": ts})
        count += 1

    return {"count": count}


# ── link datasheet/GAD exports to a sol_no ────────────────────────────────────

class LinkItem(BaseModel):
    pending_code: str
    export_id: int
    sol_no: str


class LinkBody(BaseModel):
    links: list[LinkItem]


@router.patch("/my-exports/link")
def link_exports(body: LinkBody, user=Depends(get_current_user)):
    db_path = get_user_pending_db(user["username"])
    for item in body.links:
        try:
            update_export_sol_no(item.pending_code, item.export_id, item.sol_no, db_path)
            # find latest quote export for this sol_no → set as parent
            all_exps = list_exports(item.pending_code, db_path)
            parents = [
                e for e in all_exps
                if e.get("export_type", "").startswith("quote_")
                and str(e.get("sol_no", "")) == item.sol_no
                and not e.get("parent_id")
            ]
            if parents:
                latest_parent = sorted(parents, key=lambda e: e.get("exported_at", 0), reverse=True)[0]
                update_export_parent(item.pending_code, item.export_id, latest_parent["id"], db_path)
        except Exception:
            pass
    return {"detail": "linked", "count": len(body.links)}


class UnlinkBody(BaseModel):
    pending_code: str
    export_id: int

@router.patch("/my-exports/unlink")
def unlink_export(body: UnlinkBody, user=Depends(get_current_user)):
    db_path = get_user_pending_db(user["username"])
    clear_export_link(body.pending_code, body.export_id, db_path)
    return {"detail": "unlinked"}


@router.delete("/my-exports/{export_id}")
def delete_export_entry(export_id: int, pending_code: str, user=Depends(get_current_user)):
    db_path = get_user_pending_db(user["username"])
    delete_export(pending_code, export_id, db_path)
    return {"detail": "deleted"}
