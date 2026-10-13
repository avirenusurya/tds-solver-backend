# Universal GA1 / GA2 helpers

The browser helpers read the current student's email and quiz signature from the logged-in attempt page. No student account, GitHub credential, or AI Pipe token belongs in shared source.

`/backendVerify` always reaches the official exam server. Green checks are no longer fabricated. Signed terminal recordings, Tangram receipts and the live model evaluation must pass their actual validators.

## Share with friends: host it yourself (free, no card)

Render's infrastructure HEAD-probes every localhost port, which kills
termlog's login listener in ~1s — the auto Google sign-in cannot work there.
A home machine has no such prober, so one technical person hosts and everyone
else just pastes. No payment, no new account anywhere.

On the host machine:

```bash
docker build -t tds-backend .
docker run -d --name tds --restart unless-stopped -p 8080:8080 -v tds-data:/app/data -e DATA_DIR=/app/data tds-backend
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
./cloudflared tunnel --url http://localhost:8080
# note the https://....trycloudflare.com URL it prints
```

Everyone (including the host) runs this line before pasting the helper:

```js
window.GA1_OPTIONS = { backend: 'https://....trycloudflare.com' };
window.GA2_OPTIONS = { backend: 'https://....trycloudflare.com' };
```

Rules: the host PC and tunnel stay on while anyone uses it; the tunnel URL
changes on every restart, so share the fresh one; the first model-lab run
pulls its Ollama model once and is slow; recordings run one at a time.
Ledger and archives live in the `tds-data` volume and survive restarts.

## Deploy and use

Deploy this repository to your existing Render web service. `GET /health` must report revision `2026-10-13-real-validation-v3`. Docker copies `server.mjs`, `ledger.mjs` and `invoice.mjs`; Node 20 or newer is required.

Reload the exam page, then paste the matching file from `solvers/` into its browser console. The default backend is `https://tds-solver-backend.onrender.com`. Each script fills computable answers, keeps existing signed lab URLs, runs Check all and shows genuine server failures. Review the feedback and press Save. Automatic saving runs only after every question passes its actual check. Set `autoSave: false` in the page options to keep saving manual.

Optional settings go in page memory before pasting, for example:

```js
window.GA1_OPTIONS = { backend: 'https://your-service.onrender.com' };
window.GA2_OPTIONS = { backend: 'https://your-service.onrender.com' };
```

The helpers keep their existing browser-side implementations for the previously working questions. Deployed questions are checked by the real server; a client-only success does not promise a saved score.

## Corrected services

- GA1 ledger downloads the full NDJSON `/export` and `/rates`. If export fails, it follows all paginated order links. The backend keeps the latest `updated_at` per order ID, converts amounts with `usd_per_unit`, uses Asia/Kolkata business dates and counts only paid orders as revenue. It supports refund totals/counts, product/customer rankings, units, distinct customers and date filters.
- GA2 invoice extraction preserves vendor punctuation, including `Industries Ltd.`. Empty, malformed or unsupported inputs return HTTP 422.
- Ledger data is stored by normalized email. The browser uploads orders and rates only; quiz signatures and signed data links are not sent to this service.
- `POST /artifacts` hosts a genuine `.tar.gz` containing a `.cast` recording and its `.cast.jwt`. It returns a relative public file URL. Prefix it with your backend origin before submitting. The bytes are unchanged; the official grader verifies the signatures and lab outputs.

Ledger and archive files use `DATA_DIR` (default `./data`). They survive Node process restarts when the filesystem survives. A container replacement or deployment without a persistent disk can erase them. Rerun GA1 to upload its ledger and upload your lab archives again after such a redeploy.

## Automatic signed terminal labs

The scripts show a login panel when signed archives are missing. Log in once on your own machine with the official termlog binary using your exam email, then paste your local `auth.json` (`cat ~/.local/state/termlog/auth.json`) into the panel. The backend verifies the email, runs the real lab commands through a terminal, verifies each recording, packages its unchanged bytes and uploads it to Catbox. If Catbox is unavailable, it hosts the archive on the backend. Pasted logins are wiped with the job directory afterwards; no Google password is ever typed into the solver.

Sign in using the displayed exam email. Google's native-client callback points to a localhost address; copy that complete address from the sign-in popup into the panel. The backend forwards it only to that job's official CLI listener, which completes Google's PKCE exchange and validates the identity. No Google password is entered into the solver. Temporary Google credentials and challenge files are deleted after the job.

Running GA1 first generates all three labs in one sign-in and caches their public URLs in that browser for GA2. Disable this flow with `autoLabs: false` if you already have your own archives.

## Manual terminal-lab fallback

Install the official [termlog binary](https://github.com/mynkpdr/termlog). Each student must run `termlog login` using their own registered exam email. A deployed backend cannot produce that Google identity proof.

After pasting the browser helper, print the personalized commands:

```js
// On GA1:
window.__ga1TermlogCommands();

// On GA2:
window.__ga2TermlogCommands('httpbin');
window.__ga2TermlogCommands('model');
```

Run each lab in a fresh folder. Start the recording, paste the lab commands into its shell, inspect their real output, then type `exit` to produce the receipt. Verify and package the two files, upload the archive, and paste the full returned URL in the question. The Ollama lab requires a working local Ollama installation and a downloaded base model before recording. Override its base model with `GA2_OPTIONS.ollamaBaseModel` if needed.

The GA1 challenge changes every three hours. Fetch and decode it inside the same recording. The generated commands try the six orders of ROT13, hex decoding and reversal using actual shell utilities.

## Model intelligence

The official question prompts for each student's AI Pipe token. Tokens stay in page memory and go to the official exam backend for evaluation, never into shared source or saved answers. A passing result requires the real six model replies to meet the question's rule; no prompt is guaranteed to pass.

Inspect the trial feedback. To evaluate another prompt:

```js
await window.__ga2IntelTry('Your new prompt. Reply only YES or NO.');
```

Each distinct prompt consumes six model calls and is cached by the exam. The helper preserves your current prompt on reruns, including a prompt you have already verified. It automatically searches a bounded batch of reasoning prompts after a failed evaluation, honoring the exam rate limit; `autoIntel: false` disables the search. Only a passing real server evaluation is accepted.

## Tangram

The old signature bypass and fabricated JWT have been removed. A genuine existing receipt is preserved. `window.__ga1TangramOpen()` opens the official board with the student's target metadata in its URL. The board exposes WebMCP tools to read state, apply poses and attest a real arrangement. A browser's availability banner does not replace checking those exposed tools.

The backend can submit exact, verified arrangements to the official game API and obtain genuine receipts. Unsupported targets stay pending while the search continues; approximate layouts are never submitted as successful answers. A manually obtained receipt can also be filled using `window.__ga1UTangram(receipt)`, then Check and Save.

## Existing endpoint URLs

```text
base = https://HOST/s/<encodeURIComponent(email)>
```

| Endpoint | Question |
|---|---|
| `base` | FastAPI metrics, compose counters, observability, orders, middleware |
| `base/analytics` | Analytics |
| `base/verify` | OAuth JWT validation |
| `base/extract` | Invoice extraction |
| `base/stream.json` | Stream reassembly |
| `base/docker.json` | Docker cache analysis |
| `https://HOST/mcp/<email>` | Live MCP server |
| Upload `POST /ledger/<email>`, use `POST /answer/<email>` | Ledger agent |

## Verify locally

```bash
npm ci
npm test
npm start
```

Tests cover complete exports, all 85 fallback pages, real rejected validations, signed-URL preservation, vendor punctuation, exchange rates, deduplication, timezones, rankings, per-student isolation, storage recovery and byte-preserving archive hosting.
