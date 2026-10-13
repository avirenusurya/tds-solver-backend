import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { labCommands, validateCallback, validateChallengeUrl } from './labs.mjs';

test('OAuth callback is bound to this login port and state; external and other local requests are refused', () => {
  const auth = 'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2F127.0.0.1%3A54321&state=one-job';
  const valid = 'http://127.0.0.1:54321/?state=one-job&code=temporary-code';
  assert.equal(validateCallback(valid, auth), valid);
  for (const url of ['http://127.0.0.1:54322/?state=one-job&code=x', 'http://127.0.0.1:54321/?state=other-job&code=x', 'http://127.0.0.1:54321/private?state=one-job&code=x', 'https://example.invalid/?state=one-job&code=x']) {
    assert.throws(() => validateCallback(url, auth));
  }
});

test('personal challenge links cannot fetch a different account or an arbitrary service', () => {
  const url = 'https://exam.sanand.workers.dev/questionData?email=learner%40example.invalid&quizSign=temporary&questionId=q-termlog-rec-server';
  assert.equal(validateChallengeUrl(url, 'learner@example.invalid'), url);
  assert.throws(() => validateChallengeUrl(url, 'other@example.invalid'));
  assert.throws(() => validateChallengeUrl('https://example.invalid/', 'learner@example.invalid'));
  const commands = labCommands('decode', 'learner@example.invalid', url);
  assert.equal(commands.filter((command) => command.includes('cat cipher.txt |')).length, 6);
});

test('lab command generation uses real HTTP requests and per-student model configurations', () => {
  const http = labCommands('httpbin', 'learner@example.invalid');
  assert.equal(http.length, 9);
  for (const label of ['GET','POST','FORM','AUTH','REDIRECT','COOKIES','STATUS']) assert.ok(http.some((command) => command.startsWith('capture ' + label + ' curl')));
  const first = labCommands('model', 'learner@example.invalid').join('\n');
  const second = labCommands('model', 'other@example.invalid').join('\n');
  assert.notEqual(first, second);
  assert.ok(first.includes('ollama create ga2-assistant-'));
  assert.ok(first.includes('ollama show --modelfile'));
  assert.ok(first.includes('PARAMETER temperature'));
});

const exec = (command, args, env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env, stdio: ['ignore','pipe','pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (data) => { stdout += data; }); child.stderr.on('data', (data) => { stderr += data; });
  child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
});

test('official recorder captures real input/output, flushes an exit event, and verifies untouched signed bytes', { skip: !process.env.TDS_TEST_TERMLOG }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tds-recorder-check-'));
  // Explicit test-only identity: production job code rejects development caches.
  const env = { ...process.env, TERMLOG_STATE_HOME: join(dir, 'auth'), TERMLOG_ALLOW_DEV_AUTH: '1' };
  const binary = process.env.TDS_TEST_TERMLOG;
  try {
    await exec(binary, ['login'], env);
    const spec = { command: binary, cast: 'test.cast', cwd: dir, commands: ["printf 'REAL_COMMAND_OUTPUT\\n'"], timeout: 30 };
    const path = join(dir, 'commands.json'); await writeFile(path, JSON.stringify(spec));
    await exec('python3', ['tools/record-lab.py', path], env);
    const report = JSON.parse(await exec(binary, ['verify', join(dir, 'test.cast'), '--format', 'json'], env));
    assert.equal(report.ok, true); assert.equal(report.exit_event_present, true);
    const events = (await readFile(join(dir, 'test.cast'), 'utf8')).trim().split('\n').slice(1).map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event[1] === 'i' && event[2].includes('printf')));
    assert.ok(events.some((event) => event[1] === 'o' && event[2].includes('REAL_COMMAND_OUTPUT')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
