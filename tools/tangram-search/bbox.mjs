import { readFile } from 'node:fs/promises';
import { TANGRAM_CONFIG, tangramPolygons } from './games/tangram/adapter.js';
import { algValue } from './games/tangram/algebraic.js';
const sols = JSON.parse(await readFile('/tmp/tds-continue/tangram-solutions.json', 'utf8'));
const targets = JSON.parse(await readFile('/tmp/twork/targets.json', 'utf8'));
for (const tid of ['tg-076', 'tg-012', 'tg-021']) {
  const polys = tangramPolygons({ pieces: sols[tid].pieces }, TANGRAM_CONFIG);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of polys) for (const v of p.vertices) {
    const x = algValue(v.x), y = algValue(v.y);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const nums = targets[tid].svg.match(/-?\d+/g).map(Number);
  const sx = nums.filter((_, i) => i % 2 === 0), sy = nums.filter((_, i) => i % 2 === 1);
  console.log(tid, 'union bbox', (x1 - x0).toFixed(2), 'x', (y1 - y0).toFixed(2), '| svg bbox', Math.max(...sx) - Math.min(...sx), 'x', Math.max(...sy) - Math.min(...sy));
}
