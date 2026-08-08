import json
import os
import sqlite3
import re
import smtplib
import urllib.parse
import urllib.request
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from functools import wraps
from hashlib import pbkdf2_hmac
from pathlib import Path
from secrets import token_hex
from threading import Lock
from email.message import EmailMessage
from typing import Any, Dict, Optional

from flask import Flask, jsonify, redirect, request, send_from_directory, session
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = Path(__file__).resolve().parent


def load_local_env() -> None:
    """Load local development settings without replacing deployment variables."""
    env_file = BASE_DIR / ".env"
    if not env_file.is_file():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


load_local_env()
DB_PATH = Path(os.environ.get("MISTIZEN_DB_PATH", BASE_DIR / "mistizen.db"))
MISTIZEN_ENV = os.environ.get("MISTIZEN_ENV", "development").lower()
SECRET_KEY = os.environ.get("MISTIZEN_SECRET_KEY")
if not SECRET_KEY:
    if MISTIZEN_ENV == "production":
        raise RuntimeError("MISTIZEN_SECRET_KEY must be set in production")
    SECRET_KEY = token_hex(32)
if MISTIZEN_ENV == "production" and len(SECRET_KEY) < 32:
    raise RuntimeError("MISTIZEN_SECRET_KEY must be at least 32 characters in production")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
# Set GOOGLE_REDIRECT_URI when the public address is behind a proxy or uses a
# different canonical hostname.  When it is not set, use the address serving
# the current request so local and deployed sign-in use the same callback.
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "").strip()
ADMIN_EMAILS = {email.strip().lower() for email in os.environ.get("MISTIZEN_ADMIN_EMAILS", "").split(",") if email.strip()}
SMTP_HOST = os.environ.get("MISTIZEN_SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("MISTIZEN_SMTP_PORT", "587"))
SMTP_USERNAME = os.environ.get("MISTIZEN_SMTP_USERNAME", "")
SMTP_PASSWORD = os.environ.get("MISTIZEN_SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("MISTIZEN_SMTP_FROM", SMTP_USERNAME)
SUPPORT_EMAIL = os.environ.get("MISTIZEN_SUPPORT_EMAIL", "kchoppa182@gmail.com")
DELIVERY_FEES = {"nairobi": 50.0, "nearby": 100.0, "countrywide": 150.0, "international": 400.0}
FALLBACK_CURRENCY_RATES = {"KES": 1.0, "USD": 0.0075, "EUR": 0.0069, "GBP": 0.0059}
EXCHANGE_RATE_API_KEY = os.environ.get("EXCHANGE_RATE_API_KEY", "")
RATE_CACHE_TTL_SECONDS = 300
_rate_cache: Dict[str, Any] = {"expires_at": 0.0, "rates": FALLBACK_CURRENCY_RATES, "updated_at": None, "live": False}
PHONE_RULES = {
    "+254": r"(?:1|7)\d{8}", "+233": r"(?:2|5)\d{8}", "+234": r"[2-9]\d{9}",
    "+256": r"(?:2|3|4|7)\d{8}", "+255": r"(?:2|4|6|7|8)\d{8}", "+250": r"(?:2|7|8)\d{8}",
    "+267": r"[2-7]\d{6,7}", "+268": r"(?:2|7)\d{7}", "+265": r"(?:1|2|8|9)\d{8}",
    "+260": r"(?:2|5|6|7|9)\d{8}", "+263": r"[1-9]\d{8}", "+27": r"[1-8]\d{8}",
    "+1": r"[2-9]\d{2}[2-9]\d{6}", "+44": r"\d{9,10}", "+91": r"[6-9]\d{9}",
    "+61": r"\d{9}", "+49": r"\d{7,11}", "+33": r"[1-9]\d{8}", "+81": r"\d{9,10}",
    "+971": r"[2-9]\d{7,8}",
}

app = Flask(__name__, static_folder=".")
app.secret_key = SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = 1_000_000
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = MISTIZEN_ENV == "production"
app.config["SESSION_COOKIE_NAME"] = "mistizen_session"
app.config["SESSION_REFRESH_EACH_REQUEST"] = False
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)

# Simple abuse protection for one-process deployments. Use a shared limiter at
# the reverse proxy or hosting platform when running multiple application workers.
REQUEST_WINDOWS = {
    "/api/auth/login": (5, 60),
    "/api/auth/register": (3, 3600),
    "/api/support": (5, 3600),
}
_request_attempts = defaultdict(deque)
_rate_limit_lock = Lock()
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,63}$")
SAFE_STATIC_FILES = {
    "Frontend.css", "script.js", "white-removebg-preview.png",
    "Frontend.html", "PRODUCTS.html", "cart.html", "checkout.html",
    "auth.html", "account.html", "admin.html", "support.html",
}


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                username TEXT,
                profile_photo TEXT,
                payment_method TEXT,
                payment_label TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                payload TEXT NOT NULL,
                total_kes REAL NOT NULL,
                payment_method TEXT NOT NULL,
                delivery_method TEXT NOT NULL DEFAULT 'pickup',
                delivery_address TEXT,
                delivery_fee_kes REAL NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'new',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )
        # Existing local databases predate the profile fields, so upgrade them
        # in place without losing customer accounts.
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        for name, definition in {
            "username": "TEXT",
            "profile_photo": "TEXT",
            "payment_method": "TEXT",
            "payment_label": "TEXT",
        }.items():
            if name not in columns:
                conn.execute(f"ALTER TABLE users ADD COLUMN {name} {definition}")
        order_columns = {row["name"] for row in conn.execute("PRAGMA table_info(orders)").fetchall()}
        for name, definition in {
            "delivery_method": "TEXT NOT NULL DEFAULT 'pickup'",
            "delivery_address": "TEXT",
            "delivery_fee_kes": "REAL NOT NULL DEFAULT 0",
            "status": "TEXT NOT NULL DEFAULT 'new'",
            "fulfillment_note": "TEXT",
            "tracking_reference": "TEXT",
            "status_updated_at": "TEXT",
        }.items():
            if name not in order_columns:
                conn.execute(f"ALTER TABLE orders ADD COLUMN {name} {definition}")


init_db()


def get_google_oauth_config() -> Dict[str, str]:
    redirect_uri = GOOGLE_REDIRECT_URI or request.url_root.rstrip("/") + "/api/auth/google/callback"
    return {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
    }


def create_or_get_user(email: str, provider: str = "email") -> int:
    password_hash = generate_password_hash(token_hex(24))
    username = email.split("@", 1)[0]
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            return existing["id"]
        cursor = conn.execute(
            "INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)",
            (email, password_hash, username),
        )
        return cursor.lastrowid


def require_login(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"result": "error", "message": "Authentication required"}), 401
        return view(*args, **kwargs)

    return wrapped


def require_admin(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("user_id") or (session.get("email") or "").lower() not in ADMIN_EMAILS:
            return jsonify({"result": "error", "message": "Administrator access required"}), 403
        return view(*args, **kwargs)
    return wrapped


def user_payload(row: sqlite3.Row) -> Dict[str, Optional[str]]:
    """Return only profile data that is safe for the browser."""
    return {
        "email": row["email"],
        "username": row["username"] or row["email"].split("@", 1)[0],
        "profile_photo": row["profile_photo"],
        "payment_method": row["payment_method"],
        "payment_label": row["payment_label"],
        "is_admin": row["email"].lower() in ADMIN_EMAILS,
    }


def current_user() -> Optional[sqlite3.Row]:
    user_id = session.get("user_id")
    if not user_id:
        return None
    with get_db() as conn:
        return conn.execute(
            "SELECT id, email, username, profile_photo, payment_method, payment_label FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()


def request_origin_is_trusted() -> bool:
    """Accept state-changing browser requests only from this site."""
    origin = request.headers.get("Origin")
    if not origin:
        # Non-browser clients do not send Origin. They still need authentication
        # for protected endpoints; hosting firewalls should restrict admin access.
        return True
    request_origin = request.host_url.rstrip("/")
    return origin == request_origin or (
        MISTIZEN_ENV != "production" and origin in {
            "http://localhost:5000", "http://127.0.0.1:5000", "http://[::1]:5000"
        }
    )


def client_ip() -> str:
    # Do not trust X-Forwarded-For unless a trusted reverse proxy is configured.
    if os.environ.get("MISTIZEN_TRUST_PROXY") == "1":
        return request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",", 1)[0].strip()
    return request.remote_addr or "unknown"


def is_rate_limited() -> bool:
    config = REQUEST_WINDOWS.get(request.path)
    if not config:
        return False
    maximum, window_seconds = config
    now = time.monotonic()
    key = (request.path, client_ip())
    with _rate_limit_lock:
        attempts = _request_attempts[key]
        while attempts and attempts[0] <= now - window_seconds:
            attempts.popleft()
        if len(attempts) >= maximum:
            return True
        attempts.append(now)
    return False


def strong_password(password: str) -> bool:
    return (
        len(password) >= 12
        and len(password) <= 128
        and any(char.islower() for char in password)
        and any(char.isupper() for char in password)
        and any(char.isdigit() for char in password)
    )


def send_order_confirmation(email: str, order_id: int, items: list, subtotal: float, delivery_fee: float, delivery_method: str, delivery_address: str) -> bool:
    """Send a receipt when SMTP is configured; never fail a completed order for email delivery."""
    if not all([SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM]):
        return False
    item_lines = "\n".join(f"- {item.get('name', 'Item')} × {item.get('quantity', 1)}" for item in items)
    message = EmailMessage()
    message["Subject"] = f"MISTIZEN order #{order_id} confirmed"
    message["From"] = SMTP_FROM
    message["To"] = email
    message.set_content(
        f"Thank you for shopping with MISTIZEN!\n\nOrder #{order_id}\n\nItems:\n{item_lines}\n\n"
        f"Items subtotal: KSh {subtotal:,.2f}\nDelivery ({delivery_method.replace('_', ' ').title()}): KSh {delivery_fee:,.2f}\n"
        f"Order total: KSh {subtotal + delivery_fee:,.2f}\n\nDeliver to:\n{delivery_address}\n\n"
        "We will update you as your delivery progresses."
    )
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=12) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(message)
        return True
    except (OSError, smtplib.SMTPException):
        return False


def send_support_feedback(name: str, email: str, feedback: str) -> bool:
    """Forward a customer message without exposing SMTP credentials to the browser."""
    if not all([SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM]):
        return False
    message = EmailMessage()
    message["Subject"] = "New MISTIZEN customer feedback"
    message["From"] = SMTP_FROM
    message["To"] = SUPPORT_EMAIL
    message["Reply-To"] = email
    message.set_content(f"New feedback from {name} <{email}>:\n\n{feedback}")
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=12) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(message)
        return True
    except (OSError, smtplib.SMTPException) as error:
        app.logger.warning("Support email delivery failed: %s", error)
        return False


@app.before_request
def handle_preflight():
    if request.method == "OPTIONS" and request.path.startswith("/api/"):
        if not request_origin_is_trusted():
            return jsonify({"result": "error", "message": "Untrusted origin"}), 403
        response = jsonify({})
        response.status_code = 200
        response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "")
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.path.startswith("/api/"):
        if not request_origin_is_trusted():
            return jsonify({"result": "error", "message": "Untrusted origin"}), 403
        if request.content_length not in (None, 0) and request.mimetype != "application/json":
            return jsonify({"result": "error", "message": "JSON requests only"}), 415
        if is_rate_limited():
            return jsonify({"result": "error", "message": "Too many requests. Try again later."}), 429


@app.after_request
def security_headers(response):
    origin = request.headers.get("Origin", "")
    is_local_origin = any(
        origin.startswith(prefix)
        for prefix in ["http://localhost:", "http://127.0.0.1:", "http://[::1]:"]
    )
    if request.path.startswith("/api/") and is_local_origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    if MISTIZEN_ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "Frontend.html")


@app.route("/<path:filename>")
def serve_static(filename: str):
    if filename.startswith("api/") or filename not in SAFE_STATIC_FILES and not filename.startswith("assets/"):
        return jsonify({"result": "error", "message": "Not found"}), 404
    if filename.startswith("assets/") and (".." in Path(filename).parts or Path(filename).suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico"}):
        return jsonify({"result": "error", "message": "Not found"}), 404
    # Browsers can reuse static files between page visits instead of downloading
    # the stylesheet, JavaScript, and product images every time.
    is_asset = filename.startswith("assets/") or filename in {"Frontend.css", "script.js", "white-removebg-preview.png"}
    response = send_from_directory(BASE_DIR, filename, max_age=86_400 if is_asset else 0)
    if is_asset:
        response.headers["Cache-Control"] = "public, max-age=86400"
    else:
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.route("/api/health")
def health():
    payload = {
        "result": "success",
        "message": "MISTIZEN backend is running",
    }
    if MISTIZEN_ENV != "production":
        payload["smtp_configured"] = all([SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM])
        payload["google_sign_in_configured"] = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
    return jsonify(payload)


@app.route("/api/auth/providers")
def auth_providers():
    return jsonify({
        "result": "success",
        "google": {"configured": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)},
    })


@app.route("/api/auth/register", methods=["POST"])
def register():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = (payload.get("password") or "").strip()

    if not EMAIL_RE.fullmatch(email) or not strong_password(password):
        return jsonify({"result": "error", "message": "Use a valid email and a password of at least 12 characters with uppercase, lowercase, and a number."}), 400

    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            return jsonify({"result": "error", "message": "An account with that email already exists"}), 409
        password_hash = generate_password_hash(password)
        cursor = conn.execute(
            "INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)",
            (email, password_hash, email.split("@", 1)[0]),
        )
        user_id = cursor.lastrowid

    session.clear()
    session.permanent = True
    session["user_id"] = user_id
    session["email"] = email
    return jsonify({"result": "success", "message": "Account created", "user": user_payload(current_user())})


@app.route("/api/auth/login", methods=["POST"])
def login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = (payload.get("password") or "").strip()

    if not email or not password:
        return jsonify({"result": "error", "message": "Email and password are required"}), 400

    with get_db() as conn:
        user = conn.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (email,)).fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"result": "error", "message": "Invalid email or password"}), 401

    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    session["email"] = user["email"]
    return jsonify({"result": "success", "message": "Logged in", "user": user_payload(current_user())})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"result": "success", "message": "Logged out"})


@app.route("/api/auth/me")
def me():
    user = current_user()
    if not user:
        return jsonify({"result": "success", "authenticated": False, "user": None})
    return jsonify({"result": "success", "authenticated": True, "user": user_payload(user)})


@app.route("/api/account/profile", methods=["POST"])
@require_login
def update_profile():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    profile_photo = (payload.get("profile_photo") or "").strip() or None
    if not 2 <= len(username) <= 40:
        return jsonify({"result": "error", "message": "Username must be 2 to 40 characters."}), 400
    if not re.fullmatch(r"[\w .'-]+", username, flags=re.UNICODE):
        return jsonify({"result": "error", "message": "Username contains unsupported characters."}), 400
    if profile_photo and (not profile_photo.startswith("data:image/") or len(profile_photo) > 1_500_000):
        return jsonify({"result": "error", "message": "Use an image smaller than 1 MB for your profile photo."}), 400
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET username = ?, profile_photo = ? WHERE id = ?",
            (username, profile_photo, session["user_id"]),
        )
    return jsonify({"result": "success", "message": "Profile updated", "user": user_payload(current_user())})


@app.route("/api/account/payment", methods=["POST"])
@require_login
def update_payment():
    payload = request.get_json(silent=True) or {}
    method = (payload.get("method") or "").strip().lower()
    detail = (payload.get("detail") or "").strip()
    if method not in {"card", "mpesa", "paypal", "sendwave"}:
        return jsonify({"result": "error", "message": "Choose a supported payment method."}), 400
    digits = re.sub(r"\D", "", detail)
    if method == "card":
        if not 4 <= len(digits) <= 19:
            return jsonify({"result": "error", "message": "Enter a valid card number."}), 400
        label = f"Card ending in {digits[-4:]}"
    elif method == "mpesa":
        if not 7 <= len(digits) <= 15:
            return jsonify({"result": "error", "message": "Enter a valid M-Pesa phone number."}), 400
        label = f"M-Pesa ending in {digits[-4:]}"
    else:
        label = method.title()
    with get_db() as conn:
        conn.execute("UPDATE users SET payment_method = ?, payment_label = ? WHERE id = ?", (method, label, session["user_id"]))
    return jsonify({"result": "success", "message": "Payment preference saved", "user": user_payload(current_user())})


@app.route("/api/support", methods=["POST"])
def contact_support():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()
    email = str(payload.get("email") or "").strip().lower()
    feedback = str(payload.get("feedback") or "").strip()
    if not 2 <= len(name) <= 80:
        return jsonify({"result": "error", "message": "Enter your name."}), 400
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        return jsonify({"result": "error", "message": "Enter a valid email address."}), 400
    if not 10 <= len(feedback) <= 3000:
        return jsonify({"result": "error", "message": "Feedback must be between 10 and 3,000 characters."}), 400
    if not send_support_feedback(name, email, feedback):
        return jsonify({"result": "error", "message": "Support email is unavailable right now. Please email kchoppa182@gmail.com directly."}), 503
    return jsonify({"result": "success", "message": "Thank you — your feedback has been sent to MISTIZEN support."})


@app.route("/api/rates")
def rates():
    now = time.time()
    if now >= _rate_cache["expires_at"]:
        # A keyed plan can provide the provider's latest/intraday feed. The
        # open endpoint remains a no-configuration fallback for development.
        endpoint = (
            f"https://v6.exchangerate-api.com/v6/{EXCHANGE_RATE_API_KEY}/latest/KES"
            if EXCHANGE_RATE_API_KEY
            else "https://open.er-api.com/v6/latest/KES"
        )
        try:
            with urllib.request.urlopen(endpoint, timeout=5) as response:
                payload = json.loads(response.read().decode("utf-8"))
            provider_rates = payload.get("conversion_rates") or payload.get("rates") or {}
            live_rates = {currency: float(provider_rates[currency]) for currency in FALLBACK_CURRENCY_RATES if currency in provider_rates}
            if len(live_rates) != len(FALLBACK_CURRENCY_RATES):
                raise ValueError("Exchange-rate response did not include every supported currency")
            _rate_cache.update({
                "expires_at": now + RATE_CACHE_TTL_SECONDS,
                "rates": live_rates,
                "updated_at": payload.get("time_last_update_utc") or payload.get("date"),
                "live": True,
            })
        except (OSError, ValueError, json.JSONDecodeError):
            # Keep checkout usable during an outage; retry the provider soon.
            _rate_cache.update({"expires_at": now + 60, "rates": FALLBACK_CURRENCY_RATES, "updated_at": None, "live": False})
    return jsonify({
        "result": "success",
        "rates": _rate_cache["rates"],
        "live": _rate_cache["live"],
        "updated_at": _rate_cache["updated_at"],
    })


@app.route("/api/orders", methods=["POST"])
@require_login
def create_order():
    payload = request.get_json(silent=True) or {}
    items = payload.get("items") or []
    total_kes = float(payload.get("total_kes", 0) or 0)
    payment_method = (payload.get("payment_method") or "unknown").strip()
    delivery_method = (payload.get("delivery_method") or "").strip().lower()
    delivery_address = payload.get("delivery_address") or {}

    if not items:
        return jsonify({"result": "error", "message": "Cart is empty"}), 400
    if delivery_method not in DELIVERY_FEES:
        return jsonify({"result": "error", "message": "Choose a valid delivery option"}), 400
    if not isinstance(delivery_address, dict):
        return jsonify({"result": "error", "message": "Enter your delivery address"}), 400
    phone = re.sub(r"[\s().-]", "", str(delivery_address.get("phone") or ""))
    matching_code = next((code for code in PHONE_RULES if phone.startswith(code)), None)
    national_number = phone[len(matching_code):] if matching_code else ""
    if not matching_code or not re.fullmatch(PHONE_RULES[matching_code], national_number):
        return jsonify({"result": "error", "message": "Enter a valid phone number for the selected country code"}), 400
    required_address_fields = ("house_number", "address_1", "zip_code")
    if any(not str(delivery_address.get(field) or "").strip() for field in required_address_fields):
        return jsonify({"result": "error", "message": "Complete your delivery address"}), 400
    delivery_address = json.dumps(delivery_address)
    delivery_fee = DELIVERY_FEES[delivery_method]

    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO orders (user_id, payload, total_kes, payment_method, delivery_method, delivery_address, delivery_fee_kes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (session["user_id"], json.dumps(items), total_kes + delivery_fee, payment_method, delivery_method, delivery_address, delivery_fee),
        )
        order_id = cursor.lastrowid

    email_sent = send_order_confirmation(session["email"], order_id, items, total_kes, delivery_fee, delivery_method, delivery_address)

    return jsonify({
        "result": "success",
        "message": "Order received",
        "order_id": order_id,
        "payment_method": payment_method,
        "subtotal_kes": total_kes,
        "delivery_fee_kes": delivery_fee,
        "total_kes": total_kes + delivery_fee,
        "delivery_method": delivery_method,
        "email_sent": email_sent,
    })


@app.route("/api/orders")
@require_login
def list_orders():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, payload, total_kes, payment_method, delivery_method, delivery_address, delivery_fee_kes, status, fulfillment_note, tracking_reference, status_updated_at, created_at FROM orders WHERE user_id = ? ORDER BY id DESC",
            (session["user_id"],),
        ).fetchall()

    orders = [
        {
            "id": row["id"],
            "payload": row["payload"],
            "total_kes": row["total_kes"],
            "payment_method": row["payment_method"],
            "delivery_method": row["delivery_method"],
            "delivery_address": row["delivery_address"],
            "delivery_fee_kes": row["delivery_fee_kes"],
            "status": row["status"],
            "fulfillment_note": row["fulfillment_note"],
            "tracking_reference": row["tracking_reference"],
            "status_updated_at": row["status_updated_at"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]
    return jsonify({"result": "success", "orders": orders})


@app.route("/api/admin/orders")
@require_admin
def admin_orders():
    with get_db() as conn:
        rows = conn.execute(
            """SELECT orders.id, orders.payload, orders.total_kes, orders.payment_method,
                      orders.delivery_method, orders.delivery_address, orders.delivery_fee_kes, orders.status, orders.fulfillment_note, orders.tracking_reference, orders.status_updated_at, orders.created_at,
                      users.email, users.username
               FROM orders JOIN users ON users.id = orders.user_id ORDER BY orders.id DESC"""
        ).fetchall()
    return jsonify({"result": "success", "orders": [dict(row) for row in rows]})


@app.route("/api/admin/orders/<int:order_id>/status", methods=["POST"])
@require_admin
def update_order_status(order_id: int):
    payload = request.get_json(silent=True) or {}
    status = (payload.get("status") or "").strip().lower()
    fulfillment_note = (payload.get("fulfillment_note") or "").strip()
    tracking_reference = (payload.get("tracking_reference") or "").strip()
    if status not in {"new", "processing", "out_for_delivery", "delivered", "cancelled"}:
        return jsonify({"result": "error", "message": "Invalid order status"}), 400
    if len(fulfillment_note) > 500 or len(tracking_reference) > 120:
        return jsonify({"result": "error", "message": "Fulfillment details are too long"}), 400
    with get_db() as conn:
        updated = conn.execute(
            "UPDATE orders SET status = ?, fulfillment_note = ?, tracking_reference = ?, status_updated_at = ? WHERE id = ?",
            (status, fulfillment_note or None, tracking_reference or None, datetime.now(timezone.utc).isoformat(), order_id),
        ).rowcount
    if not updated:
        return jsonify({"result": "error", "message": "Order not found"}), 404
    return jsonify({"result": "success", "message": "Order status updated"})


@app.route("/api/auth/google")
def google_auth():
    config = get_google_oauth_config()
    if not config["client_id"] or not config["client_secret"]:
        return redirect("/auth.html?auth_error=google_not_configured")

    state = token_hex(16)
    session["oauth_state"] = state
    params = {
        "client_id": config["client_id"],
        "redirect_uri": config["redirect_uri"],
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    return redirect(auth_url)


@app.route("/api/auth/google/callback")
def google_callback():
    error = request.args.get("error")
    if error:
        return redirect("/auth.html?auth_error=" + urllib.parse.quote(error))

    code = request.args.get("code")
    state = request.args.get("state")
    expected_state = session.pop("oauth_state", None)
    if not expected_state or not state or state != expected_state:
        return redirect("/auth.html?auth_error=invalid_state")
    if not code:
        return redirect("/auth.html?auth_error=missing_code")

    config = get_google_oauth_config()
    if not config["client_id"] or not config["client_secret"]:
        return redirect("/auth.html?auth_error=google_not_configured")

    token_data = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "redirect_uri": config["redirect_uri"],
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")

    token_req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=token_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(token_req, timeout=10) as response:
            token_payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return redirect("/auth.html?auth_error=token_exchange_failed")

    access_token = token_payload.get("access_token")
    if not access_token:
        return redirect("/auth.html?auth_error=token_exchange_failed")

    userinfo_req = urllib.request.Request(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": "Bearer " + access_token},
        method="GET",
    )
    try:
        with urllib.request.urlopen(userinfo_req, timeout=10) as response:
            userinfo = json.loads(response.read().decode("utf-8"))
    except Exception:
        return redirect("/auth.html?auth_error=userinfo_failed")

    email = (userinfo.get("email") or "").strip().lower()
    if not email or userinfo.get("email_verified") is not True:
        return redirect("/auth.html?auth_error=email_missing")

    user_id = create_or_get_user(email, provider="google")
    session.clear()
    session.permanent = True
    session["user_id"] = user_id
    session["email"] = email
    session["auth_provider"] = "google"

    return redirect("/PRODUCTS.html?auth=google")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=os.environ.get("MISTIZEN_DEBUG") == "1")
