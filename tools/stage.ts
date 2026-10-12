// Staged shots measured in Node (tools/stage-lib.ts): for each, the swing the view plays, the paddle to the ball at
// the contact, the jump, and where the paddle goes before and after (a bajada comes down onto the ball; por 4 finishes
// in front). Usage: npx tsx tools/stage.ts [name prefix…]

import './node-chars';
import { CLIP_NAMES, CharacterView, loadCharAssets } from '../src/render/chars';
import { SCENARIOS, stage } from './stage-lib';

(async () => {
  const a = await loadCharAssets('', 'hero', CLIP_NAMES);
  const only = process.argv.slice(2);
  const kit = { shirtHue: null, paddle: 0xffffff, paddleEdge: 0 };
  console.log('golpe              swing      estilo   pala(cm) salto(cm) pala−0,2s(m) pala+0,3s(m) mín.tras(m)');
  for (const sc of SCENARIOS) {
    if (only.length && !only.some((o) => sc.name.startsWith(o))) continue;
    const ch = new CharacterView(a, kit);
    const r = stage(ch as never, sc);
    console.log(`${r.name.padEnd(18)} ${r.swing.padEnd(10)} ${String(r.swing === 'smash' ? r.over : '').padEnd(8)} ${(r.paddle * 100).toFixed(1).padStart(7)} ${(r.rootY * 100).toFixed(0).padStart(8)} ${r.yPre.toFixed(2).padStart(12)} ${r.y30.toFixed(2).padStart(12)} ${r.minAfter.toFixed(2).padStart(11)}`);
  }
})();
