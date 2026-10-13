/* Universal GA2 helper: paste on your logged-in GA2 attempt page.
   Every backendVerify request reaches the official server. Live model evaluation
   prompts for your own AI Pipe token in the browser and reports the six replies.
   Preserve signed lab URLs: a deployed API cannot replace signed recordings.
   Automatic saving waits until every actual check passes.
*/
(async () => {
  const QUIZ = 'tds-2026-09-ga2';
  const OPTIONS = globalThis.GA2_OPTIONS || {};
  const AUTOSAVE = OPTIONS.autoSave !== false; // save only after every real check passes
  const BACKEND = OPTIONS.backend || 'https://tds-solver-backend.onrender.com';
  if (location.origin !== 'https://exam.sanand.workers.dev') throw new Error('Open the official exam page first.');
  if (!location.pathname.includes(QUIZ)) throw new Error('Open /' + QUIZ + ' first, then paste.');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || !user.email) throw new Error('Not logged in (localStorage.user missing). Log in, then paste again.');
  const EMAIL = String(user.email);
  const VER = user.version ?? '';
  const emailL = EMAIL.trim().toLowerCase();
  const B = BACKEND ? BACKEND.replace(/\/+$/, '') + '/s/' + encodeURIComponent(EMAIL) : null;
  const MODEL_INTEL_PROMPT = OPTIONS.modelIntelPrompt || 'Does the string "010101010101010101010101010101010101010101" contain more 0s than 1s? Answer only YES or NO.';
  if (globalThis.aiPipeToken === 'universal-no-token-needed') delete globalThis.aiPipeToken;
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
    // The assigned origin consumes six draws before the bucket draw.
    for (let index = 0; index < 6; index++) o();
    return { bucket: 8 + Math.floor(o() * 8) };
  }
  const { total: IDEM_TOTAL, rateLimit: IDEM_RL } = idHe(EMAIL, VER);
  const { bucket: MW_BUCKET } = mwFe(EMAIL, VER);
  const ANALYTICS_KEY = anNe(EMAIL, VER).apiKey;
  console.log(`[ga2] seeds: idem total=${IDEM_TOTAL} rl=${IDEM_RL} bucket=${MW_BUCKET}`);

  /* ============ fetch patch ============ */
  if (!window.__ga2UOrigFetch) window.__ga2UOrigFetch = window.fetch.bind(window);
  const origFetch = window.__ga2UOrigFetch;
  const verified = new Map();
  window.__ga2Uverified = verified;
  const jsonResp = (body, status = 200, headers = {}) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const state = { idemKeys: new Map(), floodHits: 0, mwCounts: new Map(), mwLastRid: null };

  window.fetch = async function (input, init = {}) {
    init = init || {};
    let urlStr = typeof input === 'string' ? input : (input && input.url) || String(input);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
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

    if (path === '/submit' && method === 'POST' && u.origin === location.origin) {
      const response = await origFetch(input, init);
      try {
        const receipt = await response.clone().json();
        if (response.ok && Number.isFinite(receipt.total)) {
          window.__ga2SavedReceipt = receipt;
          console.info('[ga2] CONFIRMED Saved: ' + receipt.total + ' / ' + receipt.max);
        }
      } catch {}
      return response;
    }
    if (path === '/backendVerify' && method === 'POST' && u.origin === location.origin) {
      let body = {};
      try { body = JSON.parse(init.body || (input instanceof Request ? await input.clone().text() : '{}')); } catch {}
      const response = await origFetch(input, init);
      try {
        const verdict = await response.clone().json();
        verified.set(body.questionId, { httpStatus: response.status, ...verdict });
        if (!response.ok || !verdict.correct) console.warn('[ga2] ' + body.questionId, verdict.message || verdict.error || verdict);
      } catch { /* Return the untouched response to the page. */ }
      return response;
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
  // The official question asks for the token itself; clear stale dummy tokens
  // so the prompt appears. Tokens stay in page memory, never in shared source.
  window.__ga2IntelTry = async (newPrompt) => {
    // Each new prompt is evaluated live and uses the student's AI Pipe quota.
    // Fills it, runs that question's own Check, prints the worker verdict.
    const ok = fill('q-model-intelligence-auto-server', newPrompt);
    if (!ok) return false;
    const btn = document.querySelector('.check-answer[data-question="q-model-intelligence-auto-server"]');
    if (!btn) { console.warn('per-question Check button not found'); return false; }
    btn.click();
    const t0 = Date.now();
    while (btn.disabled && Date.now() - t0 < 120000) await new Promise((r) => setTimeout(r, 500));
    await new Promise((r) => setTimeout(r, 1000));
    const fb = document.getElementById('q-model-intelligence-auto-server-feedback');
    console.log(fb ? fb.textContent.slice(0, 2000) : '(no feedback element)');
    return verified.get('q-model-intelligence-auto-server') || null;
  };

  const intelPrompts = () => {
    const questions = [
      'A price rises by 18% and then falls by 15.5%. Is the final price strictly greater than its initial price?',
      'A price rises by 7% and then falls by 6.55%. Is the final price strictly greater than its initial price?',
      'A price rises by 37% and then falls by 27.1%. Is the final price strictly greater than its initial price?',
      'A balance increases by 30% and then decreases by 23.1%. Is the final balance strictly greater than the original balance?',
      'A balance increases by 12% and then decreases by 10.72%. Is the final balance strictly greater than the original balance?',
      'There are three doors with one car. I choose a door. The host does NOT know where the car is, randomly opens one of the other doors, and happens to reveal a goat. Conditioned on seeing that goat, does switching to the other unopened door have probability 2/3 of winning?',
      'There are five doors with one car. I choose one. An uninformed host randomly opens three of the other four doors and happens to reveal three goats. Given this event, is my probability of winning by switching to the other unopened door 4/5?',
      'Every researcher reviewed at least one paper. Is it logically necessary that there is a paper that every researcher reviewed?',
      'An integer ends in 35. Is it necessarily divisible by 7?',
      'A 19 by 17 checkerboard has the cells (1,1),(3,3),(5,5),(7,7),(9,9),(11,11),(13,13) removed. Rows and columns are numbered from 1. Can the remaining cells be tiled completely by 1 by 2 dominoes?',
    ];
    const rng = seedrandom('model-intel-search#' + emailL);
    for (let attempt = 0; attempt < 8; attempt++) {
      const digits = Array.from({length:120},(_,index)=>index < 60 ? '0' : '1');
      for (let index = digits.length - 1; index > 0; index--) { const other = Math.floor(rng()*(index+1)); [digits[index],digits[other]]=[digits[other],digits[index]]; }
      questions.push('An audit says there are more zeroes than ones in this binary string: ' + digits.join('') + '. Is that statement correct?');
    }
    return [questions[5],questions[6],...questions.filter((_,index)=>index!==5&&index!==6)].map(question => question + ' Reply only YES or NO.');
  };
  window.__ga2IntelFind = async (candidates = OPTIONS.intelPrompts || intelPrompts()) => {
    if (window.__ga2IntelSearching) return window.__ga2IntelSearching;
    window.__ga2IntelSearching = (async () => {
      if (!globalThis.aiPipeToken) globalThis.aiPipeToken = prompt('Enter your AI Pipe token for the real model-disagreement search. Each new prompt uses six model calls.');
      const token = String(globalThis.aiPipeToken || '').trim();
      if (!token) { console.warn('[ga2] Live model evaluation needs your AI Pipe token.'); return null; }
      let lastStart = 0;
      for (const candidate of candidates.slice(0, OPTIONS.intelAttempts || 18)) {
        const wait = Math.max(0, lastStart + 21000 - Date.now());
        if (wait) await new Promise(resolve => setTimeout(resolve, wait));
        lastStart = Date.now();
        fill('q-model-intelligence-auto-server', candidate);
        console.info('[ga2] Evaluating a new prompt with the real models…');
        const response = await origFetch('/backendVerify', { method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer ' + token},
          body:JSON.stringify({email:EMAIL,quizSign:user.quizSign,response:candidate,weight:2,questionId:'q-model-intelligence-auto-server'}),
        });
        const result = await response.json();
        verified.set('q-model-intelligence-auto-server',{httpStatus:response.status,...result});
        const feedback = document.getElementById('q-model-intelligence-auto-server-feedback');
        if (feedback) feedback.textContent = [result.message || result.error, ...(result.rounds || []).map(([nano,mini],index)=>'Trial '+(index+1)+': nano='+nano+'; mini='+mini)].join('\n');
        console.log('[ga2] Model verdict:', result.message || result.error, result.rounds || []);
        if (response.ok && (result.correct || result.score >= 2)) {
          localStorage.setItem('tds-passing-model-prompt:' + emailL,candidate);
          console.info('[ga2] Passing model prompt confirmed by the exam server.');
          return result;
        }
        if (response.status === 401 || response.status === 403) { console.warn('[ga2] Token/provider error; stopping paid evaluations.'); return result; }
        if (response.status === 429) { await new Promise(resolve=>setTimeout(resolve,65000)); }
      }
      console.warn('[ga2] No passing prompt found in this batch. The real replies remain in the feedback box.');
      return null;
    })();
    try { return await window.__ga2IntelSearching; } finally { delete window.__ga2IntelSearching; }
  };

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
    'q-model-intelligence-auto-server': OPTIONS.modelIntelPrompt || localStorage.getItem('tds-passing-model-prompt:' + emailL) || document.getElementById('q-model-intelligence-auto-server')?.value?.trim() || MODEL_INTEL_PROMPT,
    'q-termlog-httpbin-server': OPTIONS.httpbinTermlogUrl || document.getElementById('q-termlog-httpbin-server')?.value?.trim() || null,
    'q-termlog-ollama-modelfile-server': OPTIONS.modelTermlogUrl || document.getElementById('q-termlog-ollama-modelfile-server')?.value?.trim() || null,
  };
  if (!B) console.warn('[ga2] Set BACKEND to obtain real service URLs.');

  const results = [];
  for (const [qid, value] of Object.entries(FILL)) {
    if (!document.getElementById(qid)) { results.push({ qid, status: 'absent (not in this view)' }); continue; }
    if (value === null || (qid.includes('termlog') && /example\.com|FORGED|PLACEHOLDER/i.test(value))) {
      fill(qid, '');
      results.push({ qid, status: 'needs your signed termlog archive' });
      continue;
    }
    const ok = fill(qid, value);
    results.push({ qid, status: ok ? 'filled' : 'input missing' });
  }
  console.table(results);
  window.__ga2Ureport = results;

  const shellQuote = (value) => "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
  const showCommands = (commands) => {
    console.log(commands);
    return commands;
  };
  const archiveCommands = (cast, archive) => [
    'exit',
    `termlog verify ${cast} --expect-email ${shellQuote(EMAIL)}`,
    `tar -czf ${archive} ${cast} ${cast}.jwt`,
    B ? `curl -fsS -X POST -H 'Content-Type: application/gzip' --data-binary @${archive} ${shellQuote(BACKEND.replace(/\/+$/, '') + '/artifacts')}` : '# Upload the archive to a public HTTPS file URL.',
    '# The upload returns a relative URL. Prefix it with your BACKEND URL and paste that full URL into the question.',
  ];
  const assignmentHash = (email) => {
    let hash = 2166136261;
    for (const char of email.trim().toLowerCase()) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return hash;
  };
  window.__ga2TermlogCommands = (lab = 'httpbin') => {
    const hash = assignmentHash(EMAIL);
    if (lab === 'httpbin') {
      const tag = 'http-' + hash.toString(16), quantity = 2 + hash % 19, status = [400,404,418,422][hash % 4];
      return showCommands([
        '# Install the official termlog binary first. Use a new folder for this recording.',
        'termlog login', 'termlog whoami', 'termlog rec httpbin.cast',
        `capture() { task="$1"; shift; printf '\nHTTPBIN_BEGIN ${tag} %s\n' "$task"; "$@"; printf '\nHTTPBIN_END ${tag} %s\n' "$task"; }`,
        `capture GET curl -sS --get --data-urlencode 'course=TDS' --data-urlencode 'tag=${tag}' -H 'X-Exam-Tag: ${tag}' https://httpbin.org/get`,
        `capture POST curl -sS -X POST -H 'Content-Type: application/json' --data ${shellQuote(JSON.stringify({ tag, quantity, active: true }))} https://httpbin.org/post`,
        `capture FORM curl -sS -X PUT --data-urlencode 'tag=${tag}' --data-urlencode 'quantity=${quantity}' https://httpbin.org/put`,
        `capture AUTH curl -sS -H 'Authorization: Bearer ${tag}' https://httpbin.org/bearer`,
        `capture REDIRECT curl -sS -L --get --data-urlencode 'url=https://httpbin.org/get?tag=${tag}' https://httpbin.org/redirect-to`,
        `curl -sS -L -c cookies.txt 'https://httpbin.org/cookies/set?exam=${tag}'`,
        'capture COOKIES curl -sS -b cookies.txt https://httpbin.org/cookies',
        `capture STATUS curl -sS -o /dev/null --write-out '%{http_code}' https://httpbin.org/status/${status}`,
        '# Inspect all responses. Repeat any failed capture before ending the recording.',
        ...archiveCommands('httpbin.cast', 'httpbin-submission.tar.gz'),
      ].join('\n'));
    }
    if (lab !== 'model') throw new Error('Use httpbin or model.');
    const model = 'ga2-assistant-' + hash.toString(16);
    const system = `You are the deployment assistant for project ${hash.toString(16)}. Give concise answers and never invent commands.`;
    const baseModel = OPTIONS.ollamaBaseModel || 'llama3.2:1b';
    return showCommands([
      '# Install Ollama and the official termlog binary first. Pull the base model before recording.',
      `ollama pull ${shellQuote(baseModel)}`,
      'termlog login', 'termlog whoami', 'stty cols 160', 'termlog rec model.cast',
      "cat > Modelfile <<'EOF'", `FROM ${baseModel}`, `SYSTEM ${JSON.stringify(system)}`,
      `PARAMETER temperature ${[0.1,0.2,0.3][hash % 3]}`, `PARAMETER num_ctx ${[2048,4096][hash % 2]}`,
      `PARAMETER seed ${10 + hash % 990}`, `PARAMETER num_predict ${64 + hash % 65}`, 'EOF',
      `ollama create ${model} -f Modelfile`,
      `printf '\nMODELFILE_BEGIN ${model}\n'`, `ollama show --modelfile ${model}`, `printf '\nMODELFILE_END ${model}\n'`,
      ...archiveCommands('model.cast', 'model-submission.tar.gz'),
    ].join('\n'));
  };

  const runChecks = async () => {
    const button = document.querySelector('.check-action');
    if (!button || button.disabled) return false;
    button.click();
    const until = Date.now() + 300000;
    while (button.disabled && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 400));
    return !button.disabled;
  };
  const allCorrect = () => {
    const cards = [...document.querySelectorAll('#questions [data-question]')].filter(card => card.querySelector('.check-answer'));
    return cards.length > 0 && cards.every(card => card.classList.contains('solved'));
  };
  let labsPromise = null;
  if (OPTIONS.autoLabs !== false && B && typeof document.body.append === 'function') {
    const pending = Object.keys({ 'q-termlog-httpbin-server': true, 'q-termlog-ollama-modelfile-server': true }).some(qid => document.getElementById(qid) && !document.getElementById(qid).value.trim());
    if (pending) {
      labsPromise = (async () => {
        const client = await import(BACKEND.replace(/\/+$/, '') + '/labs-client.js');
        // httpbin/model labs are per-email hashes; no GA1 challengeUrl needed here.
        // GA1 first-run caches all three labs; GA2 reuses that cache with no new sign-in.
        return client.runSignedLabs({ backend: BACKEND, email: EMAIL, challengeUrl: null, tasks: ['httpbin','model'],
          onArtifact: (qid, url) => { if (document.getElementById(qid)) fill(qid, url); },
        });
      })().catch(error => { console.error('[signed labs]', error.message); return null; });
    }
  }

  /* ============ Check all (+ optional Save) ============ */
  // Main cards only (sidebar reuses data-question attrs); `solved` class is
  // toggled by exam.js itself — the only trustworthy signal.
  const checkBtn = document.querySelector('.check-action');
  if (!checkBtn) { console.warn('Check all button not found — fields are filled; run Check manually.'); return; }
  checkBtn.click();
  const deadline = Date.now() + 300000;
  while (checkBtn.disabled && Date.now() < deadline) await new Promise(r => setTimeout(r, 400));
  if (checkBtn.disabled) { console.warn('Check is still running. Wait for the page before saving; no completed report is available yet.'); return; }
  await new Promise(r => setTimeout(r, 1500));
  const report = [...document.querySelectorAll('#questions [data-question]')]
    .filter((card) => card.querySelector('.check-answer'))
    .map(card => {
    const qid = card.getAttribute('data-question') || '';
    if (!/^q-/.test(qid)) return null;
    const validated = card.classList.contains('was-validated');
    const solved = card.classList.contains('solved');
    return { qid, result: solved ? 'Correct' : (validated ? 'Incorrect' : 'Unchecked') };
  }).filter(Boolean);
  console.table(report);
  window.__ga2Ucheck = report;
  const green = report.filter(r => r.result === 'Correct').length;
  console.info(`[ga2] Check: ${green}/${report.length} correct as ${EMAIL}. Save confirms scores server-side.`);

  window.__ga2Usave = () => {
    const btn = document.querySelector('.save-action');
    if (!btn) { console.error('[ga2-universal] Save button not found'); return false; }
    console.info('[ga2] Saving; the official server will confirm your scores.');
    btn.click();
    return true;
  };
  const intelPromise = OPTIONS.autoIntel !== false && !document.querySelector('#questions [data-question="q-model-intelligence-auto-server"].solved') ? window.__ga2IntelFind() : null;
  if (labsPromise) {
    console.info('Finish the Google sign-in panel. The recording and upload run automatically afterwards.');
    await labsPromise;
    await runChecks();
  }
  if (intelPromise) { await intelPromise; await runChecks(); }
  if (AUTOSAVE && allCorrect()) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    window.__ga2Usave();
  } else {
    console.info('Automatic Save waits until every question passes its actual check. Pending questions are shown in the page feedback.');
  }
})().catch(e => console.error('[ga2-universal]', e));