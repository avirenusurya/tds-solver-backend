const cacheKey = (email) => 'tds-signed-labs:' + email.trim().toLowerCase();
export function cachedLabs(email) {
  try { return JSON.parse(localStorage.getItem(cacheKey(email)) || '{}'); } catch { return {}; }
}

export async function runSignedLabs({ backend, email, challengeUrl = null, tasks, onArtifact = () => {} }) {
  backend = backend.replace(/\/+$/, '');
  const cached = cachedLabs(email);
  for (const [qid, url] of Object.entries(cached)) onArtifact(qid, url);
  const names = { decode: 'q-termlog-rec-server', httpbin: 'q-termlog-httpbin-server', model: 'q-termlog-ollama-modelfile-server' };
  const needed = tasks.filter((task) => !cached[names[task]]);
  if (!needed.length) return cached;
  // Only the decode lab needs a personal GA1 challenge URL. httpbin/model labs
  // are per-student by email hash and need no quiz signature.
  if (needed.includes('decode') && !challengeUrl) throw new Error('A current GA1 challenge URL is required for the decode lab.');
  const request = async (path, body, token) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(backend + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Signed-lab service failed.');
    return result;
  };
  const started = await request('/labs/start', { email, challengeUrl, tasks: needed });
  const panel = document.createElement('section');
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:440px;padding:18px;border:1px solid #555;border-radius:10px;background:#fff;color:#111;box-shadow:0 8px 28px #0004;font:14px/1.5 system-ui';
  const title = document.createElement('strong'); title.textContent = 'Signed terminal labs — ' + email;
  const status = document.createElement('p'); status.textContent = 'Starting…';
  const instructions = document.createElement('p');
  instructions.textContent = 'Sign in with this exam email. After Google sign-in, the popup reaches a localhost address. Copy its complete address below so the backend can finish the callback.';
  const login = document.createElement('button'); login.type = 'button'; login.textContent = 'Open Google sign-in'; login.disabled = true;
  const callback = document.createElement('input'); callback.type = 'url'; callback.placeholder = 'http://127.0.0.1:…/?state=…&code=…'; callback.style.cssText = 'display:block;width:100%;margin:12px 0';
  const finish = document.createElement('button'); finish.type = 'button'; finish.textContent = 'Complete sign-in';
  const hint = document.createElement('p'); hint.textContent = 'The backend uses the official recorder, runs the real commands and uploads a separate archive for each lab. Google credentials are cleared after the job.';
  panel.append(title, status, instructions, login, callback, finish, hint);
  document.body.append(panel);
  let authUrl;
  login.onclick = () => { if (authUrl) window.open(authUrl, 'tds-termlog-google-login', 'width=780,height=820'); };
  finish.onclick = async () => {
    finish.disabled = true;
    try {
      await request('/labs/job/' + started.id + '/callback', { callbackUrl: callback.value.trim() }, started.token);
      callback.value = ''; callback.disabled = true; login.disabled = true;
      status.textContent = 'Google callback received. Recording the labs…';
    } catch (error) { status.textContent = error.message; finish.disabled = false; }
  };
  try {
    const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      const job = await request('/labs/job/' + started.id, undefined, started.token);
      status.textContent = job.message;
      if (job.authUrl && !authUrl) {
        const url = new URL(job.authUrl);
        if (url.hostname !== 'accounts.google.com' || url.protocol !== 'https:') throw new Error('Unexpected Google sign-in address.');
        authUrl = url.href; login.disabled = false;
      }
      for (const [qid, value] of Object.entries(job.artifacts || {})) {
        const url = new URL(value, backend).href;
        if (cached[qid] !== url) { cached[qid] = url; localStorage.setItem(cacheKey(email), JSON.stringify(cached)); onArtifact(qid, url); }
      }
      if (job.status === 'complete') { panel.remove(); return cached; }
      if (job.status === 'error') throw new Error(job.message);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error('Signed-lab job timed out. Restart the helper to begin a new sign-in.');
  } catch (error) { status.textContent = error.message; throw error; }
}
