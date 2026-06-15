import os
import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from typing import Optional
from firebase_init import get_db
from auth import create_access_token, get_current_user, pwd_context
from config import settings
from limiter import limiter

router = APIRouter()

# Admin credentials from env vars — never hardcoded
ADMIN_USER = settings.ADMIN_USERNAME
ADMIN_PASS = settings.ADMIN_PASSWORD

def _get_role(username: str) -> str:
    try:
        db = get_db()
        data = db.reference(f"allowed_users/{username}").get()
        if isinstance(data, dict):
            return data.get("role", "u")
    except Exception:
        pass
    return "u"


def _verify_password(plain: str, stored: str) -> bool:
    """Verify password — handles both bcrypt hashes and legacy plaintext (lazy migration)."""
    if stored.startswith("$2b$") or stored.startswith("$2a$"):
        return pwd_context.verify(plain, stored)
    # Legacy plaintext — direct compare
    return plain == stored


def _needs_hash_upgrade(stored: str) -> bool:
    return not (stored.startswith("$2b$") or stored.startswith("$2a$"))


def _enforce_password_policy(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not any(c.isdigit() for c in password):
        raise HTTPException(400, "Password must contain at least one number")
    if not any(c.isalpha() for c in password):
        raise HTTPException(400, "Password must contain at least one letter")


def _require_expert(user: dict):
    if _get_role(user.get("username", "")) != "e":
        raise HTTPException(403, "Expert access required")


# ── schemas ──────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    admin_username: str
    admin_password: str
    email: Optional[str] = None

class GoogleLoginRequest(BaseModel):
    id_token: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


# ── helpers ───────────────────────────────────────────────────────────────────

def _firebase_user(username: str):
    """Fetch user dict from Firebase allowed_users/{username}. Returns None if missing."""
    try:
        db = get_db()
        return db.reference(f"allowed_users/{username}").get()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Firebase error: {e}")


def _exchange_google_token(id_token: str) -> dict:
    """Exchange a Google id_token with Firebase Identity Toolkit REST API."""
    api_key = os.environ.get("FIREBASE_API_KEY") or settings.FIREBASE_API_KEY
    if not api_key:
        raise HTTPException(status_code=503, detail="FIREBASE_API_KEY not configured")

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key={api_key}"
    payload = {
        "postBody": f"id_token={id_token}&providerId=google.com",
        "requestUri": "http://localhost",
        "returnIdpCredential": True,
        "returnSecureToken": True,
    }
    r = http_requests.post(url, json=payload, timeout=10)
    result = r.json()
    if "error" in result:
        raise HTTPException(status_code=401, detail=result["error"].get("message", "Google auth failed"))
    return result


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    username = user.get("username", "")
    return {"username": username, "role": _get_role(username)}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest):
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="All fields are required")

    # Admin account — verified against env-var password, never stored
    if body.username == ADMIN_USER:
        if body.password != ADMIN_PASS:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        token = create_access_token({"sub": body.username, "username": body.username})
        return TokenResponse(access_token=token, username=body.username)

    # Firebase users
    user_data = _firebase_user(body.username)
    if not isinstance(user_data, dict):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    stored_pw = user_data.get("password", "")
    if not _verify_password(body.password, stored_pw):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Lazy migration — upgrade plaintext to bcrypt hash on successful login
    if _needs_hash_upgrade(stored_pw):
        try:
            get_db().reference(f"allowed_users/{body.username}").update(
                {"password": pwd_context.hash(body.password)}
            )
        except Exception:
            pass  # migration failed — not fatal, will retry next login

    token = create_access_token({"sub": body.username, "username": body.username})
    return TokenResponse(access_token=token, username=body.username)


@router.post("/register", status_code=201)
def register(body: RegisterRequest):
    if body.admin_username != ADMIN_USER or body.admin_password != ADMIN_PASS:
        raise HTTPException(status_code=403, detail="Invalid admin credentials")

    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Username and password required")

    _enforce_password_policy(body.password)

    existing = _firebase_user(body.username)
    if existing is not None:
        raise HTTPException(status_code=409, detail="User already exists")

    user_data: dict = {"password": pwd_context.hash(body.password), "role": "u"}
    if body.email:
        user_data["email"] = body.email

    try:
        db = get_db()
        db.reference(f"allowed_users/{body.username}").set(user_data)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Firebase error: {e}")

    return {"detail": f"{body.username} registered successfully"}


@router.post("/google-login", response_model=TokenResponse)
def google_login(body: GoogleLoginRequest):
    result = _exchange_google_token(body.id_token)
    email = result.get("email", "")
    if not email:
        raise HTTPException(status_code=400, detail="Could not retrieve email from Google")

    # Find which allowed_user has this email
    try:
        db = get_db()
        users = db.reference("allowed_users").get()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Firebase error: {e}")

    found_username = None
    if isinstance(users, dict):
        for uname, udata in users.items():
            if isinstance(udata, dict) and udata.get("email") == email:
                found_username = uname
                break
    elif isinstance(users, list):
        for idx, udata in enumerate(users):
            if isinstance(udata, dict) and udata.get("email") == email:
                found_username = str(idx)
                break

    if not found_username:
        raise HTTPException(status_code=403, detail=f"{email} is not linked to any authorised account")

    token = create_access_token({"sub": found_username})
    return TokenResponse(access_token=token, username=found_username)


@router.post("/google-register", status_code=201)
def google_register(
    id_token: str,
    username: str,
    password: str,
    admin_username: str,
    admin_password: str,
):
    if admin_username != ADMIN_USER or admin_password != ADMIN_PASS:
        raise HTTPException(status_code=403, detail="Invalid admin credentials")

    result = _exchange_google_token(id_token)
    email = result.get("email", "")

    existing = _firebase_user(username)
    if existing is not None:
        raise HTTPException(status_code=409, detail="User already exists")

    user_data = {"password": pwd_context.hash(password), "role": "u", "email": email}
    try:
        db = get_db()
        db.reference(f"allowed_users/{username}").set(user_data)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Firebase error: {e}")

    return {"detail": f"{username} registered with Google account"}


# ── admin user management ─────────────────────────────────────────────────────

class AdminCreateUser(BaseModel):
    username: str
    password: str
    role: str = "u"           # "u" or "e"
    email: Optional[str] = None

class AdminUpdateUser(BaseModel):
    role: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


@router.get("/users")
def admin_list_users(user: dict = Depends(get_current_user)):
    _require_expert(user)
    db = get_db()
    snap = db.reference("allowed_users").get() or {}
    result = [{"username": "a", "email": "", "role": "e", "hardcoded": True}]
    if isinstance(snap, dict):
        for uname, udata in snap.items():
            if uname in EXPERT_USERNAMES:
                continue
            if isinstance(udata, dict):
                result.append({
                    "username": uname,
                    "email": udata.get("email", ""),
                    "role": udata.get("role", "u"),
                    "hardcoded": False,
                })
    result.sort(key=lambda u: (u["role"] != "e", u["username"]))
    return result


@router.post("/users", status_code=201)
def admin_create_user(body: AdminCreateUser, user: dict = Depends(get_current_user)):
    _require_expert(user)
    if not body.username.strip() or not body.password.strip():
        raise HTTPException(400, "Username and password are required")
    _enforce_password_policy(body.password.strip())
    if body.username == ADMIN_USER:
        raise HTTPException(409, "That username is reserved")
    db = get_db()
    if db.reference(f"allowed_users/{body.username}").get() is not None:
        raise HTTPException(409, "User already exists")
    data: dict = {"password": pwd_context.hash(body.password), "role": body.role or "u"}
    if body.email:
        data["email"] = body.email
    db.reference(f"allowed_users/{body.username}").set(data)
    return {"username": body.username, "role": data["role"], "email": data.get("email", "")}


@router.patch("/users/{target_username}")
def admin_update_user(target_username: str, body: AdminUpdateUser, user: dict = Depends(get_current_user)):
    _require_expert(user)
    if target_username in EXPERT_USERNAMES:
        raise HTTPException(400, "Cannot modify the built-in admin account")
    db = get_db()
    ref = db.reference(f"allowed_users/{target_username}")
    existing = ref.get()
    if not existing:
        raise HTTPException(404, "User not found")
    patch: dict = {}
    if body.role is not None:
        patch["role"] = body.role
    if body.email is not None:
        patch["email"] = body.email
    if body.password is not None and body.password.strip():
        _enforce_password_policy(body.password.strip())
        patch["password"] = pwd_context.hash(body.password.strip())
    if patch:
        ref.update(patch)
    updated = ref.get()
    return {"username": target_username, "role": updated.get("role", "u"),
            "email": updated.get("email", ""), "hardcoded": False}


@router.delete("/users/{target_username}")
def admin_delete_user(target_username: str, user: dict = Depends(get_current_user)):
    _require_expert(user)
    if target_username in EXPERT_USERNAMES:
        raise HTTPException(400, "Cannot delete the built-in admin account")
    if target_username == user.get("username"):
        raise HTTPException(400, "Cannot delete your own account")
    db = get_db()
    ref = db.reference(f"allowed_users/{target_username}")
    if not ref.get():
        raise HTTPException(404, "User not found")
    ref.delete()
    return {"deleted": target_username}
