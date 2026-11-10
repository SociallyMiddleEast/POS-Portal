// ------------------------------------------------------------------
// Customer POS — opened from the private access link the sales portal generates.
// Completely separate from the portal: no navigation back, no portal data shown.
//
// Today the link's #hash carries the business + license info (base64 JSON) so the
// page works on any device without a database. With a backend, the link would carry
// only the token and this page would fetch the business, menu and license from the API.
// ------------------------------------------------------------------

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n).toFixed(2);
const VAT = 0.11;
const LBP_RATE = 89500;
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const initials = n => n.split(/\s+/).filter(w => /[A-Za-z]/.test(w[0])).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${icon('check', 16)}<span>${esc(msg)}</span>`;
  $('#toast-root').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2000);
}
function modal(html, onMount, cls = '') {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back"><div class="modal glass ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
  const back = $('.modal-back', root);
  const close = () => { root.innerHTML = ''; };
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  $$('[data-close]', root).forEach(b => b.addEventListener('click', close));
  onMount && onMount($('.modal', root), close);
}

// ---------- read the access link ----------
function decodeLink() {
  const h = location.hash.slice(1);
  if (!h) return null;
  try {
    const json = decodeURIComponent(escape(atob(h.replace(/-/g, '+').replace(/_/g, '/'))));
    const p = JSON.parse(json);
    return p && p.v === 1 && p.k && p.i && p.n ? p : null;
  } catch (e) { return null; }
}

// Returns null if access is OK, or a reason the POS is locked.
function lockReason(p) {
  if (!p) return { title: 'Invalid link', text: 'This access link is incomplete or damaged. Ask your provider for a new link.' };
  // Same browser as the sales portal (demo): honour revoke / new link / suspension.
  const portal = store.get('pos-portal-data-v3', null);
  const c = portal && portal.customers && portal.customers.find(x => x.id === p.i);
  if (c) {
    if (!c.access || c.access.token !== p.k) return { title: 'Link replaced', text: 'This link is no longer valid. A newer link was issued. Ask your provider for it.' };
    if (c.access.revoked) return { title: 'Access revoked', text: 'Access to this POS has been turned off. Contact your provider.' };
    if (c.status === 'Suspended') return { title: 'Account suspended', text: 'This account is suspended. Contact your provider to restore service.' };
    // pick up renewals made in the portal after the link was sent
    Object.assign(p, { m: c.access.model, b: c.access.billing, s: c.access.start, e: c.access.end });
  }
  if (p.m === 'Subscription' && p.e && p.e < today()) return { title: 'Subscription expired', text: `Your ${String(p.b || '').toLowerCase()} subscription ended on ${fmtDate(p.e)}. Renew it with your provider to unlock the register.` };
  return null;
}

// ---------- menus per business type ----------
const MENUS = {
  Restaurant: {
    cats: ['Mezze', 'Grill', 'Mains', 'Drinks', 'Desserts'],
    items: [
      ['Hummus', 6, 'Mezze', '🫘'], ['Moutabal', 6, 'Mezze', '🍆'], ['Tabbouleh', 7, 'Mezze', '🥗'], ['Fattoush', 7, 'Mezze', '🥬'], ['Warak Enab', 8, 'Mezze', '🍃'], ['Kibbeh (4 pcs)', 9, 'Mezze', '🧆'], ['Batata Harra', 6, 'Mezze', '🥔'],
      ['Shish Taouk', 14, 'Grill', '🍢'], ['Kafta', 13, 'Grill', '🥩'], ['Lamb Chops', 22, 'Grill', '🍖'], ['Mixed Grill', 24, 'Grill', '🔥'], ['Grilled Halloumi', 9, 'Grill', '🧀'],
      ['Sayadieh', 18, 'Mains', '🐟'], ['Freekeh & Chicken', 15, 'Mains', '🍗'], ['Mloukhieh', 14, 'Mains', '🍲'],
      ['Lemonade & Mint', 4, 'Drinks', '🍋'], ['Jallab', 4, 'Drinks', '🍇'], ['Ayran', 3, 'Drinks', '🥛'], ['Almaza', 5, 'Drinks', '🍺'], ['Arak (glass)', 7, 'Drinks', '🥃'], ['Water', 1.5, 'Drinks', '💧'],
      ['Knefeh', 6, 'Desserts', '🍰'], ['Mouhalabieh', 5, 'Desserts', '🍮'], ['Fruit Plate', 8, 'Desserts', '🍉']
    ],
    types: ['Dine-in', 'Takeaway', 'Delivery']
  },
  Café: {
    cats: ['Coffee', 'Tea', 'Cold', 'Pastries', 'Sandwiches'],
    items: [
      ['Espresso', 3, 'Coffee', '☕'], ['Double Espresso', 4, 'Coffee', '☕'], ['Cappuccino', 4.5, 'Coffee', '☕'], ['Latte', 5, 'Coffee', '🥛'], ['Flat White', 5, 'Coffee', '☕'], ['Turkish Coffee', 3, 'Coffee', '🫖'],
      ['Black Tea', 2.5, 'Tea', '🍵'], ['Mint Tea', 3, 'Tea', '🌿'], ['Matcha Latte', 5.5, 'Tea', '🍵'],
      ['Iced Latte', 5.5, 'Cold', '🧊'], ['Fresh Orange', 4.5, 'Cold', '🍊'], ['Smoothie', 6, 'Cold', '🍓'],
      ['Croissant', 3, 'Pastries', '🥐'], ['Pain au Chocolat', 3.5, 'Pastries', '🥐'], ['Banana Bread', 4, 'Pastries', '🍌'], ['Cookie', 2.5, 'Pastries', '🍪'],
      ['Halloumi Sandwich', 7, 'Sandwiches', '🥪'], ['Turkey & Cheese', 8, 'Sandwiches', '🥪'], ['Labneh Wrap', 6, 'Sandwiches', '🌯']
    ],
    types: ['Dine-in', 'Takeaway']
  },
  Bar: {
    cats: ['Cocktails', 'Beer', 'Wine', 'Spirits', 'Bites'],
    items: [
      ['Mojito', 11, 'Cocktails', '🍹'], ['Negroni', 12, 'Cocktails', '🍸'], ['Margarita', 11, 'Cocktails', '🍸'], ['Arak Sour', 10, 'Cocktails', '🍋'], ['Espresso Martini', 12, 'Cocktails', '🍸'],
      ['Almaza', 5, 'Beer', '🍺'], ['Beirut Beer', 5, 'Beer', '🍺'], ['Craft IPA', 7, 'Beer', '🍻'],
      ['Ksara Red (glass)', 8, 'Wine', '🍷'], ['Kefraya White (glass)', 8, 'Wine', '🥂'], ['Rosé (glass)', 8, 'Wine', '🍷'],
      ['Whisky', 10, 'Spirits', '🥃'], ['Vodka', 9, 'Spirits', '🥃'], ['Gin & Tonic', 10, 'Spirits', '🍸'],
      ['Fries', 5, 'Bites', '🍟'], ['Sliders', 12, 'Bites', '🍔'], ['Nachos', 9, 'Bites', '🌮'], ['Nuts', 4, 'Bites', '🥜']
    ],
    types: ['Table', 'Bar tab']
  },
  Bakery: {
    cats: ['Manakish', 'Fatayer', 'Sweets', 'Drinks'],
    items: [
      ['Zaatar', 2, 'Manakish', '🫓'], ['Cheese', 3, 'Manakish', '🧀'], ['Half & Half', 2.5, 'Manakish', '🫓'], ['Lahm Bi Ajeen', 3.5, 'Manakish', '🥙'], ['Kishk', 3, 'Manakish', '🫓'], ['Cheese & Turkey', 4, 'Manakish', '🥪'],
      ['Spinach Fatayer', 1.5, 'Fatayer', '🥟'], ['Cheese Rkakat', 1.5, 'Fatayer', '🥟'], ['Sfiha', 1.5, 'Fatayer', '🥟'],
      ['Maamoul', 1.5, 'Sweets', '🍪'], ['Baklava (box)', 12, 'Sweets', '🍯'], ['Sfouf', 1.5, 'Sweets', '🍰'],
      ['Ayran', 1.5, 'Drinks', '🥛'], ['Tea', 1, 'Drinks', '🍵'], ['Soft Drink', 1.5, 'Drinks', '🥤']
    ],
    types: ['Takeaway', 'Dine-in', 'Delivery']
  },
  Hotel: {
    cats: ['Breakfast', 'All-day', 'Room service', 'Bar', 'Spa & extras'],
    items: [
      ['Continental Breakfast', 18, 'Breakfast', '🥐'], ['Lebanese Breakfast', 20, 'Breakfast', '🫓'], ['Eggs Your Way', 9, 'Breakfast', '🍳'], ['Pancakes', 10, 'Breakfast', '🥞'],
      ['Caesar Salad', 12, 'All-day', '🥗'], ['Club Sandwich', 14, 'All-day', '🥪'], ['Beef Burger', 16, 'All-day', '🍔'], ['Grilled Salmon', 26, 'All-day', '🐟'], ['Pasta Arrabbiata', 15, 'All-day', '🍝'],
      ['Room Service Mezze', 22, 'Room service', '🫘'], ['Late-night Pizza', 18, 'Room service', '🍕'], ['Fruit Basket', 15, 'Room service', '🍉'],
      ['Ksara Red (bottle)', 38, 'Bar', '🍷'], ['Cocktail', 13, 'Bar', '🍹'], ['Espresso', 4, 'Bar', '☕'], ['Water', 3, 'Bar', '💧'],
      ['Massage (60 min)', 80, 'Spa & extras', '💆'], ['Laundry', 15, 'Spa & extras', '👔'], ['Airport Transfer', 45, 'Spa & extras', '🚗']
    ],
    types: ['Restaurant', 'Room service', 'Pool bar']
  }
};

// ---------- app ----------
const P = decodeLink();
const lock = lockReason(P);
const root = $('#pos');
const needsTable = t => ['Dine-in', 'Table', 'Restaurant', 'Pool bar'].includes(t);
const needsRoom = t => t === 'Room service';


function renderLock(p, r) {
  document.title = p ? `${p.n} · POS` : 'POS';
  root.innerHTML = `
    <div class="lock-wrap">
      <div class="glass lock-card">
        <div class="lock-icon">${icon('lock', 26)}</div>
        ${p ? `<div class="lock-biz">${esc(p.n)}</div>` : ''}
        <h1>${esc(r.title)}</h1>
        <p>${esc(r.text)}</p>
        <div class="lock-foot">Powered by Socially Middle East</div>
      </div>
    </div>`;
}

// ---------- per-business configuration (menu, tables, settings) ----------
const TABLE_LAYOUTS = {
  Restaurant: [['Indoor', 'T', 10, 4], ['Terrace', 'P', 6, 2]],
  Café: [['Indoor', 'T', 6, 2], ['Outdoor', 'O', 4, 2]],
  Bar: [['Bar counter', 'B', 8, 1], ['Lounge', 'L', 6, 4]],
  Bakery: [['Indoor', 'T', 4, 2]],
  Hotel: [['Restaurant', 'R', 10, 4], ['Pool bar', 'PB', 6, 2]]
};
function seedConfig(p) {
  const menu = MENUS[p.t] || MENUS.Restaurant;
  const cats = menu.cats.map((name, i) => ({ id: 'c' + i, name }));
  const items = menu.items.map(([name, price, cat, e], i) => ({ id: 'i' + i, name, price, cat: cats.find(c => c.name === cat).id, e, active: true }));
  const tables = [];
  (TABLE_LAYOUTS[p.t] || TABLE_LAYOUTS.Restaurant).forEach(([zone, pre, n, seats]) => {
    for (let k = 1; k <= n; k++) tables.push({ id: 'tb' + tables.length, name: pre + k, zone, seats });
  });
  return { v: 1, cats, items, tables, types: menu.types, settings: { name: p.n, vat: 11, lbp: LBP_RATE, pin: '1234', footer: 'Thank you for your visit!' } };
}

// Demo sales history so the admin reports have something to show.
function seedSales(p, cfg, days = 45) {
  let s = 0; for (const ch of p.i + p.n) s = (s * 31 + ch.charCodeAt(0)) % 233280;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // popularity: a few stars, a long tail, one item that never sells
  const weights = cfg.items.map((it, i) => {
    if (i === cfg.items.length - 2) return 0;          // never sold
    const r = rnd();
    return r > 0.82 ? 6 + rnd() * 6 : r > 0.25 ? 1 + rnd() * 3 : 0.08 + rnd() * 0.3;
  });
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pickItem = () => { let x = rnd() * wsum; for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) return cfg.items[i]; } return cfg.items[0]; };
  const HOURS = {
    Café: [[7, 3], [8, 6], [9, 7], [10, 5], [11, 4], [12, 4], [13, 3], [14, 3], [15, 3], [16, 4], [17, 3], [18, 2], [19, 1]],
    Bakery: [[6, 4], [7, 8], [8, 9], [9, 7], [10, 5], [11, 4], [12, 4], [13, 3], [14, 2], [15, 2], [16, 2], [17, 3], [18, 2]],
    Bar: [[17, 2], [18, 4], [19, 5], [20, 7], [21, 9], [22, 10], [23, 8], [0, 5], [1, 2]],
    def: [[11, 1], [12, 4], [13, 7], [14, 6], [15, 3], [16, 1], [17, 1], [18, 2], [19, 5], [20, 8], [21, 7], [22, 4], [23, 1]]
  }[p.t] || [[7, 3], [8, 4], [9, 3], [12, 4], [13, 6], [14, 4], [19, 4], [20, 6], [21, 5], [22, 3]];
  const hsum = HOURS.reduce((a, h) => a + h[1], 0);
  const pickHour = () => { let x = rnd() * hsum; for (const [h, w] of HOURS) { x -= w; if (x <= 0) return h; } return HOURS[0][0]; };
  const base = { Restaurant: 34, Café: 55, Bar: 40, Bakery: 70, Hotel: 38 }[p.t] || 34;
  const vat = cfg.settings.vat / 100;
  const now = new Date();
  const out = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    const wk = day.getDay();
    const n = Math.round(base * (wk === 5 || wk === 6 ? 1.35 : wk === 1 ? 0.8 : 1) * (0.75 + rnd() * 0.5) * (0.85 + (days - d) / days * 0.3));
    for (let k = 0; k < n; k++) {
      const h = pickHour();
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate() + (h < 5 ? 1 : 0), h, Math.floor(rnd() * 60));
      if (at > now) continue;
      const lines = [];
      const nl = 1 + Math.floor(rnd() * rnd() * 5);
      for (let l = 0; l < nl; l++) {
        const it = pickItem();
        const ex = lines.find(x => x.id === it.id);
        ex ? ex.qty++ : lines.push({ id: it.id, name: it.name, cat: it.cat, qty: rnd() > 0.8 ? 2 : 1, price: it.price });
      }
      const type = cfg.types[rnd() < 0.62 ? 0 : 1 + Math.floor(rnd() * (cfg.types.length - 1))] || cfg.types[0];
      const zoneTables = cfg.tables;
      const sub = lines.reduce((a, l) => a + l.price * l.qty, 0);
      const r2 = rnd();
      const method = p.t === 'Hotel' && r2 > 0.85 ? 'Room charge' : r2 > 0.48 ? 'Card' : 'Cash';
      out.push({
        at: at.toISOString(), date: isoDate(at), type,
        table: needsTable(type) && zoneTables.length ? zoneTables[Math.floor(rnd() * zoneTables.length)].name : '',
        room: needsRoom(type) || method === 'Room charge' ? String(100 + Math.floor(rnd() * 5) * 100 + Math.floor(rnd() * 20)) : '',
        lines, sub, vat: sub * vat, total: sub * (1 + vat), count: lines.reduce((a, l) => a + l.qty, 0), method, tender: null, demo: true
      });
    }
  }
  out.sort((a, b) => a.at.localeCompare(b.at));
  out.forEach((o, i) => o.no = i + 1);
  return out;
}
function isoDate(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

function boot(p) {
  const CFG_KEY = `pos-client-${p.i}-cfg`;
  const SALES_KEY = `pos-client-${p.i}-sales-v2`;
  const ADMIN_KEY = `pos-client-${p.i}-admin`;
  let cfg = store.get(CFG_KEY, null);
  if (!cfg) { cfg = seedConfig(p); store.set(CFG_KEY, cfg); }
  let salesCache = store.get(SALES_KEY, null);
  if (!salesCache) { salesCache = seedSales(p, cfg); store.set(SALES_KEY, salesCache); }

  document.title = `${cfg.settings.name || p.n} · POS`;
  const state = { view: 'register', cat: 'All', q: '', type: cfg.types[0], table: '', room: '', cart: [], sheet: false };

  const vatRate = () => (Number(cfg.settings.vat) || 0) / 100;
  const sales = () => salesCache;
  const saveSales = list => { salesCache = list; store.set(SALES_KEY, list); };
  const nextTicket = () => salesCache.reduce((m, s) => Math.max(m, s.no), 0) + 1;
  const activeItems = () => cfg.items.filter(i => i.active !== false);
  const catName = id => (cfg.cats.find(c => c.id === id) || {}).name || 'Uncategorized';
  const cartTotals = () => { const sub = state.cart.reduce((s, l) => s + l.price * l.qty, 0); const vat = sub * vatRate(); return { sub, vat, total: sub + vat, count: state.cart.reduce((s, l) => s + l.qty, 0) }; };
  const isAdmin = () => { try { return sessionStorage.getItem(ADMIN_KEY) === '1'; } catch (e) { return !!window.__admin; } };
  const setAdmin = v => { try { v ? sessionStorage.setItem(ADMIN_KEY, '1') : sessionStorage.removeItem(ADMIN_KEY); } catch (e) {} window.__admin = v; };
  const licText = p.m === 'Perpetual' ? 'Perpetual license' : `${p.b} plan · until ${fmtDate(p.e)}`;
  const daysLeft = p.m === 'Subscription' && p.e ? Math.ceil((new Date(p.e + 'T00:00:00') - new Date()) / 864e5) : null;

  // context shared with the admin module
  const ctx = {
    p, get cfg() { return cfg; },
    saveCfg() { store.set(CFG_KEY, cfg); document.title = `${cfg.settings.name || p.n} · POS`; },
    resetCfg() { cfg = seedConfig(p); store.set(CFG_KEY, cfg); },
    sales, saveSales,
    reseedSales() {
      const real = salesCache.filter(x => !x.demo);
      const all = [...seedSales(p, cfg), ...real].sort((x, y) => x.at.localeCompare(y.at));
      all.forEach((x, i) => x.no = i + 1);
      saveSales(all);
    },
    catName, receipt, rerender: () => frame(), lock: () => { setAdmin(false); state.view = 'register'; frame(); toast('Admin locked'); },
    money, esc, modal, toast, fmtDate, today, icon, needsTable, needsRoom, vatRate
  };

  function frame() {
    if (state.view === 'admin' && !isAdmin()) state.view = 'register';
    root.innerHTML = `
      <header class="pos-top glass">
        <div class="pos-brand"><div class="pos-logo">${esc(initials(cfg.settings.name || p.n))}</div><div><b>${esc(cfg.settings.name || p.n)}</b><span>${esc(p.t)} · ${esc(p.c || '')} · Terminal 1</span></div></div>
        <nav class="pos-tabs">
          <button data-fx data-v="register" class="${state.view === 'register' ? 'active' : ''}">${icon('grid', 16)}<span>Register</span></button>
          <button data-fx data-v="sales" class="${state.view === 'sales' ? 'active' : ''}">${icon('receipt', 16)}<span>Today</span></button>
          <button data-fx data-v="admin" class="${state.view === 'admin' ? 'active' : ''}">${icon(isAdmin() ? 'settings' : 'lock', 16)}<span>Admin</span></button>
        </nav>
        <div class="pos-right">
          <button class="lic-chip ${daysLeft !== null && daysLeft <= 30 ? 'warn' : ''}" id="lic-chip" title="License">${icon('key', 14)}<span>${daysLeft !== null && daysLeft <= 30 ? `Renews in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : licText}</span></button>
          <div class="pos-clock" id="clock"></div>
          <div class="avatar cashier" title="${isAdmin() ? 'Admin' : 'Cashier'}">${isAdmin() ? 'AD' : 'CA'}</div>
        </div>
      </header>
      <main id="pos-main"></main>`;
    $$('.pos-tabs button').forEach(b => b.onclick = () => {
      if (b.dataset.v === 'admin' && !isAdmin()) return askPin(() => { state.view = 'admin'; frame(); });
      state.view = b.dataset.v; frame();
    });
    NavFX.attach($('.pos-tabs'), 'pos');
    $('#lic-chip').onclick = showLicense;
    tick(); clearInterval(window.__clock); window.__clock = setInterval(tick, 15000);
    if (state.view === 'register') register();
    else if (state.view === 'sales') salesView();
    else PosAdmin.render($('#pos-main'), ctx);
  }
  function tick() { const el = $('#clock'); if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }

  function askPin(onOk) {
    let code = '';
    modal(`
      <div class="pin">
        <div class="lock-icon" style="margin-bottom:12px">${icon('lock', 22)}</div>
        <h2>Admin PIN</h2>
        <div class="card-sub">Enter the admin PIN to manage this POS.</div>
        <div class="pin-dots" id="pin-dots">${'<i></i>'.repeat(4)}</div>
        <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map(k => `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>
        <div class="pin-hint">Demo PIN: 1234</div>
      </div>`, (m, close) => {
      const dots = () => $$('#pin-dots i', m).forEach((d, i) => d.classList.toggle('on', i < code.length));
      const press = k => {
        if (k === 'C') code = ''; else if (k === '⌫') code = code.slice(0, -1); else if (code.length < 4) code += k;
        dots();
        if (code.length === 4) {
          if (code === String(cfg.settings.pin)) { setAdmin(true); close(); toast('Admin unlocked'); onOk(); }
          else { const d = $('#pin-dots', m); d.classList.add('shake'); setTimeout(() => { d.classList.remove('shake'); code = ''; dots(); }, 450); }
        }
      };
      $$('.pin-pad button', m).forEach(b => b.onclick = () => press(b.dataset.k));
      const onKey = e => { if (!m.isConnected) return document.removeEventListener('keydown', onKey); if (/^\d$/.test(e.key)) press(e.key); if (e.key === 'Backspace') press('⌫'); if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
      document.addEventListener('keydown', onKey);
    }, 'pin-modal');
  }

  function showLicense() {
    modal(`<h2>License</h2><div class="card-sub">${esc(p.n)}</div>
      <div class="access-box">
        <div class="access-row"><span>Type</span><b>${p.m === 'Perpetual' ? 'Perpetual (owned)' : 'Subscription'}</b></div>
        ${p.m === 'Subscription' ? `<div class="access-row"><span>Billing</span><b>${esc(p.b)}</b></div><div class="access-row"><span>Active since</span><b>${fmtDate(p.s)}</b></div><div class="access-row"><span>Valid until</span><b>${fmtDate(p.e)}</b></div>` : `<div class="access-row"><span>Activated</span><b>${fmtDate(p.s)}</b></div><div class="access-row"><span>Expiry</span><b>None</b></div>`}
        <div class="access-row"><span>Outlets</span><b>${esc(p.o || 1)}</b></div>
      </div>
      <div class="modal-actions"><button class="btn" data-close>Close</button></div>`);
  }

  // ----- register -----
  function register() {
    const cats = cfg.cats.filter(c => activeItems().some(i => i.cat === c.id));
    if (state.cat !== 'All' && !cats.some(c => c.id === state.cat)) state.cat = 'All';
    if (!cfg.types.includes(state.type)) state.type = cfg.types[0];
    $('#pos-main').innerHTML = `
      <div class="pos-grid">
        <section class="pos-menu">
          <div class="pos-tools">
            <label class="search">${icon('search', 15)}<input id="q" placeholder="Search menu…" value="${esc(state.q)}" /></label>
          </div>
          <div class="cat-row" id="cats">${[{ id: 'All', name: 'All' }, ...cats].map(c => `<button data-c="${esc(c.id)}" class="${state.cat === c.id ? 'active' : ''}">${esc(c.name)}</button>`).join('')}</div>
          <div class="item-grid" id="items"></div>
        </section>
        <aside class="ticket glass ${state.sheet ? 'open' : ''}" id="ticket"></aside>
      </div>
      <button class="sheet-bar" id="sheet-bar"></button>`;
    $('#q').oninput = e => { state.q = e.target.value; drawItems(); };
    $$('#cats button').forEach(b => b.onclick = () => { state.cat = b.dataset.c; $$('#cats button').forEach(x => x.classList.toggle('active', x === b)); drawItems(); });
    $('#sheet-bar').onclick = () => { state.sheet = true; $('#ticket').classList.add('open'); };
    drawItems(); drawTicket();
  }

  function drawItems() {
    const q = state.q.toLowerCase();
    const list = activeItems().filter(i => (state.cat === 'All' || i.cat === state.cat) && (!q || i.name.toLowerCase().includes(q)));
    $('#items').innerHTML = list.length ? list.map(i => {
      const inCart = state.cart.find(l => l.id === i.id);
      return `<button class="item glass" data-id="${i.id}">
        ${inCart ? `<span class="item-badge">${inCart.qty}</span>` : ''}
        <span class="item-e">${esc(i.e || '🍽️')}</span><span class="item-n">${esc(i.name)}</span><span class="item-p">${money(i.price)}</span></button>`;
    }).join('') : `<div class="empty" style="grid-column:1/-1">${cfg.items.length ? `Nothing matches “${esc(state.q)}”.` : 'No items yet. Add your menu in Admin → Menu.'}</div>`;
    $$('#items .item').forEach(b => b.onclick = () => {
      add(b.dataset.id);
      b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    });
  }

  function add(id) {
    const it = cfg.items.find(i => i.id === id);
    const l = state.cart.find(x => x.id === id);
    l ? l.qty++ : state.cart.push({ id, name: it.name, cat: it.cat, price: it.price, e: it.e, qty: 1 });
    drawItems(); drawTicket();
  }

  function tableOptions() {
    const zones = [...new Set(cfg.tables.map(t => t.zone))];
    return `<option value="">Select…</option>` + zones.map(z => `<optgroup label="${esc(z)}">${cfg.tables.filter(t => t.zone === z).map(t => `<option ${state.table === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
  }

  function drawTicket() {
    const t = cartTotals();
    const el = $('#ticket');
    el.innerHTML = `
      <div class="ticket-head">
        <div><b>Order #${String(nextTicket()).padStart(4, '0')}</b><span>${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
        <button class="btn btn-sm btn-icon btn-ghost sheet-close" id="sheet-close" aria-label="Close">${icon('x', 18)}</button>
      </div>
      <div class="seg ticket-types" id="otype">${cfg.types.map(x => `<button data-t="${esc(x)}" class="${state.type === x ? 'active' : ''}">${esc(x)}</button>`).join('')}</div>
      ${needsTable(state.type) && cfg.tables.length ? `<div class="ticket-sub"><label>${icon('table', 15)}Table</label><select class="input" id="table">${tableOptions()}</select></div>` : ''}
      ${needsRoom(state.type) ? `<div class="ticket-sub"><label>${icon('bed', 15)}Room</label><input class="input" id="room" placeholder="e.g. 214" value="${esc(state.room)}" /></div>` : ''}
      <div class="ticket-lines">${state.cart.length ? state.cart.map(l => `
        <div class="tl">
          <span class="tl-e">${esc(l.e || '🍽️')}</span>
          <div class="tl-n"><b>${esc(l.name)}</b><span>${money(l.price)}</span></div>
          <div class="stepper"><button data-dec="${l.id}" aria-label="Less">${icon('minus', 14)}</button><b>${l.qty}</b><button data-inc="${l.id}" aria-label="More">${icon('plus', 14)}</button></div>
          <div class="tl-t">${money(l.price * l.qty)}</div>
        </div>`).join('') : `<div class="ticket-empty">${icon('bag', 28)}<span>Tap items to start an order</span></div>`}</div>
      <div class="ticket-foot">
        <div class="summary-row"><span>Subtotal</span><b>${money(t.sub)}</b></div>
        <div class="summary-row"><span>VAT ${cfg.settings.vat}%</span><b>${money(t.vat)}</b></div>
        <div class="summary-total"><span>Total</span><div style="text-align:right"><b>${money(t.total)}</b><small class="lbp">${Math.round(t.total * (cfg.settings.lbp || LBP_RATE)).toLocaleString('en-US')} LBP</small></div></div>
        <div class="ticket-actions">
          <button class="btn" id="clear" ${state.cart.length ? '' : 'disabled'}>Clear</button>
          <button class="btn btn-primary charge" id="charge" ${state.cart.length ? '' : 'disabled'}>Charge ${money(t.total)}</button>
        </div>
      </div>`;
    $$('#otype button', el).forEach(b => b.onclick = () => { state.type = b.dataset.t; drawTicket(); });
    const tb = $('#table', el); if (tb) tb.onchange = () => state.table = tb.value;
    const rm = $('#room', el); if (rm) rm.oninput = () => state.room = rm.value;
    $$('[data-inc]', el).forEach(b => b.onclick = () => { state.cart.find(l => l.id === b.dataset.inc).qty++; drawItems(); drawTicket(); });
    $$('[data-dec]', el).forEach(b => b.onclick = () => { const l = state.cart.find(x => x.id === b.dataset.dec); l.qty--; if (!l.qty) state.cart = state.cart.filter(x => x !== l); drawItems(); drawTicket(); });
    $('#clear', el).onclick = () => { state.cart = []; drawItems(); drawTicket(); };
    $('#charge', el).onclick = pay;
    $('#sheet-close', el).onclick = () => { state.sheet = false; el.classList.remove('open'); };
    const bar = $('#sheet-bar');
    bar.innerHTML = `<span class="sb-count">${t.count}</span><span>View order</span><b>${money(t.total)}</b>`;
    bar.classList.toggle('show', t.count > 0);
  }

  // ----- payment -----
  function pay() {
    if (needsTable(state.type) && cfg.tables.length && !state.table) { toast('Choose a table first'); $('#table')?.focus(); return; }
    if (needsRoom(state.type) && !state.room.trim()) { toast('Enter the room number'); $('#room')?.focus(); return; }
    const t = cartTotals();
    const methods = ['Cash', 'Card', ...(p.t === 'Hotel' ? ['Room charge'] : [])];
    let method = 'Cash';
    modal(`
      <h2>Charge ${money(t.total)}</h2>
      <div class="card-sub">${esc(state.type)}${state.table && needsTable(state.type) ? ' · ' + esc(state.table) : ''}${needsRoom(state.type) ? ' · Room ' + esc(state.room) : ''} · ${t.count} item${t.count === 1 ? '' : 's'}</div>
      <div class="pay-methods" id="pm">${methods.map(m => `<button data-m="${m}" class="${m === method ? 'active' : ''}">${icon(m === 'Cash' ? 'cash' : m === 'Card' ? 'card' : 'bed', 22)}<span>${m}</span></button>`).join('')}</div>
      <div id="pm-body"></div>
      <div class="modal-actions"><button class="btn" data-close>Back</button><button class="btn btn-primary" id="complete">${icon('check', 16)}Complete sale</button></div>
    `, (m, close) => {
      const body = () => {
        $$('#pm button', m).forEach(b => b.classList.toggle('active', b.dataset.m === method));
        if (method === 'Cash') {
          const quick = [...new Set([Math.ceil(t.total), Math.ceil(t.total / 10) * 10, Math.ceil(t.total / 20) * 20, Math.ceil(t.total / 50) * 50, 100])].filter(v => v >= t.total).slice(0, 4);
          $('#pm-body', m).innerHTML = `<div class="field"><label>Cash received (USD)</label><input class="input" id="tender" type="number" step="0.5" min="0" value="${quick[0]}" /></div>
            <div class="quick">${quick.map(v => `<button class="btn btn-sm" data-q="${v}">$${v}</button>`).join('')}</div>
            <div class="change">Change <b id="chg"></b></div>`;
          const upd = () => { const v = Number($('#tender', m).value) || 0; const ch = v - t.total; $('#chg', m).textContent = ch >= 0 ? money(ch) : 'Not enough'; $('#chg', m).style.color = ch >= 0 ? 'var(--green)' : 'var(--red)'; };
          $('#tender', m).oninput = upd;
          $$('[data-q]', m).forEach(b => b.onclick = () => { $('#tender', m).value = b.dataset.q; upd(); });
          upd();
        } else if (method === 'Card') {
          $('#pm-body', m).innerHTML = `<div class="pay-note">${icon('card', 18)}Ask the guest to tap or insert their card on the terminal, then complete the sale.</div>`;
        } else {
          $('#pm-body', m).innerHTML = `<div class="field"><label>Room number</label><input class="input" id="rc-room" value="${esc(state.room)}" placeholder="e.g. 214" /></div>`;
        }
      };
      $$('#pm button', m).forEach(b => b.onclick = () => { method = b.dataset.m; body(); });
      body();
      $('#complete', m).onclick = () => {
        let tender = null;
        if (method === 'Cash') { tender = Number($('#tender', m).value) || 0; if (tender < t.total - 0.001) { toast('Cash received is less than the total'); return; } }
        if (method === 'Room charge') { const r = $('#rc-room', m).value.trim(); if (!r) { toast('Enter the room number'); return; } state.room = r; }
        const now = new Date();
        const sale = {
          no: nextTicket(), at: now.toISOString(), date: today(), type: state.type,
          table: needsTable(state.type) ? state.table : '', room: (needsRoom(state.type) || method === 'Room charge') ? state.room : '',
          lines: state.cart.map(l => ({ id: l.id, name: l.name, cat: l.cat, qty: l.qty, price: l.price })), ...t, method, tender
        };
        saveSales([...salesCache, sale]);
        close();
        state.cart = []; state.table = ''; state.room = ''; state.sheet = false;
        receipt(sale);
        register();
      };
    });
  }

  function receipt(s) {
    modal(`
      <div class="rcpt">
        <div class="rcpt-ok">${icon('check', 26)}</div>
        <h2>${!s.demo && Date.now() - new Date(s.at) < 60000 ? 'Sale complete' : 'Receipt'}</h2>
        <div class="card-sub">Order #${String(s.no).padStart(4, '0')} · ${esc(s.method)}${s.tender != null ? ` · change ${money(s.tender - s.total)}` : ''}</div>
        <div class="paper">
          <b>${esc(cfg.settings.name || p.n)}</b><span>${new Date(s.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          <span>${esc(s.type)}${s.table ? ' · ' + esc(s.table) : ''}${s.room ? ' · Room ' + esc(s.room) : ''}</span>
          <hr/>${s.lines.map(l => `<div><span>${l.qty} × ${esc(l.name)}</span><span>${money(l.qty * l.price)}</span></div>`).join('')}<hr/>
          <div><span>Subtotal</span><span>${money(s.sub)}</span></div><div><span>VAT</span><span>${money(s.vat)}</span></div>
          <div class="paper-total"><span>Total</span><span>${money(s.total)}</span></div>
          ${cfg.settings.footer ? `<hr/><span>${esc(cfg.settings.footer)}</span>` : ''}
        </div>
      </div>
      <div class="modal-actions" style="justify-content:center"><button class="btn btn-primary" data-close>${state.view === 'register' ? icon('plus', 16) + 'New order' : 'Close'}</button></div>`, null, 'rcpt-modal');
  }

  // ----- today (cashier view) -----
  function salesView() {
    const list = salesCache.filter(s => s.date === today()).reverse();
    const total = list.reduce((s, x) => s + x.total, 0);
    const counts = {};
    list.forEach(s => s.lines.forEach(l => counts[l.name] = (counts[l.name] || 0) + l.qty));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const byMethod = {};
    list.forEach(s => byMethod[s.method] = (byMethod[s.method] || 0) + s.total);
    $('#pos-main').innerHTML = `
      <div class="pos-page">
        <div class="grid stats">
          <div class="glass stat"><div class="stat-top"><span>Sales today</span><div class="stat-icon">${icon('dollar', 17)}</div></div><div class="stat-value">${money(total)}</div><div class="stat-change" style="color:var(--muted)">incl. VAT</div></div>
          <div class="glass stat"><div class="stat-top"><span>Orders</span><div class="stat-icon">${icon('receipt', 17)}</div></div><div class="stat-value">${list.length}</div><div class="stat-change" style="color:var(--muted)">${Object.entries(byMethod).map(([k, v]) => `${k} ${money(v)}`).join(' · ') || 'No sales yet'}</div></div>
          <div class="glass stat"><div class="stat-top"><span>Average order</span><div class="stat-icon">${icon('bag', 17)}</div></div><div class="stat-value">${money(list.length ? total / list.length : 0)}</div><div class="stat-change" style="color:var(--muted)">per ticket</div></div>
          <div class="glass stat"><div class="stat-top"><span>Best seller</span><div class="stat-icon">${icon('star', 17)}</div></div><div class="stat-value" style="font-size:20px">${top ? esc(top[0]) : '—'}</div><div class="stat-change" style="color:var(--muted)">${top ? top[1] + ' sold' : 'No sales yet'}</div></div>
        </div>
        <div class="glass card">
          <div class="card-head"><div><div class="card-title">Today's orders</div><div class="card-sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div></div>
          ${list.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Order</th><th>Time</th><th>Type</th><th>Items</th><th>Payment</th><th class="num">Total</th></tr></thead>
            <tbody>${list.map(s => `<tr class="clickable" data-no="${s.no}">
              <td><span class="mono">#${String(s.no).padStart(4, '0')}</span></td>
              <td class="muted">${new Date(s.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
              <td>${esc(s.type)}${s.table ? ` <span class="tag">${esc(s.table)}</span>` : ''}${s.room ? ` <span class="tag">Room ${esc(s.room)}</span>` : ''}</td>
              <td class="muted">${s.count} item${s.count === 1 ? '' : 's'}</td>
              <td><span class="tag">${esc(s.method)}</span></td>
              <td class="num"><b>${money(s.total)}</b></td></tr>`).join('')}</tbody></table></div>`
          : `<div class="empty">No sales yet today. Orders you charge on the Register show up here.</div>`}
        </div>
      </div>`;
    $$('tr[data-no]').forEach(tr => tr.onclick = () => receipt(list.find(s => s.no === +tr.dataset.no)));
  }

  frame();
}

// start
if (lock) renderLock(P, lock);
else boot(P);
