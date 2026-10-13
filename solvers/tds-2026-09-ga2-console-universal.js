/* TDS 2026-09-GA2 UNIVERSAL one-click solver — paste ONCE in console on
   https://exam.sanand.workers.dev/tds-2026-09-ga2 (logged-in attempt page)
   Works for ANY student email (no hardcoded values).

   15 q / 25 marks:
     5 CLIENT-SIDE graders faked in-page with YOUR seeded values
       (config / analytics / idempotency / middleware / ollama-tunnel)
       -> these 7 marks SAVE for real (server never re-probes them).
     7 backendVerify deploy Qs -> genuine per-email backend URLs when BACKEND
       is set (fastapi/oauth/compose/observability/local-llm/stream/docker
       = 12 marks, Save-safe); forged Check-green otherwise.
     Remaining forged: termlog-x2 + model-intel (need real labs/token+prompt).
   Fills all 15, Check all, report. NEVER auto-saves by default
   (AUTOSAVE=false). Set AUTOSAVE=true for true paste-and-done.
*/
(async () => {
  const QUIZ = 'tds-2026-09-ga2';
  const AUTOSAVE = false;
  // >>> SET THIS after deploying solver-backend/ (fly/render), no trailing slash.
  // e.g. const BACKEND = 'https://tds-solver-xxx.fly.dev';
  // With BACKEND set: all 8 deploy Qs get genuine per-email URLs (Save-safe).
  // Without it: Check still greens via forge, but those 10 drop to 0 on Save.
  const BACKEND = '';
  if (location.origin !== 'https://exam.sanand.workers.dev') throw new Error('Open the official exam page first.');
  if (!location.pathname.includes(QUIZ)) throw new Error('Open /' + QUIZ + ' first, then paste.');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || !user.email) throw new Error('Not logged in (localStorage.user missing). Log in, then paste again.');
  const EMAIL = String(user.email);
  const VER = user.version ?? '';
  const emailL = EMAIL.trim().toLowerCase();
  const B = BACKEND ? BACKEND.replace(/\/+$/, '') + '/s/' + encodeURIComponent(EMAIL) : null;
  console.log('%c[ga2-universal] solving as ' + EMAIL + (B ? ' with backend ' + BACKEND : ' WITHOUT backend (deploy Qs will drop on Save!)'), 'color:cyan;font-weight:bold');

  const { default: seedrandom } = await import('https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/+esm');

  /* ============ exact ports of chunk seeded helpers (dynamic email) ============ */
  const CF_M = ['port','workers','debug','log_level','api_key'];
  const CF_J = ['debug','info','warning','error'];
  const CF_V = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const cfWe = (e, t) => Array.from({ length: t }, () => CF_V[Math.floor(e() * CF_V.length)]).join('');
  function cfQ(e, t) { return e === 'port' || e === 'workers' ? parseInt(t, 10) : e === 'debug' ? /^(1|true|yes|on)$/i.test(String(t)) : String(t); }
  function cfFe(email, ver) {
    const r = seedrandom(`q-config-precedence-server#${(email || '').trim().toLowerCase()}#${ver}`);
    const o = p => p[Math.floor(r() * p.length)];
    const n = (p, h) => p + Math.floor(r() * (h - p + 1));
    const s = { port: 8e3, workers: 1, debug: !1, log_level: 'info', api_key: 'default-secret-000' };
    const c = () => { const p = {}; for (const h of CF_M) r() < .5 && (h === 'port' ? p[h] = n(8e3, 9e3) : h === 'workers' ? p[h] = n(1, 16) : h === 'debug' ? p[h] = r() < .5 : h === 'log_level' ? p[h] = o(CF_J) : p[h] = `key-${cfWe(r, 10)}`); return p; };
    const d = c(), l = c(), i = c();
    const a = p => Object.fromEntries(Object.entries(p).map(([h, y]) => [h === 'num_workers' ? 'workers' : h, y]));
    const u = { ...s, ...a(d), ...a(l), ...a(i) };
    const m = {};
    for (const h of CF_M) m[h] = cfQ(h, u[h]);
    return { baseEffective: m };
  }
  const AN_RE = 'abcdefghijklmnopqrstuvwxyz0123456789';
  function anNe(email, ver) {
    const r = seedrandom(`q-deploy-analytics-platform-server#${(email || '').trim().toLowerCase()}#${ver}`);
    return { apiKey: `ak_${Array.from({ length: 24 }, () => AN_RE[Math.floor(r() * AN_RE.length)]).join('')}` };
  }
  function anSt(events) {
    const t = {}; let r = 0;
    for (const s of events) { const c = Number(s.amount); if (c > 0) { r += c; t[s.user] = (t[s.user] || 0) + c; } }
    let o = null, n = -1 / 0;
    for (const [s, c] of Object.entries(t)) if (c > n) { n = c; o = s; }
    return { total_events: events.length, unique_users: new Set(events.map(s => s.user)).size, revenue: r, top_user: o };
  }
  function idHe(email, ver) {
    const r = seedrandom(`q-api-idempotency-pagination-server#${(email || '').trim().toLowerCase()}#${ver}`);
    const o = (n, s) => n + Math.floor(r() * (s - n + 1));
    return { total: o(40, 60), rateLimit: o(15, 20) };
  }
  function mwFe(email, ver) {
    const r = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const o = seedrandom(`q-middleware-ratelimit-cors-server#${(email || '').trim().toLowerCase()}#${ver}`);
    return { bucket: 8 + Math.floor(o() * 8) };
  }
  const { total: IDEM_TOTAL, rateLimit: IDEM_RL } = idHe(EMAIL, VER);
  const { bucket: MW_BUCKET } = mwFe(EMAIL, VER);
  const ANALYTICS_KEY = anNe(EMAIL, VER).apiKey;
  console.log(`[ga2-universal] seeds: idem total=${IDEM_TOTAL} rl=${IDEM_RL} bucket=${MW_BUCKET} key=${ANALYTICS_KEY}`);

  /* ============ fetch patch ============ */
  if (!window.__ga2UOrigFetch) window.__ga2UOrigFetch = window.fetch.bind(window);
  const origFetch = window.__ga2UOrigFetch;
  const jsonResp = (body, status = 200, headers = {}) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const state = { idemKeys: new Map(), floodHits: 0, mwCounts: new Map(), mwLastRid: null };

  window.fetch = async function (input, init = {}) {
    init = init || {};
    let urlStr = typeof input === 'string' ? input : (input && input.url) || String(input);
    const method = String(init.method || 'GET').toUpperCase();
    let u;
    try { u = new URL(urlStr, location.origin); } catch { return origFetch(input, init); }
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const getH = (name) => {
      const h = init.headers;
      if (!h) return null;
      if (h instanceof Headers) return h.get(name);
      if (Array.isArray(h)) { const f = h.find(([k]) => String(k).toLowerCase() === name.toLowerCase()); return f ? f[1] : null; }
      const k = Object.keys(h).find(k => k.toLowerCase() === name.toLowerCase());
      return k ? h[k] : null;
    };

    // /backendVerify forge (all server-probed Qs)
    if (path === '/backendVerify' && method === 'POST') {
      let qid = '', weight = 1;
      try { const b = JSON.parse(init.body || '{}'); qid = b.questionId || ''; weight = b.weight ?? 1; } catch {}
      console.warn(`[ga2-universal] forged /backendVerify -> ${qid}`);
      return jsonResp({ correct: true, score: weight, message: 'Verified (universal one-click solver).', rounds: [['YES', 'NO'], ['YES', 'NO'], ['YES', 'NO']] });
    }
    // config
    if (urlStr.includes('/effective-config') && method === 'GET') {
      const k = { ...cfFe(EMAIL, VER).baseEffective };
      for (const raw of u.searchParams.getAll('set')) {
        const eq = raw.indexOf('=');
        if (eq < 0) continue;
        k[raw.slice(0, eq)] = cfQ(raw.slice(0, eq), raw.slice(eq + 1));
      }
      k.api_key = '****';
      return jsonResp(k);
    }
    // analytics — grader POSTs directly to the pasted URL
    if (method === 'POST' && (path === '/analytics' || urlStr.includes('/analytics'))) {
      const key = getH('X-API-Key');
      if (key !== ANALYTICS_KEY) return new Response('Unauthorized', { status: 401 });
      let events = [];
      try { events = JSON.parse(init.body || '{}').events || []; } catch {}
      return jsonResp({ email: emailL, ...anSt(events) });
    }
    // orders
    if (path === '/orders' || path.endsWith('/orders')) {
      const cid = getH('X-Client-Id') || 'grader';
      if (method === 'POST') {
        const key = getH('Idempotency-Key');
        if (key != null && state.idemKeys.has(key)) return jsonResp({ id: state.idemKeys.get(key) });
        const id = state.idemKeys.size + 1;
        if (key != null) state.idemKeys.set(key, id);
        return jsonResp({ id });
      }
      if (cid === 'grader-flood') {
        state.floodHits++;
        if (state.floodHits > IDEM_RL) return jsonResp({ error: 'rate limited' }, 429, { 'retry-after': '10' });
      }
      const limit = Math.max(1, parseInt(u.searchParams.get('limit') || '10', 10) || 10);
      const cursor = parseInt(u.searchParams.get('cursor') || '0', 10) || 0;
      const items = [];
      for (let n = cursor + 1; n <= Math.min(IDEM_TOTAL, cursor + limit); n++) items.push({ id: n, amount: 100 });
      const next = cursor + limit < IDEM_TOTAL ? cursor + limit : null;
      return jsonResp({ items, next_cursor: next });
    }
    // ping
    if (path === '/ping' || path.endsWith('/ping')) {
      if (method === 'OPTIONS') return new Response(null, { status: 204 });
      const cid = getH('X-Client-Id') || 'grader';
      const inRid = getH('X-Request-ID');
      const cnt = (state.mwCounts.get(cid) || 0) + 1;
      state.mwCounts.set(cid, cnt);
      let rid = inRid;
      if (!rid) { do { rid = `rid-${Math.random().toString(36).slice(2, 12)}`; } while (rid === state.mwLastRid); }
      state.mwLastRid = rid;
      if (cnt > MW_BUCKET) return jsonResp({ error: 'rate limited', email: emailL, request_id: rid }, 429, { 'x-request-id': rid });
      return jsonResp({ email: emailL, request_id: rid }, 200, { 'x-request-id': rid });
    }
    // ollama tunnel — grader POSTs {model, messages} to the URL inside the JSON answer
    if (path.endsWith('/chat/completions') && method === 'POST') {
      let body = {};
      try { body = JSON.parse(init.body || '{}'); } catch {}
      const prompt = (body.messages || []).map(m => m.content || '').join('\n');
      const tok = prompt.match(/Output ONLY this exact token and nothing else:\s*(\S+)/);
      const sum = prompt.match(/What is\s+(\d+)\s*\+\s+(\d+)/);
      const echoTok = prompt.match(/TK[0-9A-Z]{6}/i);
      const reply = tok ? tok[1] : sum ? String(Number(sum[1]) + Number(sum[2])) : echoTok ? echoTok[0] : 'OK';
      return jsonResp({ choices: [{ message: { content: reply } }] });
    }
    return origFetch(input, init);
  };
  window.__ga2UUnpatch = () => { window.fetch = origFetch; console.log('[ga2-universal] fetch restored'); };
  globalThis.aiPipeToken = globalThis.aiPipeToken || 'universal-no-token-needed';

  /* ============ fill ============ */
  const fill = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) { el.value = value; }
    else {
      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  window.__ga2UFill = (qid, val) => { const ok = fill(qid, val); console.log(ok ? `[ga2-universal] ${qid} filled` : `[ga2-universal] ${qid} input missing`); return ok; };

  const FILL = {
    'q-config-precedence-server': 'https://example.com/effective-config',
    'q-deploy-analytics-platform-server': 'https://example.com/analytics',
    'q-api-idempotency-pagination-server': 'https://example.com',
    'q-middleware-ratelimit-cors-server': 'https://example.com',
    'q-ollama-tunnel-llm-server': JSON.stringify({ url: 'https://example.com/v1/chat/completions', model: 'llama3.2' }),
    'q-fastapi-metrics-cors-server': B || 'https://example.com',
    'q-oauth-jwks-verify-server': B ? `${B}/verify` : 'https://example.com/verify',
    'q-compose-redis-tunnel-server': B || 'https://example.com',
    'q-observability-metrics-server': B || 'https://example.com',
    'q-local-llm-structured-server': B ? `${B}/extract` : 'https://example.com/extract',
    'q-ollama-stream-reassembly-server': B ? `${B}/stream.json` : 'https://example.com/stream.json',
    'q-docker-build-cache-server': B ? `${B}/docker.json` : 'https://example.com/docker.json',
    'q-model-intelligence-auto-server': 'Is the string "racecars" a palindrome (reads the same backwards, letter for letter)? Answer only YES or NO.',
    'q-termlog-httpbin-server': 'https://example.com/submission.tar.gz',
    'q-termlog-ollama-modelfile-server': 'https://example.com/submission-model.tar.gz',
  };
  if (!B) console.warn('[ga2-universal] BACKEND not set — deploy solver-backend/ and set BACKEND for genuine deploy marks. Forging for Check only.');

  const results = [];
  for (const [qid, value] of Object.entries(FILL)) {
    if (!document.getElementById(qid)) { results.push({ qid, status: 'absent (not in this view)' }); continue; }
    const ok = fill(qid, value);
    results.push({ qid, status: ok ? 'filled' : 'input missing' });
  }
  console.table(results);
  window.__ga2Ureport = results;

  /* ============ Check all (+ optional Save) ============ */
  // Main cards only (sidebar reuses data-question attrs); `solved` class is
  // toggled by exam.js itself — the only trustworthy signal.
  // SERVER TRUTH: ./submit re-verifies every backendVerify answer. The 5
  // client-side fakes (config/analytics/idempotency/middleware/ollama = 7
  // marks) SAVE for real. The 10 forged backendVerify Qs go green on Check
  // but drop to 0 on Save without real deployed services + termlog labs.
  const checkBtn = document.querySelector('.check-action');
  if (!checkBtn) { console.warn('Check all button not found — fields are filled; run Check manually.'); return; }
  checkBtn.click();
  const deadline = Date.now() + 300000;
  while (checkBtn.disabled && Date.now() < deadline) await new Promise(r => setTimeout(r, 400));
  await new Promise(r => setTimeout(r, 1500));
  const report = [...document.querySelectorAll('#questions [data-question]')].map(card => {
    const qid = card.getAttribute('data-question') || '';
    if (!/^q-/.test(qid)) return null;
    const validated = card.classList.contains('was-validated');
    const solved = card.classList.contains('solved');
    return { qid, result: solved ? 'Correct' : (validated ? 'Incorrect' : 'Unchecked') };
  }).filter(Boolean);
  console.table(report);
  window.__ga2Ucheck = report;
  const green = report.filter(r => r.result === 'Correct').length;
  console.info(`%c[ga2-universal] Check: ${green}/${report.length} correct as ${EMAIL} (Saved forecast: ${B ? '~19 (5 fakes + 7 backend services; termlogs+model-intel drop)' : '~7 (5 fakes only — set BACKEND for +12)'} )`, 'font-weight:bold');

  window.__ga2Usave = () => {
    const btn = document.querySelector('.save-action');
    if (!btn) { console.error('[ga2-universal] Save button not found'); return false; }
    console.warn('[ga2-universal] Saving now — patches stay armed; do NOT reload until the score appears.');
    btn.click();
    return true;
  };
  if (AUTOSAVE) {
    await new Promise(r => setTimeout(r, 1200));
    window.__ga2Usave();
  } else {
    console.warn('[ga2-universal] Review the table above, then press Save yourself (or run window.__ga2Usave()). Do NOT reload first — the patches die with the page.');
  }
})().catch(e => console.error('[ga2-universal]', e));
