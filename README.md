# Technica POS — Portal (UI prototype)

Sales portal for the restaurant & hotel POS: login, overview dashboard, customers (with per-customer orders, contacts, devices & licenses, notes), sale orders (create / confirm / deliver / invoice / cancel) and contacts.

Plain HTML + CSS + JavaScript. No build step, no backend, no database yet — data is mock data saved in the browser's `localStorage`.

**Demo login:** `admin` / `admin123` (or use “Create Account” — also stored locally).

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
js/app.js         router, views, auth (UI only)
assets/bg.svg     background
```

## Adding the database later

All screens read and write through the `Store` object in `js/data.js`
(`customers()`, `addCustomer()`, `orders()`, `addOrder()`, `updateOrder()`, `contacts()`, …).
Swap those functions for API calls (e.g. Supabase, Firebase, or your own API) and the UI keeps working.
Replace `Auth` in `js/app.js` with real authentication at the same time — the current login is for demo only and is **not** secure.

User menu → **Reset demo data** restores the sample data.
