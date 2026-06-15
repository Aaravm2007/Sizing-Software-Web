import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from config import settings
from limiter import limiter

app = FastAPI(title="Sizing Software API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Build CORS origins from env — never hardcode localhost in production
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

from routers import auth, sizing, costing, quotation, datafiles, formulas, records, groups, approvals, inquiry, projects
app.include_router(auth.router,       prefix="/api/auth",       tags=["auth"])
app.include_router(sizing.router,     prefix="/api/sizing",     tags=["sizing"])
app.include_router(costing.router,    prefix="/api/costing",    tags=["costing"])
app.include_router(quotation.router,  prefix="/api/quotation",  tags=["quotation"])
app.include_router(datafiles.router,  prefix="/api/datafiles",  tags=["datafiles"])
app.include_router(formulas.router,   prefix="/api/formulas",   tags=["formulas"])
app.include_router(records.router,    prefix="/api/records",    tags=["records"])
app.include_router(groups.router,     prefix="/api/groups",     tags=["groups"])
app.include_router(approvals.router,  prefix="/api/approvals",  tags=["approvals"])
app.include_router(inquiry.router,    prefix="/api/inquiry",    tags=["inquiry"])
app.include_router(projects.router,   prefix="/api/projects",   tags=["projects"])


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
