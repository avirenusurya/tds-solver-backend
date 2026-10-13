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
  // One panel per page: repasting replaces the stale panel instead of
  // stacking confusing duplicates.
  document.querySelectorAll('.tds-labs-panel').forEach((el) => el.remove());
  const panel = document.createElement('section');
  panel.className = 'tds-labs-panel';
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:460px;padding:18px;border:1px solid #555;border-radius:10px;background:#fff;color:#111;box-shadow:0 8px 28px #0004;font:14px/1.5 system-ui';
  const title = document.createElement('strong'); title.textContent = 'Signed terminal labs — ' + email;
  const status = document.createElement('p'); status.textContent = 'Waiting for your login file.';
  const instructions = document.createElement('p');
  instructions.textContent = 'On your own machine: install termlog, run `termlog login` with this exam email, then run `cat ~/.local/state/termlog/auth.json` and paste the whole JSON below. The backend records the real labs with it and wipes it afterwards.';
  const paste = document.createElement('textarea'); paste.rows = 4; paste.placeholder = '{"client_id": "…", "id_token": "…", …}'; paste.style.cssText = 'display:block;width:100%;margin:12px 0;font:12px monospace';
  const upload = document.createElement('button'); upload.type = 'button'; upload.textContent = 'Upload login & record';
  const hint = document.createElement('p'); hint.textContent = 'No Google password is typed here — only the local login file. Each login is single-use per job.';
  panel.append(title, status, instructions, paste, upload, hint);
  document.body.append(panel);
  let started = null;
  const poll = async () => {
    const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      const job = await request('/labs/job/' + started.id, undefined, started.token);
      status.textContent = job.message;
      for (const [qid, value] of Object.entries(job.artifacts || {})) {
        const url = new URL(value, backend).href;
        if (cached[qid] !== url) { cached[qid] = url; localStorage.setItem(cacheKey(email), JSON.stringify(cached)); onArtifact(qid, url); }
      }
      if (job.status === 'complete') { panel.remove(); return cached; }
      if (job.status === 'error') throw new Error(job.message);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error('Signed-lab job timed out. Paste your login again to begin a new job.');
  };
  upload.onclick = async () => {
    upload.disabled = true;
    try {
      const text = paste.value.trim();
      if (!text.startsWith('{')) throw new Error('Paste the whole auth.json contents (it starts with {).');
      let authCache;
      try { authCache = JSON.parse(text); }
      catch { throw new Error('That is not valid JSON. Copy auth.json exactly, without edits.'); }
      status.textContent = 'Login received. Starting the recording…';
      started = await request('/labs/start', { email, challengeUrl, tasks: needed, authCache });
      paste.value = '';
      await poll();
    } catch (error) {
      status.textContent = error.message;
      console.error('[signed labs]', error.message);
      paste.disabled = false; upload.disabled = false;
    }
  };
}
