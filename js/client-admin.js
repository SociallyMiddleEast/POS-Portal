// ------------------------------------------------------------------
// Customer POS — Admin (PIN protected)
// Dashboard · Orders · Item sales · Menu · Tables · Settings
// Reads/writes through the `ctx` object handed over by client.js.
// ------------------------------------------------------------------

const PosAdmin = (() => {
  const S = {
    tab: 'dashboard',
    period: { key: '30d', from: '', to: '' },
    orders: { q: '', method: '', type: '', limit: 100 },
    items: { q: '', cat: '', sort: 'revenue', dir: -1 },
    menu: { q: '', cat: '' }
  };
  let C; // ctx
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- dates & periods ----------
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const addDays = (str, n) => { const d = new Date(str + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5) + 1;
  const short = str => new Date(str + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const PERIODS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'], ['30d', '30 days'], ['month', 'This month'], ['custom', 'Custom']];

  function range() {
    const t = C.today();
    const k = S.period.key;
    let from = t, to = t;
    if (k === 'yesterday') from = to = addDays(t, -1);
    else if (k === '7d') from = addDays(t, -6);
    else if (k === '30d') from = addDays(t, -29);
    else if (k === 'month') from = t.slice(0, 8) + '01';
    else if (k === 'custom') { from = S.period.from || addDays(t, -6); to = S.period.to || t; if (from > to) [from, to] = [to, from]; }
    const n = daysBetween(from, to);
    const label = from === to ? short(from) : `${short(from)} – ${short(to)}`;
    return { from, to, n, label, prev: { from: addDays(from, -n), to: addDays(from, -1) } };
  }
  const inRange = (s, r) => s.date >= r.from && s.date <= r.to;

  function periodBar() {
    const r = range();
    return `<div class="period-bar">
      <div class="seg" id="per-seg">${PERIODS.map(([k, l]) => `<button data-p="${k}" class="${S.period.key === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      ${S.period.key === 'custom' ? `<div class="period-custom"><input type="date" class="input" id="per-from" value="${r.from}" /><span>→</span><input type="date" class="input" id="per-to" value="${r.to}" /></div>` : `<span class="period-label">${icon('clock', 14)}${r.label}</span>`}
    </div>`;
  }
  function bindPeriod() {
    $$('#per-seg button').forEach(b => b.onclick = () => {
      S.period.key = b.dataset.p;
      if (b.dataset.p === 'custom' && !S.period.from) { S.period.from = addDays(C.today(), -13); S.period.to = C.today(); }
      draw();
    });
    const f = $('#per-from'), t = $('#per-to');
    if (f) f.onchange = () => { S.period.from = f.value; draw(); };
    if (t) t.onchange = () => { S.period.to = t.value; draw(); };
  }

  // ---------- aggregation ----------
  function agg(list) {
    const a = { revenue: 0, net: 0, orders: list.length, qty: 0, byDay: {}, byHour: Array(24).fill(0), byCat: {}, byMethod: {}, byType: {}, byItem: {} };
    list.forEach(s => {
      a.revenue += s.total; a.net += s.sub; a.qty += s.count;
      a.byDay[s.date] = (a.byDay[s.date] || 0) + s.total;
      a.byHour[new Date(s.at).getHours()] += s.total;
      a.byMethod[s.method] = (a.byMethod[s.method] || 0) + s.total;
      a.byType[s.type] = (a.byType[s.type] || 0) + s.total;
      s.lines.forEach(l => {
        const key = l.id || l.name;
        const it = a.byItem[key] || (a.byItem[key] = { id: key, name: l.name, cat: l.cat, qty: 0, revenue: 0, orders: 0, last: '' });
        it.qty += l.qty; it.revenue += l.qty * l.price; it.orders++; if (s.at > it.last) it.last = s.at;
        const cn = C.catName(l.cat);
        a.byCat[cn] = (a.byCat[cn] || 0) + l.qty * l.price;
      });
    });
    a.avg = a.orders ? a.revenue / a.orders : 0;
    return a;
  }
  // every menu item (incl. ones that never sold in the period) + removed items that did sell
  function itemRows(a) {
    const rows = C.cfg.items.map(it => ({ ...(a.byItem[it.id] || { qty: 0, revenue: 0, orders: 0, last: '' }), id: it.id, name: it.name, cat: it.cat, e: it.e, active: it.active !== false }));
    Object.values(a.byItem).forEach(x => { if (!C.cfg.items.some(i => i.id === x.id)) rows.push({ ...x, removed: true }); });
    return rows;
  }

  // ---------- small UI helpers ----------
  const m = (n, d = 0) => money(n, CUR.dec === 0 ? 0 : d);
  const pct = (a, b) => b ? Math.round((a - b) / b * 100) : (a ? 100 : 0);
  const delta = (a, b) => { const v = pct(a, b); return `<div class="stat-change ${v < 0 ? 'down' : ''}">${icon('arrowUpRight', 14)}${v >= 0 ? '+' : ''}${v}%<span>vs previous ${range().n === 1 ? 'day' : range().n + ' days'}</span></div>`; };
  const stat = (label, value, ic, foot) => `<div class="glass stat"><div class="stat-top"><span>${label}</span><div class="stat-icon">${icon(ic, 17)}</div></div><div class="stat-value">${value}</div>${foot}</div>`;
  const COLORS = ['#f0533a', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6', '#22d3ee', '#a3e635'];
  function hbars(obj, fmt = v => m(v)) {
    const entries = Object.entries(obj).sort((x, y) => y[1] - x[1]);
    const total = entries.reduce((s, e) => s + e[1], 0) || 1;
    if (!entries.length) return `<div class="empty">No data for this period.</div>`;
    return `<div class="hbars">${entries.map(([k, v], i) => `<div class="hbar">
      <div class="hbar-top"><span><i style="background:${COLORS[i % COLORS.length]}"></i>${C.esc(k)}</span><b>${fmt(v)} <small>${Math.round(v / total * 100)}%</small></b></div>
      <div class="hbar-track"><div style="width:${Math.max(2, v / entries[0][1] * 100)}%;background:${COLORS[i % COLORS.length]}"></div></div></div>`).join('')}</div>`;
  }
  function barChart(el, data, fmt, opts = {}) {
    if (!el) return;
    const W = el.clientWidth || 600, H = el.clientHeight || 220, pad = { l: 4, r: 4, t: 14, b: 24 };
    const max = Math.max(...data.map(d => d.v), 1) * 1.12;
    const bw = (W - pad.l - pad.r) / data.length;
    const every = Math.max(1, Math.ceil(data.length / Math.floor(W / 46)));
    const grid = [0.25, 0.5, 0.75, 1].map(f => { const y = pad.t + (1 - f / 1.12) * (H - pad.t - pad.b); return `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.05)" stroke-dasharray="3 5"/>`; }).join('');
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="bg-${opts.id || 'x'}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${opts.color || '#f97316'}"/><stop offset="1" stop-color="${opts.color2 || '#f0533a'}" stop-opacity=".55"/></linearGradient></defs>
      ${grid}
      ${data.map((d, i) => { const h = d.v / max * (H - pad.t - pad.b); const x = pad.l + i * bw + bw * 0.16; const w = Math.max(2, bw * 0.68); return `<rect class="bar" x="${x}" y="${H - pad.b - h}" width="${w}" height="${Math.max(h, d.v ? 2 : 0)}" rx="${Math.min(5, w / 2)}" fill="url(#bg-${opts.id || 'x'})" data-i="${i}"/>`; }).join('')}
      ${data.map((d, i) => i % every === 0 ? `<text x="${pad.l + i * bw + bw / 2}" y="${H - 6}" fill="rgba(255,255,255,.4)" font-size="10.5" text-anchor="middle">${d.label}</text>` : '').join('')}
      ${data.map((d, i) => `<rect x="${pad.l + i * bw}" y="0" width="${bw}" height="${H}" fill="transparent" data-i="${i}" class="hit"/>`).join('')}
    </svg><div class="chart-tip"></div>`;
    const tip = $('.chart-tip', el);
    $$('.hit', el).forEach(r => {
      r.onmouseenter = () => { const i = +r.dataset.i; tip.innerHTML = `<b>${fmt(data[i].v)}</b>${data[i].full || data[i].label}`; tip.style.left = (pad.l + i * bw + bw / 2) + 'px'; tip.style.top = (H - pad.b - data[i].v / max * (H - pad.t - pad.b)) + 'px'; tip.style.opacity = 1; $$('.bar', el).forEach(b => b.classList.toggle('dim', b.dataset.i !== r.dataset.i)); };
      r.onmouseleave = () => { tip.style.opacity = 0; $$('.bar', el).forEach(b => b.classList.remove('dim')); };
    });
  }
  function dayseries(byDay, r) {
    const out = [];
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push({ label: r.n > 45 ? short(d) : String(+d.slice(8)), full: new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), v: byDay[d] || 0 });
    return out;
  }
  function hourseries(byHour) {
    let lo = byHour.findIndex(v => v > 0), hi = 23 - [...byHour].reverse().findIndex(v => v > 0);
    if (lo < 0) { lo = 8; hi = 22; }
    // bars/late-night: wrap after-midnight hours to the end
    const order = [];
    const late = byHour.slice(0, 5).some(v => v > 0) && byHour.slice(17).some(v => v > 0);
    if (late) { for (let h = 6; h < 24; h++) if (byHour[h] || h >= 16) order.push(h); for (let h = 0; h < 5; h++) if (byHour[h]) order.push(h); }
    else for (let h = lo; h <= hi; h++) order.push(h);
    return order.map(h => ({ label: String(h).padStart(2, '0'), full: `${String(h).padStart(2, '0')}:00 – ${String((h + 1) % 24).padStart(2, '0')}:00`, v: byHour[h] }));
  }
  function csv(name, rows) {
    const text = rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    C.toast('Export started');
  }

  // ---------- layout ----------
  const TABS = [['dashboard', 'Dashboard', 'grid'], ['orders', 'Orders', 'receipt'], ['items', 'Item sales', 'activity'], ['menu', 'Menu', 'note'], ['tables', 'Tables', 'table'], ['settings', 'Settings', 'settings']];
  let host;
  function render(el, ctx) {
    C = ctx; host = el;
    host.innerHTML = `
      <div class="adm">
        <aside class="adm-side glass">
          <div class="adm-who"><div class="avatar" style="background:linear-gradient(135deg,#f0533a,#f97316)">AD</div><div><b>Admin</b><span>${C.esc(C.cfg.settings.name || C.p.n)}</span></div></div>
          <nav class="adm-nav" id="adm-nav">${TABS.map(([k, l, ic]) => `<button data-fx data-t="${k}" class="${S.tab === k ? 'active' : ''}">${icon(ic, 16)}<span>${l}</span></button>`).join('')}</nav>
          <button class="btn btn-ghost adm-lock" id="adm-lock">${icon('lock', 15)}<span>Lock admin</span></button>
        </aside>
        <section class="adm-main" id="adm-main"></section>
      </div>`;
    $$('#adm-nav button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; render(host, C); });
    NavFX.attach($('#adm-nav'), 'adm');
    $('#adm-lock').onclick = () => C.lock();
    draw();
  }
  function draw() {
    const main = $('#adm-main');
    if (!main) return;
    ({ dashboard, orders, items, menu, tables, settings })[S.tab](main);
    main.classList.remove('adm-in'); void main.offsetWidth; main.classList.add('adm-in');
  }
  const head = (title, sub, actions = '') => `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div><div class="page-actions">${actions}</div></div>`;

  // ================================================================
  // DASHBOARD
  // ================================================================
  function dashboard(main) {
    const r = range();
    const all = C.sales();
    const cur = all.filter(s => inRange(s, r));
    const prev = all.filter(s => inRange(s, r.prev));
    const a = agg(cur), b = agg(prev);
    const rows = itemRows(a).filter(x => !x.removed && x.active);
    const best = [...rows].sort((x, y) => y.qty - x.qty || y.revenue - x.revenue).slice(0, 5);
    const least = [...rows].sort((x, y) => x.qty - y.qty || x.revenue - y.revenue).slice(0, 5);
    const maxQ = Math.max(...best.map(x => x.qty), 1);
    const itemLine = (x, i, kind) => `<div class="rank-row" data-item="${x.id}">
      <span class="rank-n ${kind}">${i + 1}</span><span class="rank-e">${C.esc(x.e || '🍽️')}</span>
      <div class="rank-main"><b>${C.esc(x.name)}</b><span>${C.esc(C.catName(x.cat))}</span>
        ${kind === 'best' ? `<div class="rank-bar"><div style="width:${x.qty / maxQ * 100}%"></div></div>` : ''}</div>
      <div class="rank-val">${x.qty ? `<b>${x.qty} sold</b><span>${m(x.revenue)}</span>` : `<span class="pill red">No sales</span>`}</div></div>`;

    main.innerHTML = `
      ${head('Dashboard', `${C.esc(C.cfg.settings.name || C.p.n)} · sales performance`, `<button class="btn" id="go-orders">${icon('receipt', 16)}All orders</button>`)}
      ${periodBar()}
      <div class="grid stats">
        ${stat('Revenue', m(a.revenue), 'dollar', delta(a.revenue, b.revenue))}
        ${stat('Orders', a.orders.toLocaleString(), 'receipt', delta(a.orders, b.orders))}
        ${stat('Average order', m(a.avg, 2), 'bag', delta(a.avg, b.avg))}
        ${stat('Items sold', a.qty.toLocaleString(), 'star', delta(a.qty, b.qty))}
      </div>
      <div class="grid row-2-1">
        <div class="glass card"><div class="card-head"><div><div class="card-title">${r.n === 1 ? 'Sales by hour' : 'Sales by day'}</div><div class="card-sub">Revenue${Number(C.cfg.settings.vat) ? ' incl. VAT' : ''} · ${r.label}</div></div></div><div class="chart-wrap" id="ch-days"></div></div>
        <div class="glass card"><div class="card-head"><div><div class="card-title">By category</div><div class="card-sub">${Number(C.cfg.settings.vat) ? 'Net sales (excl. VAT)' : 'Sales'}</div></div></div>${hbars(a.byCat)}</div>
      </div>
      <div class="grid row-1-1" style="margin-bottom:18px">
        <div class="glass card"><div class="card-head"><div><div class="card-title">Best sellers</div><div class="card-sub">Top 5 by quantity</div></div><button class="btn btn-sm btn-ghost" data-goto="items">All items</button></div>
          <div class="rank">${best.map((x, i) => itemLine(x, i, 'best')).join('')}</div></div>
        <div class="glass card"><div class="card-head"><div><div class="card-title">Least sellers</div><div class="card-sub">Bottom 5. Worth reviewing</div></div><button class="btn btn-sm btn-ghost" data-goto="items" data-sort="asc">See all</button></div>
          <div class="rank">${least.map((x, i) => itemLine(x, i, 'least')).join('')}</div></div>
      </div>
      <div class="grid row-2-1">
        <div class="glass card"><div class="card-head"><div><div class="card-title">Busiest hours</div><div class="card-sub">Revenue by time of day</div></div></div><div class="chart-wrap" id="ch-hours" style="height:200px"></div></div>
        <div class="glass card"><div class="card-head"><div class="card-title">Payments</div></div>${hbars(a.byMethod)}
          <div class="card-head" style="margin:22px 0 14px"><div class="card-title">Order types</div></div>${hbars(a.byType)}</div>
      </div>
      <div class="glass card"><div class="card-head"><div><div class="card-title">Latest orders</div><div class="card-sub">${r.label}</div></div><button class="btn btn-sm" data-goto="orders">View all ${icon('chevronRight', 14)}</button></div>
        ${ordersTable(cur.slice(-8).reverse())}</div>`;
    bindPeriod();
    const daysData = r.n === 1 ? hourseries(a.byHour) : dayseries(a.byDay, r);
    const drawCharts = () => { barChart($('#ch-days'), daysData, v => m(v), { id: 'd' }); barChart($('#ch-hours'), hourseries(a.byHour), v => m(v), { id: 'h', color: '#60a5fa', color2: '#6366f1' }); };
    drawCharts(); let lastW = innerWidth; window.onresize = () => { if (innerWidth !== lastW) { lastW = innerWidth; drawCharts(); } };
    $('#go-orders').onclick = () => { S.tab = 'orders'; render(host, C); };
    $$('[data-goto]').forEach(b => b.onclick = () => { if (b.dataset.sort === 'asc') { S.items.sort = 'qty'; S.items.dir = 1; } S.tab = b.dataset.goto; render(host, C); });
    $$('[data-item]').forEach(x => x.onclick = () => itemDetail(x.dataset.item));
    bindOrderRows(cur);
  }

  // ================================================================
  // ORDERS
  // ================================================================
  function ordersTable(list) {
    if (!list.length) return `<div class="empty">No orders in this period.</div>`;
    return `<div class="table-wrap"><table>
      <thead><tr><th>Order</th><th>Date & time</th><th>Type</th><th>Items</th><th>Payment</th><th class="num">Total</th></tr></thead>
      <tbody>${list.map(s => `<tr class="clickable" data-no="${s.no}">
        <td><span class="mono">#${String(s.no).padStart(4, '0')}</span></td>
        <td class="muted">${new Date(s.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
        <td>${C.esc(s.type)}${s.table ? ` <span class="tag">${C.esc(s.table)}</span>` : ''}${s.room ? ` <span class="tag">Room ${C.esc(s.room)}</span>` : ''}</td>
        <td class="muted trunc">${s.lines.map(l => `${l.qty}× ${C.esc(l.name)}`).join(', ')}</td>
        <td><span class="tag">${C.esc(s.method)}</span></td>
        <td class="num"><b>${m(s.total, 2)}</b></td></tr>`).join('')}</tbody></table></div>`;
  }
  function bindOrderRows(list) { $$('#adm-main tr[data-no]').forEach(tr => tr.onclick = () => C.receipt(list.find(s => s.no === +tr.dataset.no))); }

  function orders(main) {
    const r = range();
    const all = C.sales().filter(s => inRange(s, r));
    const methods = [...new Set(C.sales().map(s => s.method))], types = [...new Set(C.sales().map(s => s.type))];
    main.innerHTML = `
      ${head('Orders', 'Every sale on this POS', `<button class="btn" id="exp">${icon('arrowUpRight', 16)}Export CSV</button>`)}
      ${periodBar()}
      <div class="toolbar">
        <label class="search">${icon('search', 15)}<input id="o-q" placeholder="Order #, item, table or room…" value="${C.esc(S.orders.q)}" /></label>
        <select class="input pill-select" id="o-m"><option value="">All payments</option>${methods.map(x => `<option ${S.orders.method === x ? 'selected' : ''}>${C.esc(x)}</option>`).join('')}</select>
        <select class="input pill-select" id="o-t"><option value="">All order types</option>${types.map(x => `<option ${S.orders.type === x ? 'selected' : ''}>${C.esc(x)}</option>`).join('')}</select>
      </div>
      <div class="glass card" id="o-list"></div>`;
    bindPeriod();
    const filtered = () => {
      const q = S.orders.q.toLowerCase().replace(/^#/, '');
      return all.filter(s => (!S.orders.method || s.method === S.orders.method) && (!S.orders.type || s.type === S.orders.type) &&
        (!q || String(s.no).padStart(4, '0').includes(q) || (s.table || '').toLowerCase() === q || (s.room || '').includes(q) || s.lines.some(l => l.name.toLowerCase().includes(q)))).reverse();
    };
    const drawList = () => {
      const list = filtered();
      const a = agg(list);
      const shown = list.slice(0, S.orders.limit);
      $('#o-list').innerHTML = `<div class="card-head"><div><div class="card-title">${list.length.toLocaleString()} orders · ${m(a.revenue, 2)}</div><div class="card-sub">${r.label} · avg ${m(a.avg, 2)} · ${a.qty.toLocaleString()} items</div></div></div>
        ${ordersTable(shown)}${list.length > shown.length ? `<div style="text-align:center;margin-top:14px"><button class="btn btn-sm" id="more">Show more (${list.length - shown.length} left)</button></div>` : ''}`;
      bindOrderRows(list);
      const more = $('#more'); if (more) more.onclick = () => { S.orders.limit += 200; drawList(); };
    };
    drawList();
    $('#o-q').oninput = e => { S.orders.q = e.target.value; S.orders.limit = 100; drawList(); };
    $('#o-m').onchange = e => { S.orders.method = e.target.value; drawList(); };
    $('#o-t').onchange = e => { S.orders.type = e.target.value; drawList(); };
    $('#exp').onclick = () => csv(`orders_${r.from}_${r.to}.csv`, [['Order', 'Date', 'Time', 'Type', 'Table', 'Room', 'Items', 'Payment', 'Subtotal', 'VAT', 'Total'],
      ...filtered().map(s => [s.no, s.date, new Date(s.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), s.type, s.table, s.room, s.lines.map(l => `${l.qty}x ${l.name}`).join('; '), s.method, s.sub.toFixed(2), s.vat.toFixed(2), s.total.toFixed(2)])]);
  }

  // ================================================================
  // ITEM SALES (search any item, any period)
  // ================================================================
  function items(main) {
    const r = range();
    const a = agg(C.sales().filter(s => inRange(s, r)));
    const b = agg(C.sales().filter(s => inRange(s, r.prev)));
    main.innerHTML = `
      ${head('Item sales', 'Search any item and see how it sold in the period', `<button class="btn" id="exp">${icon('arrowUpRight', 16)}Export CSV</button>`)}
      ${periodBar()}
      <div class="toolbar">
        <label class="search">${icon('search', 15)}<input id="i-q" placeholder="Search an item…" value="${C.esc(S.items.q)}" /></label>
        <select class="input pill-select" id="i-c"><option value="">All categories</option>${C.cfg.cats.map(c => `<option value="${c.id}" ${S.items.cat === c.id ? 'selected' : ''}>${C.esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="glass card" id="i-list"></div>`;
    bindPeriod();
    const cols = [['name', 'Item'], ['qty', 'Qty sold'], ['revenue', 'Net sales'], ['share', '% of sales'], ['orders', 'Orders'], ['trend', 'vs prev.'], ['last', 'Last sold']];
    const rowsAll = () => itemRows(a).map(x => ({ ...x, share: a.net ? x.revenue / a.net * 100 : 0, trend: pct(x.qty, (b.byItem[x.id] || {}).qty || 0), prevQty: (b.byItem[x.id] || {}).qty || 0 }));
    const filtered = () => {
      const q = S.items.q.toLowerCase();
      const k = S.items.sort, d = S.items.dir;
      return rowsAll().filter(x => (!q || x.name.toLowerCase().includes(q)) && (!S.items.cat || x.cat === S.items.cat))
        .sort((x, y) => (k === 'name' ? x.name.localeCompare(y.name) : (x[k] > y[k] ? 1 : x[k] < y[k] ? -1 : 0)) * d || y.revenue - x.revenue);
    };
    const drawList = () => {
      const list = filtered();
      const tq = list.reduce((s, x) => s + x.qty, 0), tr = list.reduce((s, x) => s + x.revenue, 0);
      $('#i-list').innerHTML = `<div class="card-head"><div><div class="card-title">${list.length} item${list.length === 1 ? '' : 's'}${S.items.q ? ` matching “${C.esc(S.items.q)}”` : ''}</div><div class="card-sub">${r.label} · ${tq.toLocaleString()} sold · ${m(tr, 2)} net</div></div></div>
        ${list.length ? `<div class="table-wrap"><table class="sort-table">
          <thead><tr>${cols.map(([k, l]) => `<th class="${k === 'name' ? '' : 'num'} sortable ${S.items.sort === k ? 'sorted' : ''}" data-k="${k}">${l}${S.items.sort === k ? (S.items.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
          <tbody>${list.map(x => `<tr class="clickable" data-item="${x.id}">
            <td><div class="cell-main"><span class="rank-e">${C.esc(x.e || '🍽️')}</span><div><b>${C.esc(x.name)}</b><small>${C.esc(C.catName(x.cat))}${x.removed ? ' · removed' : x.active === false ? ' · hidden' : ''}</small></div></div></td>
            <td class="num">${x.qty ? `<b>${x.qty}</b>` : '<span class="pill red">0</span>'}</td>
            <td class="num">${m(x.revenue, 2)}</td>
            <td class="num"><div class="share"><div><i style="width:${Math.min(100, x.share * 4)}%"></i></div>${x.share.toFixed(1)}%</div></td>
            <td class="num muted">${x.orders}</td>
            <td class="num">${x.qty || x.prevQty ? `<span class="${x.trend >= 0 ? 'up' : 'down'}">${x.trend >= 0 ? '▲' : '▼'} ${Math.abs(x.trend)}%</span>` : '<span class="muted">—</span>'}</td>
            <td class="num muted">${x.last ? new Date(x.last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td></tr>`).join('')}</tbody>
        </table></div>` : `<div class="empty">No item matches “${C.esc(S.items.q)}”.</div>`}`;
      $$('#i-list th.sortable').forEach(th => th.onclick = () => { const k = th.dataset.k; if (S.items.sort === k) S.items.dir *= -1; else { S.items.sort = k; S.items.dir = k === 'name' ? 1 : -1; } drawList(); });
      $$('#i-list tr[data-item]').forEach(tr => tr.onclick = () => itemDetail(tr.dataset.item));
    };
    drawList();
    $('#i-q').oninput = e => { S.items.q = e.target.value; drawList(); };
    $('#i-c').onchange = e => { S.items.cat = e.target.value; drawList(); };
    $('#exp').onclick = () => csv(`item-sales_${r.from}_${r.to}.csv`, [['Item', 'Category', 'Qty sold', 'Net sales', '% of sales', 'Orders', 'Prev. period qty', 'Last sold'],
      ...filtered().map(x => [x.name, C.catName(x.cat), x.qty, x.revenue.toFixed(2), x.share.toFixed(2), x.orders, x.prevQty, x.last ? x.last.slice(0, 10) : ''])]);
  }

  function itemDetail(id) {
    const r = range();
    const it = C.cfg.items.find(i => i.id === id);
    const cur = C.sales().filter(s => inRange(s, r) && s.lines.some(l => (l.id || l.name) === id));
    const prev = C.sales().filter(s => inRange(s, r.prev) && s.lines.some(l => (l.id || l.name) === id));
    const sum = list => { let q = 0, rev = 0; const byDay = {}, byHour = Array(24).fill(0), byType = {}; list.forEach(s => s.lines.forEach(l => { if ((l.id || l.name) !== id) return; q += l.qty; rev += l.qty * l.price; byDay[s.date] = (byDay[s.date] || 0) + l.qty; byHour[new Date(s.at).getHours()] += l.qty; byType[s.type] = (byType[s.type] || 0) + l.qty; })); return { q, rev, byDay, byHour, byType }; };
    const a = sum(cur), b = sum(prev);
    const name = it ? it.name : (cur[0] || prev[0])?.lines.find(l => (l.id || l.name) === id)?.name || 'Item';
    const allTime = sum(C.sales().filter(s => s.lines.some(l => (l.id || l.name) === id)));
    const best = Object.entries(a.byDay).sort((x, y) => y[1] - x[1])[0];
    C.modal(`
      <div class="item-detail">
        <div class="id-head"><span class="id-e">${C.esc(it?.e || '🍽️')}</span><div><h2>${C.esc(name)}</h2><div class="card-sub" style="margin:0">${C.esc(C.catName(it?.cat))} · ${it ? m(it.price, 2) : 'removed from menu'} · ${r.label}</div></div><button class="btn btn-sm btn-icon btn-ghost" data-close style="margin-left:auto">${icon('x', 18)}</button></div>
        <div class="id-stats">
          <div><span>Qty sold</span><b>${a.q}</b><small class="${pct(a.q, b.q) >= 0 ? 'up' : 'down'}">${pct(a.q, b.q) >= 0 ? '▲' : '▼'} ${Math.abs(pct(a.q, b.q))}% vs prev.</small></div>
          <div><span>Net sales</span><b>${m(a.rev, 2)}</b><small class="muted">${b.rev ? m(b.rev) + ' prev.' : '—'}</small></div>
          <div><span>Per day</span><b>${(a.q / r.n).toFixed(1)}</b><small class="muted">avg qty</small></div>
          <div><span>Best day</span><b>${best ? best[1] : '—'}</b><small class="muted">${best ? short(best[0]) : 'no sales'}</small></div>
        </div>
        ${r.n > 1 ? `<div class="card-title" style="margin:18px 0 8px">Quantity by day</div><div class="chart-wrap" id="id-days" style="height:170px"></div>` : ''}
        <div class="grid row-1-1" style="margin-top:14px;gap:22px">
          <div><div class="card-title" style="margin-bottom:8px">Time of day</div><div class="chart-wrap" id="id-hours" style="height:150px"></div></div>
          <div><div class="card-title" style="margin-bottom:12px">Order types</div>${hbars(a.byType, v => v + ' sold')}</div>
        </div>
        <div class="id-foot">All time: <b>${allTime.q.toLocaleString()}</b> sold · <b>${m(allTime.rev)}</b> net</div>
      </div>`, md => {
      if (r.n > 1) barChart($('#id-days', md), dayseries(a.byDay, r), v => v + ' sold', { id: 'idd' });
      barChart($('#id-hours', md), hourseries(a.byHour), v => v + ' sold', { id: 'idh', color: '#60a5fa', color2: '#6366f1' });
    }, 'wide-modal');
  }

  // ================================================================
  // MENU (categories & items)
  // ================================================================
  const EMOJI = ['🍽️', '🥗', '🫘', '🧆', '🍢', '🥩', '🍗', '🐟', '🍔', '🍕', '🍝', '🌯', '🥪', '🫓', '🥐', '🍰', '🍮', '🍪', '☕', '🍵', '🧃', '🍋', '🍺', '🍷', '🍸', '🍹', '🥃', '💧', '🥤', '🍟'];
  function menu(main) {
    const cfg = C.cfg;
    const count = id => cfg.items.filter(i => i.cat === id).length;
    main.innerHTML = `
      ${head('Menu', 'Categories and items shown on the register', `<button class="btn" id="add-cat">${icon('plus', 16)}Category</button><button class="btn btn-primary" id="add-item">${icon('plus', 16)}Item</button>`)}
      <div class="grid menu-grid">
        <div class="glass card">
          <div class="card-head"><div><div class="card-title">Categories</div><div class="card-sub">Order on the register</div></div></div>
          <div class="cat-list">${cfg.cats.map((c, i) => `
            <div class="cat-li ${S.menu.cat === c.id ? 'sel' : ''}" data-cat="${c.id}">
              <span class="drag">${i + 1}</span><b>${C.esc(c.name)}</b><span class="muted">${count(c.id)}</span>
              <div class="cat-act">
                <button class="btn btn-sm btn-icon btn-ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''} title="Move up">${icon('chevronDown', 14, 'rot180')}</button>
                <button class="btn btn-sm btn-icon btn-ghost" data-down="${i}" ${i === cfg.cats.length - 1 ? 'disabled' : ''} title="Move down">${icon('chevronDown', 14)}</button>
                <button class="btn btn-sm btn-icon btn-ghost" data-ren="${c.id}" title="Rename">${icon('edit', 14)}</button>
                <button class="btn btn-sm btn-icon btn-ghost btn-danger" data-delcat="${c.id}" title="Delete">${icon('trash', 14)}</button>
              </div>
            </div>`).join('') || '<div class="empty">No categories yet.</div>'}</div>
        </div>
        <div class="glass card">
          <div class="toolbar" style="margin-bottom:12px">
            <label class="search">${icon('search', 15)}<input id="m-q" placeholder="Search items…" value="${C.esc(S.menu.q)}" /></label>
            ${S.menu.cat ? `<button class="btn btn-sm" id="m-clear">${C.esc(C.catName(S.menu.cat))} ${icon('x', 13)}</button>` : ''}
          </div>
          <div id="m-items"></div>
        </div>
      </div>`;
    const drawItems = () => {
      const q = S.menu.q.toLowerCase();
      const list = cfg.items.filter(i => (!S.menu.cat || i.cat === S.menu.cat) && (!q || i.name.toLowerCase().includes(q)));
      $('#m-items').innerHTML = list.length ? `<div class="table-wrap"><table style="min-width:520px">
        <thead><tr><th>Item</th><th>Category</th><th class="num">Price</th><th>On register</th><th></th></tr></thead>
        <tbody>${list.map(i => `<tr>
          <td><div class="cell-main"><span class="rank-e">${C.esc(i.e || '🍽️')}</span><div><b>${C.esc(i.name)}</b>${i.ar ? `<small dir="rtl">${C.esc(i.ar)}</small>` : ''}</div></div></td>
          <td class="muted">${C.esc(C.catName(i.cat))}</td>
          <td class="num"><b>${m(i.price, 2)}</b></td>
          <td><label class="switch"><input type="checkbox" data-tog="${i.id}" ${i.active !== false ? 'checked' : ''}/><span></span></label></td>
          <td class="num" style="white-space:nowrap"><button class="btn btn-sm btn-icon btn-ghost" data-edit="${i.id}" title="Edit">${icon('edit', 14)}</button><button class="btn btn-sm btn-icon btn-ghost btn-danger" data-del="${i.id}" title="Delete">${icon('trash', 14)}</button></td>
        </tr>`).join('')}</tbody></table></div>` : `<div class="empty">No items${S.menu.cat ? ' in this category' : ''}.</div>`;
      $$('[data-tog]').forEach(t => t.onchange = () => { cfg.items.find(i => i.id === t.dataset.tog).active = t.checked; C.saveCfg(); C.toast(t.checked ? 'Shown on register' : 'Hidden from register'); });
      $$('[data-edit]').forEach(b => b.onclick = () => itemModal(cfg.items.find(i => i.id === b.dataset.edit)));
      $$('[data-del]').forEach(b => b.onclick = () => {
        const it = cfg.items.find(i => i.id === b.dataset.del);
        confirmBox(`Delete “${it.name}”?`, 'Past sales stay in your reports.', () => { cfg.items = cfg.items.filter(i => i !== it); C.saveCfg(); C.toast('Item deleted'); draw(); });
      });
    };
    drawItems();
    $('#m-q').oninput = e => { S.menu.q = e.target.value; drawItems(); };
    const mc = $('#m-clear'); if (mc) mc.onclick = () => { S.menu.cat = ''; draw(); };
    $$('.cat-li').forEach(li => li.onclick = e => { if (e.target.closest('button')) return; S.menu.cat = S.menu.cat === li.dataset.cat ? '' : li.dataset.cat; draw(); });
    const move = (i, d) => { const a = cfg.cats; [a[i], a[i + d]] = [a[i + d], a[i]]; C.saveCfg(); draw(); };
    $$('[data-up]').forEach(b => b.onclick = () => move(+b.dataset.up, -1));
    $$('[data-down]').forEach(b => b.onclick = () => move(+b.dataset.down, 1));
    $$('[data-ren]').forEach(b => b.onclick = () => catModal(cfg.cats.find(c => c.id === b.dataset.ren)));
    $$('[data-delcat]').forEach(b => b.onclick = () => {
      const c = cfg.cats.find(x => x.id === b.dataset.delcat), n = count(c.id);
      if (n && cfg.cats.length === 1) return C.toast('Add another category first');
      const others = cfg.cats.filter(x => x !== c);
      C.modal(`<h2>Delete “${C.esc(c.name)}”?</h2><div class="card-sub">${n ? `${n} item${n === 1 ? '' : 's'} will move to another category.` : 'This category is empty.'}</div>
        ${n ? `<div class="field"><label>Move items to</label><select class="input" id="mv">${others.map(o => `<option value="${o.id}">${C.esc(o.name)}</option>`).join('')}</select></div>` : ''}
        <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="ok">Delete</button></div>`, (md, close) => {
        $('#ok', md).onclick = () => { const to = n ? $('#mv', md).value : null; cfg.items.forEach(i => { if (i.cat === c.id) i.cat = to; }); cfg.cats = others; if (S.menu.cat === c.id) S.menu.cat = ''; C.saveCfg(); close(); C.toast('Category deleted'); draw(); };
      });
    });
    $('#add-cat').onclick = () => catModal(null);
    $('#add-item').onclick = () => cfg.cats.length ? itemModal(null) : C.toast('Create a category first');
  }

  function catModal(c) {
    C.modal(`<h2>${c ? 'Rename category' : 'New category'}</h2><div class="card-sub">Shown as a tab on the register.</div>
      <form id="cf"><div class="field"><label>Name</label><input class="input" name="name" required value="${C.esc(c ? c.name : '')}" placeholder="e.g. Breakfast" /></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">${c ? 'Save' : 'Add category'}</button></div></form>`, (md, close) => {
      $('#cf', md).onsubmit = e => {
        e.preventDefault();
        const name = e.target.elements.name.value.trim(); if (!name) return;
        if (c) c.name = name; else C.cfg.cats.push({ id: 'c' + Date.now().toString(36), name });
        C.saveCfg(); close(); C.toast(c ? 'Category renamed' : 'Category added'); draw();
      };
    });
  }

  function itemModal(it) {
    const cfg = C.cfg;
    let emoji = it?.e || '🍽️';
    C.modal(`<h2>${it ? 'Edit item' : 'New item'}</h2><div class="card-sub">${it ? 'Changes apply to new orders. Past sales keep their price.' : 'Add a product to the register.'}</div>
      <form id="itf"><div class="form-grid">
        <div class="field full"><label>Name</label><input class="input" name="name" required value="${C.esc(it?.name || '')}" placeholder="e.g. Chicken Shawarma" /></div>
        <div class="field"><label>Price (${CUR.code}${Number(cfg.settings.vat) ? ', excl. VAT' : ''})</label><input class="input" name="price" type="number" step="${CUR.dec === 0 ? 250 : 0.25}" min="0" required value="${it ? it.price : ''}" /></div>
        <div class="field"><label>Category</label><select class="input" name="cat">${cfg.cats.map(c => `<option value="${c.id}" ${(it ? it.cat : S.menu.cat) === c.id ? 'selected' : ''}>${C.esc(c.name)}</option>`).join('')}</select></div>
        <div class="field full"><label>Second-language name (optional)</label><input class="input" name="ar" dir="auto" value="${C.esc(it?.ar || '')}" placeholder="e.g. Arabic name" /></div>
        <div class="field full"><label>Icon</label><div class="emoji-row"><input class="input emoji-in" name="e" maxlength="4" value="${C.esc(emoji)}" />${EMOJI.map(x => `<button type="button" class="emo ${x === emoji ? 'sel' : ''}" data-e="${x}">${x}</button>`).join('')}</div></div>
        <label class="check full"><input type="checkbox" name="active" ${it?.active === false ? '' : 'checked'} /> Show on the register</label>
      </div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">${it ? 'Save changes' : 'Add item'}</button></div></form>`, (md, close) => {
      const f = $('#itf', md);
      $$('.emo', md).forEach(b => b.onclick = () => { f.elements.e.value = b.dataset.e; $$('.emo', md).forEach(x => x.classList.toggle('sel', x === b)); });
      f.onsubmit = e => {
        e.preventDefault();
        const v = { ar: f.elements.ar.value.trim(), name: f.elements.name.value.trim(), price: Math.max(0, Number(f.elements.price.value) || 0), cat: f.elements.cat.value, e: f.elements.e.value.trim() || '🍽️', active: f.elements.active.checked };
        if (!v.name) return;
        if (it) Object.assign(it, v); else cfg.items.push({ id: 'i' + Date.now().toString(36), ...v });
        C.saveCfg(); close(); C.toast(it ? 'Item updated' : 'Item added'); draw();
      };
    });
  }

  function confirmBox(title, sub, onYes) {
    C.modal(`<h2>${C.esc(title)}</h2><div class="card-sub">${C.esc(sub)}</div><div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="yes">Delete</button></div>`,
      (md, close) => { $('#yes', md).onclick = () => { close(); onYes(); }; });
  }

  // ================================================================
  // TABLES
  // ================================================================
  function tables(main) {
    const cfg = C.cfg;
    const zones = [...new Set(cfg.tables.map(t => t.zone))];
    const seats = cfg.tables.reduce((s, t) => s + Number(t.seats || 0), 0);
    const todaySales = C.sales().filter(s => s.date === C.today());
    const used = name => todaySales.filter(s => s.table === name);
    main.innerHTML = `
      ${head('Tables', `${cfg.tables.length} tables · ${seats} seats · ${zones.length} area${zones.length === 1 ? '' : 's'}`, `<button class="btn" id="bulk">${icon('plus', 16)}Add several</button><button class="btn btn-primary" id="add-t">${icon('plus', 16)}Table</button>`)}
      ${zones.length ? zones.map(z => `
        <div class="glass card zone">
          <div class="card-head"><div><div class="card-title">${C.esc(z)}</div><div class="card-sub">${cfg.tables.filter(t => t.zone === z).length} tables · ${cfg.tables.filter(t => t.zone === z).reduce((s, t) => s + Number(t.seats || 0), 0)} seats</div></div>
            <div style="display:flex;gap:6px"><button class="btn btn-sm btn-ghost" data-renz="${C.esc(z)}">${icon('edit', 14)}Rename</button><button class="btn btn-sm" data-addz="${C.esc(z)}">${icon('plus', 14)}Add</button></div></div>
          <div class="table-tiles">${cfg.tables.filter(t => t.zone === z).map(t => { const u = used(t.name); return `
            <button class="ttile seats-${Math.min(8, Number(t.seats) || 1)}" data-tid="${t.id}">
              <span class="tt-shape">${Array.from({ length: Math.min(8, Number(t.seats) || 1) }, () => '<i></i>').join('')}<b>${C.esc(t.name)}</b></span>
              <span class="tt-meta">${t.seats} seat${t.seats == 1 ? '' : 's'}${u.length ? ` · <em>${u.length} today</em>` : ''}</span>
            </button>`; }).join('')}</div>
        </div>`).join('') : `<div class="glass card empty">No tables yet. Add your first table.</div>`}`;
    $('#add-t').onclick = () => tableModal(null, zones[0] || 'Indoor');
    $('#bulk').onclick = bulkModal;
    $$('[data-addz]').forEach(b => b.onclick = () => tableModal(null, b.dataset.addz));
    $$('[data-tid]').forEach(b => b.onclick = () => tableModal(cfg.tables.find(t => t.id === b.dataset.tid)));
    $$('[data-renz]').forEach(b => b.onclick = () => {
      const z = b.dataset.renz;
      C.modal(`<h2>Rename area</h2><form id="zf"><div class="field" style="margin-top:14px"><label>Area name</label><input class="input" name="z" value="${C.esc(z)}" required /></div>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Save</button></div></form>`, (md, close) => {
        $('#zf', md).onsubmit = e => { e.preventDefault(); const nz = e.target.elements.z.value.trim(); if (!nz) return; cfg.tables.forEach(t => { if (t.zone === z) t.zone = nz; }); C.saveCfg(); close(); C.toast('Area renamed'); draw(); };
      });
    });
  }
  function tableModal(t, zone) {
    const cfg = C.cfg;
    const zones = [...new Set(cfg.tables.map(x => x.zone))];
    C.modal(`<h2>${t ? 'Edit table' : 'New table'}</h2><div class="card-sub">Tables appear in the ticket's table list.</div>
      <form id="tf"><div class="form-grid">
        <div class="field"><label>Name</label><input class="input" name="name" required value="${C.esc(t?.name || '')}" placeholder="e.g. T11" /></div>
        <div class="field"><label>Seats</label><input class="input" name="seats" type="number" min="1" max="30" value="${t?.seats || 4}" /></div>
        <div class="field full"><label>Area</label><input class="input" name="zone" list="zones" required value="${C.esc(t?.zone || zone)}" placeholder="e.g. Terrace" /><datalist id="zones">${zones.map(z => `<option value="${C.esc(z)}">`).join('')}</datalist></div>
      </div>
      <div class="modal-actions" style="justify-content:space-between">${t ? `<button type="button" class="btn btn-ghost btn-danger" id="del">${icon('trash', 15)}Delete</button>` : '<span></span>'}
        <div style="display:flex;gap:10px"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">${t ? 'Save' : 'Add table'}</button></div></div></form>`, (md, close) => {
      const f = $('#tf', md);
      f.onsubmit = e => {
        e.preventDefault();
        const v = { name: f.elements.name.value.trim(), seats: Math.max(1, Number(f.elements.seats.value) || 1), zone: f.elements.zone.value.trim() };
        if (cfg.tables.some(x => x !== t && x.name.toLowerCase() === v.name.toLowerCase())) return C.toast('A table with that name already exists');
        if (t) Object.assign(t, v); else cfg.tables.push({ id: 'tb' + Date.now().toString(36), ...v });
        C.saveCfg(); close(); C.toast(t ? 'Table updated' : 'Table added'); draw();
      };
      const del = $('#del', md); if (del) del.onclick = () => { cfg.tables = cfg.tables.filter(x => x !== t); C.saveCfg(); close(); C.toast('Table deleted'); draw(); };
    });
  }
  function bulkModal() {
    const cfg = C.cfg;
    C.modal(`<h2>Add several tables</h2><div class="card-sub">For example, 6 terrace tables named P7 to P12.</div>
      <form id="bf"><div class="form-grid">
        <div class="field"><label>How many</label><input class="input" name="n" type="number" min="1" max="50" value="4" /></div>
        <div class="field"><label>Seats each</label><input class="input" name="seats" type="number" min="1" max="30" value="4" /></div>
        <div class="field"><label>Name prefix</label><input class="input" name="pre" value="T" /></div>
        <div class="field"><label>Start number</label><input class="input" name="start" type="number" min="1" value="${cfg.tables.length + 1}" /></div>
        <div class="field full"><label>Area</label><input class="input" name="zone" list="zones2" value="${C.esc(cfg.tables[0]?.zone || 'Indoor')}" /><datalist id="zones2">${[...new Set(cfg.tables.map(x => x.zone))].map(z => `<option value="${C.esc(z)}">`).join('')}</datalist></div>
      </div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Add tables</button></div></form>`, (md, close) => {
      $('#bf', md).onsubmit = e => {
        e.preventDefault();
        const el = e.target.elements, n = Math.min(50, Math.max(1, +el.n.value || 1)), st = +el.start.value || 1;
        let added = 0;
        for (let k = 0; k < n; k++) { const name = el.pre.value.trim() + (st + k); if (cfg.tables.some(x => x.name.toLowerCase() === name.toLowerCase())) continue; cfg.tables.push({ id: 'tb' + Date.now().toString(36) + k, name, seats: +el.seats.value || 1, zone: el.zone.value.trim() || 'Indoor' }); added++; }
        C.saveCfg(); close(); C.toast(`${added} table${added === 1 ? '' : 's'} added`); draw();
      };
    });
  }

  // ================================================================
  // SETTINGS
  // ================================================================
  function settings(main) {
    const st = C.cfg.settings;
    const sales = C.sales();
    main.innerHTML = `
      ${head('Settings', 'Business details, taxes and security')}
      <div class="grid row-1-1" style="margin-bottom:18px">
        <form class="glass card" id="sf">
          <div class="card-head"><div class="card-title">Business & receipt</div></div>
          <div class="form-grid" style="grid-template-columns:1fr 1fr">
            <div class="field" style="grid-column:1/-1"><label>Name on POS & receipts</label><input class="input" name="name" value="${C.esc(st.name || C.p.n)}" required /></div>
            <div class="field"><label>VAT %</label><input class="input" name="vat" type="number" min="0" max="50" step="0.5" value="${st.vat}" /></div>
            ${CUR.code === 'USD' ? `<div class="field"><label>LBP rate (per $1)</label><input class="input" name="lbp" type="number" min="0" step="100" value="${st.lbp}" /></div>` : `<div class="field"><label>Currency</label><input class="input" value="${CUR.code}" disabled /></div>`}
            <div class="field" style="grid-column:1/-1"><label>Receipt footer</label><input class="input" name="footer" value="${C.esc(st.footer || '')}" placeholder="Thank you for your visit!" /></div>
            <div class="field" style="grid-column:1/-1"><label>Order types (comma separated)</label><input class="input" name="types" value="${C.esc(C.cfg.types.join(', '))}" /></div>
          </div>
          <div class="modal-actions"><button class="btn btn-primary">${icon('check', 16)}Save</button></div>
        </form>
        <div class="grid" style="gap:18px;align-content:start">
          <form class="glass card" id="pf">
            <div class="card-head"><div><div class="card-title">Admin PIN</div><div class="card-sub">Needed to open this admin area</div></div></div>
            <div class="form-grid" style="grid-template-columns:1fr 1fr">
              <div class="field"><label>Current PIN</label><input class="input" name="cur" type="password" inputmode="numeric" maxlength="4" required /></div>
              <div class="field"><label>New PIN (4 digits)</label><input class="input" name="nw" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" required /></div>
            </div>
            <div class="modal-actions"><button class="btn">Change PIN</button></div>
          </form>
          <div class="glass card">
            <div class="card-head"><div><div class="card-title">Data</div><div class="card-sub">${sales.length.toLocaleString()} orders stored${sales.some(s => s.demo) ? ' · includes demo history' : ''}</div></div></div>
            <div class="data-actions">
              <button class="btn btn-sm" id="exp-all">${icon('arrowUpRight', 14)}Export all orders</button>
              ${sales.some(s => s.demo) ? `<button class="btn btn-sm btn-ghost btn-danger" id="clr-demo">Remove demo sales</button>` : `<button class="btn btn-sm btn-ghost" id="reseed">Load demo sales</button>`}
              <button class="btn btn-sm btn-ghost btn-danger" id="reset-menu">Reset menu & tables</button>
            </div>
          </div>
          <div class="glass card"><div class="card-head"><div class="card-title">License</div>${pillLic()}</div>
            <div class="info-list"><div><span>Type</span><b>${C.p.m === 'Perpetual' ? 'Perpetual' : C.esc(C.p.b) + ' subscription'}</b></div><div><span>${C.p.m === 'Perpetual' ? 'Activated' : 'Valid until'}</span><b>${C.fmtDate(C.p.m === 'Perpetual' ? C.p.s : C.p.e)}</b></div><div><span>Provider</span><b>Socially Middle East</b></div></div></div>
        </div>
      </div>`;
    $('#sf').onsubmit = e => {
      e.preventDefault();
      const el = e.target.elements;
      Object.assign(st, { name: el.name.value.trim() || C.p.n, vat: Math.max(0, +el.vat.value || 0), lbp: el.lbp ? Math.max(0, +el.lbp.value || 0) : st.lbp, footer: el.footer.value.trim() });
      const types = el.types.value.split(',').map(x => x.trim()).filter(Boolean);
      if (types.length) C.cfg.types = [...new Set(types)];
      C.saveCfg(); C.toast('Settings saved'); C.rerender();
    };
    $('#pf').onsubmit = e => {
      e.preventDefault();
      const el = e.target.elements;
      if (el.cur.value !== String(st.pin)) return C.toast('Current PIN is wrong');
      if (!/^\d{4}$/.test(el.nw.value)) return C.toast('New PIN must be 4 digits');
      st.pin = el.nw.value; C.saveCfg(); e.target.reset(); C.toast('PIN changed');
    };
    $('#exp-all').onclick = () => csv('all-orders.csv', [['Order', 'Date', 'Time', 'Type', 'Table', 'Room', 'Items', 'Payment', 'Subtotal', 'VAT', 'Total'], ...sales.map(s => [s.no, s.date, new Date(s.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), s.type, s.table, s.room, s.lines.map(l => `${l.qty}x ${l.name}`).join('; '), s.method, s.sub.toFixed(2), s.vat.toFixed(2), s.total.toFixed(2)])]);
    const cd = $('#clr-demo'); if (cd) cd.onclick = () => confirmBox('Remove demo sales?', 'Only the generated demo history is removed. Real sales stay.', () => { C.saveSales(C.sales().filter(s => !s.demo)); C.toast('Demo sales removed'); draw(); });
    const rs = $('#reseed'); if (rs) rs.onclick = () => { C.reseedSales(); C.toast('Demo sales loaded'); draw(); };
    $('#reset-menu').onclick = () => confirmBox('Reset menu & tables?', 'Restores the default menu, tables and settings. Sales are kept.', () => { C.resetCfg(); C.toast('Menu & tables reset'); C.rerender(); });
  }
  function pillLic() {
    const exp = C.p.m === 'Subscription' && C.p.e && C.p.e < C.today();
    return `<span class="pill ${exp ? 'amber' : 'green'}">${exp ? 'Expired' : 'Active'}</span>`;
  }

  return { render };
})();
