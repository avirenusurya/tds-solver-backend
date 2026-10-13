import { readFile } from 'node:fs/promises';
import { TANGRAM_CONFIG, tangramAdapter } from './games/tangram/adapter.js';
import { computeMatchKey } from './visual/kernel.js';
const sols = JSON.parse(await readFile('/tmp/tds-continue/tangram-solutions.json', 'utf8'));
let ok = 0, fail = 0;
for (const [tid, sol] of Object.entries(sols)) {
  const state = { pieces: sol.pieces };
  try {
    const key = await computeMatchKey(tangramAdapter, state, TANGRAM_CONFIG);
    if (key === sol.expected_match_key) ok++;
    else { fail++; console.log('MISMATCH', tid, key.slice(0,16), 'vs', sol.expected_match_key.slice(0,16)); }
  } catch (e) { fail++; console.log('ERROR', tid, e.message); }
}
console.log(`oracle check: ${ok} ok, ${fail} fail out of ${Object.keys(sols).length}`);
