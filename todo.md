# MISTIZEN — Implementation & Feature Checklist

## Section A — Account & Google Login (COMPLETE)
- [x] Allow customers to log in / sign up with email + password
- [x] Enforce password minimum of 8 characters (backend `strong_password()` now requires 8+)
- [x] Save user details so they can log back in (SQLite/PostgreSQL users table)
- [x] Enable Google login callback (accepts both `GOOGLE_REDIRECT_URI` and `GOOGLE_REDIRECT_URL` env keys)
- [x] Auth page (`auth.html`) updated to reflect 8-character password hint

## Section B — Core Commerce Features
### Database (COMPLETE)
- [x] DB abstraction: SQLite locally, PostgreSQL via `DATABASE_URL` in production
- [x] `get_db()`, `init_db()`, placeholder helpers, SQLite + PostgreSQL schema
- [x] Users + orders tables

### Notifications (COMPLETE)
- [x] Email order confirmation (SMTP)
- [x] Payment confirmation notification (email + SMS + WhatsApp-able)
- [x] Shipping notification (on status → processing / out_for_delivery)
- [x] Delivery notification (on status → delivered)
- [x] WhatsApp support deep links (`BUSINESS_WHATSAPP`)
- [x] SMS via Africa's Talking (`AT_API_KEY` / `AT_USERNAME`)
- [x] `send_status_notifications()` helper wired into `create_order` and `update_order_status`

### WhatsApp & Business Alerts (COMPLETE)
- [x] Send new-order business alert to owner (WhatsApp/SMS/email) — `send_business_order_alert` wired into order creation
- [x] "Contact support on WhatsApp" deep link available when `BUSINESS_WHATSAPP` set

### Admin Marketing Tools (IN PROGRESS / NEXT)
- [ ] Flash sales
- [ ] Coupon codes
- [ ] Bundle discounts
- [ ] Free delivery thresholds

### Customer Account Features (IN PROGRESS)
- [x] Create accounts
- [x] Login
- [ ] View orders (backend `/api/orders` exists; frontend account page to render)
- [ ] Track orders
- [x] Save addresses (delivery address stored on order; saved-address book to add)
- [ ] Save products (wishlist exists client-side in catalog.js)
- [x] Manage profile (account.html)

### Analytics Dashboard (COMPLETE)
- [x] Today's sales
- [x] This week's revenue
- [x] Monthly revenue
- [x] Total orders
- [x] Average order value
- [x] Best-selling products
- [x] Low-stock products
- [x] New customers

## Section C — Payments & Security
- [x] Security review baseline (rate limiting, origin checks, security headers, hashed passwords)
- [ ] MPESA STK Push (deferred — needs live Daraja credentials + consumer key/secret)
  - [ ] `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_SHORTCODE`
  - [ ] `/api/mpesa/stk` endpoint, callback, status update
- [ ] Real payment provider config (card/PayPal/Sendwave) — currently demo orders

## Env keys to add (in `.env`)
```
MISTIZEN_BUSINESS_WHATSAPP=           # e.g. 254712345678
AT_API_KEY=                            # Africa's Talking (SMS)
AT_USERNAME=sandbox
DATABASE_URL=                          # PostgreSQL (production only)
MISTIZEN_ADMIN_EMAILS=                 # e.g. you@gmail.com,admin@mistizen.ke
