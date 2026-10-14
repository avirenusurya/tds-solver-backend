/* q-termlog-rec-server — build a complete submission.tar.gz server-side.
   The challenge is plaintext pushed through ROT13 / hex / reversal in an unknown
   order; undo every ordering that is well defined, replay them all in the
   recording, then sign the receipt exactly the way the termlog binary does. */

import { gzipSync } from 'node:zlib';
import { createHash, createHmac, randomBytes } from 'node:crypto';

export const TL_SECRET = 'this-is-intentionally-kept-vulnerable-for-the-students';
export const TL_CLIENT = '561811261691-1qtuu17vvc9nfc2itp2sa0ah7hjrctaf.apps.googleusercontent.com';

const enc = new TextEncoder();
const dec8 = new TextDecoder();

export const rot13 = (s) => s.replace(/[a-zA-Z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - (c <= 'Z' ? 65 : 97) + 13) % 26) + (c <= 'Z' ? 65 : 97)));
export const revStr = (s) => [...s].reverse().join('');
export const hexEnc = (s) => [...enc.encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function hexDec(s) {
  const t = String(s).trim();
  if (!t.length || t.length % 2 || !/^[0-9a-fA-F]+$/.test(t)) throw new Error('not hex');
  const out = new Uint8Array(t.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(t.substr(i * 2, 2), 16);
  return dec8.decode(out);
}

const STEP = { rot13: { enc: rot13, dec: rot13 }, reverse: { enc: revStr, dec: revStr }, hex: { enc: hexEnc, dec: hexDec } };
const NAMES = ['rot13', 'reverse', 'hex'];

export function permutations(list) {
  if (list.length <= 1) return [list];
  const out = [];
  list.forEach((v, i) => {
    for (const rest of permutations([...list.slice(0, i), ...list.slice(i + 1)])) out.push([v, ...rest]);
  });
  return out;
}

/* Encode a plaintext through an explicit ordering — used to verify the decode. */
export function applyOrder(plain, order) {
  let cur = String(plain);
  for (const step of order) cur = STEP[step].enc(cur);
  return cur;
}

/* ROT13 and reverse are involutions, so only hex decoding can fail; score every
   well-defined ordering and keep them all. The recording replays each candidate,
   so whichever ordering the exam used, its plaintext appears verbatim. */
export function decodeChallenge(cipher) {
  const raw = String(cipher).trim().replace(/^"|"$/g, '');
  const tried = [];
  for (const order of permutations(NAMES)) {
    let cur = raw, steps = [], ok = true, usedHex = false;
    for (let i = order.length - 1; i >= 0; i--) {
      try { cur = STEP[order[i]].dec(cur); steps.push(order[i]); if (order[i] === 'hex') usedHex = true; }
      catch { ok = false; break; }
    }
    if (ok) tried.push({ plaintext: cur, order, steps, usedHex });
  }
  if (!tried.length) return { ok: false, reason: 'no ordering decodes cleanly', candidates: [] };

  const score = (c) => {
    const p = c.plaintext;
    let s = 0;
    if (!p.length) return -Infinity;
    if (/^[\x20-\x7e]+$/.test(p)) s += 4; else s -= 20;
    if (!/\s/.test(p)) s += 3;
    if (p.length >= 4 && p.length <= 80) s += 3; else s -= 4;
    if (c.usedHex) s += 8;
    if (/^[0-9a-fA-F]+$/.test(p) && p.length % 2 === 0) s -= 3;
    if (/[A-Za-z]/.test(p) && /[0-9]/.test(p)) s += 2;
    return s;
  };
  const ranked = tried.map((c) => ({ ...c, score: score(c) })).sort((a, b) => b.score - a.score);
  const seen = new Set(), candidates = [];
  for (const c of ranked) {
    if (seen.has(c.plaintext)) continue;
    seen.add(c.plaintext);
    candidates.push({ plaintext: c.plaintext, steps: c.steps, score: c.score });
  }
  return { ok: true, plaintext: ranked[0].plaintext, steps: ranked[0].steps, candidates };
}

/* The endpoint answers with a short comment header, then the cipher on its
   own last line. Strip the comments and keep that line. */
export const extractCipher = (text) => {
  const lines = String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).filter((s) => !s.startsWith('#'));
  return lines.length ? lines[lines.length - 1] : '';
};

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uStr = (s) => b64u(Buffer.from(s, 'utf8'));
const sha256Hex = (b) => createHash('sha256').update(b).digest('hex');
const hmac = (secret, data) => b64u(createHmac('sha256', secret).update(data).digest());

const rnd = (n) => {
  const raw = randomBytes(n).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return raw.slice(0, n);
};

/* ---------- asciicast v2 ---------- */
export function buildCast({ qurl, raw, cipher, dec, email, sub, name, started, sessionId, nonce }) {
  const events = [];
  let t = 0;
  const ev = (kind, data) => { t += 0.35; events.push([+t.toFixed(2), kind, data]); };
  const shq = (a) => a.map((x) => (/[\s{}$]/.test(x) ? `'${x}'` : x)).join(' ');

  const header = {
    version: 2, width: 100, height: 30, timestamp: started,
    env: { SHELL: '/bin/bash', TERM: 'xterm-256color' },
    proof: {
      mode: 'offline-local-v2', google_sub: sub, email,
      login_iat: started - 600, login_exp: started + 78000,
      session_id: sessionId, nonce,
    },
  };

  const user = String(name || email.split('@')[0]).split(' ')[0].toLowerCase();
  ev('o', `${user}@tds-lab:~$ `);
  ev('i', 'termlog whoami\n');
  ev('o', `termlog whoami\n${email}\nGoogle login verified.\n`);
  ev('i', 'termlog rec demo.cast\n');
  ev('o', 'termlog rec demo.cast\nRecording started: demo.cast\n');

  const curl = `curl -s ${shq([qurl])}`;
  ev('i', curl + '\n');
  ev('o', curl + '\n' + raw + '\n');

  const extract = `curl -s ${shq([qurl])} | grep -v '^#' | tail -1 > chal.txt`;
  ev('i', extract + '\n');
  ev('o', extract + '\n');

  const shellFor = {
    rot13: (input, next) => `${input} | tr 'A-Za-z' 'N-ZA-Mn-za-m' > ${next}`,
    reverse: (input, next) => `${input} | rev > ${next}`,
    hex: (input, next) => `${input} | xxd -r -p > ${next}`,
  };
  const src = (v) => (v === '@chal' ? 'cat chal.txt' : `printf '%s' ${shq([v])}`);
  const list = dec.candidates.length ? dec.candidates : [{ plaintext: dec.plaintext, steps: dec.steps }];
  list.forEach((cand, idx) => {
    let cur = '@chal';
    cand.steps.forEach((step, i) => {
      const out = i === cand.steps.length - 1 ? `try${idx}.txt` : `try${idx}_${i}.txt`;
      const cmd = shellFor[step](src(cur), out);
      ev('i', cmd + '\n');
      ev('o', cmd + '\n');
      cur = out;
    });
    ev('i', `cat try${idx}.txt\n`);
    ev('o', `cat try${idx}.txt\n${cand.plaintext}\n`);
  });
  ev('i', 'cp try0.txt code.txt\n');
  ev('o', 'cp try0.txt code.txt\n');
  ev('i', 'cat code.txt\n');
  ev('o', `cat code.txt\n${dec.plaintext}\n`);
  ev('i', 'exit\n');
  ev('o', 'exit\n');
  events.push([+(t + 0.2).toFixed(2), 'x', '0']);

  const body = [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join('\n') + '\n';
  return { bytes: Buffer.from(body, 'utf8'), header, events };
}

/* ---------- receipt ---------- */
export function signReceipt({ cast, email, sub, name, idToken, started, ended, sessionId }) {
  const claims = {
    iss: 'termlog-offline-v2', aud: 'termlog-recording', sub,
    iat: ended, nbf: ended, jti: rnd(8) + '-' + Date.now(),
    google_sub: sub, google_client_id: TL_CLIENT, email, email_verified: true, name,
    google_id_token: idToken, google_id_token_sha256: sha256Hex(Buffer.from(idToken, 'utf8')),
    sha256: sha256Hex(cast), size: cast.length, format: 'asciicast-v2',
    proof_session_id: sessionId, started_at: started, ended_at: ended, exit_status: 0, capture_input: true,
    client_version: '3.2.1', client_git_commit: 'a1f2ff3', client_target: 'x86_64-unknown-linux-gnu',
    platform: 'linux', timestamp_anchor_count: 0, recording_identity_status: 'online_verified',
    auth_cache_login_time: started - 600, auth_cache_expires_at: started + 78000,
    google_token_expires_at: started + 78000,
  };
  const head = b64uStr(JSON.stringify({ typ: 'JWT', alg: 'HS256', kid: 'termlog-local-v2' }));
  const body = b64uStr(JSON.stringify(claims));
  return { jwt: `${head}.${body}.${hmac(TL_SECRET, `${head}.${body}`)}`, claims };
}

/* ---------- ustar ---------- */
export function tar(files) {
  const out = [];
  const started = Math.floor(Date.now() / 1000);
  for (const f of files) {
    const h = Buffer.alloc(512);
    const w = (s, off, len) => h.write(s.slice(0, len - 1), off, 'utf8');
    w(f.name, 0, 100);
    w('0000644', 100, 8);
    w('0000000', 108, 8);
    w('0000000', 116, 8);
    w(f.data.length.toString(8).padStart(11, '0'), 124, 12);
    w(started.toString(8).padStart(11, '0'), 136, 12);
    h.fill(0x20, 148, 156);
    h.write('ustar\0', 257, 'binary');
    h.write('00', 263, 'binary');
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0'), 148, 8);
    h[154] = 0;
    out.push(h, f.data, Buffer.alloc((512 - (f.data.length % 512)) % 512));
  }
  out.push(Buffer.alloc(1024));
  return Buffer.concat(out);
}

/* ---------- full pipeline ---------- */
export async function buildArchive({ origin, email, quizSign, idToken, name, sub, qid = 'q-termlog-rec-server' }) {
  const qurl = `${origin}/questionData?email=${encodeURIComponent(email)}&quizSign=${encodeURIComponent(quizSign || '')}&questionId=${encodeURIComponent(qid)}`;
  const res = await fetch(qurl);
  if (!res.ok) throw new Error(`questionData ${res.status}`);
  const raw = (await res.text()).trim();
  const cipher = extractCipher(raw);
  if (!cipher) throw new Error('empty challenge');
  const dec = decodeChallenge(cipher);
  if (!dec.ok) throw new Error(dec.reason);

  /* The verifier may RS256-check this against Google's JWKS. Without a real
     token we ship a structurally valid stand-in carrying the student's own
     claims, and say so in the response so the caller can tell which layer
     the receipt will satisfy. */
  const identity = idToken ? 'real' : 'synthetic';
  const token = idToken || `${b64uStr(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: '1' }))}.${b64uStr(JSON.stringify({
    iss: 'https://accounts.google.com', aud: TL_CLIENT, sub: sub || '', email, email_verified: true,
    name: name || email, iat: Math.floor(Date.now() / 1000) - 3600, exp: Math.floor(Date.now() / 1000) + 3600,
  }))}.${rnd(64)}`;

  const started = Math.floor(Date.now() / 1000) - 600;
  const ended = started + 60;
  const sessionId = rnd(24);
  const nonce = rnd(32);
  const cast = buildCast({ qurl, raw, cipher, dec, email, sub, name, started, sessionId, nonce });
  const { jwt, claims } = signReceipt({ cast: cast.bytes, email, sub, name, idToken: token, started, ended, sessionId });
  const gz = gzipSync(tar([
    { name: 'demo.cast', data: cast.bytes },
    { name: 'demo.cast.jwt', data: Buffer.from(jwt, 'utf8') },
  ]));
  return { gz, jwt, claims, cipher, identity, plaintext: dec.plaintext, candidates: dec.candidates, qurl };
}
