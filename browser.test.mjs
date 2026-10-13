import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import seedrandom from 'seedrandom';

class Input {
  constructor(value = '') { this.current = value; }
  get value() { return this.current; }
  set value(value) { this.current = value; }
  dispatchEvent() {}
}

async function runHelper(ga, fields, fetch) {
  const logs = [];
  const inputs = Object.fromEntries(Object.entries(fields).map(([id, value]) => [id, new Input(value)]));
  const source = (await readFile(new URL(`./solvers/tds-2026-09-${ga}-console-universal.js`, import.meta.url), 'utf8'))
    .replace("await import('https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/+esm')", '__seedModule');
  const originalVerify = async () => false;
  const patchedVerify = Object.assign(async () => true, { __ga1U: true, __orig: originalVerify });
  const subtlePrototype = { verify: patchedVerify };
  const context = vm.createContext({
    __seedModule: { default: seedrandom }, fetch,
    crypto: { subtle: Object.create(subtlePrototype) },
    document: { getElementById: (id) => inputs[id] || null, querySelector: () => null, body: { textContent: '' } },
    localStorage: { getItem: (key) => key === 'user' ? JSON.stringify({ email: 'learner@example.invalid', quizSign: 'fresh-session-signature' }) : null, setItem() {} },
    location: { origin: 'https://exam.sanand.workers.dev', pathname: '/tds-2026-09-' + ga },
    HTMLInputElement: Input, HTMLTextAreaElement: class {},
    console: Object.fromEntries(['log', 'info', 'warn', 'error', 'table'].map((name) => [name, (...args) => logs.push([name, ...args])])),
    Response, Request, Headers, URL, AbortSignal, TextEncoder, TextDecoder, Event, Blob,
    setTimeout, clearTimeout,
    aiPipeToken: 'universal-no-token-needed',
    prompt: () => { throw new Error('A token must be requested by the official grader, not stored in source.'); },
  });
  context.window = context;
  await vm.runInContext(source, context);
  assert.equal(logs.filter(([kind, prefix]) => kind === 'error' && /^\[ga[12]-universal\]$/.test(prefix)).length, 0);
  return { context, inputs, logs, originalVerify };
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const order = (id) => ({ id: 'ORD-' + id, amount: id + 1, currency: 'USD', status: 'paid', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-02T00:00:00Z' });
const rates = { usd_per_unit: { USD: 1, EUR: 1.1, INR: 0.01 } };

for (const ga of ['ga1', 'ga2']) {
  test(`${ga}: failed server validation remains failed, including Request objects`, async () => {
    let calls = 0;
    const { context, originalVerify } = await runHelper(ga, {}, async (input) => {
      calls++;
      if (input instanceof Request) await input.text();
      return json({ correct: false, score: 0, message: 'Actual server rejection' });
    });
    const response = await context.fetch(new Request('https://exam.sanand.workers.dev/backendVerify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: 'q-live-test', weight: 4 }),
    }));
    assert.equal((await response.json()).correct, false);
    assert.equal(context[`__${ga}Uverified`].get('q-live-test').score, 0);
    assert.equal(calls, 1);
    assert.equal(context.aiPipeToken, undefined);
    if (ga === 'ga1') assert.equal(Object.getPrototypeOf(context.crypto.subtle).verify, originalVerify);
  });
}

test('GA1 downloads the complete NDJSON export with rates, sends no signature to the backend, and preserves a signed lab URL', async () => {
  let uploaded, exports = 0;
  const orders = Array.from({ length: 4250 }, (_, id) => order(id));
  const { inputs } = await runHelper('ga1', {
    'q-ledger-agent-server': '', 'q-termlog-rec-server': 'https://files.example.invalid/my-signed-lab.tar.gz',
  }, async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/questionData') {
      assert.equal(url.searchParams.get('quizSign'), 'fresh-session-signature');
      const path = url.searchParams.get('path');
      if (path === '/') return json({ links: { export: '/questionData?path=%2Fexport&quizSign=old-signature', rates: '/questionData?path=%2Frates' } });
      if (path === '/rates') return json(rates);
      if (path === '/export') { exports++; return new Response(orders.map((row) => JSON.stringify(row)).join('\n')); }
    }
    if (url.pathname.startsWith('/ledger/')) {
      uploaded = JSON.parse(init.body);
      return json({ records: uploaded.ledger.orders.length });
    }
    throw new Error('Unexpected request: ' + url);
  });
  assert.equal(exports, 1);
  assert.equal(uploaded.ledger.orders.length, 4250);
  assert.deepEqual(uploaded.ledger.rates, rates);
  assert.ok(!JSON.stringify(uploaded).includes('signature'));
  assert.equal(inputs['q-ledger-agent-server'].value, 'https://tds-solver-backend.onrender.com/answer/learner%40example.invalid');
  assert.equal(inputs['q-termlog-rec-server'].value, 'https://files.example.invalid/my-signed-lab.tar.gz');
});

test('GA1 export failure follows all 85 order pages without truncation', async () => {
  let uploaded, pages = 0;
  await runHelper('ga1', { 'q-ledger-agent-server': '' }, async (input, init) => {
    const url = new URL(String(input));
    const path = url.searchParams.get('path');
    if (path === '/') return json({ links: { orders: '/questionData?path=%2Forders&page=1' } });
    if (path === '/rates') return json(rates);
    if (path === '/export') return json({ error: 'Export temporarily unavailable' }, 503);
    if (path === '/orders') {
      const page = Number(url.searchParams.get('page') || 1);
      pages++;
      return json({ page, pages: 85, orders: [order(page)], next: page === 85 ? null : '/questionData?path=%2Forders&page=' + (page + 1) });
    }
    if (url.pathname.startsWith('/ledger/')) { uploaded = JSON.parse(init.body); return json({ records: 85 }); }
    throw new Error('Unexpected request: ' + url);
  });
  assert.equal(pages, 85);
  assert.equal(uploaded.ledger.orders.length, 85);
});

test('GA2 keeps genuine lab URLs and a previously selected model prompt across reruns', async () => {
  const { inputs, context } = await runHelper('ga2', {
    'q-termlog-httpbin-server': 'https://files.example.invalid/httpbin.tar.gz',
    'q-termlog-ollama-modelfile-server': 'https://files.example.invalid/model.tar.gz',
    'q-model-intelligence-auto-server': 'My previously verified prompt. Reply only YES or NO.',
  }, async () => json({ correct: false }));
  assert.equal(inputs['q-termlog-httpbin-server'].value, 'https://files.example.invalid/httpbin.tar.gz');
  assert.equal(inputs['q-termlog-ollama-modelfile-server'].value, 'https://files.example.invalid/model.tar.gz');
  assert.equal(inputs['q-model-intelligence-auto-server'].value, 'My previously verified prompt. Reply only YES or NO.');
  const commands = context.__ga2TermlogCommands('httpbin');
  assert.ok(commands.includes('HTTPBIN_BEGIN http-'));
  assert.ok(commands.includes('capture STATUS curl'));
  assert.ok(context.__ga2TermlogCommands('model').includes('ollama show --modelfile ga2-assistant-'));
});

test('missing or placeholder signed archives are left pending rather than replaced with fake URLs', async () => {
  const { inputs } = await runHelper('ga2', {
    'q-termlog-httpbin-server': 'https://example.com/submission.tar.gz',
    'q-termlog-ollama-modelfile-server': '',
  }, async () => json({}));
  assert.equal(inputs['q-termlog-httpbin-server'].value, '');
  assert.equal(inputs['q-termlog-ollama-modelfile-server'].value, '');
});
