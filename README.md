# Technica POS — Portal (UI prototype)

Sales portal for the restaurant & hotel POS: login, overview dashboard, customers (with per-customer orders, contacts, devices & licenses, notes), sale orders (create / confirm / deliver / invoice / cancel) and contacts.

Plain HTML + CSS + JavaScript. No build step, no backend, no database yet — data is mock data saved in the browser's `localStorage`.

**Demo login:** `admin` / `admin123` (or use “Create Account” — also stored locally).

## Licensing, payment & customer access

1. When you create a sale order, choose the **license model**:
   - **Subscription**, billed **Yearly** or **Monthly** (monthly costs 15% more than yearly)
   - **Perpetual**, a one-time payment (3× the yearly price) with no expiry
2. Order flow: Draft → Confirmed → Delivered → Invoiced → **Paid**.
   Click **Record payment** to enter the date, method and reference. You can still change the license model there.
3. Recording the payment activates the customer's POS access and opens the **access link** panel. From there you can copy the link, open it, send it by WhatsApp or email, create a new link (the old one stops working), or revoke access.
   You can open the panel again at any time from the customer page (**Access link**).
4. The link opens `client.html`, a separate POS for that business: a menu for its type (restaurant, café, bar, bakery or hotel), an order ticket, table or room number, cash/card/room-charge payment, a receipt, and "Sales today". It has no link back to the portal.
   - When a subscription expires, the register locks.
   - Revoking access or creating a new link locks the old link (for now this only works in the same browser; see below).

> For now the link carries the business and license info inside the URL (`#…`), so it works on any device without a database. With a backend, the link should carry only the random token, and `client.html` should check it with the server. That also makes revoking access work everywhere.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Put it on GitHub Pages

1. Create a new repo on GitHub (e.g. `pos-portal`).
2. Push these files to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "POS portal UI"
   git branch -M main
   git remote add origin https://github.com/<your-username>/pos-portal.git
   git push -u origin main
   ```
3. Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
4. After a minute it's live at `https://<your-username>.github.io/pos-portal/`.

## Structure

```
index.html        entry page
css/styles.css    glass theme
js/icons.js       inline SVG icons
js/data.js        mock data + Store (the only data layer)
js/app.js         portal: router, views, auth (UI only)
client.html       customer POS (opened from the access link)
js/client.js      customer POS logic + menus per business type
css/client.css    customer POS styles
assets/bg.svg     background
```

## Adding the database later

All screens read and write through the `Store` object in `js/data.js`
(`customers()`, `addCustomer()`, `orders()`, `addOrder()`, `updateOrder()`, `contacts()`, …).
Swap those functions for API calls (e.g. Supabase, Firebase, or your own API) and the UI keeps working.
Replace `Auth` in `js/app.js` with real authentication at the same time — the current login is for demo only and is **not** secure.

User menu → **Reset demo data** restores the sample data.
