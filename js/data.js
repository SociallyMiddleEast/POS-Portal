// ------------------------------------------------------------------
// Mock data layer. Everything lives in localStorage for now.
// Later, replace the functions in `Store` with API calls to your DB —
// the UI only talks to Store, so nothing else needs to change.
// ------------------------------------------------------------------

const STORE_KEY = 'pos-portal-data-v3';
const VAT_RATE = 0.11; // Lebanon VAT

const PRODUCTS = [
  { sku: 'LIC-STD', name: 'POS License — Standard (per terminal)', category: 'License', price: 360 },
  { sku: 'LIC-PRO', name: 'POS License — Pro (per terminal)', category: 'License', price: 540 },
  { sku: 'LIC-HTL', name: 'Hotel PMS Interface (per property)', category: 'License', price: 1200 },
  { sku: 'LIC-KDS', name: 'Kitchen Display License (per screen)', category: 'License', price: 180 },
  { sku: 'HW-TERM', name: 'Touch POS Terminal 15.6"', category: 'Hardware', price: 890 },
  { sku: 'HW-HAND', name: 'Handheld Waiter Device', category: 'Hardware', price: 420 },
  { sku: 'HW-PRNT', name: 'Thermal Receipt Printer', category: 'Hardware', price: 210 },
  { sku: 'HW-KPRN', name: 'Kitchen Impact Printer', category: 'Hardware', price: 260 },
  { sku: 'HW-DRWR', name: 'Cash Drawer', category: 'Hardware', price: 95 },
  { sku: 'HW-KDS', name: 'Kitchen Display Screen 22"', category: 'Hardware', price: 640 },
  { sku: 'SRV-INST', name: 'Installation & Setup (per site)', category: 'Service', price: 350 },
  { sku: 'SRV-TRN', name: 'Staff Training (per session)', category: 'Service', price: 150 },
  { sku: 'SRV-MENU', name: 'Menu Build & Import', category: 'Service', price: 200 },
  { sku: 'SRV-SUP', name: 'Premium Support (per year)', category: 'Service', price: 600 }
];

// ---------- Licensing ----------
// License products: `price` is the yearly subscription price.
// Monthly = yearly / 12 + 15%.  Perpetual = 3 × yearly (one-time).
const LICENSE_MODELS = ['Subscription', 'Perpetual'];
const BILLING_PERIODS = ['Yearly', 'Monthly'];
const isLicense = sku => sku.startsWith('LIC');
function licensePrice(p, model, billing) {
  if (p.category !== 'License') return p.price;
  if (model === 'Perpetual') return p.price * 3;
  return billing === 'Monthly' ? Math.round(p.price / 12 * 1.15) : p.price;
}
function licenseSuffix(model, billing) {
  return model === 'Perpetual' ? 'one-time' : billing === 'Monthly' ? '/ month' : '/ year';
}
const isoLocal = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function addPeriod(dateStr, billing) {
  const d = new Date(dateStr + 'T00:00:00');
  if (billing === 'Monthly') d.setMonth(d.getMonth() + 1); else d.setFullYear(d.getFullYear() + 1);
  return isoLocal(d);
}
function newToken() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let t = '';
  const rnd = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(14)) : Array.from({ length: 14 }, () => Math.random() * 1e9);
  for (let i = 0; i < 14; i++) t += abc[rnd[i] % abc.length];
  return t;
}
// Access state of a customer's POS: Active | Expired | Revoked | Suspended | None
function accessStatus(c) {
  const a = c && c.access;
  if (!a) return 'None';
  if (a.revoked) return 'Revoked';
  if (c.status === 'Suspended') return 'Suspended';
  if (a.model === 'Subscription' && a.end && a.end < isoLocal(new Date())) return 'Expired';
  return 'Active';
}

function seedData() {
  // Deterministic pseudo-random so the demo looks the same for everyone
  let s = 42;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];

  const customers = [
    { id: 'C001', name: 'Cedar Grill House', type: 'Restaurant', city: 'Beirut', address: 'Gemmayzeh, Gouraud St.', phone: '+961 1 445 210', email: 'ops@cedargrill.lb', status: 'Active', plan: 'Pro', outlets: 2 },
    { id: 'C002', name: 'Le Phénicien Hotel', type: 'Hotel', city: 'Byblos', address: 'Old Port Road', phone: '+961 9 540 880', email: 'it@lephenicien.lb', status: 'Active', plan: 'Enterprise', outlets: 4 },
    { id: 'C003', name: 'Mar Mikhael Café', type: 'Café', city: 'Beirut', address: 'Armenia St. 112', phone: '+961 3 220 914', email: 'hello@mmcafe.lb', status: 'Active', plan: 'Standard', outlets: 1 },
    { id: 'C004', name: 'Batroun Beach Resort', type: 'Hotel', city: 'Batroun', address: 'Coastal Highway', phone: '+961 6 740 300', email: 'gm@batrounbeach.lb', status: 'Onboarding', plan: 'Enterprise', outlets: 3 },
    { id: 'C005', name: 'Zaatar & Co. Bakery', type: 'Bakery', city: 'Jounieh', address: 'Kaslik Main Rd.', phone: '+961 9 912 455', email: 'orders@zaatarco.lb', status: 'Active', plan: 'Standard', outlets: 3 },
    { id: 'C006', name: 'Hamra Rooftop Bar', type: 'Bar', city: 'Beirut', address: 'Hamra, Makdessi St.', phone: '+961 70 118 902', email: 'manager@hamrarooftop.lb', status: 'Active', plan: 'Pro', outlets: 1 },
    { id: 'C007', name: 'Saida Seafood Co.', type: 'Restaurant', city: 'Saida', address: 'Sea Castle Corniche', phone: '+961 7 733 120', email: 'info@saidaseafood.lb', status: 'Suspended', plan: 'Standard', outlets: 1 },
    { id: 'C008', name: 'Broummana Grand Hotel', type: 'Hotel', city: 'Broummana', address: 'Main Street', phone: '+961 4 960 500', email: 'fnb@broummanagrand.lb', status: 'Active', plan: 'Enterprise', outlets: 5 },
    { id: 'C009', name: 'Jounieh Marina Bistro', type: 'Restaurant', city: 'Jounieh', address: 'Marina Walk', phone: '+961 9 641 077', email: 'bistro@jouniehmarina.lb', status: 'Onboarding', plan: 'Pro', outlets: 1 },
    { id: 'C010', name: 'Tyre Coast Kitchen', type: 'Restaurant', city: 'Tyre', address: 'Rest House Rd.', phone: '+961 7 349 610', email: 'kitchen@tyrecoast.lb', status: 'Active', plan: 'Standard', outlets: 1 }
  ];
  const now = new Date();
  customers.forEach((c, i) => {
    const d = new Date(now.getFullYear() - (i % 3 === 0 ? 2 : 1), (i * 5) % 12, 3 + i);
    c.since = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });

  const first = ['Rami', 'Nour', 'Karim', 'Maya', 'Elie', 'Lara', 'Georges', 'Rita', 'Hadi', 'Yara', 'Ziad', 'Dana', 'Fadi', 'Joelle', 'Samir', 'Christelle'];
  const last = ['Haddad', 'Khoury', 'Saab', 'Nassar', 'Azar', 'Matar', 'Daher', 'Rizk', 'Fares', 'Aoun', 'Gemayel', 'Hayek'];
  const roles = ['Owner', 'General Manager', 'F&B Manager', 'IT Manager', 'Accountant', 'Restaurant Manager', 'Purchasing'];
  const contacts = [];
  let cn = 1;
  customers.forEach(c => {
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const fn = pick(first), ln = pick(last);
      contacts.push({
        id: 'P' + String(cn++).padStart(3, '0'),
        customerId: c.id,
        name: `${fn} ${ln}`,
        role: k === 0 ? (c.type === 'Hotel' ? 'General Manager' : 'Owner') : pick(roles),
        phone: `+961 ${pick(['3', '70', '71', '76', '81'])} ${100 + Math.floor(rnd() * 899)} ${100 + Math.floor(rnd() * 899)}`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}@${c.email.split('@')[1]}`,
        primary: k === 0
      });
    }
  });

  const orders = [];
  const statuses = ['Paid', 'Paid', 'Paid', 'Paid', 'Invoiced'];
  let on = 1;
  for (let m = 9; m >= 0; m--) {
    const count = 2 + Math.floor(rnd() * 3) + (9 - m > 5 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const c = pick(customers.filter(x => x.status !== 'Suspended' || m > 4));
      const maxDay = m === 0 ? Math.max(1, now.getDate()) : 26;
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1 + Math.floor(rnd() * maxDay));
      const lines = [];
      const nl = 2 + Math.floor(rnd() * 3);
      const used = new Set();
      for (let l = 0; l < nl; l++) {
        const p = pick(PRODUCTS);
        if (used.has(p.sku)) continue;
        used.add(p.sku);
        lines.push({ sku: p.sku, name: p.name, qty: 1 + Math.floor(rnd() * (p.category === 'Service' ? 2 : 4)), price: p.price, discount: rnd() > 0.7 ? 10 : 0 });
      }
      if (!lines.some(l => isLicense(l.sku))) { const lp = pick(PRODUCTS.filter(x => x.category === 'License')); lines.unshift({ sku: lp.sku, name: lp.name, qty: 1 + Math.floor(rnd() * 3), price: lp.price, discount: 0 }); }
      const model = rnd() > 0.7 ? 'Perpetual' : 'Subscription';
      const billing = rnd() > 0.8 ? 'Monthly' : 'Yearly';
      lines.forEach(l => { const pr = PRODUCTS.find(x => x.sku === l.sku); l.price = licensePrice(pr, model, billing); });
      let status = m === 0 ? pick(['Draft', 'Confirmed', 'Confirmed', 'Delivered', 'Invoiced']) : m === 1 ? pick(['Delivered', 'Invoiced', 'Paid']) : pick(statuses);
      orders.push({
        id: `SO-${d.getFullYear()}-${String(on++).padStart(4, '0')}`,
        customerId: c.id,
        date: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
        status,
        lines,
        license: { model, billing },
        payment: status === 'Paid' ? { date: isoLocal(new Date(d.getTime() + 864e6)), method: pick(['Bank transfer', 'Cash', 'Cheque', 'Card']), reference: '' } : null,
        notes: ''
      });
    }
  }

  const devices = [];
  customers.forEach(c => {
    const terms = c.outlets * (c.type === 'Hotel' ? 2 : 1) + 1;
    for (let t = 0; t < terms; t++) {
      devices.push({ customerId: c.id, type: 'POS Terminal', serial: `TX-${c.id.slice(1)}${t}${Math.floor(rnd() * 9000 + 1000)}`, location: c.type === 'Hotel' ? pick(['Lobby Bar', 'Main Restaurant', 'Pool Bar', 'Room Service']) : pick(['Front Counter', 'Bar', 'Terrace']), status: c.status === 'Suspended' ? 'Offline' : rnd() > 0.15 ? 'Online' : 'Offline' });
    }
    devices.push({ customerId: c.id, type: 'Receipt Printer', serial: `PR-${c.id.slice(1)}${Math.floor(rnd() * 9000 + 1000)}`, location: 'Front Counter', status: c.status === 'Suspended' ? 'Offline' : 'Online' });
    if (c.type !== 'Café' && c.type !== 'Bakery') devices.push({ customerId: c.id, type: 'Kitchen Display', serial: `KD-${c.id.slice(1)}${Math.floor(rnd() * 9000 + 1000)}`, location: 'Kitchen', status: c.status === 'Suspended' ? 'Offline' : 'Online' });
  });

  // Onboarding customers haven't paid yet → no access (shows the "record payment" flow)
  orders.forEach(o => { const c = customers.find(x => x.id === o.customerId); if (c.status === 'Onboarding' && o.status === 'Paid') { o.status = 'Invoiced'; o.payment = null; } });
  // Access: from each customer's latest paid order
  customers.forEach(c => {
    const paid = orders.filter(o => o.customerId === c.id && o.status === 'Paid').sort((a, b) => b.payment.date.localeCompare(a.payment.date))[0];
    if (!paid) return;
    const { model, billing } = paid.license;
    const start = paid.payment.date;
    c.access = { token: newToken(), orderId: paid.id, model, billing: model === 'Perpetual' ? null : billing, start, end: model === 'Perpetual' ? null : addPeriod(start, billing), revoked: false };
  });
  // One lapsed monthly subscription, to show the "expired" state
  const lapsed = customers.find(c => c.id === 'C005');
  if (lapsed && lapsed.access) {
    const paid = orders.find(o => o.id === lapsed.access.orderId);
    paid.license = { model: 'Subscription', billing: 'Monthly' };
    paid.lines.forEach(l => { const pr = PRODUCTS.find(x => x.sku === l.sku); l.price = licensePrice(pr, 'Subscription', 'Monthly'); });
    Object.assign(lapsed.access, { model: 'Subscription', billing: 'Monthly', end: addPeriod(lapsed.access.start, 'Monthly') });
  }

  const notes = customers.map((c, i) => ({ customerId: c.id, date: new Date(now.getTime() - (i + 1) * 86400000 * 3).toISOString().slice(0, 10), text: pick(['Requested quote for an extra handheld for the terrace.', 'Menu updated for the new season.', 'Follow-up call about license renewal.', 'Reported printer paper jam — resolved remotely.', 'Interested in KDS for the second kitchen.', 'Training session scheduled for new staff.']) }));

  return { customers, contacts, orders, devices, notes };
}

const Store = {
  _data: null,
  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      this._data = raw ? JSON.parse(raw) : seedData();
    } catch (e) { this._data = seedData(); }
    return this._data;
  },
  save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this._data)); } catch (e) { /* storage unavailable */ } },
  reset() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} this._data = seedData(); },
  get data() { return this._data || this.load(); },

  customers() { return this.data.customers; },
  customer(id) { return this.data.customers.find(c => c.id === id); },
  addCustomer(c) {
    const n = this.data.customers.length + 1;
    c.id = 'C' + String(n).padStart(3, '0');
    while (this.customer(c.id)) c.id = 'C' + String(++n).padStart(3, '0');
    c.since = new Date().toISOString().slice(0, 10);
    this.data.customers.push(c); this.save(); return c;
  },

  contacts(customerId) { return customerId ? this.data.contacts.filter(c => c.customerId === customerId) : this.data.contacts; },
  addContact(c) {
    c.id = 'P' + String(this.data.contacts.length + 1).padStart(3, '0') + Math.floor(Math.random() * 90 + 10);
    this.data.contacts.push(c); this.save(); return c;
  },
  deleteContact(id) { this.data.contacts = this.data.contacts.filter(c => c.id !== id); this.save(); },

  orders(customerId) {
    const list = customerId ? this.data.orders.filter(o => o.customerId === customerId) : this.data.orders;
    return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  },
  order(id) { return this.data.orders.find(o => o.id === id); },
  addOrder(o) {
    const year = new Date().getFullYear();
    const max = this.data.orders.reduce((m, x) => Math.max(m, parseInt(x.id.split('-')[2], 10)), 0);
    o.id = `SO-${year}-${String(max + 1).padStart(4, '0')}`;
    this.data.orders.push(o); this.save(); return o;
  },
  updateOrder(id, patch) { Object.assign(this.order(id), patch); this.save(); },

  setAccess(customerId, access) { const c = this.customer(customerId); c.access = access; this.save(); return access; },
  revokeAccess(customerId) { const c = this.customer(customerId); if (c.access) { c.access.revoked = true; this.save(); } },
  regenerateAccess(customerId) { const c = this.customer(customerId); if (c.access) { c.access.token = newToken(); c.access.revoked = false; this.save(); } return c.access; },

  devices(customerId) { return this.data.devices.filter(d => d.customerId === customerId); },
  notes(customerId) { return this.data.notes.filter(n => n.customerId === customerId).sort((a, b) => b.date.localeCompare(a.date)); },
  addNote(n) { this.data.notes.push(n); this.save(); }
};

function orderTotals(o) {
  let subtotal = 0, discount = 0;
  o.lines.forEach(l => {
    const gross = l.qty * l.price;
    subtotal += gross;
    discount += gross * (l.discount || 0) / 100;
  });
  const net = subtotal - discount;
  const vat = net * VAT_RATE;
  return { subtotal, discount, net, vat, total: net + vat };
}
