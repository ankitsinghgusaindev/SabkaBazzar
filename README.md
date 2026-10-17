# LocalShop

Hyperlocal marketplace: shopkeepers run online shops from their phones, customers find nearby shops with live prices and order pickup or delivery.

## Layout
- backend/  FastAPI + SQLAlchemy (PostgreSQL). Start here: app/main.py, app/models.py
- frontend/src/  React + TypeScript (Vite). Customer and shopkeeper screens.

## Run
1. Start PostgreSQL and create a database `localshop` (user and password `localshop`), or set DATABASE_URL.
2. Backend: see backend/README.md
3. Frontend:
       npm create vite@latest localshop-web -- --template react-ts
       cd localshop-web && npm install react-router-dom
       Replace src/ with ./frontend/src and run npm run dev

## Business rules implemented
- Shops: open/close, delivery radius, invite code, members-only mode
- Inventory: categories, discounts, stock audit log (InventoryLog), low-stock alerts, restock and corrections
- Customers: live location (foreground only), nearby shops by distance, member joining
- Binding: a shopkeeper can bind a member as exclusive; that customer cannot order from any other shop
- Orders: stock locked during checkout (no overselling), price snapshot, idempotency key against duplicate orders, cancel restores stock, strict status state machine
- Ratings: shop, delivery, and per-product stars, only after a completed order, one review per order
- Dashboard: revenue today / 7 days / total, cancel rate, customers, ratings
- Admin: /admin/overview (users by role, shops, GMV, orders by status, 30-day revenue, top shops)

## Not yet built (next steps)
- Admin console UI, payments (UPI/Razorpay), delivery partner or shopkeeper-run delivery dispatch, push notifications, WebSocket live order updates, Alembic migrations, tests, PostGIS for geo queries at scale.
