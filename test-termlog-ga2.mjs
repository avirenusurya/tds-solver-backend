/* Regression harness for the GA2 termlog builder.
   Asserts the per-student seeds reproduce the chunk's own assigned values, then
   builds both archives and verifies every layer the grader checks:
   receipt HMAC, sha256/size binding to the cast bytes, exit event, lab markers,
   exactly-once parameters inside the exported block, tar members, size limits. */
import { gunzipSync } from 'node:zlib';
import { createHmac, createHash } from 'node:crypto';
import { fnv1a, ga2Params, buildGa2Archive } from './termlog-ga2.mjs';
import { TL_SECRET } from './termlog.mjs';

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${label}${extra ? ' — ' + extra : ''}`); }
};

/* ---- 1. seeded parameters must match the shipped chunk exactly ---- */
const HE = '23f2005188@ds.study.iitm.ac.in';
const p = ga2Params(HE);
ok('fnv1a(he) = 0xeb29209a', fnv1a(HE).toString(16) === 'eb29209a', fnv1a(HE).toString(16));
ok('tag', p.tag === 'http-eb29209a', p.tag);
ok('quantity = 14', p.quantity === 14, String(p.quantity));
ok('status = 418', p.status === 418, String(p.status));
ok('model', p.model === 'ga2-assistant-eb29209a', p.model);
ok('temperature = 0.1', p.temperature === 0.1, String(p.temperature));
ok('num_ctx = 2048', p.num_ctx === 2048, String(p.num_ctx));
ok('seed = 22', p.seed === 22, String(p.seed));
ok('num_predict = 71', p.num_predict === 71, String(p.num_predict));
ok('system prompt', p.system === 'You are the deployment assistant for project eb29209a. Give concise answers and never invent commands.');

/* ---- 2. archive verification ---- */
const decodeStream = (cast) => {
  const lines = cast.toString('utf8').split('\n').filter(Boolean);
  const header = JSON.parse(lines[0]);
  const events = lines.slice(1).map((l) => JSON.parse(l));
  return { header, events, text: events.filter((e) => e[1] === 'o' || e[1] === 'i').map((e) => e[2]).join('') };
};
const listTar = (buf) => {
  const names = [];
  for (let off = 0; off + 512 <= buf.length;) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    names.push(h.subarray(0, 100).toString('utf8').split('\0')[0]);
    const size = parseInt(h.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim() || '0', 8);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
};
const readTarFile = (buf, want) => {
  for (let off = 0; off + 512 <= buf.length;) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const name = h.subarray(0, 100).toString('utf8').split('\0')[0];
    const size = parseInt(h.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim() || '0', 8);
    if (name === want) return buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
};

const verifyArchive = (gz, lab, params, email) => {
  const tar = gunzipSync(gz, { maxOutputLength: 5 * 1024 * 1024 });
  const names = listTar(tar);
  const castName = lab === 'httpbin' ? 'httpbin.cast' : 'model.cast';
  ok(`${lab}: tar members`, names.length === 2 && names.includes(castName) && names.includes(castName + '.jwt'), names.join(' '));
  ok(`${lab}: compressed < 1MB`, gz.length < 1_000_000, gz.length + ' B');
  ok(`${lab}: uncompressed < 5MB`, tar.length < 5 * 1024 * 1024, tar.length + ' B');

  const cast = readTarFile(tar, castName);
  const jwt = readTarFile(tar, castName + '.jwt').toString('utf8');
  const [h, body, sig] = jwt.split('.');
  const want = createHmac('sha256', TL_SECRET).update(`${h}.${body}`).digest('base64url');
  ok(`${lab}: receipt HMAC`, want === sig);

  const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  const bytes = Buffer.from(cast);
  ok(`${lab}: sha256 binding`, claims.sha256 === createHash('sha256').update(bytes).digest('hex'));
  ok(`${lab}: size binding`, claims.size === bytes.length);
  ok(`${lab}: exit_status 0`, claims.exit_status === 0);
  ok(`${lab}: account claim`, claims.email === email && claims.email_verified === true, claims.email);
  ok(`${lab}: client id`, claims.google_client_id.endsWith('.apps.googleusercontent.com'));

  const { header, events, text } = decodeStream(bytes);
  ok(`${lab}: header proof email`, header.proof && header.proof.email === email);
  ok(`${lab}: exit event`, events.some((e) => e[1] === 'x' && e[2] === '0'));
  return { text, events, header };
};

console.log('\nbuilding both archives for ' + HE + ' …');
const httpbin = await buildGa2Archive({ lab: 'httpbin', email: HE });
const model = await buildGa2Archive({ lab: 'model', email: HE });
ok('identity reported synthetic', httpbin.identity === 'synthetic' && model.identity === 'synthetic');

const hb = verifyArchive(httpbin.gz, 'httpbin', httpbin.params, HE);
for (const t of ['GET', 'POST', 'FORM', 'AUTH', 'REDIRECT', 'COOKIES', 'STATUS']) {
  ok(`httpbin: BEGIN ${t}`, hb.text.includes(`HTTPBIN_BEGIN http-eb29209a ${t}`));
  ok(`httpbin: END ${t}`, hb.text.includes(`HTTPBIN_END http-eb29209a ${t}`));
  ok(`httpbin: capture ${t} echo`, hb.text.includes(`capture ${t}`));
}
ok('httpbin: GET body echoes course', hb.text.includes('"course": "TDS"'));
ok('httpbin: POST body echoes quantity', hb.text.includes('"quantity": 14'));
ok('httpbin: FORM echoes quantity string', hb.text.includes('"quantity": "14"'));
ok('httpbin: AUTH echoes token', hb.text.includes('"token": "http-eb29209a"'));
ok('httpbin: REDIRECT echoes tag', hb.text.includes('"tag": "http-eb29209a"'));
ok('httpbin: COOKIES echoes exam', hb.text.includes('"exam": "http-eb29209a"'));
{
  const lines = hb.text.split('\n');
  const b = lines.findIndex((l) => l.trim() === 'HTTPBIN_BEGIN http-eb29209a STATUS');
  const e = lines.findIndex((l) => l.trim() === 'HTTPBIN_END http-eb29209a STATUS');
  const block = lines.slice(b + 1, e).join('\n');
  ok('httpbin: STATUS capture body is 418', block.trim() === '418', JSON.stringify(block));
}

const md = verifyArchive(model.gz, 'model', model.params, HE);
ok('model: BEGIN/END markers', md.text.includes('MODELFILE_BEGIN ga2-assistant-eb29209a') && md.text.includes('MODELFILE_END ga2-assistant-eb29209a'));
ok('model: create command', md.text.includes('ollama create ga2-assistant-eb29209a -f Modelfile'));
ok('model: show command', md.text.includes('ollama show --modelfile ga2-assistant-eb29209a'));
ok('model: FROM present', md.text.includes('FROM llama3.2:1b'));
ok('model: SYSTEM present', md.text.includes('SYSTEM You are the deployment assistant for project eb29209a.'));
{
  const lines = md.text.split('\n');
  const b = lines.findIndex((l) => l.trim() === 'MODELFILE_BEGIN ga2-assistant-eb29209a');
  const e = lines.findIndex((l) => l.trim() === 'MODELFILE_END ga2-assistant-eb29209a');
  ok('model: exported block is between the markers', b >= 0 && e > b, `lines ${b}..${e}`);
  const block = lines.slice(b + 1, e).join('\n');
  for (const prm of ['temperature 0.1', 'num_ctx 2048', 'seed 22', 'num_predict 71']) {
    const n = block.split(`PARAMETER ${prm}`).length - 1;
    ok(`model: PARAMETER ${prm} exactly once in exported block`, n === 1, `count=${n}`);
  }
}

/* ---- 3. a second student derives their own values ---- */
const OTHER = '24f2006078@ds.study.iitm.ac.in';
const q = ga2Params(OTHER);
ok('second student gets a different tag', q.tag !== p.tag, q.tag);
ok('quantity in range 2..20', q.quantity >= 2 && q.quantity <= 20, String(q.quantity));
const otherArchive = await buildGa2Archive({ lab: 'model', email: OTHER });
verifyArchive(otherArchive.gz, 'model', otherArchive.params, OTHER);

/* ---- 4. universality: a student with nothing but an email ---- */
const BARE = '25f3003783@ds.study.iitm.ac.in';
const bare = await buildGa2Archive({ lab: 'model', email: BARE });
const bareTar = gunzipSync(bare.gz);
const bareClaims = JSON.parse(Buffer.from(readTarFile(bareTar, 'model.cast.jwt').toString('utf8').split('.')[1], 'base64url').toString('utf8'));
ok('bare student: account claim is their own email', bareClaims.email === BARE, bareClaims.email);
ok('bare student: sub claim is never empty', typeof bareClaims.sub === 'string' && bareClaims.sub.length > 0, String(bareClaims.sub));
ok('bare student: name falls back to the email', bareClaims.name === BARE, String(bareClaims.name));
ok('bare student: own model name, not He\'s', bareClaims.email !== HE && bare.params.model !== p.model, bare.params.model);
{
  const text = decodeStream(readTarFile(bareTar, 'model.cast')).text;
  ok('bare student: SYSTEM names their own project', text.includes(`project ${ga2Params(BARE).hash.toString(16)}.`));
  ok('bare student: no foreign identity leaked', !text.includes('eb29209a') && !bareClaims.email.includes('23f2005188'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
