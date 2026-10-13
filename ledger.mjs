const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function parseLedgerDocument(text) {
  try { return JSON.parse(text); }
  catch {
    // /export is application/x-ndjson, not one JSON array.
    return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
  }
}

function gather(node, orders, rates, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (typeof node.id === 'string' && typeof node.created_at === 'string' && typeof node.status === 'string' && 'amount' in node) {
    orders.push(node);
    return;
  }
  if (node.usd_per_unit && typeof node.usd_per_unit === 'object') {
    for (const [currency, rate] of Object.entries(node.usd_per_unit)) {
      if (!Number.isFinite(Number(rate)) || Number(rate) <= 0) throw new Error(`Invalid exchange rate for ${currency}`);
      rates[String(currency).toUpperCase()] = Number(rate);
    }
  }
  for (const child of Object.values(node)) gather(child, orders, rates, seen);
}

export function buildLedgerStore(raw) {
  if (typeof raw === 'string') raw = parseLedgerDocument(raw);
  const orders = [], rates = { USD: 1 };
  gather(raw, orders, rates);
  if (!orders.length) throw new Error('No order rows found. Upload the complete /export plus /rates.');
  const current = new Map();
  for (const order of orders) {
    const updated = Date.parse(order.updated_at || order.created_at);
    if (!Number.isFinite(updated) || !Number.isFinite(Date.parse(order.created_at))) throw new Error(`Invalid timestamp on ${order.id}`);
    if (!Number.isFinite(Number(order.amount))) throw new Error(`Invalid amount on ${order.id}`);
    const previous = current.get(order.id);
    if (!previous || updated >= previous.updated) current.set(order.id, { order, updated });
  }
  const records = [...current.values()].map(({ order }) => {
    const currency = String(order.currency || 'USD').toUpperCase();
    if (!(currency in rates)) throw new Error(`Missing USD exchange rate for ${currency}; fetch /rates before uploading.`);
    // Do not slice the source timestamp: UTC rows near midnight cross the business date.
    const date = new Date(Date.parse(order.created_at) + 330 * 60 * 1000).toISOString().slice(0, 10);
    return { ...order, currency, status: order.status.toLowerCase(), business_date: date, usd: Number(order.amount) * rates[currency] };
  });
  return { records, rates, sourceRows: orders.length };
}

function mentions(question, name) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(String(name).toLowerCase()).replace(/\s+/g, '\\s+')}([^a-z0-9]|$)`).test(question);
}

function dateFilter(question) {
  const dates = [...question.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  const year = Number(question.match(/\b(20\d{2})\b/)?.[1]) || null;
  const numericMonths = [...question.matchAll(/\b20\d{2}-(\d{2})(?!-\d{2})\b/g)].map((match) => Number(match[1]));
  let months = MONTHS.map((name, index) => new RegExp(`\\b(?:${name}|${name.slice(0, 3)}|${name === 'september' ? 'sept' : name})\\b`).test(question) ? index + 1 : null).filter(Boolean);
  months.push(...numericMonths);
  const quarter = question.match(/\bq([1-4])\b|\b(?:quarter\s*([1-4])|([1-4])(?:st|nd|rd|th)\s+quarter)\b/);
  const namedQuarter = ['first', 'second', 'third', 'fourth'].findIndex((name) => question.includes(`${name} quarter`));
  const q = quarter ? Number(quarter[1] || quarter[2] || quarter[3]) : namedQuarter >= 0 ? namedQuarter + 1 : null;
  if (q) months = [(q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3];
  if (months.length === 2 && /\b(?:between|through|until|to)\b/.test(question)) {
    const [start, end] = [...months].sort((a, b) => a - b);
    months = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }
  return (row) => {
    const date = row.business_date;
    if (dates.length >= 2) return date >= dates[0] && date <= dates[1];
    if (dates.length === 1) return date === dates[0];
    if (year && Number(date.slice(0, 4)) !== year) return false;
    return !months.length || months.includes(Number(date.slice(5, 7)));
  };
}

export function ledgerAnswerOne(store, question) {
  if (typeof question !== 'string' || !question.trim()) throw new Error('question must be a non-empty string');
  const text = question.toLowerCase();
  let rows = store.records.filter(dateFilter(text));
  for (const field of ['region', 'product', 'customer']) {
    const matches = [...new Set(store.records.map((row) => row[field]).filter(Boolean))].filter((value) => mentions(text, value));
    if (matches.length) rows = rows.filter((row) => matches.includes(row[field]));
  }
  const refunds = /\brefund(?:ed|s)?\b/.test(text);
  const units = /\b(?:units?|quantit(?:y|ies))\b/.test(text);
  const money = /\b(?:revenue|sales|spent|spend|spending|money|amount|value|usd|dollars?|worth|earnings?|generated)\b/.test(text);
  const count = /\b(?:how many|number of|count)\b/.test(text);
  const ranking = /\b(?:which|top|highest|largest|most|best|leading|lowest|least|smallest)\b/.test(text);
  const distinct = /\b(?:unique|distinct|different)\b/.test(text) || (count && /\bcustomers?\b/.test(text));
  const explicitStatus = ['paid', 'refunded', 'void', 'pending'].find((status) => mentions(text, status));
  // Revenue includes paid orders only. Refund totals use the current refunded rows.
  if (refunds) rows = rows.filter((row) => row.status === 'refunded');
  else if (explicitStatus) rows = rows.filter((row) => row.status === explicitStatus);
  else if (money || /\bsold\b/.test(text) || (ranking && !units && !count)) rows = rows.filter((row) => row.status === 'paid');

  if (ranking && /\b(?:products?|customers?|regions?)\b/.test(text) && !count && !distinct) {
    const field = /\bproducts?\b/.test(text) ? 'product' : /\bcustomers?\b/.test(text) ? 'customer' : 'region';
    const totals = new Map();
    for (const row of rows) totals.set(row[field], (totals.get(row[field]) || 0) + (units ? Number(row.qty) : row.usd));
    const ascending = /\b(?:lowest|least|smallest)\b/.test(text);
    const entries = [...totals].sort((a, b) => (ascending ? a[1] - b[1] : b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])));
    const limit = Number(text.match(/\btop\s+(\d+)\b/)?.[1]) || 1;
    return limit === 1 ? entries[0]?.[0] ?? null : entries.slice(0, limit).map(([name]) => name);
  }
  if (distinct) {
    const field = /\bproducts?\b/.test(text) ? 'product' : /\bregions?\b/.test(text) ? 'region' : 'customer';
    return new Set(rows.map((row) => row[field])).size;
  }
  if (units) return rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  if (count && !/\b(?:average|mean)\b/.test(text)) return rows.length;
  const total = rows.reduce((sum, row) => sum + row.usd, 0);
  if (/\b(?:average|mean)\b/.test(text)) return roundMoney(rows.length ? total / rows.length : 0);
  return roundMoney(total);
}
