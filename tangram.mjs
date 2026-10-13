import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import seedrandom from 'seedrandom';
const targets = JSON.parse(await readFile(new URL('./tangram-targets.json', import.meta.url), 'utf8'));
const bundled = JSON.parse(await readFile(new URL('./tangram-solutions.json', import.meta.url), 'utf8'));
const inventory = ['large-a','large-b','medium','small-a','small-b','square','parallelogram'];
export function personalizedTarget(email) {
  return targets[Math.floor(seedrandom(`${String(email)}#q-visual-game-tangram`)() * targets.length)];
}
export async function attestPieces(pieces, email) {
  if (!Array.isArray(pieces) || pieces.length !== 7) throw new Error('Seven poses are required.');
  const tuples = inventory.map(id => {
    const pose = pieces.find(piece => piece.id === id);
    if (!pose || !Number.isInteger(pose.x) || !Number.isInteger(pose.y) || !Number.isInteger(pose.orientation) || typeof pose.reflected !== 'boolean') throw new Error('Invalid pose for ' + id);
    return [pose.x,pose.y,pose.orientation,pose.reflected ? 1 : 0];
  });
  const state = Buffer.from(JSON.stringify(tuples)).toString('base64url');
  const response = await fetch('https://tds-network-games.sanand.workers.dev/api/visual/attest', {
    method:'POST',headers:{'Content-Type':'application/json','User-Agent':'Mozilla/5.0'},
    body:JSON.stringify({email,game:'tangram',game_version:1,config_id:'standard-seven-v1',state_version:1,equivalence_version:2,state}),
    signal:AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok || result.invalid || !result.receipt) throw new Error(result.message || result.error || 'Official game validation failed.');
  return result;
}
export async function acceptSolution(dataDir, targetId, pieces) {
  const target = targets.find(target => target.target_id === targetId);
  if (!target) throw new Error('Unknown target.');
  const result = await attestPieces(pieces, 'solver-validation@example.invalid');
  if (result.match_key !== target.expected_match_key) throw new Error('The arrangement does not match that target.');
  const solution = {pieces,expected_match_key:target.expected_match_key};
  await mkdir(join(dataDir,'tangram'),{recursive:true});
  await writeFile(join(dataDir,'tangram',targetId+'.json'),JSON.stringify(solution));
  bundled[targetId] = solution;
  return {ok:true,target_id:targetId};
}
export async function solveTangram(dataDir, email) {
  if (typeof email !== 'string' || !email.includes('@')) throw new Error('Registered email is required.');
  const target = personalizedTarget(email);
  let solution = bundled[target.target_id];
  if (!solution) { try { solution=JSON.parse(await readFile(join(dataDir,'tangram',target.target_id+'.json'),'utf8')); } catch {} }
  if (!solution) return {pending:true,target_id:target.target_id,message:'This target is still being searched. No approximate or forged receipt will be submitted.'};
  const result = await attestPieces(solution.pieces,email);
  if (result.match_key !== target.expected_match_key) throw new Error('The live game returned a different match key.');
  return {target_id:target.target_id,receipt:result.receipt,match_key:result.match_key};
}
