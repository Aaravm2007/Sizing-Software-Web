import shutil
import sys
from pathlib import Path
from typing import List, Optional
import urllib.parse
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

APP_DIR = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(APP_DIR))

from auth import get_current_user, get_expert_user

router = APIRouter()

FOLDERS = {
    "datasheets": APP_DIR / "Datasheets",
    "gads": APP_DIR / "Gads",
}

ARCHIVE_FOLDERS = {
    "datasheets": APP_DIR / "archived_datasheet",
    "gads": APP_DIR / "archived_gad",
}


def _list_files(folder: Path, query: str = "") -> list[str]:
    if not folder.exists():
        return []
    q = query.lower()
    return sorted(
        f.name for f in folder.rglob("*")
        if f.is_file() and (not q or q in f.name.lower())
    )


@router.get("/{folder_key}/files")
def list_files(
    folder_key: str,
    q: Optional[str] = Query(""),
    view: Optional[str] = Query("active"),
    _=Depends(get_current_user),
):
    folder_map = ARCHIVE_FOLDERS if view == "archived" else FOLDERS
    folder = folder_map.get(folder_key)
    if folder is None:
        raise HTTPException(404, "Unknown folder")
    return {"files": _list_files(folder, q or "")}


@router.get("/{folder_key}/files/{filename:path}")
def download_file(
    folder_key: str,
    filename: str,
    _=Depends(get_current_user),
):
    folder = FOLDERS.get(folder_key)
    if folder is None:
        raise HTTPException(404, "Unknown folder")
    decoded = urllib.parse.unquote(filename)
    path = (folder / decoded).resolve()
    if not str(path).startswith(str(folder.resolve())):
        raise HTTPException(403, "Forbidden")
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(
        path=str(path),
        filename=path.name,
        media_type="application/octet-stream",
    )


class ArchiveBody(BaseModel):
    filenames: list[str]


@router.post("/{folder_key}/upload")
async def upload_files(
    folder_key: str,
    files: List[UploadFile] = File(...),
    _=Depends(get_expert_user),
):
    folder = FOLDERS.get(folder_key)
    if folder is None:
        raise HTTPException(404, "Unknown folder")
    folder.mkdir(parents=True, exist_ok=True)
    saved = []
    for file in files:
        name = Path(file.filename or "").name
        if not name:
            continue
        dest = folder / name
        with dest.open("wb") as f:
            shutil.copyfileobj(file.file, f)
        saved.append(name)
    return {"saved": len(saved), "files": saved}


@router.post("/{folder_key}/archive")
def archive_files(
    folder_key: str,
    body: ArchiveBody,
    _=Depends(get_expert_user),
):
    folder = FOLDERS.get(folder_key)
    archive_dir = ARCHIVE_FOLDERS.get(folder_key)
    if folder is None or archive_dir is None:
        raise HTTPException(404, "Unknown folder")
    archive_dir.mkdir(parents=True, exist_ok=True)
    moved, missing = [], []
    for name in body.filenames:
        safe_name = Path(name).name
        if not safe_name:
            continue
        src = folder / safe_name
        if not src.exists():
            missing.append(safe_name)
            continue
        shutil.move(str(src), str(archive_dir / safe_name))
        moved.append(safe_name)
    return {"archived": len(moved), "missing": missing}


class RestoreBody(BaseModel):
    filenames: list[str]


@router.post("/{folder_key}/restore")
def restore_files(
    folder_key: str,
    body: RestoreBody,
    _=Depends(get_expert_user),
):
    archive_dir = ARCHIVE_FOLDERS.get(folder_key)
    folder = FOLDERS.get(folder_key)
    if folder is None or archive_dir is None:
        raise HTTPException(404, "Unknown folder")
    folder.mkdir(parents=True, exist_ok=True)
    moved, missing = [], []
    for name in body.filenames:
        safe_name = Path(name).name
        if not safe_name:
            continue
        src = archive_dir / safe_name
        if not src.exists():
            missing.append(safe_name)
            continue
        shutil.move(str(src), str(folder / safe_name))
        moved.append(safe_name)
    return {"restored": len(moved), "missing": missing}
