import sys
from pathlib import Path
from typing import Optional
import urllib.parse
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

APP_DIR = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(APP_DIR))

from auth import get_current_user

router = APIRouter()

FOLDERS = {
    "datasheets": APP_DIR / "Datasheets",
    "gads": APP_DIR / "Gads",
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
    _=Depends(get_current_user),
):
    folder = FOLDERS.get(folder_key)
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
