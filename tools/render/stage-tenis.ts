// Los golpes escenificados (tools/render/stage-lib.ts) medidos en Node: el swing que juega la vista, el punto dulce a
// la bola en el contacto, el salto, la raqueta antes y después (un cortado baja sobre la bola), la mano izquierda en
// la empuñadura (revés a dos manos). Uso: npx tsx tools/render/stage-tenis.ts [prefijo…]
import '../node-chars';
import { CLIP_NAMES, CharacterView, loadCharAssets } from '../../src/render/chars';
import { SCENARIOS, stage } from './stage-lib';

(async () => {
  const a = await loadCharAssets('', 'hero', CLIP_NAMES);
  const only = process.argv.slice(2);
  const kit = { shirtHue: null, paddle: 0xffffff, paddleEdge: 0 };
  console.log('golpe              swing      dulce(cm) salto(cm) dulce−0,2s(m) dulce+0,3s(m) mín.tras(m) manoI(cm)');
  for (const sc of SCENARIOS) {
    if (only.length && !only.some((o) => sc.name.startsWith(o))) continue;
    const ch = new CharacterView(a, kit);
    const r = stage(ch as never, sc);
    console.log(`${r.name.padEnd(18)} ${r.swing.padEnd(10)} ${(r.paddle * 100).toFixed(1).padStart(8)} ${(r.rootY * 100).toFixed(0).padStart(8)} ${r.yPre.toFixed(2).padStart(13)} ${r.y30.toFixed(2).padStart(13)} ${r.minAfter.toFixed(2).padStart(11)} ${(r.leftHand * 100).toFixed(1).padStart(9)}`);
  }
})();
