# tds-solver-backend — multi-tenant one-click solver backend (GA1 + GA2)

One persistent Node process serves **every** student. Personalize by email-in-path:

```
base = https://HOST/s/<encodeURIComponent(email)>
```

| Paste as answer | Question |
|---|---|
| `base` | GA2 fastapi `/stats`, compose (`/healthz /hit/ /count/`), observability (`/work /metrics /healthz /logs/tail`), idempotency (`/orders`), middleware (`/ping`) |
| `base/analytics` | GA2 deploy-analytics |
| `base/verify` | GA2 oauth-jwks-verify |
| `base/extract` | GA2 local-llm-structured |
| `base/stream.json` | GA2 ollama-stream-reassembly |
| `base/docker.json` | GA2 docker-build-cache |
| `https://HOST/mcp/<email>` | GA1 mcp-server-live |
| upload `POST /ledger/<email>` then paste `https://HOST/answer/<email>` | GA1 ledger-agent |

The matching console solvers (`data-leak/questions/*-console-universal.js`) do all
of this automatically from one paste — set `BACKEND` at the top of the script.

## Run locally

```bash
cd solver-backend
npm install
node server.mjs            # :8080
npm test                   # 82 differential + behavioral checks
```

## Deploy (pick one — must stay awake through Oct 18 grading)

**Fly.io** (recommended, always-on):
```bash
fly launch --no-deploy
fly deploy
fly status   # confirm 1 machine running; auto_stop MUST be false (see fly.toml)
```
Your URL: `https://tds-solver-backend.fly.dev` (or whatever `fly status` shows).

**Render:** new Web Service → Docker → repo `solver-backend/` → plan **starter**
(free sleeps; starter doesn't) → health check `/health`.

**Do NOT use:** plain Vercel serverless functions (in-memory rate buckets,
idempotency keys, obs counters and compose counts don't survive across
invocations → flaky 429/counter checks), laptop tunnels (die on sleep).

## After deploy

1. `curl https://HOST/health` → `{"ok":true,...}`
2. Set `BACKEND = 'https://HOST'` (no trailing slash) in both universal console scripts.
3. Paste each script once on its exam page → Check all green → Save.
4. Keep the service up until grading ends; saved scores re-verify live.

## Privacy

The console posts your ledger JSON to `/ledger/<email>` (needed to answer
ledger questions) and your quizSign is used *in your own browser only* to
fetch your ledger/challenge — it is never sent anywhere. No submissions,
tokens, or quizSigns are logged or stored server-side.
