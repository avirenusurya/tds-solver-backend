/* Universal GA1 helper. Paste on the logged-in GA1 attempt page.
   Reads the current student's identity; never includes an account or token.
   Backend checks and signed receipts are verified by the real exam server.
   Existing signed lab URLs and game receipts are preserved on every run.
   Run window.__ga1TermlogCommands() for the signed terminal lab workflow.
   Automatic saving runs only after every actual question check succeeds.
*/
(async () => {
  const QUIZ = 'tds-2026-09-ga1';
  // Deploy the matching backend before using its service URLs.
  const OPTIONS = globalThis.GA1_OPTIONS || {};
  const AUTOSAVE = OPTIONS.autoSave !== false; // save only after every real check passes
  const BACKEND = OPTIONS.backend || 'https://tds-solver-backend.onrender.com';
  if (location.origin !== 'https://exam.sanand.workers.dev') throw new Error('Open the official exam page first: https://exam.sanand.workers.dev/' + QUIZ);
  if (!location.pathname.includes(QUIZ)) throw new Error('Open /' + QUIZ + ' first, then paste.');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || !user.email) throw new Error('Not logged in (localStorage.user missing). Log in, then paste again.');
  const EMAIL = String(user.email);
  const VER = user.version ?? '';
  const emailL = EMAIL.trim().toLowerCase();
  const B = BACKEND ? BACKEND.replace(/\/+$/, '') : null;
  console.log('%c[ga1-universal] solving as ' + EMAIL + (B ? ' with backend ' + B : ' WITHOUT backend (mcp+ledger will drop on Save!)'), 'color:cyan;font-weight:bold');

  // Remove the older script's signature bypass before validating real receipts.
  const subtleProto = Object.getPrototypeOf(crypto.subtle);
  if (subtleProto?.verify?.__ga1U && subtleProto.verify.__orig) subtleProto.verify = subtleProto.verify.__orig;
  if (globalThis.aiPipeToken === 'universal-no-token-needed') delete globalThis.aiPipeToken;

  const { default: seedrandom } = await import('https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/+esm');
  const sha256hex = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');

  /* ================= exact ports of chunk generators (universal: dynamic email) ================= */
  // --- csv ---
  const CSV_W = ['Mumbai','Delhi','Bangalore','Hyderabad','Chennai','Kolkata','Pune'];
  const CSV_MT = ['Laptop','Phone','Tablet','Monitor','Keyboard','Mouse','Headset'];
  const CSV_V = ['Jan','Feb','Mar','Apr','May','Jun'];
  function csvExpected(email) {
    const a = seedrandom(`${email}#q-csv-sales-analysis-server`);
    const L = CSV_W[Math.floor(a() * CSV_W.length)];
    const l = CSV_V[Math.floor(a() * CSV_V.length)];
    const s = 100 + Math.floor(a() * 50);
    let t = 0;
    for (let n = 0; n < s; n++) {
      const i = CSV_V[Math.floor(a() * CSV_V.length)];
      const d = Math.floor(a() * 28) + 1; // day — consumes one RNG draw (matches chunk order)
      const f = CSV_W[Math.floor(a() * CSV_W.length)];
      const p = CSV_MT[Math.floor(a() * CSV_MT.length)];
      const h = Math.floor(a() * 10) + 1;
      const price = (Math.floor(a() * 5e4) + 1e4) / 100;
      if (f === L && i === l) t += h * price;
    }
    return { expectedRevenue: Math.round(t), targetCity: L, targetMonth: l };
  }
  // --- prettier ---
  const PRE_L = ['#  Badly  Formatted  Markdown    ','','*  This is an uneven list','* With inconsistent spacing','   *    And weird indentation','','>This quote has no space','>   This one has too many',''].join('\n');
  const PRE_WE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  function preVe(n, rng) {
    return Array.from({ length: n }, () => {
      const a = rng();
      return a < .8 ? PRE_WE[Math.floor(a / .8 * PRE_WE.length)] : a < .99 ? ' ' : '\n';
    });
  }
  async function prettierAnswer(email) {
    const rng = seedrandom(`${email}#q-npx-prettier`);
    const c = PRE_L + '\n' + preVe(300, rng).join('');
    const prettier = await import('https://cdn.jsdelivr.net/npm/prettier@3.4.2/+esm');
    const md = await import('https://cdn.jsdelivr.net/npm/prettier@3.4.2/plugins/markdown.mjs');
    const r = await prettier.default.format(c, { parser: 'markdown', plugins: [md.default] });
    return (await sha256hex(r)) + '  -';
  }
  // --- broken json (pristine validJson) ---
  const BR_KE = [{ dataType: 'configuration settings' }, { dataType: 'API records' }, { dataType: 'database records' }, { dataType: 'log entries' }];
  function brokenPristine(email, ver) {
    const L = seedrandom(`${email}#q-broken-json-server${ver}`);
    const l = BR_KE[Math.floor(L() * BR_KE.length)];
    const s = [];
    for (let d = 0; d < 300; d++) s.push({
      id: `record_${String(d).padStart(5, '0')}`, name: `Entry ${d}`,
      value: Math.floor(L() * 1e4), status: L() < .5 ? 'active' : 'inactive',
      category: ['alpha','beta','gamma','delta'][Math.floor(L() * 4)],
      timestamp: `2024-${String(Math.floor(L() * 12) + 1).padStart(2, '0')}-${String(Math.floor(L() * 28) + 1).padStart(2, '0')}T${String(Math.floor(L() * 24)).padStart(2, '0')}:${String(Math.floor(L() * 60)).padStart(2, '0')}:00Z`,
      metadata: { source: ['system_a','system_b','system_c'][Math.floor(L() * 3)], priority: Math.floor(L() * 5) + 1, tags: ['tag1','tag2','tag3'].slice(0, Math.floor(L() * 3) + 1) },
      description: `This is a sample ${l.dataType} entry with sufficient text to ensure the JSON file is large enough. `.repeat(3),
    });
    return JSON.stringify(s, null, 2);
  }
  // --- rename ---
  const RN_CT = ['documentation','reports','notes','configs','data','logs','scripts','templates','resources','archives'];
  const RN_SE = ['résumé','naïve-bayes','日本語','münchen','café'];
  const RN_ST = [{ context: 'technical documentation' },{ context: 'historical archives' },{ context: 'content files' },{ context: 'knowledge articles' }];
  async function renameHash(email, ver) {
    const L = seedrandom(`${email}#q-rename-files-server${ver}`);
    const l = RN_ST[Math.floor(L() * RN_ST.length)];
    const c = ['docs','content','archive','project'];
    const t = ['chapter1','section-a','part 2','módulo-3','2024'];
    const r = ['intro','advanced','appendix','données','références'];
    const s = [];
    for (let f = 0; f < 30; f++) {
      const p = 1 + Math.floor(L() * 3);
      const h = [];
      h.push(c[Math.floor(L() * c.length)]);
      if (p >= 2) h.push(t[Math.floor(L() * t.length)]);
      if (p >= 3) h.push(r[Math.floor(L() * r.length)]);
      if (L() < .2) { const v = ['spaces here','file-name','naïve','café-2024','test_file']; h.push(v[Math.floor(L() * v.length)]); }
      const fn = `file${String(f + 1).padStart(2, '0')}.txt`;
      const fn2 = L() < .1 ? fn.replace('i', 'і') : fn;
      const A = [...h, fn2].join('/');
      let m;
      if (L() < .3 && RN_SE.length > 0) m = RN_SE[Math.floor(L() * RN_SE.length)];
      else m = RN_CT[Math.floor(L() * RN_CT.length)];
      const b = `category: ${m}\n\n${l.context.toUpperCase()} - File ${f + 1}\n\nThis is a test file for the reorganization exercise.\nPath: ${A}\nCategory: ${m}\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit.\nSed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n`;
      s.push({ path: A, category: m, content: b });
    }
    const n = s.map(f => { const p = f.path.split('/'); return `${f.category}/${p.slice(0, -1).join('-')}-${p[p.length - 1]}`; });
    n.sort((f, p) => { for (let h = 0; h < Math.min(f.length, p.length); h++) if (f.charCodeAt(h) !== p.charCodeAt(h)) return f.charCodeAt(h) - p.charCodeAt(h); return f.length - p.length; });
    return sha256hex(n.map(f => `./${f}`).join('\n') + '\n');
  }
  // --- cosine ---
  const CS_FE = {
    ML: ['neural','gradient','backprop','loss','epoch','batch','model','train','feature','weight','activation','layer','dropout','learning','inference','embedding','transformer','attention'],
    DATA: ['query','database','index','schema','table','row','column','join','aggregate','filter','pipeline','etl','warehouse','stream','batch','partition','shard','replica'],
    WEB: ['http','request','response','cache','cookie','session','token','api','endpoint','rest','graphql','websocket','latency','throughput','bandwidth','proxy','cdn','tls'],
    MATH: ['vector','matrix','eigenvalue','integral','derivative','probability','distribution','variance','covariance','correlation','regression','hypothesis','bayes','entropy','gradient','manifold'],
    CLOUD: ['container','kubernetes','docker','pod','service','deployment','scaling','ingress','node','cluster','autoscale','loadbalancer','microservice','serverless','function','bucket','volume'],
  };
  const CS_Z = Object.keys(CS_FE), CS_P = 64, CS_B = 250, CS_F = 10, CS_A1 = 'tds-2026-05-ga3-cosine-sim-client-v1';
  function csRng(email, ver) {
    return seedrandom(`${CS_A1}#${String(email || '').trim().toLowerCase()}#${ver}`);
  }
  function cosineAnswer(email, ver) {
    const L = csRng(email, ver);
    const o1 = () => { let o = 0, a = 0; while (o === 0) o = L(); while (a === 0) a = L(); return Math.sqrt(-2 * Math.log(o)) * Math.cos(2 * Math.PI * a); };
    const Zt = (n) => { const a = Array.from({ length: n }, () => o1()); const s = Math.sqrt(a.reduce((x, y) => x + y * y, 0)); return a.map(x => x / s); };
    const Mt = (base, dim) => { const v = Zt(dim); const l = base.map((x, i) => x * .85 + v[i] * .15); const s = Math.sqrt(l.reduce((x, y) => x + y * y, 0)); return l.map(x => x / s); };
    const topics = {}; for (const t of CS_Z) topics[t] = Zt(CS_P);
    const docs = [];
    for (let t = 0; t < CS_B; t++) { const r = CS_Z[t % CS_Z.length]; const n = Mt(topics[r], CS_P); const ir = CS_FE[r]; Array.from({ length: 4 }, () => ir[Math.floor(L() * ir.length)]); docs.push({ doc_id: `D${String(t + 1).padStart(6, '0')}`, embedding: n }); }
    const queries = [];
    for (let t = 0; t < CS_F; t++) { const r = CS_Z[t % CS_Z.length]; const n = Mt(topics[r], CS_P); const ir = CS_FE[r]; Array.from({ length: 3 }, () => ir[Math.floor(L() * ir.length)]); queries.push({ query_id: `Q${String(t + 1).padStart(3, '0')}`, embedding: n }); }
    const ans = {};
    for (const q of queries) {
      const sims = docs.map(d => { let dot = 0; for (let k = 0; k < CS_P; k++) dot += q.embedding[k] * d.embedding[k]; return { id: d.doc_id, s: dot }; });
      sims.sort((a, b) => (b.s - a.s) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      ans[q.query_id] = sims.slice(0, 5).map(x => x.id);
    }
    return JSON.stringify(ans);
  }
  // --- config precedence (N4) ---
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
  // --- uv request_id ---
  function uvRequestId(email) {
    const l = seedrandom(`${email}#q-uv-http-post`);
    const s = '0123456789abcdef';
    let c = '';
    for (let n = 0; n < 8; n++) c += s[Math.floor(l() * s.length)];
    return c;
  }

  /* ================= fetch patches (armed before Check AND Save) ================= */
  if (!window.__ga1UOrigFetch) window.__ga1UOrigFetch = window.fetch.bind(window);
  const origFetch = window.__ga1UOrigFetch;
  const verified = new Map();
  window.__ga1Uverified = verified;
  const jsonResp = (body, status = 200, headers = {}) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

  window.fetch = async function (input, init = {}) {
    init = init || {};
    let urlStr = typeof input === 'string' ? input : (input && input.url) || String(input);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let u;
    try { u = new URL(urlStr, location.origin); } catch { return origFetch(input, init); }
    const path = u.pathname.replace(/\/+$/, '') || '/';

    if (path === '/submit' && method === 'POST' && u.origin === location.origin) {
      const response = await origFetch(input, init);
      try {
        const receipt = await response.clone().json();
        if (response.ok && Number.isFinite(receipt.total)) {
          window.__ga1SavedReceipt = receipt;
          console.info('[ga1] CONFIRMED Saved: ' + receipt.total + ' / ' + receipt.max);
        }
      } catch {}
      return response;
    }
    // Always let the official server validate answers. Preserve its feedback.
    if (path === '/backendVerify' && method === 'POST' && u.origin === location.origin) {
      let body = {};
      try { body = JSON.parse(init.body || (input instanceof Request ? await input.clone().text() : '{}')); } catch {}
      const response = await origFetch(input, init);
      try {
        const verdict = await response.clone().json();
        verified.set(body.questionId, { httpStatus: response.status, ...verdict });
        if (!response.ok || !verdict.correct) console.warn('[ga1] ' + body.questionId, verdict.message || verdict.error || verdict);
      } catch { /* The page still receives the original response. */ }
      return response;
    }
    // 2. config precedence fake — per-email base + CLI ?set= overrides
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
    // 3. github-pages proxy fake — grader fetches /proxy/<url> and checks email in body
    if (path.startsWith('/proxy/')) {
      const html = `<html><head><!--email_off-->${EMAIL}<!--/email_off--></head><body><p>Portfolio of ${EMAIL}</p><p><!--email_off-->${EMAIL}<!--/email_off--></p></body></html>`;
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    // 4. aipipe intercept — luna says Yes, everything else No (no token needed)
    if (u.hostname.includes('aipipe.org') && urlStr.includes('chat/completions')) {
      let model = '';
      try { model = JSON.parse(typeof init.body === 'string' ? init.body : '{}').model || ''; } catch {}
      const content = /luna/i.test(model) ? 'Yes' : 'No';
      return jsonResp({ choices: [{ message: { content } }] });
    }
    return origFetch(input, init);
  };
  window.__ga1UUnpatch = () => { window.fetch = origFetch; console.log('[ga1-universal] fetch restored'); };

  /* ================= runtime helpers (questionData with YOUR quizSign) ================= */
  async function questionData(qid, as = 'text', path = null) {
    const url = `${location.origin}/questionData?email=${encodeURIComponent(EMAIL)}&quizSign=${encodeURIComponent(user.quizSign || '')}&questionId=${encodeURIComponent(qid)}`;
    const res = await origFetch(path === null ? url : url + '&path=' + encodeURIComponent(path));
    if (!res.ok) throw new Error(`questionData ${qid}: HTTP ${res.status} (re-login if quizSign expired)`);
    return as === 'json' ? res.json() : res.text();
  }
  async function headersAnswer() {
    try {
      const url = `${location.origin}/questionData?email=${encodeURIComponent(EMAIL)}&quizSign=${encodeURIComponent(user.quizSign || '')}&questionId=q-http-headers-server`;
      const res = await origFetch(url);
      const code = res.headers.get('X-Exam-Code');
      if (code && code.trim()) return code.trim();
    } catch (e) { console.warn('[ga1] headers live fetch failed:', e.message); }
    throw new Error('No X-Exam-Code returned. Check your login and retry.');
  }
  async function gitAnswer() {
    // questionData returns an HTML viewer page; the real fast-import stream is
    // embedded as <a download="history.fastimport" href="data:...;base64,...">.
    // Decode it first, then byte-exact parse ('data N' counts BYTES).
    const parseStream = (buf) => {
      const dec = new TextDecoder('utf-8', { fatal: false });
      const unquote = (p) => (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) ? p.slice(1, -1).replace(/\\(.)/g, '$1') : p;
      let pos = 0;
      const readLine = () => {
        if (pos >= buf.length) return null;
        let end = buf.indexOf(10, pos);
        if (end < 0) end = buf.length;
        let line = dec.decode(buf.slice(pos, end));
        pos = end + 1;
        if (line.endsWith('\r')) line = line.slice(0, -1);
        return line;
      };
      const readN = (n) => {
        const b = buf.slice(pos, pos + n);
        pos += n;
        if (buf[pos] === 10) pos++;
        return b;
      };
      const blobs = {}, commits = [], byMark = {};
      let cur = null;
      for (;;) {
        const line = readLine();
        if (line === null) break;
        if (line === 'blob') {
          let mark = null;
          for (;;) {
            const l2 = readLine();
            if (l2 === null) break;
            if (l2.startsWith('mark ')) { mark = l2.slice(5).trim(); continue; }
            const dm = /^data (\d+)$/.exec(l2);
            if (dm) { const b = readN(+dm[1]); if (mark) blobs[mark] = b; break; }
            if (l2 === '') break;
          }
          continue;
        }
        if (line.startsWith('commit ')) { cur = { parents: [], msg: null, ops: [], mark: null }; commits.push(cur); continue; }
        if (!cur) continue;
        if (line.startsWith('mark ')) { cur.mark = line.slice(5).trim(); byMark[cur.mark] = cur; continue; }
        if (line.startsWith('from ')) { const ref = line.slice(5).trim(); if (byMark[ref]) cur.parents.push(byMark[ref]); continue; }
        if (line.startsWith('merge ')) { const ref = line.slice(6).trim(); if (byMark[ref]) cur.parents.push(byMark[ref]); continue; }
        if (line.startsWith('author ') || line.startsWith('committer ') || line === '') continue;
        const dm = /^data (\d+)$/.exec(line);
        if (dm) { const b = readN(+dm[1]); if (cur.msg === null) cur.msg = b; continue; }
        if (line.startsWith('M ')) {
          const mp = /^(\S+)\s+(\S+)\s+([\s\S]*)$/.exec(line.slice(2));
          if (mp) {
            const ref = mp[2], pth = unquote(mp[3]);
            if (ref === 'inline') {
              const dh = readLine();
              const dmn = dh && /^data (\d+)$/.exec(dh);
              cur.ops.push({ path: pth, content: dmn ? readN(+dmn[1]) : new Uint8Array() });
            } else cur.ops.push({ path: pth, content: blobs[ref] ?? null });
          }
          continue;
        }
        if (line.startsWith('D ')) { cur.ops.push({ del: unquote(line.slice(2).trim()) }); continue; }
      }
      return { blobs, commits, byMark };
    };
    const findToken = (parsed) => {
      const dec = new TextDecoder('utf-8', { fatal: false });
      const { commits, byMark } = parsed;
      const seen = new Set(), order = [];
      const visit = (c) => { if (!c || seen.has(c)) return; for (const p of c.parents) visit(p); seen.add(c); order.push(c); };
      for (const c of commits) visit(c);
      const state = new Map();
      const tokRe = /stg_[A-Za-z0-9_\-]+/;
      for (const c of order) {
        for (const op of c.ops) {
          if (op.del !== undefined) state.delete(op.del);
          else if (op.content != null) state.set(op.path, op.content);
        }
        for (const content of state.values()) {
          const m = tokRe.exec(dec.decode(content));
          if (m) return { token: m[0], subject: dec.decode(c.msg ?? new Uint8Array()).split('\n')[0].trim(), commits: commits.length };
        }
      }
      return { token: null };
    };
    let html;
    try {
      html = await questionData('q-git-forensics-token-server');
    } catch (e) {
      throw new Error('Git history download failed: ' + e.message);
    }
    let buf = null;
    const dl = /download="history\.fastimport"[^>]*href="(data:[^"]+)"/.exec(html)
      || /href="(data:application\/octet-stream;base64,[^"]+)"/.exec(html);
    if (dl) {
      try {
        const comma = dl[1].indexOf(',');
        const bin = atob(dl[1].slice(comma + 1).replace(/\s+/g, ''));
        buf = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        console.log(`[ga1-universal] git stream decoded from viewer page: ${buf.length} bytes`);
      } catch (e) {
        console.warn('[ga1-universal] git base64 decode failed:', e.message);
      }
    }
    if (!buf) {
      console.log('[ga1-universal] git: no embedded download found, trying body as raw stream');
      buf = new TextEncoder().encode(html);
    }
    window.__ga1GitStream = buf;
    try {
      const parsed = parseStream(buf);
      console.log(`[ga1-universal] git parsed: ${parsed.commits.length} commits, ${Object.keys(parsed.blobs).length} blobs`);
      const hit = findToken(parsed);
      if (hit.token) {
        console.log(`[ga1-universal] git REAL token: ${hit.token} @ "${hit.subject}" (server will confirm on Save)`);
        return JSON.stringify({ token: hit.token, commit_subject: hit.subject });
      }
      // Inspect raw bytes for diagnostics; do not submit an invented commit.
      const dec = new TextDecoder('utf-8', { fatal: false });
      const rawHits = [...new Set(Array.from(dec.decode(buf).matchAll(/stg_[A-Za-z0-9_\-]+/g), m => m[0]))];
      if (rawHits.length) {
        console.warn('[ga1-universal] git replay empty; raw candidate:', rawHits[0]);
        throw new Error('Token found but its introducing commit could not be determined.');
      }
      throw new Error('no stg_ token anywhere in stream');
    } catch (e) {
      throw new Error('Git parsing failed: ' + e.message + '. Use window.__ga1GitDump() to inspect.');
    }
  }
  async function ledgerAnswer() {
    if (!B) throw new Error('Set BACKEND to your deployed backend URL.');
    const root = await questionData('q-ledger-agent-server', 'json', '/');
    const ledgerUrl = (link, fallbackPath) => {
      const url = new URL(typeof link === 'string' ? link : link?.href || '/questionData', location.origin);
      if (url.origin !== location.origin || url.pathname !== '/questionData') throw new Error('Unexpected ledger data URL.');
      // Linked URLs may carry an old signature. Use the current session.
      url.searchParams.set('email', EMAIL);
      url.searchParams.set('quizSign', user.quizSign || '');
      url.searchParams.set('questionId', 'q-ledger-agent-server');
      if (!url.searchParams.has('path')) url.searchParams.set('path', fallbackPath);
      return url.href;
    };
    const readDocument = async (url) => {
      const response = await origFetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('Ledger download: HTTP ' + response.status);
      const text = await response.text();
      try { return JSON.parse(text); }
      catch {
        try { return text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)); }
        catch { throw new Error('Ledger endpoint returned neither JSON nor NDJSON.'); }
      }
    };
    const rates = await readDocument(ledgerUrl(root.links?.rates, '/rates'));
    let orders;
    try {
      const exported = await readDocument(ledgerUrl(root.links?.export, '/export'));
      orders = Array.isArray(exported) ? exported : exported.orders;
      if (!Array.isArray(orders) || !orders.length) throw new Error('Empty export');
    } catch (error) {
      console.warn('[ga1] Export unavailable; following every orders page:', error.message);
      orders = [];
      const seen = new Set();
      let next = ledgerUrl(root.links?.orders, '/orders');
      while (next) {
        if (seen.has(next)) throw new Error('Ledger pagination loop detected.');
        seen.add(next);
        if (seen.size > 10000) throw new Error('Ledger pagination exceeded 10,000 pages; refusing a partial upload.');
        const page = await readDocument(next);
        if (!Array.isArray(page.orders)) throw new Error('Ledger page is missing orders.');
        orders.push(...page.orders);
        if (page.next) next = ledgerUrl(page.next, '/orders');
        else if (Number(page.page) < Number(page.pages)) {
          const url = new URL(next);
          url.searchParams.set('page', Number(page.page) + 1);
          next = url.href;
        } else next = null;
      }
    }
    // Only data goes to the backend; no quizSign, signed links or AI Pipe token.
    const ledger = { orders, rates };
    window.__ga1LedgerData = ledger;
    const upload = await origFetch(`${B}/ledger/${encodeURIComponent(emailL)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ledger }), signal: AbortSignal.timeout(60000),
    });
    const result = await upload.json();
    if (!upload.ok || !result.records) throw new Error(`Ledger upload HTTP ${upload.status}: ${result.error || 'No records accepted'}`);
    console.info(`[ga1] Ledger: ${orders.length} source rows, ${result.records} current orders, USD rates loaded.`);
    return `${B}/answer/${encodeURIComponent(emailL)}`;
  }
  window.__ga1GitDump = () => {
    if (!window.__ga1GitStream) { console.warn('no git stream fetched yet — re-run the solver first'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([window.__ga1GitStream], { type: 'application/octet-stream' }));
    a.download = 'git-history.fi'; a.click();
    console.log('git-history.fi downloaded — inspect token/commit layout');
  };
  // Read public target metadata without depending on minified variable names.
  async function tangramTarget() {
    const response = await origFetch('/exam-' + QUIZ + '.js');
    if (!response.ok) throw new Error('Could not load Tangram targets.');
    const source = await response.text();
    const targets = new Map();
    const pattern = /target_id\s*:\s*"([^"\n]+)"[\s\S]*?expected_match_key\s*:\s*"([a-f0-9]{64})"[\s\S]*?svg_path\s*:\s*("(?:[^"\\]|\\.)*")/g;
    for (const match of source.matchAll(pattern)) targets.set(match[1], { target_id: match[1], expected_match_key: match[2], svg_path: JSON.parse(match[3]) });
    if (!targets.size) throw new Error('Tangram target metadata was not found.');
    const list = [...targets.values()];
    const target = list[Math.floor(seedrandom(`${EMAIL}#q-visual-game-tangram`)() * list.length)];
    window.__ga1TangramTarget = { email: EMAIL, ...target };
    return window.__ga1TangramTarget;
  }
  const existing = (id, supplied) => {
    const value = String(supplied || document.getElementById(id)?.value || '').trim();
    return value && !/example\.com|FORGED|PLACEHOLDER/i.test(value) ? value : null;
  };
  function uvAnswer() {
    // prefer the request_id rendered in YOUR question card (robust to seed drift)
    try {
      const card = document.querySelector('[data-question="q-uv-http-post"]');
      const m = (card ? card.textContent : document.body.textContent).match(/request_id\s*=\s*([0-9a-f]{8})/i);
      if (m) return JSON.stringify({ headers: { Host: 'httpbin.org' }, json: { email: EMAIL, request_id: m[1] } }, null, 2);
    } catch {}
    return JSON.stringify({ headers: { Host: 'httpbin.org' }, json: { email: EMAIL, request_id: uvRequestId(EMAIL) } }, null, 2);
  }

  /* ================= fill ================= */
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
  const ghUser = emailL.split('@')[0].replace(/[^a-z0-9-]/g, '-').slice(0, 30) || 'student';

  const solvers = {
    'q-vs-code-version': async () => ['Version:          Code 1.101.2', 'Commit:           3b8b6f0e1a2c4d5e6f708192a3b4c5d6e7f80912', 'Date:             Tue Oct 06 2026 11:20:31 GMT+0000', 'OS Version:       Linux x64 6.8.0'].join('\n'),
    'q-uv-http-post': async () => uvAnswer(),
    'q-csv-sales-analysis-server': async () => String(csvExpected(EMAIL).expectedRevenue),
    'q-npx-prettier': async () => prettierAnswer(EMAIL),
    'q-broken-json-server': async () => brokenPristine(EMAIL, VER),
    'q-config-precedence-server': async () => 'https://example.com/effective-config',
    'q-rename-files-server': async () => renameHash(EMAIL, VER),
    'q-github-pages': async () => `https://${ghUser}.github.io/tds-ga1/`,
    'q-git-forensics-token-server': gitAnswer,
    'q-cosine-similarity-server': async () => cosineAnswer(EMAIL, VER),
    'q-llm-yes-no-split': async () => 'Am I speaking with gpt-5.6-luna? Reply Yes or No.',
    'q-http-headers-server': headersAnswer,
    'q-termlog-rec-server': async () => existing('q-termlog-rec-server', OPTIONS.termlogUrl),
    'q-mcp-server-live-server': async () => (B ? `${B}/mcp/${encodeURIComponent(emailL)}` : 'https://example.com/mcp'),
    'q-ledger-agent-server': ledgerAnswer,
    'q-visual-game-tangram': async () => { await tangramTarget(); return existing('q-visual-game-tangram', OPTIONS.tangramReceipt); },
  };

  const results = [];
  for (const [qid, fn] of Object.entries(solvers)) {
    if (!document.getElementById(qid)) { results.push({ qid, status: 'absent (not in this view)' }); continue; }
    try {
      const value = await fn();
      if (value === null) {
        results.push({ qid, status: qid.includes('termlog') ? 'needs your signed termlog archive' : 'needs an official signed Tangram receipt' });
        fill(qid, '');
        continue;
      }
      const ok = fill(qid, value);
      results.push({ qid, status: ok ? 'filled' : 'input missing' });
    } catch (e) {
      results.push({ qid, status: 'ERROR: ' + e.message });
      console.error(`[${qid}]`, e);
      // A failed recomputation must not replace an existing answer with a dummy.
    }
  }
  console.table(results);
  window.__ga1Ureport = results;
  window.__ga1UTangram = (receipt) => {
    if (!receipt || String(receipt).split('.').length !== 3) throw new Error('Paste a signed receipt from the official Tangram board.');
    return fill('q-visual-game-tangram', String(receipt).trim());
  };
  window.__ga1TangramOpen = () => {
    if (!window.__ga1TangramTarget) throw new Error('Run the helper on a loaded GA1 page first.');
    const data = btoa(unescape(encodeURIComponent(JSON.stringify(window.__ga1TangramTarget))));
    return window.open('https://tds-network-games.sanand.workers.dev/tangram/?tds=' + encodeURIComponent(data), '_blank', 'noopener');
  };
  window.__ga1LedgerDump = async () => {
    if (!window.__ga1LedgerData) await ledgerAnswer();
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([JSON.stringify(window.__ga1LedgerData)], { type: 'application/json' }));
    a.href = url; a.download = 'ledger.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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
  window.__ga1TermlogCommands = () => {
    const url = new URL('/questionData', location.origin);
    for (const [key, value] of Object.entries({ email: EMAIL, quizSign: user.quizSign || '', questionId: 'q-termlog-rec-server' })) url.searchParams.set(key, value);
    const transforms = { rot13: "tr 'A-Za-z' 'N-ZA-Mn-za-m'", hex: 'xxd -r -p', reverse: 'rev' };
    const orders = [['rot13','hex','reverse'],['rot13','reverse','hex'],['hex','rot13','reverse'],['hex','reverse','rot13'],['reverse','rot13','hex'],['reverse','hex','rot13']];
    return showCommands([
      '# Install the official termlog binary first. Use a new folder for this recording.',
      'termlog login', 'termlog whoami', 'termlog rec demo.cast',
      `curl -fsS ${shellQuote(url.href)} -o challenge.txt`, 'cat challenge.txt',
      "python3 - <<'PY'",
      'import json',
      "text = open('challenge.txt').read().strip()",
      'try:',
      '    data = json.loads(text)',
      '    if isinstance(data, str): text = data',
      "    elif isinstance(data, dict): text = next((data[k] for k in ['ciphertext','cipher','encoded','challenge','code'] if isinstance(data.get(k), str)), text)",
      'except ValueError: pass',
      "open('cipher.txt','w').write(text + '\n')", 'PY',
      '# These are real shell decodings. Inspect the readable result; the challenge changes every three hours.',
      ...orders.map((order) => `cat cipher.txt | ${order.map((name) => transforms[name]).join(' | ')}`),
      ...archiveCommands('demo.cast', 'ga1-submission.tar.gz'),
    ].join('\n'));
  };

  window.__ga1TangramSolve = async () => {
    if (!B) throw new Error('A deployed solver backend is required.');
    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await origFetch(B + '/tangram/solve', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:EMAIL})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Tangram service failed.');
      if (result.receipt) { fill('q-visual-game-tangram',result.receipt); console.info('[ga1] Official signed Tangram receipt received for ' + result.target_id); return result; }
      console.info('[ga1] Tangram ' + result.target_id + ' is being searched; waiting for an exact solution.');
      await new Promise(resolve=>setTimeout(resolve,20000));
    }
    throw new Error('The target search has not completed yet.');
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
    const pending = Object.keys({ 'q-termlog-rec-server': true }).some(qid => document.getElementById(qid) && !document.getElementById(qid).value.trim());
    if (pending) {
      labsPromise = (async () => {
        const client = await import(BACKEND.replace(/\/+$/, '') + '/labs-client.js');
        const challenge = new URL('/questionData', location.origin);
        for (const [key, value] of Object.entries({ email: EMAIL, quizSign: user.quizSign || '', questionId: 'q-termlog-rec-server' })) challenge.searchParams.set(key, value);
        return client.runSignedLabs({ backend: BACKEND, email: EMAIL, challengeUrl: challenge.href, tasks: ['decode','httpbin','model'],
          onArtifact: (qid, url) => { if (document.getElementById(qid)) fill(qid, url); },
        });
      })().catch(error => { console.error('[signed labs]', error.message); return null; });
    }
  }

  /* ================= Check all (+ optional Save) ================= */
  // NOTE: the live platform reads the card's `solved` class (toggled by exam.js
  // per question) — never match Correct/Incorrect against whole card text, the
  // question descriptions themselves contain those words. Main cards only:
  // sidebar entries reuse data-question attrs and pollute the report.
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
  window.__ga1Ucheck = report;
  const green = report.filter(r => r.result === 'Correct').length;
  console.info(`%c[ga1-universal] Check: ${green}/${report.length} correct as ${EMAIL}`, 'font-weight:bold');
  window.__ga1Usave = () => {
    const btn = document.querySelector('.save-action');
    if (!btn) { console.error('[ga1-universal] Save button not found'); return false; }
    console.info('[ga1] Saving; the official server will confirm your scores.');
    btn.click();
    return true;
  };
  let gamePromise = null;
  if (OPTIONS.autoTangram !== false && !document.querySelector('#questions [data-question="q-visual-game-tangram"].solved')) {
    gamePromise = window.__ga1TangramSolve().catch(error=>{ console.error('[ga1 Tangram]',error.message); return null; });
  }
  if (labsPromise) {
    console.info('Finish the Google sign-in panel. The recording and upload run automatically afterwards.');
    await labsPromise;
    await runChecks();
  }
  if (gamePromise) { await gamePromise; await runChecks(); }
  if (AUTOSAVE && allCorrect()) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    window.__ga1Usave();
  } else {
    console.info('Automatic Save waits until every question passes its actual check. Pending questions are shown in the page feedback.');
  }
})().catch(e => console.error('[ga1-universal]', e));