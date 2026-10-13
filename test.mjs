import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildLedgerStore, ledgerAnswerOne, parseLedgerDocument } from './ledger.mjs';
import { extractInvoice } from './invoice.mjs';

const rates = { description: 'USD value of one unit of each currency', usd_per_unit: { USD: 1, EUR: 1.1, INR: 0.01 } };
const row = (id, overrides = {}) => ({
  id, customer: 'C1001', region: 'North', product: 'Rice Cooker', qty: 2,
  amount: 100, currency: 'USD', status: 'paid',
  created_at: '2026-02-28T20:00:00Z', updated_at: '2026-03-01T00:00:00Z', ...overrides,
});
const fixture = {
  orders: [
    row('A', { amount: 999 }), // Stale revision must disappear.
    row('B', { amount: 1000, currency: 'INR', product: 'Air Fryer', customer: 'C1002' }),
    row('A', { amount: 100, updated_at: '2026-03-04T00:00:00Z' }),
    row('C', { amount: 200, currency: 'EUR', status: 'refunded' }),
    row('D', { amount: 5000, status: 'void' }),
    row('E', { amount: 50, created_at: '2026-03-31T20:00:00Z', updated_at: '2026-04-01T00:00:00Z' }),
    row('F', { amount: 300, region: 'South' }),
  ], rates,
};

test('ledger export parses NDJSON and JSON, and never selects wrapper documents as rows', () => {
  const text = fixture.orders.map((order) => JSON.stringify(order)).join('\n') + '\n';
  assert.deepEqual(parseLedgerDocument(text), fixture.orders);
  assert.deepEqual(parseLedgerDocument(JSON.stringify(fixture)), fixture);
  const store = buildLedgerStore({ wrapper: { links: { orders: '/orders' } }, fetched: [{ orders: fixture.orders }, rates] });
  assert.equal(store.sourceRows, 7);
  assert.equal(store.records.length, 6);
});

test('revenue uses the latest order, paid status, USD rates and Kolkata business month', () => {
  const store = buildLedgerStore(fixture);
  assert.equal(ledgerAnswerOne(store, 'What was total revenue in USD from the North region in March 2026?'), 110);
  assert.equal(ledgerAnswerOne(store, 'How much revenue did North generate in Apr 2026?'), 50);
  assert.equal(ledgerAnswerOne(store, 'What was the total revenue in North in the first quarter of 2026?'), 110);
  assert.equal(ledgerAnswerOne(store, 'Revenue in North between March and April 2026?'), 160);
});

test('refunds, distinct customers, counts, units, product names and rankings', () => {
  const store = buildLedgerStore(fixture);
  assert.equal(ledgerAnswerOne(store, 'How many refunded orders were in North in March 2026?'), 1);
  assert.equal(ledgerAnswerOne(store, 'Total refunded amount in USD in North in March 2026?'), 220);
  assert.equal(ledgerAnswerOne(store, 'How many unique customers had paid orders in North in March 2026?'), 2);
  assert.equal(ledgerAnswerOne(store, 'How many paid orders in North in March 2026?'), 2);
  assert.equal(ledgerAnswerOne(store, 'Which product earned the highest revenue in North in March 2026?'), 'Rice Cooker');
  assert.equal(ledgerAnswerOne(store, 'Which customer spent the most in North in March 2026?'), 'C1001');
  assert.equal(ledgerAnswerOne(store, 'What is the average paid order value in USD in North in March 2026?'), 55);
  assert.equal(ledgerAnswerOne(store, 'How many units of Air Fryer were sold in North in March 2026?'), 2);
});

test('a partial ledger without rates fails clearly instead of claiming a successful upload', () => {
  assert.throws(() => buildLedgerStore({ orders: fixture.orders }), /Missing USD exchange rate/);
  assert.throws(() => buildLedgerStore({ fetched: [{ page: 1, next: '/page2' }] }), /No order rows/);
});

test('random invoice amounts, currencies and full vendor punctuation survive extraction', () => {
  for (let index = 0; index < 24; index++) {
    const vendor = `Acme-${index.toString(16).padStart(4, '0')} Industries Ltd.`;
    const amount = Number((50 + index * 317.73).toFixed(2));
    const currency = ['USD', 'EUR', 'GBP'][index % 3];
    const date = `2026-${String(index % 12 + 1).padStart(2, '0')}-17`;
    const result = extractInvoice(`Please process this invoice from ${vendor}. Total due: ${amount} ${currency}. Due date: ${date}. Thanks.`);
    assert.ok(result.vendor.toLowerCase().includes(vendor.toLowerCase()));
    assert.equal(result.amount, amount);
    assert.equal(result.currency, currency);
    assert.equal(result.date, date);
    assert.deepEqual(Object.keys(result).sort(), ['amount', 'currency', 'date', 'vendor']);
  }
  assert.equal(extractInvoice('Invoice from Example Co.\nTotal due: EUR 1,234.50\nDue date: 2026-04-30').amount, 1234.5);
  assert.deepEqual(extractInvoice('Invoice from Acme-abc9 Industries Ltd. Please pay 503.41 EUR by 2026-08-29.'), {
    vendor: 'Acme-abc9 Industries Ltd.', amount: 503.41, currency: 'EUR', date: '2026-08-29',
  });
  assert.deepEqual(extractInvoice('Vendor: Acme-013f Industries Ltd.\nBalance due USD 7,432.18\nPayment due 2026-12-08'), {
    vendor: 'Acme-013f Industries Ltd.', amount: 7432.18, currency: 'USD', date: '2026-12-08',
  });
});

test('malformed invoice inputs cannot produce HTTP 500 or fabricated fields', () => {
  for (const value of ['', 'garbage', null, 42, {}, []]) assert.equal(extractInvoice(value), null);
});

async function startServer(dataDir) {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: '0', DATA_DIR: dataDir }, stdio: ['ignore', 'ignore', 'pipe'] });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
    child.stderr.on('data', (data) => {
      const match = data.toString().match(/on :(\d+)/);
      if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); }
    });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
  });
  return { child, base, stop: async () => { const ended = once(child, 'exit'); child.kill(); await ended; } };
}

test('HTTP ledger upload, independent students and recovery after process restart', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'tds-ledger-test-'));
  let server = await startServer(dataDir);
  const post = (path, body) => fetch(server.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    let response = await post('/ledger/learner%40example.invalid', { ledger: fixture });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).records, 6);
    response = await post('/answer/learner%40example.invalid', { question: 'Total revenue in North in March 2026?' });
    assert.deepEqual(await response.json(), { answer: 110 });
    response = await post('/answer/other%40example.invalid', { question: 'Total revenue?' });
    assert.equal(response.status, 404);
    response = await post('/s/learner%40example.invalid/extract', { text: 'Invoice from Acme-ab12 Industries Ltd. Total due: 99.75 GBP. Due date: 2026-11-12.' });
    assert.equal(response.status, 200);
    assert.ok((await response.json()).vendor.includes('Acme-ab12 Industries Ltd.'));
    for (const body of [{ text: '' }, { text: {} }, {}, null]) {
      response = await post('/s/learner%40example.invalid/extract', body);
      assert.equal(response.status, 422);
    }
    const tar = Buffer.alloc(3072);
    for (const [offset, name] of [[0, 'demo.cast'], [1024, 'demo.cast.jwt']]) {
      tar.write(name, offset);
      tar.write('00000000004\0', offset + 124);
      tar.write('test', offset + 512);
    }
    const archive = gzipSync(tar);
    response = await fetch(server.base + '/artifacts', { method: 'POST', body: archive });
    assert.equal(response.status, 201);
    const artifactUrl = (await response.json()).url;
    assert.deepEqual(Buffer.from(await (await fetch(server.base + artifactUrl)).arrayBuffer()), archive);
    response = await fetch(server.base + '/artifacts', { method: 'POST', body: 'not gzip' });
    assert.equal(response.status, 422);
    await server.stop();
    server = await startServer(dataDir);
    response = await post('/answer/learner%40example.invalid', { question: 'Total revenue in North in March 2026?' });
    assert.deepEqual(await response.json(), { answer: 110 });
  } finally { await server.stop(); await rm(dataDir, { recursive: true, force: true }); }
});
