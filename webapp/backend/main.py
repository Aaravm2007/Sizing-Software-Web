import logging
import sys
import os
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from config import settings
from limiter import limiter
from auth import get_expert_user

# ── logging setup ─────────────────────────────────────────────────────────────
_LOG_DIR = Path(__file__).parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)
_LOG_FILE = _LOG_DIR / "app.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.FileHandler(_LOG_FILE, encoding="utf-8")],
)
_log = logging.getLogger("app")
_START_TIME = time.time()

# ── app ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Sizing Software API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

_cors_origins = [settings.FRONTEND_URL]
if settings.EXTRA_CORS_ORIGINS:
    _cors_origins += [o.strip() for o in settings.EXTRA_CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── request logging middleware ────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    try:
        response = await call_next(request)
        duration = time.time() - start
        path   = request.url.path
        method = request.method
        status = response.status_code
        if status >= 500:
            _log.error(f"{method} | {path} | {status} | {duration:.2f}s")
        elif status >= 400:
            _log.warning(f"{method} | {path} | {status} | {duration:.2f}s")
        elif duration > 2.0:
            _log.warning(f"{method} | {path} | {status} | SLOW {duration:.2f}s")
        return response
    except Exception as exc:
        duration = time.time() - start
        _log.error(f"{request.method} | {request.url.path} | CRASH | {type(exc).__name__}: {exc}")
        raise

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    _log.error(f"{request.method} | {request.url.path} | CRASH | {type(exc).__name__}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# ── routers ───────────────────────────────────────────────────────────────────
from routers import auth, sizing, costing, quotation, datafiles, formulas, approvals, inquiry, pending, po, mass_sizing
app.include_router(auth.router,       prefix="/api/auth",       tags=["auth"])
app.include_router(sizing.router,     prefix="/api/sizing",     tags=["sizing"])
app.include_router(costing.router,    prefix="/api/costing",    tags=["costing"])
app.include_router(quotation.router,  prefix="/api/quotation",  tags=["quotation"])
app.include_router(datafiles.router,  prefix="/api/datafiles",  tags=["datafiles"])
app.include_router(formulas.router,   prefix="/api/formulas",   tags=["formulas"])
app.include_router(approvals.router,  prefix="/api/approvals",  tags=["approvals"])
app.include_router(inquiry.router,    prefix="/api/inquiry",    tags=["inquiry"])
app.include_router(pending.router,    prefix="/api/pending",    tags=["pending"])
app.include_router(po.router,         prefix="/api/po",         tags=["po"])
app.include_router(mass_sizing.router, prefix="/api/mass-sizing", tags=["mass-sizing"])


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0", "uptime_seconds": int(time.time() - _START_TIME)}


@app.get("/api/admin/logs")
def get_logs(_=Depends(get_expert_user)):
    if not _LOG_FILE.exists():
        return []
    lines = _LOG_FILE.read_text(encoding="utf-8", errors="replace").splitlines()
    entries = []
    for line in reversed(lines[-600:]):
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 2:
            continue
        entries.append({
            "timestamp": parts[0] if len(parts) > 0 else "",
            "level":     parts[1] if len(parts) > 1 else "",
            "method":    parts[2] if len(parts) > 2 else "",
            "path":      parts[3] if len(parts) > 3 else "",
            "status":    parts[4] if len(parts) > 4 else "",
            "detail":    " | ".join(parts[5:]) if len(parts) > 5 else "",
        })
    return entries[:300]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
