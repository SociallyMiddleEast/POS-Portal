// ------------------------------------------------------------------
// Technica POS Portal — UI only (vanilla JS, hash router, no build).
// ------------------------------------------------------------------

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $('#app');

// ---------- helpers ----------
const localToday = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, dec = 0) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const initials = name => name.split(/\s+/).filter(w => /[A-Za-z]/.test(w[0])).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const GRADS = [
  ['#3b82f6', '#6366f1'], ['#a855f7', '#ec4899'], ['#f59e0b', '#f97316'], ['#ef4444', '#f43f5e'],
  ['#10b981', '#14b8a6'], ['#06b6d4', '#3b82f6'], ['#8b5cf6', '#6366f1'], ['#f97316', '#ef4444']
];
const gradFor = key => { let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const g = GRADS[h % GRADS.length]; return `background:linear-gradient(135deg,${g[0]},${g[1]})`; };
const avatar = (name, key, cls = '') => `<div class="avatar ${cls}" style="${gradFor(key || name)}">${esc(initials(name))}</div>`;

const STATUS_COLORS = {
  Active: 'green', Onboarding: 'blue', Suspended: 'red',
  Draft: 'gray', Confirmed: 'blue', Delivered: 'violet', Invoiced: 'amber', Paid: 'green', Cancelled: 'red',
  Online: 'green', Offline: 'red', Expired: 'amber', Revoked: 'red', None: 'gray',
  Subscription: 'blue', Perpetual: 'violet'
};
const pill = s => `<span class="pill ${STATUS_COLORS[s] || 'gray'}">${esc(s)}</span>`;
const TYPE_ICON = { Restaurant: 'store', Hotel: 'hotel', Café: 'store', Bar: 'store', Bakery: 'store' };
const BUSINESS_TYPES = ['Restaurant', 'Hotel', 'Café', 'Bar', 'Bakery'];
const ORDER_FLOW = ['Draft', 'Confirmed', 'Delivered', 'Invoiced', 'Paid'];
const OPEN_STATUSES = ['Draft', 'Confirmed', 'Delivered', 'Invoiced'];
const countsToward = o => o.status !== 'Draft' && o.status !== 'Cancelled';

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${icon('check', 16)}<span>${esc(msg)}</span>`;
  $('#toast-root').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2400);
}

function modal(html, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back"><div class="modal glass" role="dialog" aria-modal="true">${html}</div></div>`;
  const back = $('.modal-back', root);
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  $$('[data-close]', root).forEach(b => b.addEventListener('click', close));
  onMount && onMount($('.modal', root), close);
  const first = $('input, select, textarea', root); first && first.focus();
}

function customerStats(id) {
  const orders = Store.orders(id);
  const revenue = orders.filter(countsToward).reduce((s, o) => s + orderTotals(o).total, 0);
  return { orders: orders.length, revenue, open: orders.filter(o => OPEN_STATUSES.includes(o.status)).length, last: orders[0]?.date };
}

// ---------- customer POS access link ----------
// For now the link carries the customer's license info (base64 in the #hash) so it works
// on any device without a database. With a backend, the link only needs the token.
function b64url(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function accessLink(c) {
  const a = c.access;
  const payload = { v: 1, k: a.token, i: c.id, n: c.name, t: c.type, c: c.city, o: c.outlets, m: a.model, b: a.billing, s: a.start, e: a.end };
  const base = new URL('client.html', location.href).href.split('#')[0];
  return base + '#' + b64url(JSON.stringify(payload));
}
function licenseLabel(a) {
  if (!a) return '—';
  return a.model === 'Perpetual' ? 'Perpetual license' : `${a.billing} subscription`;
}
function validityLabel(a) {
  if (!a) return '—';
  if (a.model === 'Perpetual') return 'No expiry';
  return (a.end < localToday() ? 'Expired ' : 'Valid until ') + fmtDate(a.end);
}

function openAccessModal(customerId) {
  const c = Store.customer(customerId);
  const st = accessStatus(c);
  if (st === 'None') {
    const unpaid = Store.orders(c.id).find(o => ['Confirmed', 'Delivered', 'Invoiced'].includes(o.status));
    return modal(`<h2>No POS access yet</h2><div class="card-sub">${esc(c.name)} gets a POS access link once one of their sale orders is paid.</div>
      <div class="modal-actions"><button class="btn" data-close>Close</button>${unpaid ? `<a class="btn btn-primary" href="#/orders/${unpaid.id}" data-close>${icon('dollar', 16)}Record payment on ${unpaid.id}</a>` : `<a class="btn btn-primary" href="#/orders/new?customer=${c.id}" data-close>${icon('plus', 16)}New sale order</a>`}</div>`);
  }
  const a = c.access;
  const link = accessLink(c);
  const msg = `Hello ${c.name}, here is your Technica POS access link: ${link}`;
  modal(`
    <h2>POS access link</h2>
    <div class="card-sub">Private link to ${esc(c.name)}'s own POS. It doesn't give access to this portal.</div>
    <div class="access-box">
      <div class="access-row"><span>Status</span>${pill(st)}</div>
      <div class="access-row"><span>License</span><b>${licenseLabel(a)}</b></div>
      <div class="access-row"><span>Validity</span><b>${validityLabel(a)}</b></div>
      <div class="access-row"><span>From order</span><a class="mono" href="#/orders/${a.orderId}" data-close>${esc(a.orderId)}</a></div>
    </div>
    ${st === 'Active' ? '' : `<div class="notice">${st === 'Expired' ? 'The subscription has expired. The customer sees a locked screen until you record a renewal payment.' : st === 'Revoked' ? 'Access is revoked. The link shows a locked screen until you restore it.' : 'This customer is suspended, so their POS is locked.'}</div>`}
    <div class="field" style="margin-top:16px"><label>Access link</label>
      <div class="link-field"><input class="input" id="acc-link" readonly value="${esc(link)}" /><button class="btn btn-primary" id="acc-copy">${icon('copy', 15)}Copy</button></div>
    </div>
    <div class="share-row">
      <a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener">${icon('external', 14)}Open POS</a>
      <a class="btn btn-sm" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${icon('phone', 14)}WhatsApp</a>
      <a class="btn btn-sm" href="mailto:${esc(c.email || '')}?subject=${encodeURIComponent('Your Technica POS access')}&body=${encodeURIComponent(msg)}">${icon('mail', 14)}Email</a>
    </div>
    <div class="modal-actions" style="justify-content:space-between">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-ghost" id="acc-regen" title="Old link stops working">${icon('refresh', 14)}New link</button>
        ${a.revoked ? `<button class="btn btn-sm btn-ghost" id="acc-restore">${icon('check', 14)}Restore access</button>` : `<button class="btn btn-sm btn-ghost btn-danger" id="acc-revoke">${icon('x', 14)}Revoke</button>`}
      </div>
      <button class="btn" data-close>Done</button>
    </div>`, (m, close) => {
    $('#acc-copy', m).onclick = async () => {
      const inp = $('#acc-link', m);
      try { await navigator.clipboard.writeText(inp.value); } catch (e) { inp.select(); try { document.execCommand('copy'); } catch (e2) {} }
      toast('Link copied');
    };
    $('#acc-link', m).onfocus = e => e.target.select();
    const regen = $('#acc-regen', m); regen.onclick = () => { Store.regenerateAccess(c.id); toast('New link created. The old one no longer works'); openAccessModal(c.id); };
    const rv = $('#acc-revoke', m); if (rv) rv.onclick = () => { Store.revokeAccess(c.id); toast('Access revoked'); close(); render(); };
    const rs = $('#acc-restore', m); if (rs) rs.onclick = () => { c.access.revoked = false; Store.save(); toast('Access restored'); render(); openAccessModal(c.id); };
  });
}

// ---------- auth (UI only — replace with real auth when the backend exists) ----------
const AUTH_KEY = 'pos-portal-auth';
const Auth = {
  get user() { try { return JSON.parse(sessionStorage.getItem(AUTH_KEY)); } catch (e) { return null; } },
  login(username, password) {
    let users = [];
    try { users = JSON.parse(localStorage.getItem('pos-portal-users') || '[]'); } catch (e) {}
    const demo = username === 'admin' && password === 'admin123';
    const found = users.find(u => (u.email === username || u.username === username) && u.password === password);
    if (!demo && !found) return false;
    const user = demo ? { name: 'Miguel Faraj', role: 'Sales Engineer', username: 'admin' } : { name: found.name, role: 'Sales', username: found.username };
    try { sessionStorage.setItem(AUTH_KEY, JSON.stringify(user)); } catch (e) {}
    this._mem = user;
    return true;
  },
  signup(name, email, password) {
    let users = [];
    try { users = JSON.parse(localStorage.getItem('pos-portal-users') || '[]'); } catch (e) {}
    users.push({ name, email, username: email, password });
    try { localStorage.setItem('pos-portal-users', JSON.stringify(users)); } catch (e) {}
    return this.login(email, password);
  },
  logout() { try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {} this._mem = null; }
};
const currentUser = () => Auth.user || Auth._mem || null;

// ---------- router ----------
const ROUTES = [
  [/^\/login$/, () => viewLogin()],
  [/^\/overview$/, () => viewOverview()],
  [/^\/customers$/, () => viewCustomers()],
  [/^\/customers\/([^/]+)$/, m => viewCustomer(m[1])],
  [/^\/orders$/, () => viewOrders()],
  [/^\/orders\/new$/, () => viewOrderNew()],
  [/^\/orders\/([^/]+)$/, m => viewOrder(m[1])],
  [/^\/contacts$/, () => viewContacts()]
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/overview';
  const [path, qs] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
const go = h => { location.hash = h; };

function render() {
  const { path } = parseHash();
  if (!currentUser() && path !== '/login') return go('/login');
  if (currentUser() && path === '/login') return go('/overview');
  $('#modal-root').innerHTML = '';
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) { fn(m); window.scrollTo(0, 0); return; }
  }
  go('/overview');
}
window.addEventListener('hashchange', render);

// ---------- shell ----------
const NAV = [
  { href: '/overview', label: 'Overview', icon: 'grid' },
  { href: '/customers', label: 'Customers', icon: 'store' },
  { href: '/orders', label: 'Sale Orders', icon: 'receipt' },
  { href: '/contacts', label: 'Contacts', icon: 'contacts' }
];

function shell(active, content, mount) {
  const u = currentUser();
  const links = NAV.map(n => `<a href="#${n.href}" class="nav-link ${active === n.href ? 'active' : ''}">${icon(n.icon, 16)}${n.label}</a>`).join('');
  app.innerHTML = `
  <div class="shell">
    <nav class="navbar glass">
      <a href="#/overview" class="brand"><span class="brand-mark">${icon('logo', 18)}</span><span>Technica POS<small>PORTAL</small></span></a>
      <div class="nav-links">${links}</div>
      <div class="nav-right">
        <form class="search nav-search" id="nav-search">${icon('search', 15)}<input placeholder="Search customers…" aria-label="Search customers" /></form>
        <a href="#/orders/new" class="btn btn-primary btn-sm" title="New sale order">${icon('plus', 15)}<span class="hide-sm">New order</span></a>
        <div class="user-chip">
          <button class="avatar" id="user-btn" aria-label="Account menu">${esc(initials(u.name))}</button>
          <div class="user-menu glass" id="user-menu">
            <div class="who"><b>${esc(u.name)}</b><span>${esc(u.role)}</span></div>
            <button class="menu-item" id="reset-data">${icon('activity', 16)}Reset demo data</button>
            <button class="menu-item" id="logout">${icon('logout', 16)}Log out</button>
          </div>
        </div>
        <button class="btn btn-icon btn-ghost nav-burger" id="burger" aria-label="Menu">${icon('menu', 20)}</button>
      </div>
    </nav>
    <div class="mobile-nav glass" id="mobile-nav">${links}</div>
    <main class="view">${content}</main>
  </div>`;

  $('#burger').onclick = () => $('#mobile-nav').classList.toggle('open');
  $('#user-btn').onclick = e => { e.stopPropagation(); $('#user-menu').classList.toggle('open'); };
  document.onclick = e => { if (!e.target.closest('.user-chip')) $('#user-menu')?.classList.remove('open'); };
  $('#logout').onclick = () => { Auth.logout(); go('/login'); };
  $('#reset-data').onclick = () => { Store.reset(); toast('Demo data reset'); render(); };
  $('#nav-search').onsubmit = e => { e.preventDefault(); const q = $('input', e.target).value.trim(); go('/customers' + (q ? '?q=' + encodeURIComponent(q) : '')); };
  mount && mount();
}

// ================================================================
// LOGIN
// ================================================================
function viewLogin() {
  app.innerHTML = `
  <div class="login-wrap">
    <div class="login-brand"><span class="brand-mark">${icon('logo', 18)}</span>Technica POS</div>
    <div class="login-card glass" id="lc">
      <div class="slider"></div>

      <form class="pane p-login" id="login-form" autocomplete="on">
        <h1>Login</h1>
        <label class="line-input">${icon('user', 18)}<input name="username" placeholder="Username or email" autocomplete="username" required /></label>
        <label class="line-input">${icon('lock', 18)}<input name="password" type="password" placeholder="Password" autocomplete="current-password" required />
          <button type="button" class="toggle-pw" aria-label="Show password">${icon('eye', 18)}</button></label>
        <div class="login-error" id="login-error"></div>
        <button class="btn btn-block" type="submit">Login</button>
        <div class="login-meta">Don't have an account? <button type="button" data-flip>Sign Up</button>
          <a href="#/login" class="forgot" onclick="event.preventDefault(); toast('Password reset will be enabled with the backend')">Forgot Password?</a></div>
        <div class="login-hint">Demo login: <b>admin</b> / <b>admin123</b></div>
      </form>

      <div class="pane welcome p-hello">
        <h2>HELLO,<br/>FRIEND!</h2>
        <p>New to the portal? Create an account to manage your customers and sale orders.</p>
        <div><button class="btn" data-flip>Create Account ${icon('arrowRight', 15)}</button></div>
      </div>

      <div class="pane welcome p-welcome">
        <h2>WELCOME<br/>BACK!</h2>
        <p>Already have an account? Log in with your credentials.</p>
        <div><button class="btn" data-flip>${icon('arrowLeft', 15)} Sign In</button></div>
      </div>

      <form class="pane p-signup" id="signup-form">
        <h1>Create Account</h1>
        <label class="line-input">${icon('user', 18)}<input name="name" placeholder="Full Name" required /></label>
        <label class="line-input">${icon('mail', 18)}<input name="email" type="email" placeholder="Work Email" required /></label>
        <label class="line-input">${icon('lock', 18)}<input name="password" type="password" placeholder="Create Password" minlength="6" required /></label>
        <button class="btn btn-block btn-primary" type="submit">Sign Up</button>
        <div class="login-meta">Already a member? <button type="button" data-flip>Login</button></div>
      </form>
    </div>
  </div>`;

  const lc = $('#lc');
  $$('[data-flip]').forEach(b => b.onclick = () => lc.classList.toggle('signup'));
  $('.toggle-pw').onclick = e => {
    const inp = e.currentTarget.previousElementSibling;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    e.currentTarget.innerHTML = icon(show ? 'eyeOff' : 'eye', 18);
  };
  $('#login-form').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (Auth.login(f.get('username').trim(), f.get('password'))) go('/overview');
    else $('#login-error').textContent = 'Wrong username or password.';
  };
  $('#signup-form').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    Auth.signup(f.get('name').trim(), f.get('email').trim(), f.get('password'));
    toast('Account created');
    go('/overview');
  };
}

// ================================================================
// OVERVIEW
// ================================================================
function monthlySeries(n = 10) {
  const now = new Date();
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-US', { month: 'short' }), revenue: 0, orders: 0 });
  }
  Store.orders().forEach(o => {
    const m = months.find(x => x.key === o.date.slice(0, 7));
    if (!m || o.status === 'Cancelled') return;
    m.orders++;
    if (countsToward(o)) m.revenue += orderTotals(o).total;
  });
  return months;
}

function viewOverview() {
  const customers = Store.customers();
  const orders = Store.orders();
  const series = monthlySeries();
  const cur = series[series.length - 1], prev = series[series.length - 2];
  const pct = (a, b) => b ? Math.round((a - b) / b * 100) : 0;
  const active = customers.filter(c => c.status === 'Active').length;
  const open = orders.filter(o => OPEN_STATUSES.includes(o.status)).length;
  const counted = orders.filter(countsToward);
  const avg = counted.length ? counted.reduce((s, o) => s + orderTotals(o).total, 0) / counted.length : 0;

  const change = (v, label = 'vs last month') => `<div class="stat-change ${v < 0 ? 'down' : ''}">${icon('arrowUpRight', 14)}${v >= 0 ? '+' : ''}${v}%<span>${label}</span></div>`;
  const stats = [
    { label: 'Active customers', value: active, icon: 'store', foot: `<div class="stat-change" style="color:var(--blue)">${customers.filter(c => c.status === 'Onboarding').length} onboarding</div>` },
    { label: 'Open sale orders', value: open, icon: 'receipt', foot: `<div class="stat-change" style="color:var(--amber)">${orders.filter(o => o.status === 'Invoiced').length} awaiting payment</div>` },
    { label: 'Revenue this month', value: money(cur.revenue), icon: 'dollar', foot: change(pct(cur.revenue, prev.revenue)) },
    { label: 'Avg. order value', value: money(avg), icon: 'bag', foot: `<div class="stat-change" style="color:var(--muted)">${counted.length} orders, incl. VAT</div>` }
  ];

  // revenue by business type
  const byType = BUSINESS_TYPES.map(t => ({ t, v: counted.filter(o => Store.customer(o.customerId)?.type === t).reduce((s, o) => s + orderTotals(o).total, 0) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const totalRev = byType.reduce((s, x) => s + x.v, 0);
  const DONUT_COLORS = ['#f0533a', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa'];

  // top customers
  const top = customers.map(c => ({ c, ...customerStats(c.id) })).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  shell('/overview', `
    <div class="page-head">
      <div><h1>Overview</h1><p>Welcome back, ${esc(currentUser().name.split(' ')[0])}. Here's how your accounts are doing.</p></div>
      <div class="page-actions">
        <a href="#/customers" class="btn">${icon('store', 16)}Customers</a>
        <a href="#/orders/new" class="btn btn-primary">${icon('plus', 16)}Create sale order</a>
      </div>
    </div>

    <div class="grid stats">
      ${stats.map(s => `<div class="glass stat"><div class="stat-top"><span>${s.label}</span><div class="stat-icon">${icon(s.icon, 17)}</div></div><div class="stat-value">${s.value}</div>${s.foot}</div>`).join('')}
    </div>

    <div class="grid row-2-1">
      <div class="glass card">
        <div class="card-head">
          <div><div class="card-title">Sales performance</div><div class="card-sub">Last 10 months</div></div>
          <div class="seg" id="chart-seg"><button class="active" data-k="revenue">Revenue</button><button data-k="orders">Orders</button></div>
        </div>
        <div class="chart-wrap" id="chart"></div>
      </div>
      <div class="glass card">
        <div class="card-head"><div><div class="card-title">Revenue by business type</div><div class="card-sub">All time, incl. VAT</div></div></div>
        <div class="donut-wrap">
          <div class="donut">${donutSvg(byType.map((x, i) => ({ v: x.v, c: DONUT_COLORS[i % 5] })))}
            <div class="donut-center"><b>${totalRev ? Math.round(byType[0].v / totalRev * 100) : 0}%</b><span>${esc(byType[0]?.t || '')}</span></div></div>
          <div class="legend">${byType.map((x, i) => `<div class="legend-row"><i style="background:${DONUT_COLORS[i % 5]}"></i><span>${x.t}</span><b>${Math.round(x.v / totalRev * 100)}% <span>(${money(x.v / 1000, 1)}k)</span></b></div>`).join('')}</div>
        </div>
      </div>
    </div>

    <div class="grid row-2-1">
      <div class="glass card">
        <div class="card-head">
          <div><div class="card-title">My customers</div><div class="card-sub">Top accounts by revenue</div></div>
          <a href="#/customers" class="btn btn-sm">View all ${icon('chevronRight', 14)}</a>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Customer</th><th>Type</th><th>Status</th><th class="num">Orders</th><th class="num">Revenue</th><th></th></tr></thead>
          <tbody>${top.map(({ c, orders, revenue }) => `
            <tr class="clickable" data-href="#/customers/${c.id}">
              <td><div class="cell-main">${avatar(c.name, c.id)}<div><b>${esc(c.name)}</b><small>${esc(c.city)}</small></div></div></td>
              <td><span class="tag">${esc(c.type)}</span></td>
              <td>${pill(c.status)}</td>
              <td class="num">${orders}</td>
              <td class="num"><b>${money(revenue)}</b></td>
              <td class="num" style="white-space:nowrap"><button class="btn btn-sm link-btn" data-link="${c.id}" title="Customer POS link">${icon('link', 14)}Link</button> <a class="btn btn-sm btn-ghost btn-icon" href="#/orders/new?customer=${c.id}" title="New order for ${esc(c.name)}" onclick="event.stopPropagation()">${icon('plus', 15)}</a></td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="glass card">
        <div class="card-head"><div><div class="card-title">Recent sale orders</div><div class="card-sub">Latest activity</div></div><a href="#/orders" class="btn btn-sm btn-ghost">All</a></div>
        <div class="feed">${orders.slice(0, 6).map(o => {
          const c = Store.customer(o.customerId);
          return `<a class="feed-item" href="#/orders/${o.id}"><div class="feed-icon">${icon('receipt', 15)}</div><div style="min-width:0"><b>${esc(c?.name || '—')}</b><span>${o.id} · ${fmtDate(o.date)}</span><div style="margin-top:5px">${pill(o.status)}</div></div><div class="amt">${money(orderTotals(o).total)}</div></a>`;
        }).join('')}</div>
      </div>
    </div>
  `, () => {
    bindRowLinks();
    let key = 'revenue';
    const draw = () => lineChart($('#chart'), series.map(m => ({ label: m.label, v: m[key] })), key === 'revenue' ? v => money(v) : v => v + ' orders');
    draw();
    $$('#chart-seg button').forEach(b => b.onclick = () => { $$('#chart-seg button').forEach(x => x.classList.remove('active')); b.classList.add('active'); key = b.dataset.k; draw(); });
    window.onresize = draw;
  });
}

function bindRowLinks() {
  $$('tr[data-href]').forEach(tr => tr.onclick = () => { location.hash = tr.dataset.href; });
  bindLinkButtons();
}
function bindLinkButtons() {
  $$('[data-link]').forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); openAccessModal(b.dataset.link); });
}

function donutSvg(parts) {
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  const r = 66, C = 2 * Math.PI * r, gap = parts.length > 1 ? 4 : 0;
  let off = 0;
  const segs = parts.map(p => {
    const len = Math.max(p.v / total * C - gap, 0.1);
    const s = `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${p.c}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"/>`;
    off += p.v / total * C;
    return s;
  }).join('');
  return `<svg viewBox="0 0 160 160" width="160" height="160"><circle cx="80" cy="80" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="13"/>${segs}</svg>`;
}

function lineChart(el, data, fmt) {
  if (!el) return;
  const W = el.clientWidth || 600, H = el.clientHeight || 230;
  const pad = { l: 8, r: 8, t: 16, b: 28 };
  const max = Math.max(...data.map(d => d.v), 1) * 1.15;
  const x = i => pad.l + i * (W - pad.l - pad.r) / (data.length - 1);
  const y = v => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const pts = data.map((d, i) => [x(i), y(d.v)]);
  // smooth path (Catmull-Rom → Bezier)
  let path = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    path += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  const area = `${path} L${pts[pts.length - 1][0]},${H - pad.b} L${pts[0][0]},${H - pad.b} Z`;
  const grid = [0.25, 0.5, 0.75, 1].map(f => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(max / 1.15 * f)}" y2="${y(max / 1.15 * f)}" stroke="rgba(255,255,255,.05)" stroke-dasharray="3 5"/>`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa" stop-opacity=".35"/><stop offset="1" stop-color="#60a5fa" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#ag)"/>
    <path d="${path}" fill="none" stroke="#7cb6fb" stroke-width="2.5" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#0b0b0d" stroke="#bcdcff" stroke-width="2" data-i="${i}"/>`).join('')}
    ${data.map((d, i) => `<text x="${x(i)}" y="${H - 6}" fill="rgba(255,255,255,.4)" font-size="11" text-anchor="middle">${d.label}</text>`).join('')}
    ${pts.map((p, i) => `<rect x="${p[0] - (W / data.length) / 2}" y="0" width="${W / data.length}" height="${H}" fill="transparent" data-i="${i}" class="hit"/>`).join('')}
  </svg><div class="chart-tip"></div>`;
  const tip = $('.chart-tip', el);
  $$('.hit', el).forEach(r => {
    r.onmouseenter = () => { const i = +r.dataset.i; tip.innerHTML = `<b>${fmt(data[i].v)}</b>${data[i].label}`; tip.style.left = pts[i][0] + 'px'; tip.style.top = pts[i][1] + 'px'; tip.style.opacity = 1; };
    r.onmouseleave = () => { tip.style.opacity = 0; };
  });
}

// ================================================================
// CUSTOMERS
// ================================================================
const custState = { type: 'All', view: 'grid' };

function viewCustomers() {
  const q = parseHash().query.q || '';
  shell('/customers', `
    <div class="page-head">
      <div><h1>Customers</h1><p>${Store.customers().length} restaurants, hotels and venues using your POS.</p></div>
      <div class="page-actions"><button class="btn btn-primary" id="add-cust">${icon('plus', 16)}Add customer</button></div>
    </div>
    <div class="toolbar">
      <label class="search">${icon('search', 15)}<input id="cust-q" placeholder="Search by name, city or email…" value="${esc(q)}" /></label>
      <div class="seg" id="type-seg">${['All', ...BUSINESS_TYPES].map(t => `<button data-t="${t}" class="${custState.type === t ? 'active' : ''}">${t}</button>`).join('')}</div>
      <div class="spacer"></div>
      <div class="seg" id="view-seg"><button data-v="grid" class="${custState.view === 'grid' ? 'active' : ''}">Cards</button><button data-v="table" class="${custState.view === 'table' ? 'active' : ''}">Table</button></div>
    </div>
    <div id="cust-list"></div>
  `, () => {
    const draw = () => {
      const term = $('#cust-q').value.toLowerCase();
      const list = Store.customers().filter(c => (custState.type === 'All' || c.type === custState.type) && (!term || [c.name, c.city, c.email, c.type].join(' ').toLowerCase().includes(term)));
      const box = $('#cust-list');
      if (!list.length) { box.innerHTML = `<div class="glass card empty">No customers match your search.</div>`; return; }
      if (custState.view === 'grid') {
        box.innerHTML = `<div class="grid cust-grid">${list.map(c => {
          const s = customerStats(c.id);
          return `<a class="glass cust-card" href="#/customers/${c.id}">
            <div class="top">${avatar(c.name, c.id)}<div><b>${esc(c.name)}</b><span>${esc(c.type)} · ${esc(c.city)}</span></div>${pill(c.status)}</div>
            <button class="btn btn-sm link-btn card-link" data-link="${c.id}">${icon('link', 14)}${c.access ? 'Customer link' : 'Set up access'}${c.access && accessStatus(c) !== 'Active' ? ` · ${accessStatus(c)}` : ''}</button>
            <div class="meta"><div><span>Orders</span><b>${s.orders}</b></div><div><span>Revenue</span><b>${money(s.revenue / 1000, 1)}k</b></div><div><span>License</span><b>${c.access ? (c.access.model === 'Perpetual' ? 'Perpetual' : c.access.billing) : '—'}</b></div></div>
          </a>`;
        }).join('')}</div>`;
        bindLinkButtons();
      } else {
        box.innerHTML = `<div class="glass card"><div class="table-wrap"><table>
          <thead><tr><th>Customer</th><th>Type</th><th>City</th><th>Plan</th><th>Status</th><th>POS access</th><th class="num">Open orders</th><th class="num">Revenue</th><th></th></tr></thead>
          <tbody>${list.map(c => { const s = customerStats(c.id); return `
            <tr class="clickable" data-href="#/customers/${c.id}">
              <td><div class="cell-main">${avatar(c.name, c.id)}<div><b>${esc(c.name)}</b><small>${esc(c.email)}</small></div></div></td>
              <td><span class="tag">${esc(c.type)}</span></td><td class="muted">${esc(c.city)}</td><td>${esc(c.plan)}</td><td>${pill(c.status)}</td><td>${c.access ? `<span class="tag">${c.access.model === 'Perpetual' ? 'Perpetual' : c.access.billing}</span> ` : ''}${accessStatus(c) === 'Active' ? '' : pill(accessStatus(c))}</td>
              <td class="num">${s.open}</td><td class="num"><b>${money(s.revenue)}</b></td><td class="num"><button class="btn btn-sm link-btn" data-link="${c.id}">${icon('link', 14)}Link</button></td></tr>`; }).join('')}</tbody>
        </table></div></div>`;
        bindRowLinks();
      }
    };
    draw();
    $('#cust-q').oninput = draw;
    $$('#type-seg button').forEach(b => b.onclick = () => { custState.type = b.dataset.t; $$('#type-seg button').forEach(x => x.classList.toggle('active', x === b)); draw(); });
    $$('#view-seg button').forEach(b => b.onclick = () => { custState.view = b.dataset.v; $$('#view-seg button').forEach(x => x.classList.toggle('active', x === b)); draw(); });
    $('#add-cust').onclick = openCustomerModal;
  });
}

function openCustomerModal() {
  modal(`
    <h2>Add customer</h2><div class="card-sub">Create a new restaurant, hotel or venue account.</div>
    <form id="cust-form"><div class="form-grid">
      <div class="field full"><label>Business name</label><input class="input" name="name" required placeholder="e.g. Cedar Grill House" /></div>
      <div class="field"><label>Type</label><select class="input" name="type">${BUSINESS_TYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Plan</label><select class="input" name="plan"><option>Standard</option><option>Pro</option><option>Enterprise</option></select></div>
      <div class="field"><label>City</label><input class="input" name="city" required placeholder="Beirut" /></div>
      <div class="field"><label>Outlets</label><input class="input" name="outlets" type="number" min="1" value="1" /></div>
      <div class="field full"><label>Address</label><input class="input" name="address" /></div>
      <div class="field"><label>Phone</label><input class="input" name="phone" placeholder="+961 …" /></div>
      <div class="field"><label>Email</label><input class="input" name="email" type="email" /></div>
    </div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Create customer</button></div></form>
  `, (m, close) => {
    $('#cust-form', m).onsubmit = e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const c = Store.addCustomer({ ...f, outlets: +f.outlets || 1, status: 'Onboarding' });
      close(); toast(`${c.name} added`); go('/customers/' + c.id);
    };
  });
}

// ---------- customer detail ----------
const custTab = { id: null, tab: 'overview' };

function viewCustomer(id) {
  const c = Store.customer(id);
  if (!c) return shell('/customers', `<div class="glass card empty">Customer not found. <a href="#/customers" style="text-decoration:underline">Back to customers</a></div>`);
  if (custTab.id !== id) { custTab.id = id; custTab.tab = 'overview'; }
  const s = customerStats(id);
  const devices = Store.devices(id);
  const contacts = Store.contacts(id);
  const online = devices.filter(d => d.status === 'Online').length;

  shell('/customers', `
    <a href="#/customers" class="crumb">${icon('arrowLeft', 14)}Customers</a>
    <div class="glass hero">
      ${avatar(c.name, c.id, 'lg')}
      <div>
        <h1>${esc(c.name)} ${pill(c.status)}</h1>
        <div class="sub"><span>${icon(TYPE_ICON[c.type] || 'store', 14)}${esc(c.type)}</span><span>${icon('pin', 14)}${esc(c.address ? c.address + ', ' : '')}${esc(c.city)}</span><span>${icon('star', 14)}${esc(c.plan)} plan</span></div>
      </div>
      <div class="page-actions">
        <a class="btn" href="mailto:${esc(c.email)}">${icon('mail', 16)}Email</a>
        <button class="btn" id="hero-access">${icon('link', 16)}Access link</button>
        <a class="btn btn-primary" href="#/orders/new?customer=${c.id}">${icon('plus', 16)}New sale order</a>
      </div>
    </div>

    <div class="grid stats">
      <div class="glass stat"><div class="stat-top"><span>Lifetime revenue</span><div class="stat-icon">${icon('dollar', 17)}</div></div><div class="stat-value">${money(s.revenue)}</div><div class="stat-change" style="color:var(--muted)">Customer since ${fmtDate(c.since)}</div></div>
      <div class="glass stat"><div class="stat-top"><span>Sale orders</span><div class="stat-icon">${icon('receipt', 17)}</div></div><div class="stat-value">${s.orders}</div><div class="stat-change" style="color:var(--amber)">${s.open} open</div></div>
      <div class="glass stat"><div class="stat-top"><span>Devices online</span><div class="stat-icon">${icon('monitor', 17)}</div></div><div class="stat-value">${online}/${devices.length}</div><div class="stat-change" style="color:${online === devices.length ? 'var(--green)' : 'var(--red)'}">${devices.length - online} offline</div></div>
      <div class="glass stat"><div class="stat-top"><span>Contacts</span><div class="stat-icon">${icon('users', 17)}</div></div><div class="stat-value">${contacts.length}</div><div class="stat-change" style="color:var(--muted)">${c.outlets} outlet${c.outlets > 1 ? 's' : ''}</div></div>
    </div>

    <div class="seg tabs" id="cust-tabs">
      ${[['overview', 'Overview'], ['orders', 'Sale orders'], ['contacts', 'Contacts'], ['devices', 'Devices & licenses'], ['notes', 'Notes']].map(([k, l]) => `<button data-k="${k}" class="${custTab.tab === k ? 'active' : ''}">${l}</button>`).join('')}
    </div>
    <div id="tab-body"></div>
  `, () => {
    $('#hero-access').onclick = () => openAccessModal(c.id);
    const body = $('#tab-body');
    const drawTab = () => { body.innerHTML = customerTab(c, custTab.tab); bindRowLinks(); bindCustomerTab(c); };
    $$('#cust-tabs button').forEach(b => b.onclick = () => { custTab.tab = b.dataset.k; $$('#cust-tabs button').forEach(x => x.classList.toggle('active', x === b)); drawTab(); });
    drawTab();
  });
}

function ordersTable(orders, showCustomer = true) {
  if (!orders.length) return `<div class="empty">No sale orders yet.</div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Order</th>${showCustomer ? '<th>Customer</th>' : ''}<th>Date</th><th>Items</th><th>Status</th><th class="num">Total</th></tr></thead>
    <tbody>${orders.map(o => { const c = Store.customer(o.customerId); return `
      <tr class="clickable" data-href="#/orders/${o.id}">
        <td><span class="mono">${o.id}</span></td>
        ${showCustomer ? `<td><div class="cell-main">${avatar(c?.name || '?', o.customerId)}<div><b>${esc(c?.name || '—')}</b><small>${esc(c?.city || '')}</small></div></div></td>` : ''}
        <td class="muted">${fmtDate(o.date)}</td>
        <td class="muted">${o.lines.reduce((s, l) => s + Number(l.qty), 0)} items</td>
        <td>${pill(o.status)}</td>
        <td class="num"><b>${money(orderTotals(o).total, 2)}</b></td></tr>`; }).join('')}</tbody></table></div>`;
}

function contactCards(list, showCompany) {
  if (!list.length) return `<div class="glass card empty">No contacts yet.</div>`;
  return `<div class="grid contact-grid">${list.map(p => { const c = Store.customer(p.customerId); return `
    <div class="glass contact-card">
      <div class="top">${avatar(p.name, p.id)}<div style="min-width:0"><b>${esc(p.name)}</b><span>${esc(p.role)}</span></div>${p.primary ? '<span class="pill amber" style="margin-left:auto">Primary</span>' : ''}</div>
      <div class="lines">
        <a href="tel:${esc(p.phone.replace(/\s/g, ''))}">${icon('phone', 14)}<span>${esc(p.phone)}</span></a>
        <a href="mailto:${esc(p.email)}">${icon('mail', 14)}<span>${esc(p.email)}</span></a>
      </div>
      <div class="foot">
        ${showCompany && c ? `<a class="company" href="#/customers/${c.id}">${icon('store', 13)}${esc(c.name)}</a>` : `<span class="company">${icon('user', 13)}Contact</span>`}
        <button class="btn btn-sm btn-icon btn-ghost btn-danger" data-del="${p.id}" title="Delete contact">${icon('trash', 14)}</button>
      </div>
    </div>`; }).join('')}</div>`;
}

function customerTab(c, tab) {
  const orders = Store.orders(c.id);
  if (tab === 'overview') {
    const notes = Store.notes(c.id).slice(0, 3);
    const st = accessStatus(c), a = c.access;
    const accessCard = `<div class="glass card access-card" style="margin-bottom:18px">
      <div class="access-card-main">
        <div class="stat-icon" style="width:44px;height:44px">${icon('monitor', 20)}</div>
        <div><div class="card-title" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">Customer POS access ${pill(st)}</div>
          <div class="card-sub">${st === 'None' ? 'Not active yet. Record a payment on a sale order to activate it.' : `${licenseLabel(a)} · ${validityLabel(a)} · from ${esc(a.orderId)}`}</div></div>
      </div>
      <button class="btn ${st === 'Active' ? 'btn-primary' : ''}" data-access>${icon('link', 16)}${st === 'None' ? 'Set up access' : 'Share access link'}</button>
    </div>`;
    return accessCard + `<div class="grid row-1-1" style="margin-bottom:18px">
      <div class="glass card"><div class="card-head"><div class="card-title">Account details</div></div>
        <div class="info-list">
          <div><span>Customer ID</span><b class="mono">${c.id}</b></div>
          <div><span>Business type</span><b>${esc(c.type)}</b></div>
          <div><span>Plan</span><b>${esc(c.plan)}</b></div>
          <div><span>Outlets</span><b>${c.outlets}</b></div>
          <div><span>Phone</span><b><a href="tel:${esc((c.phone || '').replace(/\s/g, ''))}">${esc(c.phone || '—')}</a></b></div>
          <div><span>Email</span><b><a href="mailto:${esc(c.email)}">${esc(c.email || '—')}</a></b></div>
          <div><span>Customer since</span><b>${fmtDate(c.since)}</b></div>
        </div></div>
      <div class="glass card"><div class="card-head"><div class="card-title">Latest notes</div><button class="btn btn-sm btn-ghost" data-goto="notes">All notes</button></div>
        <div class="feed">${notes.length ? notes.map(n => `<div class="feed-item" style="cursor:default"><div class="feed-icon">${icon('note', 15)}</div><div><b>${esc(n.text)}</b><span>${fmtDate(n.date)}</span></div></div>`).join('') : '<div class="empty">No notes yet.</div>'}</div></div>
    </div>
    <div class="glass card"><div class="card-head"><div class="card-title">Recent sale orders</div><button class="btn btn-sm btn-ghost" data-goto="orders">All orders</button></div>${ordersTable(orders.slice(0, 5), false)}</div>`;
  }
  if (tab === 'orders') {
    return `<div class="glass card"><div class="card-head"><div><div class="card-title">Sale orders</div><div class="card-sub">${orders.length} orders</div></div><a class="btn btn-sm btn-primary" href="#/orders/new?customer=${c.id}">${icon('plus', 14)}New order</a></div>${ordersTable(orders, false)}</div>`;
  }
  if (tab === 'contacts') {
    return `<div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="add-contact">${icon('plus', 16)}Add contact</button></div>${contactCards(Store.contacts(c.id), false)}`;
  }
  if (tab === 'devices') {
    const devices = Store.devices(c.id);
    // licenses = license lines from non-cancelled, non-draft orders
    const lic = {};
    orders.filter(countsToward).forEach(o => o.lines.filter(l => l.sku.startsWith('LIC')).forEach(l => { lic[l.sku] = lic[l.sku] || { name: l.name, qty: 0, last: o.date }; lic[l.sku].qty += Number(l.qty); if (o.date > lic[l.sku].last) lic[l.sku].last = o.date; }));
    const renew = () => c.access && c.access.model === 'Subscription' ? c.access.end : null;
    const devIcon = { 'POS Terminal': 'monitor', 'Receipt Printer': 'printer', 'Kitchen Display': 'monitor' };
    return `<div class="grid row-1-1">
      <div class="glass card"><div class="card-head"><div><div class="card-title">Devices</div><div class="card-sub">${devices.length} registered</div></div></div>
        <div class="table-wrap"><table style="min-width:480px"><thead><tr><th>Device</th><th>Location</th><th>Status</th></tr></thead><tbody>
        ${devices.map(d => `<tr><td><div class="cell-main"><div class="feed-icon">${icon(devIcon[d.type] || 'monitor', 15)}</div><div><b>${esc(d.type)}</b><small class="mono">${esc(d.serial)}</small></div></div></td><td class="muted">${esc(d.location)}</td><td>${pill(d.status)}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="glass card"><div class="card-head"><div><div class="card-title">Licenses</div><div class="card-sub">${c.access ? `${licenseLabel(c.access)} · ${validityLabel(c.access)}` : 'From confirmed sale orders'}</div></div>${c.access ? pill(accessStatus(c)) : ''}</div>
        ${Object.keys(lic).length ? `<div class="table-wrap"><table style="min-width:440px"><thead><tr><th>License</th><th class="num">Qty</th><th>Renews</th></tr></thead><tbody>
        ${Object.values(lic).map(l => { const r = renew(); const soon = r && (new Date(r) - new Date()) / 864e5 < 60; return `<tr><td><div class="cell-main"><div class="feed-icon">${icon('key', 15)}</div><b style="font-weight:500">${esc(l.name)}</b></div></td><td class="num">${l.qty}</td><td>${!r ? `<span class="muted">${c.access ? 'Perpetual' : '—'}</span>` : soon ? `<span class="pill amber">${fmtDate(r)}</span>` : `<span class="muted">${fmtDate(r)}</span>`}</td></tr>`; }).join('')}
        </tbody></table></div>` : '<div class="empty">No licenses sold yet.</div>'}</div>
    </div>`;
  }
  if (tab === 'notes') {
    const notes = Store.notes(c.id);
    return `<div class="glass card">
      <form id="note-form" style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap"><input class="input" name="text" placeholder="Add a note about this customer…" required style="flex:1;min-width:200px" /><button class="btn btn-primary">${icon('plus', 15)}Add note</button></form>
      <div class="feed">${notes.length ? notes.map(n => `<div class="feed-item" style="cursor:default"><div class="feed-icon">${icon('note', 15)}</div><div><b>${esc(n.text)}</b><span>${fmtDate(n.date)}</span></div></div>`).join('') : '<div class="empty">No notes yet.</div>'}</div></div>`;
  }
  return '';
}

function bindCustomerTab(c) {
  $$('[data-access]').forEach(b => b.onclick = () => openAccessModal(c.id));
  $$('[data-goto]').forEach(b => b.onclick = () => $(`#cust-tabs button[data-k="${b.dataset.goto}"]`).click());
  const add = $('#add-contact'); if (add) add.onclick = () => openContactModal(c.id);
  bindContactDelete();
  const nf = $('#note-form');
  if (nf) nf.onsubmit = e => { e.preventDefault(); const text = new FormData(nf).get('text').trim(); if (!text) return; Store.addNote({ customerId: c.id, date: localToday(), text }); toast('Note added'); render(); };
}

function bindContactDelete() {
  $$('[data-del]').forEach(b => b.onclick = e => {
    e.preventDefault();
    const p = Store.contacts().find(x => x.id === b.dataset.del);
    modal(`<h2>Delete contact?</h2><div class="card-sub">${esc(p.name)} will be removed from this customer.</div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="confirm-del">Delete</button></div>`,
      (m, close) => { $('#confirm-del', m).onclick = () => { Store.deleteContact(p.id); close(); toast('Contact deleted'); render(); }; });
  });
}

function openContactModal(customerId) {
  const customers = Store.customers();
  modal(`
    <h2>Add contact</h2><div class="card-sub">A person you deal with at one of your customers.</div>
    <form id="contact-form"><div class="form-grid">
      <div class="field full"><label>Customer</label><select class="input" name="customerId" required>${customers.map(c => `<option value="${c.id}" ${c.id === customerId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Full name</label><input class="input" name="name" required /></div>
      <div class="field"><label>Role</label><input class="input" name="role" placeholder="e.g. F&B Manager" /></div>
      <div class="field"><label>Phone</label><input class="input" name="phone" placeholder="+961 …" /></div>
      <div class="field"><label>Email</label><input class="input" name="email" type="email" /></div>
      <label class="check full"><input type="checkbox" name="primary" /> Primary contact for this customer</label>
    </div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Save contact</button></div></form>
  `, (m, close) => {
    $('#contact-form', m).onsubmit = e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const primary = !!f.primary;
      if (primary) Store.contacts(f.customerId).forEach(p => p.primary = false);
      Store.addContact({ ...f, role: f.role || 'Contact', phone: f.phone || '—', email: f.email || '—', primary });
      close(); toast('Contact saved'); render();
    };
  });
}

// ================================================================
// SALE ORDERS
// ================================================================
const orderState = { status: 'All' };

function viewOrders() {
  shell('/orders', `
    <div class="page-head">
      <div><h1>Sale orders</h1><p>Quotes and orders for licenses, hardware and services.</p></div>
      <div class="page-actions"><a href="#/orders/new" class="btn btn-primary">${icon('plus', 16)}Create sale order</a></div>
    </div>
    <div class="toolbar">
      <label class="search">${icon('search', 15)}<input id="ord-q" placeholder="Search order # or customer…" /></label>
      <div class="seg" id="ord-seg">${['All', ...ORDER_FLOW, 'Cancelled'].map(s => `<button data-s="${s}" class="${orderState.status === s ? 'active' : ''}">${s}</button>`).join('')}</div>
    </div>
    <div class="glass card" id="ord-list"></div>
  `, () => {
    const draw = () => {
      const term = $('#ord-q').value.toLowerCase();
      const list = Store.orders().filter(o => (orderState.status === 'All' || o.status === orderState.status) && (!term || (o.id + ' ' + (Store.customer(o.customerId)?.name || '')).toLowerCase().includes(term)));
      const total = list.filter(countsToward).reduce((s, o) => s + orderTotals(o).total, 0);
      $('#ord-list').innerHTML = `<div class="card-head"><div><div class="card-title">${list.length} orders</div><div class="card-sub">${money(total)} confirmed value</div></div></div>${ordersTable(list)}`;
      bindRowLinks();
    };
    draw();
    $('#ord-q').oninput = draw;
    $$('#ord-seg button').forEach(b => b.onclick = () => { orderState.status = b.dataset.s; $$('#ord-seg button').forEach(x => x.classList.toggle('active', x === b)); draw(); });
  });
}

function viewOrderNew() {
  const pre = parseHash().query.customer || '';
  const customers = Store.customers().filter(c => c.status !== 'Suspended');
  const today = localToday();
  const lines = [{ sku: '', qty: 1, price: 0, discount: 0 }];
  const lic = { model: 'Subscription', billing: 'Yearly' };

  const productOptions = sel => `<option value="">Select product…</option>` + ['License', 'Hardware', 'Service'].map(cat =>
    `<optgroup label="${cat}">${PRODUCTS.filter(p => p.category === cat).map(p => `<option value="${p.sku}" ${p.sku === sel ? 'selected' : ''}>${esc(p.name)} — ${money(licensePrice(p, lic.model, lic.billing))}${p.category === 'License' ? ' ' + licenseSuffix(lic.model, lic.billing) : ''}</option>`).join('')}</optgroup>`).join('');

  shell('/orders', `
    <a href="#/orders" class="crumb">${icon('arrowLeft', 14)}Sale orders</a>
    <div class="page-head"><div><h1>New sale order</h1><p>Build a quote, then save as draft or confirm it.</p></div></div>
    <div class="grid so-layout">
      <div class="grid" style="gap:18px">
        <div class="glass card">
          <div class="card-head"><div class="card-title">Order details</div></div>
          <div class="form-grid">
            <div class="field"><label>Customer</label><select class="input" id="so-cust"><option value="">Choose customer…</option>${customers.map(c => `<option value="${c.id}" ${c.id === pre ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Order date</label><input class="input" type="date" id="so-date" value="${today}" /></div>
            <div class="field"><label>Payment terms</label><select class="input" id="so-terms"><option>Due on receipt</option><option selected>Net 15</option><option>Net 30</option><option>50% upfront</option></select></div>
          </div>
        </div>
        <div class="glass card">
          <div class="card-head"><div><div class="card-title">Licensing</div><div class="card-sub">How the customer pays for the POS software</div></div></div>
          <div class="lic-grid">
            <div class="field"><label>License model</label><div class="seg" id="so-model">${LICENSE_MODELS.map(m => `<button type="button" data-m="${m}" class="${m === lic.model ? 'active' : ''}">${m}</button>`).join('')}</div></div>
            <div class="field" id="billing-field"><label>Billing period</label><div class="seg" id="so-billing">${BILLING_PERIODS.map(b => `<button type="button" data-b="${b}" class="${b === lic.billing ? 'active' : ''}">${b}</button>`).join('')}</div></div>
          </div>
          <div class="lic-hint" id="lic-hint"></div>
        </div>
        <div class="glass card">
          <div class="card-head"><div><div class="card-title">Order lines</div><div class="card-sub">Licenses, hardware and services</div></div><button class="btn btn-sm" id="add-line">${icon('plus', 14)}Add line</button></div>
          <div class="table-wrap"><table class="lines-table" style="min-width:720px">
            <thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Disc. %</th><th class="num">Amount</th><th></th></tr></thead>
            <tbody id="lines"></tbody>
          </table></div>
        </div>
        <div class="glass card"><div class="field"><label>Notes for the customer</label><textarea class="input" id="so-notes" placeholder="Delivery, installation date, anything to mention on the quote…"></textarea></div></div>
      </div>
      <div class="glass card summary">
        <div class="card-head"><div class="card-title">Summary</div></div>
        <div id="so-cust-mini"></div>
        <div id="so-lic-mini"></div>
        <div id="so-sum"></div>
        <button class="btn btn-primary" id="so-confirm">${icon('check', 16)}Confirm order</button>
        <button class="btn" id="so-draft">Save as draft</button>
        <div class="login-error" id="so-err" style="text-align:center;margin-top:10px"></div>
      </div>
    </div>
  `, () => {
    const tbody = $('#lines');
    const drawLines = () => {
      tbody.innerHTML = lines.map((l, i) => `<tr>
        <td><select class="input" data-i="${i}" data-f="sku">${productOptions(l.sku)}</select></td>
        <td class="num"><input class="input" type="number" min="1" step="1" value="${l.qty}" data-i="${i}" data-f="qty" /></td>
        <td class="num"><input class="input" type="number" min="0" step="1" value="${l.price}" data-i="${i}" data-f="price" style="width:100px" />${l.sku && isLicense(l.sku) ? `<div class="unit-suffix">${licenseSuffix(lic.model, lic.billing)}</div>` : ''}</td>
        <td class="num"><input class="input" type="number" min="0" max="100" step="1" value="${l.discount}" data-i="${i}" data-f="discount" style="width:72px" /></td>
        <td class="num" data-amt="${i}"><b>${money(l.qty * l.price * (1 - l.discount / 100), 2)}</b></td>
        <td class="num"><button class="btn btn-sm btn-icon btn-ghost btn-danger" data-rm="${i}" title="Remove line" ${lines.length === 1 ? 'disabled style="opacity:.3"' : ''}>${icon('trash', 14)}</button></td></tr>`).join('');
      $$('[data-f]', tbody).forEach(inp => {
        const ev = inp.tagName === 'SELECT' ? 'onchange' : 'oninput';
        inp[ev] = () => {
          const l = lines[+inp.dataset.i], f = inp.dataset.f;
          if (f === 'sku') { const p = PRODUCTS.find(x => x.sku === inp.value); l.sku = inp.value; l.price = p ? licensePrice(p, lic.model, lic.billing) : 0; drawLines(); }
          else { l[f] = Math.max(0, Number(inp.value) || 0); if (f === 'discount') l[f] = Math.min(l[f], 100); $(`[data-amt="${inp.dataset.i}"]`).innerHTML = `<b>${money(l.qty * l.price * (1 - l.discount / 100), 2)}</b>`; }
          drawSum();
        };
      });
      $$('[data-rm]', tbody).forEach(b => b.onclick = () => { if (lines.length > 1) { lines.splice(+b.dataset.rm, 1); drawLines(); drawSum(); } });
    };
    const drawSum = () => {
      const t = orderTotals({ lines: lines.filter(l => l.sku) });
      $('#so-sum').innerHTML = `
        <div class="summary-row"><span>Subtotal</span><b>${money(t.subtotal, 2)}</b></div>
        <div class="summary-row"><span>Discount</span><b>−${money(t.discount, 2)}</b></div>
        <div class="summary-row"><span>VAT (11%)</span><b>${money(t.vat, 2)}</b></div>
        <div class="summary-total"><span>Total</span><b>${money(t.total, 2)}</b></div>`;
    };
    const drawCust = () => {
      const c = Store.customer($('#so-cust').value);
      $('#so-lic-mini').innerHTML = `<div class="summary-row"><span>License</span><b>${pill(lic.model)}${lic.model === 'Subscription' ? ` <span class="muted" style="font-size:12px">${lic.billing}</span>` : ''}</b></div>`;
      $('#so-cust-mini').innerHTML = c ? `<div class="cust-mini">${avatar(c.name, c.id)}<div><b>${esc(c.name)}</b><span>${esc(c.type)} · ${esc(c.city)} · ${esc(c.plan)}</span></div></div>` : `<div class="cust-mini"><div class="avatar" style="background:rgba(255,255,255,.08)">${icon('store', 16)}</div><div><b>No customer yet</b><span>Choose one on the left</span></div></div>`;
    };
    $('#so-cust').onchange = drawCust;
    const drawLic = () => {
      $$('#so-model button').forEach(b => b.classList.toggle('active', b.dataset.m === lic.model));
      $$('#so-billing button').forEach(b => b.classList.toggle('active', b.dataset.b === lic.billing));
      $('#billing-field').style.display = lic.model === 'Perpetual' ? 'none' : '';
      $('#lic-hint').innerHTML = lic.model === 'Perpetual'
        ? `${icon('key', 14)}One-time payment (3× the yearly price). The customer owns the license and their POS never expires.`
        : `${icon('refresh', 14)}Recurring. Access runs for 1 ${lic.billing === 'Monthly' ? 'month' : 'year'} from the payment date${lic.billing === 'Monthly' ? '. Monthly costs 15% more than yearly' : ''}.`;
      lines.forEach(l => { const p = PRODUCTS.find(x => x.sku === l.sku); if (p && p.category === 'License') l.price = licensePrice(p, lic.model, lic.billing); });
      drawLines(); drawSum(); drawCust();
    };
    $$('#so-model button').forEach(b => b.onclick = () => { lic.model = b.dataset.m; drawLic(); });
    $$('#so-billing button').forEach(b => b.onclick = () => { lic.billing = b.dataset.b; drawLic(); });
    $('#add-line').onclick = () => { lines.push({ sku: '', qty: 1, price: 0, discount: 0 }); drawLines(); };
    const save = status => {
      const customerId = $('#so-cust').value;
      const valid = lines.filter(l => l.sku && l.qty > 0);
      if (!customerId) return $('#so-err').textContent = 'Choose a customer first.';
      if (!valid.length) return $('#so-err').textContent = 'Add at least one product line.';
      const o = Store.addOrder({
        customerId, date: $('#so-date').value || today, status,
        terms: $('#so-terms').value, notes: $('#so-notes').value.trim(),
        license: { model: lic.model, billing: lic.billing }, payment: null,
        lines: valid.map(l => ({ sku: l.sku, name: PRODUCTS.find(p => p.sku === l.sku).name, qty: l.qty, price: l.price, discount: l.discount }))
      });
      toast(`${o.id} ${status === 'Draft' ? 'saved as draft' : 'confirmed'}`);
      go('/orders/' + o.id);
    };
    $('#so-confirm').onclick = () => save('Confirmed');
    $('#so-draft').onclick = () => save('Draft');
    drawLic();
  });
}

function viewOrder(id) {
  const o = Store.order(id);
  if (!o) return shell('/orders', `<div class="glass card empty">Order not found. <a href="#/orders" style="text-decoration:underline">Back to orders</a></div>`);
  const c = Store.customer(o.customerId);
  const t = orderTotals(o);
  const idx = ORDER_FLOW.indexOf(o.status);
  const lic = o.license || { model: 'Subscription', billing: 'Yearly' };
  const next = { Draft: ['Confirmed', 'Confirm order'], Confirmed: ['Delivered', 'Mark as delivered'], Delivered: ['Invoiced', 'Create invoice'] }[o.status];
  const canPay = ['Confirmed', 'Delivered', 'Invoiced'].includes(o.status);
  const primary = c ? Store.contacts(c.id).find(p => p.primary) : null;
  const hasAccess = c && c.access && c.access.orderId === o.id;

  shell('/orders', `
    <a href="#/orders" class="crumb">${icon('arrowLeft', 14)}Sale orders</a>
    <div class="page-head">
      <div><h1 style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="mono" style="font-size:24px;color:var(--text)">${o.id}</span>${pill(o.status)}</h1><p>${fmtDate(o.date)}${o.terms ? ' · ' + esc(o.terms) : ''} · ${licenseLabel(lic)}</p></div>
      <div class="page-actions">
        ${!['Cancelled', 'Paid', 'Invoiced'].includes(o.status) ? `<button class="btn btn-ghost btn-danger" id="cancel-o">Cancel order</button>` : ''}
        <button class="btn" onclick="window.print()">${icon('printer', 16)}Print</button>
        ${next ? `<button class="btn ${canPay ? '' : 'btn-primary'}" id="advance">${icon('check', 16)}${next[1]}</button>` : ''}
        ${canPay ? `<button class="btn btn-primary" id="pay">${icon('dollar', 16)}Record payment</button>` : ''}
        ${o.status === 'Paid' && c ? `<button class="btn btn-primary" id="access">${icon('link', 16)}Customer access link</button>` : ''}
      </div>
    </div>
    ${o.status !== 'Cancelled' ? `<div class="steps" style="margin-bottom:18px">${ORDER_FLOW.map((s, i) => `<div class="step ${i < idx || o.status === 'Paid' ? 'done' : i === idx ? 'current' : ''}"><i>${i < idx || o.status === 'Paid' ? '✓' : i + 1}</i>${s}</div>`).join('')}</div>` : ''}
    <div class="grid so-layout">
      <div class="grid" style="gap:18px">
        <div class="glass card">
          <div class="card-head"><div class="card-title">Order lines</div></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Disc.</th><th class="num">Amount</th></tr></thead>
            <tbody>${o.lines.map(l => `<tr><td><b style="font-weight:500">${esc(l.name)}</b><div class="mono" style="font-size:11.5px">${esc(l.sku)}</div></td><td class="num">${l.qty}</td><td class="num">${money(l.price, 2)}${isLicense(l.sku) ? `<div class="unit-suffix">${licenseSuffix(lic.model, lic.billing)}</div>` : ''}</td><td class="num muted">${l.discount ? l.discount + '%' : '—'}</td><td class="num"><b>${money(l.qty * l.price * (1 - (l.discount || 0) / 100), 2)}</b></td></tr>`).join('')}</tbody>
          </table></div>
          ${o.notes ? `<div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--border)"><div class="card-sub" style="margin-bottom:6px">Notes</div>${esc(o.notes)}</div>` : ''}
        </div>
        <div class="grid row-1-1">
          <div class="glass card"><div class="card-head"><div class="card-title">Licensing</div>${pill(lic.model)}</div>
            <div class="info-list">
              <div><span>Model</span><b>${lic.model}</b></div>
              ${lic.model === 'Subscription' ? `<div><span>Billing</span><b>${lic.billing}</b></div>` : ''}
              ${o.status === 'Paid' && hasAccess ? `<div><span>POS access</span><b>${pill(accessStatus(c))}</b></div><div><span>Validity</span><b>${validityLabel(c.access)}</b></div>` : `<div><span>POS access</span><b class="muted">${o.status === 'Paid' ? 'Covered by a newer order' : 'Activates when paid'}</b></div>`}
            </div></div>
          <div class="glass card"><div class="card-head"><div class="card-title">Payment</div>${o.payment ? pill('Paid') : `<span class="pill gray">Unpaid</span>`}</div>
            ${o.payment ? `<div class="info-list">
              <div><span>Paid on</span><b>${fmtDate(o.payment.date)}</b></div>
              <div><span>Method</span><b>${esc(o.payment.method)}</b></div>
              ${o.payment.reference ? `<div><span>Reference</span><b class="mono">${esc(o.payment.reference)}</b></div>` : ''}
              <div><span>Amount</span><b>${money(t.total, 2)}</b></div></div>`
            : `<div class="muted" style="font-size:13px">${canPay ? 'Record the payment when it arrives. That activates the customer\'s POS access and gives you their link.' : o.status === 'Draft' ? 'Confirm the order first.' : 'No payment.'}</div>`}
          </div>
        </div>
      </div>
      <div class="glass card summary">
        <div class="card-head"><div class="card-title">Customer</div></div>
        ${c ? `<a class="cust-mini" href="#/customers/${c.id}">${avatar(c.name, c.id)}<div><b>${esc(c.name)}</b><span>${esc(c.type)} · ${esc(c.city)}</span></div></a>` : ''}
        ${primary ? `<div class="info-list" style="margin-bottom:10px"><div><span>Contact</span><b>${esc(primary.name)}</b></div><div><span>Phone</span><b>${esc(primary.phone)}</b></div></div>` : ''}
        <div class="summary-row"><span>Subtotal</span><b>${money(t.subtotal, 2)}</b></div>
        <div class="summary-row"><span>Discount</span><b>−${money(t.discount, 2)}</b></div>
        <div class="summary-row"><span>VAT (11%)</span><b>${money(t.vat, 2)}</b></div>
        <div class="summary-total"><span>Total</span><b>${money(t.total, 2)}</b></div>
      </div>
    </div>
  `, () => {
    const adv = $('#advance');
    if (adv) adv.onclick = () => { Store.updateOrder(o.id, { status: next[0] }); toast(`${o.id} → ${next[0]}`); render(); };
    const pay = $('#pay'); if (pay) pay.onclick = () => openPaymentModal(o.id);
    const acc = $('#access'); if (acc) acc.onclick = () => openAccessModal(c.id);
    const can = $('#cancel-o');
    if (can) can.onclick = () => modal(`<h2>Cancel ${o.id}?</h2><div class="card-sub">The order will be kept but marked as cancelled.</div><div class="modal-actions"><button class="btn" data-close>Keep order</button><button class="btn btn-primary" id="yes">Cancel order</button></div>`,
      (m, close) => { $('#yes', m).onclick = () => { Store.updateOrder(o.id, { status: 'Cancelled' }); close(); toast(`${o.id} cancelled`); render(); }; });
  });
}

function openPaymentModal(orderId) {
  const o = Store.order(orderId);
  const c = Store.customer(o.customerId);
  const lic = { ...(o.license || { model: 'Subscription', billing: 'Yearly' }) };
  const hasLicenses = o.lines.some(l => isLicense(l.sku));
  const today = localToday();
  modal(`
    <h2>Record payment · ${o.id}</h2>
    <div class="card-sub">${esc(c.name)}. Marks the order as paid and activates their POS access.</div>
    <form id="pay-form">
      <div class="form-grid">
        <div class="field"><label>Payment date</label><input class="input" type="date" name="date" value="${today}" required /></div>
        <div class="field"><label>Method</label><select class="input" name="method"><option>Bank transfer</option><option>Cash</option><option>Cheque</option><option>Card</option><option>OMT / Whish</option></select></div>
        <div class="field full"><label>Reference (optional)</label><input class="input" name="reference" placeholder="Transfer ID, cheque no.…" /></div>
        <div class="field full"><label>License model</label><div class="seg" id="pm-model">${LICENSE_MODELS.map(m => `<button type="button" data-m="${m}">${m}</button>`).join('')}</div></div>
        <div class="field full" id="pm-billing-f"><label>Billing period</label><div class="seg" id="pm-billing">${BILLING_PERIODS.map(b => `<button type="button" data-b="${b}">${b}</button>`).join('')}</div></div>
      </div>
      <div class="access-box" style="margin-top:16px" id="pm-preview"></div>
      <label class="check" style="margin-top:14px"><input type="checkbox" name="activate" checked /> Activate POS access and create the customer's link</label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">${icon('check', 16)}Mark as paid</button></div>
    </form>`, (m, close) => {
    const form = $('#pay-form', m);
    const preview = () => {
      $$('#pm-model button', m).forEach(b => b.classList.toggle('active', b.dataset.m === lic.model));
      $$('#pm-billing button', m).forEach(b => b.classList.toggle('active', b.dataset.b === lic.billing));
      $('#pm-billing-f', m).style.display = lic.model === 'Perpetual' ? 'none' : '';
      const start = form.elements.date.value || today;
      const repriced = { ...o, lines: o.lines.map(l => { const p = PRODUCTS.find(x => x.sku === l.sku); return p && p.category === 'License' ? { ...l, price: licensePrice(p, lic.model, lic.billing) } : l; }) };
      const changed = Math.abs(orderTotals(repriced).total - orderTotals(o).total) > 0.005;
      $('#pm-preview', m).innerHTML = `
        <div class="access-row"><span>Amount received</span><b>${money(orderTotals(repriced).total, 2)}</b></div>
        <div class="access-row"><span>POS access</span><b>${lic.model === 'Perpetual' ? 'Permanent, no expiry' : `${fmtDate(start)} → ${fmtDate(addPeriod(start, lic.billing))}`}</b></div>
        ${changed ? `<div class="access-row"><span></span><b style="color:var(--amber);font-size:12px">License prices updated for ${lic.model === 'Perpetual' ? 'perpetual' : lic.billing.toLowerCase()}</b></div>` : ''}
        ${hasLicenses ? '' : `<div class="access-row"><span></span><b style="color:var(--muted);font-size:12px">This order has no license lines</b></div>`}`;
      return repriced;
    };
    $$('#pm-model button', m).forEach(b => b.onclick = () => { lic.model = b.dataset.m; preview(); });
    $$('#pm-billing button', m).forEach(b => b.onclick = () => { lic.billing = b.dataset.b; preview(); });
    form.elements.date.oninput = preview;
    preview();
    form.onsubmit = e => {
      e.preventDefault();
      const repriced = preview();
      const date = form.elements.date.value || today;
      Store.updateOrder(o.id, {
        status: 'Paid', lines: repriced.lines, license: { ...lic },
        payment: { date, method: form.elements.method.value, reference: form.elements.reference.value.trim() }
      });
      if (c.status === 'Onboarding') { c.status = 'Active'; Store.save(); }
      const activate = form.elements.activate.checked;
      if (activate) {
        const prev = c.access;
        // Renewal of the same customer: keep the same link so they don't need a new one
        Store.setAccess(c.id, {
          token: prev && !prev.revoked ? prev.token : newToken(), orderId: o.id,
          model: lic.model, billing: lic.model === 'Perpetual' ? null : lic.billing,
          start: date, end: lic.model === 'Perpetual' ? null : addPeriod(date, lic.billing), revoked: false
        });
      }
      close(); toast(`${o.id} marked as paid`); render();
      if (activate) openAccessModal(c.id);
    };
  });
}

// ================================================================
// CONTACTS
// ================================================================
function viewContacts() {
  const customers = Store.customers();
  shell('/contacts', `
    <div class="page-head">
      <div><h1>Contacts</h1><p>Everyone you work with across your customers.</p></div>
      <div class="page-actions"><button class="btn btn-primary" id="add-contact">${icon('plus', 16)}Add contact</button></div>
    </div>
    <div class="toolbar">
      <label class="search">${icon('search', 15)}<input id="con-q" placeholder="Search name, role, phone or email…" /></label>
      <select class="input" id="con-cust" style="width:auto;min-width:220px;border-radius:999px"><option value="">All customers</option>${customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="con-primary" /> Primary only</label>
    </div>
    <div id="con-list"></div>
  `, () => {
    const draw = () => {
      const term = $('#con-q').value.toLowerCase(), cid = $('#con-cust').value, prim = $('#con-primary').checked;
      const list = Store.contacts().filter(p => (!cid || p.customerId === cid) && (!prim || p.primary) && (!term || [p.name, p.role, p.phone, p.email, Store.customer(p.customerId)?.name].join(' ').toLowerCase().includes(term)))
        .sort((a, b) => a.name.localeCompare(b.name));
      $('#con-list').innerHTML = contactCards(list, true);
      bindContactDelete();
    };
    draw();
    $('#con-q').oninput = draw; $('#con-cust').onchange = draw; $('#con-primary').onchange = draw;
    $('#add-contact').onclick = () => openContactModal($('#con-cust').value);
  });
}

// ---------- boot ----------
Store.load();
render();
