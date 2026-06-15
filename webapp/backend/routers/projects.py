import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from firebase_init import get_db

router = APIRouter()
PROJECTS_PATH = "/projects"


class BundleCreate(BaseModel):
    quote_code: str
    sizing_project: Optional[str] = None
    sizing_sr_no: Optional[int] = None
    costing: Optional[dict] = None


class ProjectCreate(BaseModel):
    name: str
    customer: str = ""
    nickname: str = ""
    date: str = ""
    time: str = ""
    bundle: Optional[BundleCreate] = None


@router.post("", status_code=201)
def create_project(body: ProjectCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    pid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    bundles: list = []
    if body.bundle:
        bundles.append({
            "id": str(uuid.uuid4()),
            "quote_code": body.bundle.quote_code,
            "sizing_project": body.bundle.sizing_project,
            "sizing_sr_no": body.bundle.sizing_sr_no,
            "costing": body.bundle.costing,
            "datetime": now,
        })
    project = {
        "id": pid,
        "name": body.name,
        "customer": body.customer,
        "nickname": body.nickname,
        "date": body.date,
        "time": body.time,
        "created_by": user.get("username", "unknown"),
        "created_at": now,
        "bundles": bundles,
    }
    db.reference(f"{PROJECTS_PATH}/{pid}").set(project)
    return project


@router.get("")
def list_projects(user: dict = Depends(get_current_user)):
    db = get_db()
    snap = db.reference(PROJECTS_PATH).get()
    if not snap:
        return []
    projects = list(snap.values())
    projects.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    return projects


@router.get("/{project_id}")
def get_project(project_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    project = db.reference(f"{PROJECTS_PATH}/{project_id}").get()
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.delete("/{project_id}")
def delete_project_endpoint(project_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    ref = db.reference(f"{PROJECTS_PATH}/{project_id}")
    if not ref.get():
        raise HTTPException(404, "Project not found")
    ref.delete()
    return {"deleted": project_id}


@router.post("/{project_id}/bundles", status_code=201)
def add_bundle(project_id: str, body: BundleCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    ref = db.reference(f"{PROJECTS_PATH}/{project_id}")
    project = ref.get()
    if not project:
        raise HTTPException(404, "Project not found")
    bundles: list = list(project.get("bundles") or [])
    now = datetime.now(timezone.utc).isoformat()
    bundle = {
        "id": str(uuid.uuid4()),
        "quote_code": body.quote_code,
        "sizing_project": body.sizing_project,
        "sizing_sr_no": body.sizing_sr_no,
        "costing": body.costing,
        "datetime": now,
    }
    bundles.append(bundle)
    ref.update({"bundles": bundles})
    return bundle


@router.delete("/{project_id}/bundles/{bundle_id}")
def remove_bundle(project_id: str, bundle_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    ref = db.reference(f"{PROJECTS_PATH}/{project_id}")
    project = ref.get()
    if not project:
        raise HTTPException(404, "Project not found")
    bundles = [b for b in (project.get("bundles") or []) if b.get("id") != bundle_id]
    ref.update({"bundles": bundles})
    return {"bundles": bundles}
