import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import crypto from 'node:crypto';

const quote = (value) => "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const taskIds = { decode: 'q-termlog-rec-server', httpbin: 'q-termlog-httpbin-server', model: 'q-termlog-ollama-modelfile-server' };
const hashEmail = (email) => {
  let hash = 2166136261;
  for (const char of normalizeEmail(email)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
};

export function validateChallengeUrl(value, email) {
  const url = new URL(value);
  if (url.origin !== 'https://exam.sanand.workers.dev' || url.pathname !== '/questionData'
    || url.searchParams.get('questionId') !== taskIds.decode
    || normalizeEmail(url.searchParams.get('email')) !== normalizeEmail(email)
    || !url.searchParams.get('quizSign')) throw new Error('A current, personal GA1 challenge URL is required.');
  return url.href;
}

// Bring-your-own login: the user runs `termlog login` on their own machine
// (same-machine browser flow, always works) and pastes auth.json. The server
// never sees a password; the cache is wiped with the job directory.
export function validateAuthCache(cache, email) {
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) throw new Error('Paste your termlog auth.json contents (JSON).');
  if (cache.dev) throw new Error('Development logins are rejected; run a real `termlog login` locally.');
  const claims = cache.claims || {};
  if (normalizeEmail(claims.email) !== normalizeEmail(email)) throw new Error('That login is for a different Google email. Log in locally with your exam email.');
  if (typeof cache.id_token !== 'string' || !cache.id_token) throw new Error('Login file is missing its token; run `termlog login` again locally.');
  if (typeof claims.exp !== 'number') throw new Error('Login file is missing its expiry; run `termlog login` again locally.');
  if (claims.exp <= Date.now() / 1000 + 60 && typeof cache.refresh_token !== 'string') throw new Error('That Google login expired and has no refresh token; run `termlog login` again locally.');
  return cache;
}

export function validateCallback(value, authUrl) {
  let callback;
  try { callback = new URL(String(value || '').trim()); }
  catch { throw new Error('Paste the complete localhost callback URL (http://127.0.0.1:PORT/?state=...&code=...).'); }
  let expected, redirect;
  try { expected = new URL(authUrl); redirect = new URL(expected.searchParams.get('redirect_uri')); }
  catch { throw new Error('This login session expired. Start a new job and use its fresh Google sign-in link.'); }
  if (redirect.hostname !== '127.0.0.1') throw new Error('Unexpected login session. Start a new job.');
  if (callback.protocol !== 'http:') throw new Error(`Callback must be http://127.0.0.1, got ${callback.protocol}//. Copy the localhost address from the sign-in popup, not the Google page.`);
  if (callback.hostname !== '127.0.0.1') throw new Error(`Callback host must be 127.0.0.1, got ${callback.hostname}.`);
  if (String(callback.port) !== String(redirect.port)) throw new Error(`Callback port ${callback.port || '(none)'} does not match this job's port ${redirect.port}. Use the localhost URL from THIS job's popup.`);
  if (callback.pathname !== '/') throw new Error(`Callback path must be /, got ${callback.pathname}. Copy the full address including ?state=...&code=....`);
  if (callback.searchParams.get('state') !== expected.searchParams.get('state')) throw new Error('Callback state does not match this login attempt. You pasted a URL from a different sign-in; use THIS job\'s popup URL.');
  if (!callback.searchParams.get('code')) throw new Error('Callback is missing ?code=.... Wait for Google to redirect to localhost, then copy the complete address.');
  return callback.href;
}

export function labCommands(task, email, challengeUrl, baseModel = 'smollm2:135m') {
  const hash = hashEmail(email);
  if (task === 'decode') {
    const transformations = { rot13: "tr 'A-Za-z' 'N-ZA-Mn-za-m'", hex: 'xxd -r -p', reverse: 'rev' };
    const permutations = [['rot13','hex','reverse'],['rot13','reverse','hex'],['hex','rot13','reverse'],['hex','reverse','rot13'],['reverse','rot13','hex'],['reverse','hex','rot13']];
    return [
      `curl -fsS --retry 3 --max-time 30 -A 'Mozilla/5.0' ${quote(validateChallengeUrl(challengeUrl, email))} -o challenge.txt`,
      'cat challenge.txt',
      `python3 - <<'PY'\nimport json\ntext = open('challenge.txt').read().strip()\ntry:\n data = json.loads(text)\n if isinstance(data, str): text = data\n elif isinstance(data, dict): text = next((data[k] for k in ['ciphertext','cipher','encoded','challenge','code'] if isinstance(data.get(k),str)), text)\nexcept ValueError: pass\nopen('cipher.txt','w').write(text + '\\n')\nPY`,
      ...permutations.map((order) => `cat cipher.txt | ${order.map((name) => transformations[name]).join(' | ')}`),
    ];
  }
  if (task === 'httpbin') {
    const tag = 'http-' + hash.toString(16), quantity = 2 + hash % 19, status = [400,404,418,422][hash % 4];
    const curl = 'curl -sS --retry 3 --retry-all-errors --max-time 30';
    return [
      `capture() { task="$1"; shift; printf '\\nHTTPBIN_BEGIN ${tag} %s\\n' "$task"; "$@"; result=$?; printf '\\nHTTPBIN_END ${tag} %s\\n' "$task"; return "$result"; }`,
      `capture GET ${curl} --get --data-urlencode 'course=TDS' --data-urlencode 'tag=${tag}' -H 'X-Exam-Tag: ${tag}' https://httpbin.org/get`,
      `capture POST ${curl} -X POST -H 'Content-Type: application/json' --data ${quote(JSON.stringify({ tag, quantity, active: true }))} https://httpbin.org/post`,
      `capture FORM ${curl} -X PUT --data-urlencode 'tag=${tag}' --data-urlencode 'quantity=${quantity}' https://httpbin.org/put`,
      `capture AUTH ${curl} -H 'Authorization: Bearer ${tag}' https://httpbin.org/bearer`,
      `capture REDIRECT ${curl} -L --get --data-urlencode 'url=https://httpbin.org/get?tag=${tag}' https://httpbin.org/redirect-to`,
      `${curl} -L -c cookies.txt 'https://httpbin.org/cookies/set?exam=${tag}'`,
      `capture COOKIES ${curl} -b cookies.txt https://httpbin.org/cookies`,
      `capture STATUS ${curl} -o /dev/null --write-out '%{http_code}' https://httpbin.org/status/${status}`,
    ];
  }
  if (task !== 'model') throw new Error('Unknown lab');
  const name = 'ga2-assistant-' + hash.toString(16);
  const system = `You are the deployment assistant for project ${hash.toString(16)}. Give concise answers and never invent commands.`;
  return [
    `cat > Modelfile <<'MODELFILE'\nFROM ${baseModel}\nSYSTEM ${JSON.stringify(system)}\nPARAMETER temperature ${[0.1,0.2,0.3][hash % 3]}\nPARAMETER num_ctx ${[2048,4096][hash % 2]}\nPARAMETER seed ${10 + hash % 990}\nPARAMETER num_predict ${64 + hash % 65}\nMODELFILE`,
    `ollama create ${name} -f Modelfile`,
    `printf '\\nMODELFILE_BEGIN ${name}\\n'`,
    `ollama show --modelfile ${name}`,
    `printf '\\nMODELFILE_END ${name}\\n'`,
  ];
}

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore','pipe','pipe'], timeout: 180000, ...options });
  let stdout = '', stderr = '';
  child.stdout.on('data', (data) => { stdout = (stdout + data).slice(-100000); });
  child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-10000); });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} failed (${code}): ${stderr.slice(-1000)}`)));
});

export function createLabManager({ dataDir, termlog = process.env.TERMLOG_BIN || 'termlog', python = 'python3', ollama = 'ollama' }) {
  const jobs = new Map();
  let queue = Promise.resolve(), modelReady = null, ollamaProcess = null;
  const baseModel = 'smollm2:135m';
  const modelEnv = { ...process.env, OLLAMA_MODELS: join(dataDir, 'ollama-models'), OLLAMA_HOST: '127.0.0.1:11434' };
  const prepareModel = () => modelReady ||= (async () => {
    try { await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(2000) }); }
    catch {
      ollamaProcess = spawn(ollama, ['serve'], { env: modelEnv, stdio: 'ignore' });
      ollamaProcess.on('error', () => {});
      let ready = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try { const response = await fetch('http://127.0.0.1:11434/api/version'); if (response.ok) { ready = true; break; } } catch {}
      }
      if (!ready) throw new Error('Ollama could not start.');
    }
    await run(ollama, ['pull', baseModel], { env: modelEnv });
  })().catch((error) => { modelReady = null; throw error; });

  const execute = async (job) => {
    try {
      const cache = JSON.parse(await readFile(join(job.authDir, 'auth.json'), 'utf8'));
      if (normalizeEmail(cache.claims?.email) !== job.email || cache.dev) throw new Error('Google sign-in must use the registered exam email.');
      job.status = 'queued'; job.message = 'Google identity verified. Waiting for the recording worker.';
      const work = async () => {
        job.status = 'recording';
        if (job.tasks.includes('model')) { job.message = 'Preparing the small Ollama model.'; await prepareModel(); }
        for (const task of job.tasks) {
          job.message = `Recording ${task} lab with the official termlog binary.`;
          const dir = join(job.dir, task); await mkdir(dir, { recursive: true });
          const cast = task === 'decode' ? 'demo.cast' : task === 'httpbin' ? 'httpbin.cast' : 'model.cast';
          const spec = { command: termlog, cast, cwd: dir, commands: labCommands(task, job.email, job.challengeUrl, baseModel), timeout: 900 };
          const specFile = join(dir, 'commands.json');
          await writeFile(specFile, JSON.stringify(spec), { mode: 0o600 });
          const env = { ...modelEnv, TERMLOG_STATE_HOME: job.authDir, TERMLOG_CONFIG_HOME: join(job.dir, 'config') };
          delete env.TERMLOG_ALLOW_DEV_AUTH;
          await run(python, [new URL('./tools/record-lab.py', import.meta.url).pathname, specFile], { env, timeout: 900000 });
          await run(termlog, ['verify', cast, '--expect-email', job.email, '--format', 'json'], { cwd: dir, env });
          await run('tar', ['-czf', 'submission.tar.gz', cast, cast + '.jwt'], { cwd: dir });
          const archive = await readFile(join(dir, 'submission.tar.gz'));
          if (archive.length > 1024 * 1024) throw new Error('Signed archive exceeds the grader size limit.');
          let url;
          try {
            const form = new FormData(); form.append('reqtype', 'fileupload'); form.append('fileToUpload', new Blob([archive], { type: 'application/gzip' }), task + '-submission.tar.gz');
            const response = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form, signal: AbortSignal.timeout(90000) });
            url = (await response.text()).trim();
            if (!response.ok || !/^https:\/\/files\.catbox\.moe\/[a-z0-9]+\.(?:tar\.gz|gz)$/i.test(url)) throw new Error('Catbox upload did not return a file URL.');
          } catch {
            const file = crypto.randomUUID() + '.tar.gz';
            await mkdir(join(dataDir, 'artifacts'), { recursive: true });
            await copyFile(join(dir, 'submission.tar.gz'), join(dataDir, 'artifacts', file));
            url = '/artifacts/' + file;
          }
          job.artifacts[taskIds[task]] = url;
        }
        job.status = 'complete'; job.message = 'Signed submissions are ready. The exam server still verifies each lab.';
      };
      const completion = queue.then(work);
      queue = completion.catch(() => {});
      await completion;
    } catch (error) { job.status = 'error'; job.message = error.message.replace(/quizSign=[^&\s]+/g, 'quizSign=REDACTED'); }
    finally { delete job.challengeUrl; await rm(job.dir, { recursive: true, force: true }); }
  };

  return {
    async health() {
      try { await Promise.all([run(termlog, ['--version']), run(python, ['--version']), run(ollama, ['--version'])]); return { available: true }; }
      catch { return { available: false, error: 'Deploy the Docker image containing termlog, Python and Ollama.' }; }
    },
    async start(input) {
      const email = normalizeEmail(input.email);
      if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) throw new Error('Enter a valid registered email.');
      const tasks = [...new Set(input.tasks || ['decode','httpbin','model'])];
      if (!tasks.length || tasks.some((task) => !(task in taskIds))) throw new Error('Unknown lab tasks.');
      const challengeUrl = tasks.includes('decode') ? validateChallengeUrl(input.challengeUrl, email) : null;
      if ([...jobs.values()].filter((job) => !['complete','error'].includes(job.status)).length >= 8) throw new Error('Eight sign-in or recording jobs are already active. Retry shortly.');
      const ready = await this.health(); if (!ready.available) throw new Error(ready.error);
      const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('base64url');
      const dir = join(dataDir, 'lab-jobs', id), authDir = join(dir, 'auth'); await mkdir(authDir, { recursive: true, mode: 0o700 });
      await mkdir(join(dir, 'config'), { recursive: true, mode: 0o700 });
      const job = { id, token, email, dir, authDir, tasks, challengeUrl, status: 'starting', message: 'Checking your login.', artifacts: {}, created: Date.now(), loginDiag: '' };
      jobs.set(id, job);
      // Bring-your-own login: the browser sign-in flow cannot survive this
      // host's localhost probing, so the user logs in locally (same machine,
      // always works) and pastes auth.json. No listener, no race, no timeout.
      if (input.authCache === undefined) throw new Error('Paste your local termlog login: run `termlog login` with your exam email, then paste auth.json.');
      let cache;
      try { cache = validateAuthCache(typeof input.authCache === 'string' ? JSON.parse(input.authCache) : input.authCache, email); }
      catch (error) { jobs.delete(id); throw error; }
      await writeFile(join(authDir, 'auth.json'), JSON.stringify(cache), { mode: 0o600 });
      job.status = 'queued';
      job.message = 'Login received. Waiting for the recording worker.';
      void execute(job).catch(() => {});
      return { id, token };
    },
    get(id, token) {
      const job = jobs.get(id);
      if (!job || typeof token !== 'string' || token.length !== job.token.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(job.token))) throw new Error('Invalid job token.');
      return { id: job.id, email: job.email, status: job.status, message: job.message, authUrl: job.publicAuthUrl, artifacts: job.artifacts, diag: job.loginDiag || '' };
    },
    async callback(id, token, value) {
      this.get(id, token);
      throw new Error('Browser sign-in is retired on this host; paste your local auth.json instead.');
    },
  };
}
