"""MISTIZEN server. Run locally with: python app.py"""
import json
import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from base64 import b64decode, b64encode
from pathlib import Path
from urllib.request import urlopen

try:
    from flask import Flask, jsonify, request, send_from_directory, session  # type: ignore[import]
except ImportError as exc:
    raise RuntimeError(
        "Flask is required to run this application. Install it with "
        "'python -m pip install flask' and rerun."
    ) from exc

ROOT = Path(__file__).resolve().parent

def generate_password_hash(password):
    password_bytes = password.encode("utf-8")
    salt = secrets.token_bytes(16)
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password_bytes, salt, 310000)
    return b64encode(salt + hash_bytes).decode("ascii")


def check_password_hash(password_hash, password):
    try:
        decoded = b64decode(password_hash.encode("ascii"))
        salt, hash_bytes = decoded[:16], decoded[16:]
        test_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310000)
        return hmac.compare_digest(test_hash, hash_bytes)
    except (TypeError, ValueError):
        return False

DATABASE = ROOT / "mistizen.db"
PAGES = {"Frontend.html", "PRODUCTS.html", "cart.html", "auth.html", "checkout.html"}
ASSETS = {"Frontend.css", "script.js", "162113.jpg"}
BASE_PRICE_KES = 1200

app = Flask(__name__)
# Set MISTIZEN_SECRET_KEY in production; a temporary key is only for local development.
app.config.update(
    SECRET_KEY=os.environ.get("MISTIZEN_SECRET_KEY", secrets.token_urlsafe(32)),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("MISTIZEN_HTTPS") == "1",
)


def get_csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(24)
    return session["csrf_token"]


@app.before_request
def protect_csrf():
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.path.startswith("/api/"):
        token = request.headers.get("X-CSRF-Token")
        if token != session.get("csrf_token"):
            return api_error("Invalid CSRF token.", 403)


@app.get("/api/csrf-token")
def csrf_token():
    return jsonify(csrf_token=get_csrf_token())


def db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def initialise_database():
    with db() as connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS carts (
                id TEXT PRIMARY KEY, user_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS cart_items (
                id INTEGER PRIMARY KEY, cart_id TEXT NOT NULL, name TEXT NOT NULL,
                price_kes INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0)
            );
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY, cart_id TEXT NOT NULL, payment_method TEXT NOT NULL,
                amount_kes INTEGER NOT NULL, status TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        """)


def current_cart_id():
    cart_id = session.get("cart_id")
    if not cart_id:
        cart_id = secrets.token_urlsafe(24)
        session["cart_id"] = cart_id
        with db() as connection:
            connection.execute("INSERT INTO carts (id, user_id) VALUES (?, ?)", (cart_id, session.get("user_id")))
    return cart_id


def cart_items(cart_id):
    with db() as connection:
        return [dict(row) for row in connection.execute(
            "SELECT id, name, price_kes AS price, quantity FROM cart_items WHERE cart_id = ? ORDER BY id", (cart_id,)
        )]


def api_error(message, status=400):
    return jsonify(error=message), status


@app.get("/")
def home():
    return send_from_directory(ROOT, "Frontend.html")


@app.get("/<page>")
def page(page):
    if page in PAGES:
        return send_from_directory(ROOT, page)
    if page in ASSETS:
        return send_from_directory(ROOT, page)
    return "Not found", 404


@app.post("/api/auth/<action>")
def auth(action):
    if action not in {"signup", "login"}:
        return api_error("Unknown account action", 404)
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    if "@" not in email or len(password) < 6:
        return api_error("Enter a valid email and a password of at least 6 characters.")
    with db() as connection:
        user = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if action == "signup":
            if user:
                return api_error("An account already exists for this email.", 409)
            cursor = connection.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)", (email, generate_password_hash(password)))
            user_id = cursor.lastrowid
        else:
            if not user or not check_password_hash(user["password_hash"], password):
                return api_error("Email or password is incorrect.", 401)
            user_id = user["id"]
    session["user_id"] = user_id
    return jsonify(ok=True, email=email)


@app.route("/api/cart", methods=["GET", "POST", "DELETE"])
def cart():
    cart_id = current_cart_id()
    if request.method == "GET":
        return jsonify(items=cart_items(cart_id))
    if request.method == "DELETE":
        with db() as connection:
            connection.execute("DELETE FROM cart_items WHERE cart_id = ?", (cart_id,))
        return jsonify(ok=True)
    body = request.get_json(silent=True) or {}
    name = str(body.get("name", "Untitled product")).strip()[:80] or "Untitled product"
    quantity = body.get("quantity", 1)
    if not isinstance(quantity, int) or not 1 <= quantity <= 12:
        return api_error("Quantity must be between 1 and 12.")
    with db() as connection:
        item = connection.execute("SELECT id, quantity FROM cart_items WHERE cart_id = ? AND name = ? AND price_kes = ?", (cart_id, name, BASE_PRICE_KES)).fetchone()
        if item:
            connection.execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (min(12, item["quantity"] + quantity), item["id"]))
        else:
            connection.execute("INSERT INTO cart_items (cart_id, name, price_kes, quantity) VALUES (?, ?, ?, ?)", (cart_id, name, BASE_PRICE_KES, quantity))
    return jsonify(items=cart_items(cart_id)), 201


@app.delete("/api/cart/<int:item_id>")
def remove_cart_item(item_id):
    with db() as connection:
        connection.execute("DELETE FROM cart_items WHERE id = ? AND cart_id = ?", (item_id, current_cart_id()))
    return jsonify(ok=True)


@app.post("/api/orders")
def create_order():
    body = request.get_json(silent=True) or {}
    method = body.get("method")
    if method not in {"mpesa", "card", "paypal", "sendwave"}:
        return api_error("Choose a valid payment method.")
    cart_id = current_cart_id()
    items = cart_items(cart_id)
    if not items:
        return api_error("Your cart is empty.")
    amount = sum(item["price"] * item["quantity"] for item in items)
    order_id = secrets.token_urlsafe(12)
    with db() as connection:
        connection.execute(
            "INSERT INTO orders (id, cart_id, payment_method, amount_kes, status) VALUES (?, ?, ?, ?, ?)",
            (order_id, cart_id, method, amount, "awaiting_payment_provider"),
        )
    # Connect M-Pesa/PayPal/Sendwave/card provider SDKs here using server environment variables.
    return jsonify(ok=True, order_id=order_id, status="awaiting_payment_provider")


_rates_cache = {"time": 0, "rates": None}


@app.get("/api/rates")
def rates():
    if _rates_cache["rates"] and time.time() - _rates_cache["time"] < 3600:
        return jsonify(result="success", rates=_rates_cache["rates"])
    try:
        with urlopen("https://open.er-api.com/v6/latest/KES", timeout=8) as response:
            data = json.load(response)
        if data.get("result") != "success":
            raise ValueError("Rate provider response was not successful")
        _rates_cache.update(time=time.time(), rates=data["rates"])
        return jsonify(result="success", rates=data["rates"])
    except Exception:
        return api_error("Live exchange rates are temporarily unavailable.", 503)


if __name__ == "__main__":
    initialise_database()
    app.run(host="127.0.0.1", port=5000, debug=False)
