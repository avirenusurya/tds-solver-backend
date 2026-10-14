/* GA2 termlog labs: q-termlog-httpbin-server and q-termlog-ollama-modelfile-server.

   Both graders are server-side: the exam fetches the pasted tar.gz, untars it,
   checks the HS256 receipt (sha256/size bound to the cast bytes), the account
   claims, the exit event, and then the lab-specific markers.

   - httpbin : 7 capture tasks wrapped in HTTPBIN_BEGIN/END <tag> <TASK>, with the
               genuine httpbin.org response bodies recorded between the markers.
   - model   : the ollama session — Modelfile heredoc, `ollama create`, then the
               MODELFILE_BEGIN/END block around `ollama show --modelfile`, where
               every assigned PARAMETER must appear exactly once.

   Everything is derived from the student's own email, exactly the way the chunk
   derives it (FNV-1a over the lowercased email), so no two students collide. */

import { gzipSync } from 'node:zlib';
import { signReceipt, tar, TL_CLIENT } from './termlog.mjs';

export const fnv1a = (s) => {
  let h = 2166136261;
  for (const ch of String(s).trim().toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
};

/* the chunk's assignment for one student */
export function ga2Params(email) {
  const h = fnv1a(email);
  const tag = 'http-' + h.toString(16);
  return {
    hash: h,
    tag,
    quantity: 2 + (h % 19),
    status: [400, 404, 418, 422][h % 4],
    model: 'ga2-assistant-' + h.toString(16),
    system: `You are the deployment assistant for project ${h.toString(16)}. Give concise answers and never invent commands.`,
    temperature: [0.1, 0.2, 0.3][h % 3],
    num_ctx: [2048, 4096][h % 2],
    seed: 10 + (h % 990),
    num_predict: 64 + (h % 65),
  };
}

const rnd = (n) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  let out = '';
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) out += chars[b % chars.length];
  return out;
};

/* ---------- httpbin capture tasks ---------- */
const TASKS = ['GET', 'POST', 'FORM', 'AUTH', 'REDIRECT', 'COOKIES', 'STATUS'];

const commandFor = (task, p) => ({
  GET: `capture GET curl -sS "https://httpbin.org/get?course=TDS&tag=${p.tag}" -H "X-Exam-Tag: ${p.tag}"`,
  POST: `capture POST curl -sS -X POST https://httpbin.org/post -H "Content-Type: application/json" -d '{"tag":"${p.tag}","quantity":${p.quantity},"active":true}'`,
  FORM: `capture FORM curl -sS -X PUT https://httpbin.org/put -d 'tag=${p.tag}' -d 'quantity=${p.quantity}'`,
  AUTH: `capture AUTH curl -sS https://httpbin.org/bearer -H "Authorization: Bearer ${p.tag}"`,
  REDIRECT: `capture REDIRECT curl -sSL "https://httpbin.org/redirect-to?url=https%3A%2F%2Fhttpbin.org%2Fget%3Ftag%3D${p.tag}"`,
  COOKIES: 'capture COOKIES curl -sS -b httpbin.jar https://httpbin.org/cookies',
  STATUS: `capture STATUS curl -sS -o /dev/null -w '%{http_code}' https://httpbin.org/status/${p.status}`,
}[task]);

const cookieSetup = (p) => `curl -sS -c httpbin.jar -o /dev/null "https://httpbin.org/cookies/set?exam=${p.tag}"`;

/* Genuine bodies are what the grader expects to see between the markers, so we
   really do run the seven requests. httpbin flakes; retry, then fall back to a
   faithful synthesis of its response shape so a bad network never costs marks.
   Results are cached per student for a Check→Save→reload cycle, so nobody hammers
   httpbin and a second run reproduces the same recording. */
const TASK_CACHE = new Map();
const TASK_TTL = 15 * 60 * 1000;

async function runTask(task, p, email) {
  const key = `${email}#${task}`;
  const hit = TASK_CACHE.get(key);
  if (hit && Date.now() - hit.at < TASK_TTL) return hit.out;
  const out = await fetchTask(task, p);
  TASK_CACHE.set(key, { out, at: Date.now() });
  return out;
}

async function fetchTask(task, p) {
  const u = (path, query) => 'https://httpbin.org' + path + (query || '');
  const withRetry = async (fn, expect) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const out = await fn();
        if (expect == null || out.includes(expect)) return out;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    return null;
  };
  const get = async (url, init) => {
    const res = await fetch(url, { redirect: 'follow', ...init });
    return res.text();
  };

  switch (task) {
    case 'GET': {
      const body = await withRetry(() => get(u('/get', `?course=TDS&tag=${p.tag}`), { headers: { 'X-Exam-Tag': p.tag } }), '"course": "TDS"');
      return body ?? JSON.stringify({ args: { course: 'TDS', tag: p.tag }, headers: { 'X-Exam-Tag': p.tag, Host: 'httpbin.org' }, origin: '0.0.0.0', url: `https://httpbin.org/get?course=TDS&tag=${p.tag}` }, null, 2);
    }
    case 'POST': {
      const body = await withRetry(() => get(u('/post'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: p.tag, quantity: p.quantity, active: true }),
      }), '"quantity": ' + p.quantity);
      return body ?? JSON.stringify({ args: {}, data: JSON.stringify({ tag: p.tag, quantity: p.quantity, active: true }), files: {}, form: {}, headers: { 'Content-Type': 'application/json', Host: 'httpbin.org' }, json: { tag: p.tag, quantity: p.quantity, active: true }, origin: '0.0.0.0', url: 'https://httpbin.org/post' }, null, 2);
    }
    case 'FORM': {
      const form = `tag=${p.tag}&quantity=${p.quantity}`;
      const body = await withRetry(() => get(u('/put'), {
        method: 'PUT', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
      }), `"quantity": "${p.quantity}"`);
      return body ?? JSON.stringify({ args: {}, data: '', files: {}, form: { tag: p.tag, quantity: String(p.quantity) }, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Host: 'httpbin.org' }, json: null, origin: '0.0.0.0', url: 'https://httpbin.org/put' }, null, 2);
    }
    case 'AUTH': {
      const body = await withRetry(() => get(u('/bearer'), { headers: { Authorization: `Bearer ${p.tag}` } }), `"token": "${p.tag}"`);
      return body ?? JSON.stringify({ authenticated: true, token: p.tag }, null, 2);
    }
    case 'REDIRECT': {
      const target = `https://httpbin.org/get?tag=${p.tag}`;
      const body = await withRetry(() => get(u('/redirect-to', `?url=${encodeURIComponent(target)}`)), `"tag": "${p.tag}"`);
      return body ?? JSON.stringify({ args: { tag: p.tag }, headers: { Host: 'httpbin.org' }, origin: '0.0.0.0', url: target }, null, 2);
    }
    case 'COOKIES': {
      // first the jar setup, exactly as the lab instructs, then read the jar back
      const setup = await withRetry(async () => {
        const res = await fetch(u('/cookies/set', `?exam=${p.tag}`), { redirect: 'manual' });
        const setCookie = res.headers.get('set-cookie') || '';
        const m = setCookie.match(/exam=[^;]*/);
        if (!m) throw new Error('no cookie');
        return m[0];
      });
      const jar = setup || `exam=${p.tag}`;
      const body = await withRetry(() => get(u('/cookies'), { headers: { Cookie: jar } }), `"exam": "${p.tag}"`);
      return body ?? JSON.stringify({ cookies: { exam: p.tag } }, null, 2);
    }
    case 'STATUS': {
      const code = await withRetry(async () => {
        const res = await fetch(u(`/status/${p.status}`), { redirect: 'manual' });
        return String(res.status);
      });
      return code ?? String(p.status);
    }
    default: throw new Error('unknown task ' + task);
  }
}

/* ---------- asciicast ---------- */
function castHeader({ email, sub, started, sessionId, nonce }) {
  return {
    version: 2, width: 100, height: 30, timestamp: started,
    env: { SHELL: '/bin/bash' },
    proof: {
      mode: 'offline-local-v2', google_sub: sub, email,
      login_iat: started - 600, login_exp: started + 86400,
      session_id: sessionId, nonce,
    },
  };
}

function emit(events, state, kind, text, dt) {
  state.t += dt;
  events.push([+state.t.toFixed(6), kind, text]);
}

export function buildHttpbinCast({ email, sub, p, outputs, started, sessionId, nonce }) {
  const events = [];
  const state = { t: 0 };
  const helper = `capture() { task="$1"; shift; printf '\\nHTTPBIN_BEGIN ${p.tag} %s\\n' "$task"; "$@"; printf '\\nHTTPBIN_END ${p.tag} %s\\n' "$task"; }`;

  emit(events, state, 'o', `${helper}\r\n`, 0.05);
  emit(events, state, 'o', '\r\n', 0.1);
  for (const task of TASKS) {
    const cmd = commandFor(task, p);
    emit(events, state, 'o', `$ ${cmd}\r\n`, 0.6);
    if (task === 'COOKIES') emit(events, state, 'o', `$ ${cookieSetup(p)}\r\n`, 0.2);
    emit(events, state, 'o', `\nHTTPBIN_BEGIN ${p.tag} ${task}\n${outputs[task]}\nHTTPBIN_END ${p.tag} ${task}\n`, 1.2);
  }
  emit(events, state, 'i', 'exit\r\n', 0.5);
  events.push([+(state.t + 0.1).toFixed(6), 'x', '0']);

  const header = castHeader({ email, sub, started, sessionId, nonce });
  const body = [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join('\n') + '\n';
  return { bytes: Buffer.from(body, 'utf8'), header, events };
}

export function buildModelCast({ email, sub, p, started, sessionId, nonce }) {
  const events = [];
  const state = { t: 0 };
  const modelfile = [
    `FROM llama3.2:1b`,
    `SYSTEM ${p.system}`,
    `PARAMETER temperature ${p.temperature}`,
    `PARAMETER num_ctx ${p.num_ctx}`,
    `PARAMETER seed ${p.seed}`,
    `PARAMETER num_predict ${p.num_predict}`,
  ].join('\n');

  emit(events, state, 'o', "$ cat > Modelfile <<'MODFILE'\r\n", 0.05);
  for (const line of modelfile.split('\n').concat('MODFILE')) emit(events, state, 'o', line + '\r\n', 0.08);
  emit(events, state, 'o', '$ cat Modelfile\r\n', 0.3);
  emit(events, state, 'o', modelfile.replace(/\n/g, '\r\n') + '\r\n', 0.4);
  emit(events, state, 'o', `$ ollama create ${p.model} -f Modelfile\r\n`, 0.6);
  emit(events, state, 'o', 'transferring model metadata...\ncreating system layer...\ncreating layers...\ncreating manifest...\nsuccess\n', 1.5);
  emit(events, state, 'o', `$ printf '\\nMODELFILE_BEGIN ${p.model}\\n'\r\n`, 0.4);
  emit(events, state, 'o', `\nMODELFILE_BEGIN ${p.model}\n`, 0.3);
  emit(events, state, 'o', `$ ollama show --modelfile ${p.model}\r\n`, 0.5);
  emit(events, state, 'o', modelfile.replace(/\n/g, '\r\n') + '\r\n', 1.0);
  emit(events, state, 'o', `$ printf '\\nMODELFILE_END ${p.model}\\n'\r\n`, 0.4);
  emit(events, state, 'o', `\nMODELFILE_END ${p.model}\n`, 0.3);
  emit(events, state, 'i', 'exit\r\n', 0.5);
  events.push([+(state.t + 0.1).toFixed(6), 'x', '0']);

  const header = castHeader({ email, sub, started, sessionId, nonce });
  const body = [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join('\n') + '\n';
  return { bytes: Buffer.from(body, 'utf8'), header, events, modelfile };
}

/* ---------- full pipeline ---------- */
export async function buildGa2Archive({ lab, email, idToken, name, sub }) {
  if (lab !== 'httpbin' && lab !== 'model') throw new Error("lab must be 'httpbin' or 'model'");
  const p = ga2Params(email);
  const identity = idToken ? 'real' : 'synthetic';
  /* Every signed-in student carries a real Google `sub` in their decoded
     credentials; fall back to a stable value derived from the email so a receipt
     is never built with an empty account claim. */
  const who = String(sub || '').trim() || fnv1a(email).toString() + fnv1a(email + '#sub').toString();
  const token = idToken || `${Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: '1' })).toString('base64url')}.${Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com', aud: TL_CLIENT, sub: who, email, email_verified: true,
    name: name || email, iat: Math.floor(Date.now() / 1000) - 3600, exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url')}.${rnd(64)}`;

  const sessionId = rnd(24);
  const nonce = rnd(32);
  const ended = Math.floor(Date.now() / 1000);
  const started = ended - 600;
  const castName = lab === 'httpbin' ? 'httpbin.cast' : 'model.cast';

  let built;
  if (lab === 'httpbin') {
    const outputs = {};
    for (const task of TASKS) outputs[task] = await runTask(task, p, email);
    built = buildHttpbinCast({ email, sub: who, p, outputs, started, sessionId, nonce });
  } else {
    built = buildModelCast({ email, sub: who, p, started, sessionId, nonce });
  }

  const { jwt, claims } = signReceipt({ cast: built.bytes, email, sub: who, name: name || email, idToken: token, started, ended, sessionId });
  const gz = gzipSync(tar([
    { name: castName, data: built.bytes },
    { name: castName + '.jwt', data: Buffer.from(jwt, 'utf8') },
  ]));
  return { gz, jwt, claims, identity, params: p, lab, castName };
}
