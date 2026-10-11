// Prepares an AI-made character (Magnific → Tripo → Meshy rig) for the game:
//   · welds and simplifies the mesh (skinning kept), drops the animation it came with
//   · writes one .json with the glTF, its binary (base64) and the colour texture (1024 px webp, data URI):
//     artifact pages serve .json but not .glb, and they block fetching data: URIs
// Usage: node tools/prep-character.mjs <in.glb> <out-name> [target triangles = 18000]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [, , input, name, tri = '18000'] = process.argv;
if (!input || !name) throw new Error('usage: node tools/prep-character.mjs <in.glb> <out-name> [triangles]');
const target = Number(tri);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

// the colour texture: 1024 px webp, carried inside the same JSON (see below)
const tex = root.listTextures()[0];
mkdirSync('assets/chars', { recursive: true });
let texUri = '';
if (tex) {
  writeFileSync(`/tmp/${name}-tex.img`, tex.getImage());
  execFileSync('python3', ['-c', `from PIL import Image\nim=Image.open('/tmp/${name}-tex.img').convert('RGB')\nim=im.resize((1024,1024), Image.LANCZOS)\nim.save('/tmp/${name}-tex.webp','WEBP',quality=86,method=6)`]);
  texUri = 'data:image/webp;base64,' + readFileSync(`/tmp/${name}-tex.webp`).toString('base64');
}
for (const t of root.listTextures()) t.dispose();
for (const a of root.listAnimations()) a.dispose();
// a clean material: the game sets the map, roughness and the rest
for (const m of root.listMaterials()) {
  m.setBaseColorTexture(null);
  m.setDoubleSided(false);
  m.setRoughnessFactor(0.85);
  m.setMetallicFactor(0);
}

let before = 0;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) before += p.getIndices().getCount() / 3;
await MeshoptSimplifier.ready;
await doc.transform(weld({}), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / before), error: 0.004, lockBorder: false }), dedup(), prune({ keepAttributes: true }));
let after = 0;
for (const mesh of root.listMeshes())
  for (const p of mesh.listPrimitives()) {
    after += p.getIndices().getCount() / 3;
    // tangents are not needed (no normal map on the characters)
    const tg = p.getAttribute('TANGENT');
    if (tg) {
      p.setAttribute('TANGENT', null);
      tg.dispose();
    }
  }
await doc.transform(prune({ keepAttributes: true }));

// One .json per character: the glTF, its binary buffer and the texture, all as plain JSON fields.
// Artifact pages block fetching data: URIs, so the game rebuilds a GLB in memory from these instead of
// letting the loader fetch anything (render/chars.ts).
const { json, resources } = await io.writeJSON(doc, { format: 0 });
if ((json.buffers ?? []).length !== 1) throw new Error('expected one buffer');
const data = resources[json.buffers[0].uri];
json.buffers = [{ byteLength: data.byteLength }];
const out = JSON.stringify({ gltf: json, bin: Buffer.from(data).toString('base64'), tex: texUri });
writeFileSync(`assets/chars/${name}.json`, out);
console.log(`${name}: ${Math.round(before)} → ${Math.round(after)} triangles, ${(out.length / 1024).toFixed(0)} KB json`);
