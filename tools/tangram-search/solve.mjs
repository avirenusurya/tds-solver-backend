import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { TANGRAM_CONFIG, tangramAdapter } from './games/tangram/adapter.js';
import { computeMatchKey } from './visual/kernel.js';
import { W, H, buildMasks, rasterizeTarget } from './geo.mjs';

const INVENTORY = ['large-a', 'large-b', 'medium', 'small-a', 'small-b', 'square', 'parallelogram'];
const MASKS = buildMasks();
const union = new Int16Array(W * H);

function evaluate(poses, variants) {
  union.fill(0);
  let ux0 = 1e9, uy0 = 1e9;
  for (let p = 0; p < 7; p++) {
    const pose = poses[p];
    const cells = MASKS[pose.id][pose.mi].cells;
    const bx = pose.x, by = pose.y;
    for (let k = 0; k < cells.length; k += 2) {
      const i = cells[k] + bx, j = cells[k + 1] + by;
      if (i < 0 || i >= W || j < 0 || j >= H) return 1e9;
      if (i < ux0) ux0 = i;
      if (j < uy0) uy0 = j;
      union[j * W + i]++;
    }
  }
  let best = Infinity;
  for (const v of variants) {
    const dx = ux0 - v.bbox.x0, dy = uy0 - v.bbox.y0;
    let mismatch = 0, overlap = 0;
    const t = v.grid;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = union[j * W + i];
      if (u > 1) overlap += u - 1;
      const ti = i - dx, tj = j - dy;
      const tv = ti < 0 || ti >= W || tj < 0 || tj >= H ? 0 : t[tj * W + ti];
      if ((u > 0 ? 1 : 0) !== tv) mismatch++;
    }
    const val = mismatch + 5 * overlap;
    if (val < best) best = val;
  }
  return best;
}

const rnd = (n) => Math.floor(Math.random() * n);
function scatterPose(id, bbox) {
  const x = Math.max(0, Math.min(W - 1, bbox.x0 + rnd(Math.max(1, bbox.x1 - bbox.x0)) + rnd(49) - 24));
  const y = Math.max(0, Math.min(H - 1, bbox.y0 + rnd(Math.max(1, bbox.y1 - bbox.y0)) + rnd(49) - 24));
  return { id, x, y, mi: rnd(16) };
}
function mutatePose(pose, strength) {
  const p = { ...pose };
  const r = Math.random();
  if (r < 0.5) {
    const s = strength * (1 + rnd(6));
    p.x = Math.max(0, Math.min(W - 1, p.x + rnd(2 * s + 1) - s));
    p.y = Math.max(0, Math.min(H - 1, p.y + rnd(2 * s + 1) - s));
  } else if (r < 0.72) {
    p.mi = rnd(16);
  } else if (r < 0.82) {
    p.mi = (p.mi + 1 + rnd(15)) % 16;
  } else {
    return null; // signal swap
  }
  return p;
}

async function tryExact(poses, expected) {
  const state = { pieces: poses.map((p) => ({ id: p.id, x: p.x, y: p.y, orientation: MASKS[p.id][p.mi].o, reflected: MASKS[p.id][p.mi].ref })) };
  try {
    if ((await computeMatchKey(tangramAdapter, state, TANGRAM_CONFIG)) === expected) return state.pieces;
  } catch {}
  return null;
}

// normalized cell-set IoU donor search among solved targets
function pickDonor(targetVariants, solvedRasters) {
  const t = targetVariants[0];
  const tset = new Set();
  for (let j = t.bbox.y0; j <= t.bbox.y1; j++) for (let i = t.bbox.x0; i <= t.bbox.x1; i++)
    if (t.grid[j * W + i]) tset.add((i - t.bbox.x0) + ',' + (j - t.bbox.y0));
  let best = null, bestIoU = 0;
  for (const s of solvedRasters) {
    let inter = 0;
    for (const c of s.cells) if (tset.has(c)) inter++;
    const iou = inter / (s.cells.size + tset.size - inter);
    if (iou > bestIoU) { bestIoU = iou; best = s; }
  }
  return { donor: best, iou: bestIoU, tmin: { x: t.bbox.x0, y: t.bbox.y0 } };
}

export async function solveOne(targetId, expected, svg, budgetSec, solvedRasters, onTick) {
  const { variants } = rasterizeTarget(svg);
  const bbox = variants[0].bbox;
  const { donor, iou, tmin } = pickDonor(variants, solvedRasters);
  const deadline = Date.now() + budgetSec * 1000;
  let best = Infinity;
  const t0 = Date.now();
  let round = 0;
  while (Date.now() < deadline) {
    round++;
    let poses;
    if (donor && round % 2 === 0) {
      // transplant: donor arrangement shifted onto target min + jitter
      const dx = tmin.x - donor.min.x + rnd(9) - 4, dy = tmin.y - donor.min.y + rnd(9) - 4;
      poses = donor.poses.map((p) => ({
        id: p.id,
        x: Math.max(0, Math.min(W - 1, p.x + dx)),
        y: Math.max(0, Math.min(H - 1, p.y + dy)),
        mi: Math.random() < 0.85 ? p.mi : rnd(16),
      }));
    } else {
      poses = INVENTORY.map((id) => scatterPose(id, bbox));
    }
    let cur = evaluate(poses, variants);
    const iters = 80000;
    let stall = 0;
    for (let it = 0; it < iters && Date.now() < deadline; it++) {
      const T = 30 * Math.pow(0.0002, it / iters);
      const k = rnd(7);
      let next = poses.slice();
      const mut = mutatePose(poses[k], cur > 2000 ? 24 : cur > 400 ? 8 : 2);
      if (mut === null) {
        const k2 = (k + 1 + rnd(6)) % 7;
        const a = { ...next[k] }, b = { ...next[k2] };
        const ax = a.x, ay = a.y; a.x = b.x; a.y = b.y; b.x = ax; b.y = ay;
        next[k] = a; next[k2] = b;
      } else next[k] = mut;
      const val = evaluate(next, variants);
      if (val <= cur || Math.random() < Math.exp((cur - val) / Math.max(T, 1e-6))) {
        poses = next; cur = val; stall = 0;
        if (cur < best) {
          best = cur;
          if (best < 800) {
            const hit = await tryExact(poses, expected);
            if (hit) return { pieces: hit, ms: Date.now() - t0 };
          }
        }
      } else if (++stall > 30000) break;
    }
    if (onTick) onTick(best, Date.now() - t0, iou);
  }
  return null;
}

if (process.argv[1].endsWith('solve.mjs')) {
  const [tid, secs] = [process.argv[2], Number(process.argv[3] || 300)];
  const targets = JSON.parse(await readFile('/tmp/twork/targets.json', 'utf8'));
  const sols = JSON.parse(await readFile('/tmp/tds-continue/tangram-solutions.json', 'utf8'));
  const solvedRasters = [];
  for (const [sid, sol] of Object.entries(sols)) {
    const unionL = new Int16Array(W * H);
    for (const pc of sol.pieces) {
      const mi = pc.orientation * 2 + (pc.reflected ? 1 : 0);
      for (let k = 0; k < MASKS[pc.id][mi].cells.length; k += 2)
        unionL[(MASKS[pc.id][mi].cells[k + 1] + pc.y) * W + MASKS[pc.id][mi].cells[k] + pc.x]++;
    }
    let x0 = W, y0 = H;
    const cells = new Set();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (unionL[j * W + i]) {
      x0 = Math.min(x0, i); y0 = Math.min(y0, j); cells.add(i + ',' + j);
    }
    const norm = new Set([...cells].map((c) => { const [i, j] = c.split(',').map(Number); return (i - x0) + ',' + (j - y0); }));
    const poses = sol.pieces.map((pc) => ({ id: pc.id, x: pc.x, y: pc.y, mi: pc.orientation * 2 + (pc.reflected ? 1 : 0) }));
    solvedRasters.push({ cells: norm, min: { x: x0, y: y0 }, poses });
  }
  const t = targets[tid];
  if (!t) throw new Error('unknown target ' + tid);
  console.log(`solving ${tid} (${t.family}) budget ${secs}s`);
  const hit = await solveOne(tid, t.expected_match_key, t.svg, secs, solvedRasters, (best, ms, iou) => console.log(`  best=${best} at ${Math.round(ms / 1000)}s donorIoU=${iou.toFixed(2)}`));
  if (hit) {
    await mkdir('/tmp/twork/found', { recursive: true });
    await writeFile(`/tmp/twork/found/${tid}.json`, JSON.stringify({ expected_match_key: t.expected_match_key, pieces: hit.pieces }));
    console.log(`FOUND ${tid}`);
  } else console.log(`missed ${tid}`);
}
