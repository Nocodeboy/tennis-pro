// The characters with the players' builds (render/body.ts, the builds in src/kits.ts), for tools/poses.ts: every
// CharacterView it makes gets the next build in turn (hero, the rivals, Marta), so the pose metrics are measured on
// the real heights, shoulders and hips. Usage: CHARS=./chars-bodies.ts npx tsx tools/poses.ts [seconds] [out.json]
// (the path is relative to tools/)
import * as C from '../src/render/chars';
import { HERO, PARTNER_KIT, RIVAL_KITS } from '../src/kits';
import type { Build } from '../src/render/body';

export * from '../src/render/chars';

const BUILDS: Build[] = [HERO, ...Object.values(RIVAL_KITS), PARTNER_KIT].map((k) => k.kit.body!).filter(Boolean);
let n = 0;

export class CharacterView extends C.CharacterView {
  constructor(a: C.CharAssets, kit: C.Kit, height?: number) {
    const b = BUILDS[n++ % BUILDS.length];
    void height;
    super(a, { ...kit, body: b }, b.height);
  }
}
