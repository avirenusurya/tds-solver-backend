import { TANGRAM_CONFIG, tangramPolygons } from './games/tangram/adapter.js';
import { algValue } from './games/tangram/algebraic.js';

export const W = 384, H = 288; // sixteenth-unit cells
const INVENTORY = ['large-a', 'large-b', 'medium', 'small-a', 'small-b', 'square', 'parallelogram'];

function pointInPoly(px, py, vs) {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const [xi, yi] = vs[i], [xj, yj] = vs[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Base masks at origin pose, y-up sixteenth cells. Returns {cells: Int32Array flat [dx,dy,...], minX,...} per piece/orient/reflect.
export function buildMasks() {
  const masks = {};
  for (const id of INVENTORY) {
    masks[id] = [];
    for (let o = 0; o < 8; o++) {
      for (const ref of [false, true]) {
        const polys = tangramPolygons({ pieces: [{ id, x: 0, y: 0, orientation: o, reflected: ref }] }, TANGRAM_CONFIG);
        const vs = polys[0].vertices.map((v) => [algValue(v.x, 1), algValue(v.y, 1)]); // sixteenth-unit floats
        const xs = vs.map((v) => v[0]), ys = vs.map((v) => v[1]);
        const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
        const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
        const cells = [];
        for (let i = x0; i < x1; i++) for (let j = y0; j < y1; j++) {
          if (pointInPoly(i + 0.5, j + 0.5, vs)) cells.push(i, j);
        }
        masks[id].push({ o, ref, cells });
      }
    }
  }
  return masks;
}

// Target silhouette raster from SVG path (screen px, y-down) -> sixteenth grid y-up.
// SVG integers halve to .0/.5 sixteenths while pieces snap to integer ticks,
// so build all 4 half-shifted rasters; energy takes the min. Board px height 18*32=576.
export function rasterizeTarget(svg) {
  const loops = [];
  for (const part of svg.split(/(?=[Mm])/)) {
    const nums = part.match(/-?\d+(\.\d+)?/g);
    if (!nums) continue;
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([Number(nums[i]), Number(nums[i + 1])]);
    if (pts.length >= 3) loops.push(pts);
  }
  const variants = [];
  for (const [ox, oy] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]) {
    const grid = new Uint8Array(W * H);
    let x0 = W, y0 = H, x1 = 0, y1 = 0, count = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const px = (i + 0.5 + ox) * 2, py = 576 - (j + 0.5 + oy) * 2;
      let inside = false;
      for (const vs of loops) {
        let c = false;
        for (let a = 0, b = vs.length - 1; a < vs.length; b = a++) {
          const [xi, yi] = vs[a], [xj, yj] = vs[b];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
        }
        if (c) inside = !inside;
      }
      if (inside) { grid[j * W + i] = 1; count++; if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
    }
    variants.push({ grid, count, bbox: { x0, x1, y0, y1 } });
  }
  return { variants };
}
