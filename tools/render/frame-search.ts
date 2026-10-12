// Busca la cámara de juego (vertical y horizontal) para la pista de tenis: proyecta la pista y los jugadores y elige
// distancia, altura, punto de mira y campo de visión con el jugador lejano lo más grande posible, la cabeza del lejano
// bajo el marcador y los pies del cercano por encima de la zona de los pulgares.
// Uso: npx tsx tools/render/frame-search.ts aspecto top bot [dmax]
import * as THREE from 'three';
const HL = 23.77 / 2, WD = 10.97;
const aspect = Number(process.argv[2] ?? 390 / 844);
const TOP = Number(process.argv[3] ?? 0.12);
const BOT = Number(process.argv[4] ?? 0.7);
const DMAX = Number(process.argv[5] ?? 40);
const PMIN = Number(process.argv[6] ?? 0);
const portrait = aspect < 0.8;
const cam = new THREE.PerspectiveCamera(40, aspect, 0.3, 600);
const v = new THREE.Vector3();
const sy = (x: number, y: number, z: number) => (1 - v.set(x, y, z).project(cam).y) / 2;
const sx = (x: number, y: number, z: number) => v.set(x, y, z).project(cam).x;
let best: any = null;
for (let d = 16; d <= DMAX; d += 0.5)
  for (let h = 6; h <= 30; h += 0.5)
    for (let lz = -4; lz <= 10; lz += 0.5)
      for (let f = 22; f <= 70; f += 1) {
        cam.fov = f;
        cam.updateProjectionMatrix();
        cam.position.set(0, h, d);
        cam.lookAt(0, 0, lz);
        cam.updateMatrixWorld();
        const farHead = sy(0, 1.95, -(HL + 0.9));
        const nearFeet = sy(0, 0, HL + 0.9);
        if (farHead < TOP || nearFeet > BOT) continue;
        if (Math.abs(sx(WD / 2, 0, HL)) > (portrait ? Number(process.env.NC ?? 1.15) : 0.85)) continue;
        if (Math.abs(sx(WD / 2, 0, -HL)) > 0.9) continue;
        const farPx = sy(0, 0, -(HL + 0.9)) - sy(0, 1.85, -(HL + 0.9));
        const nearPx = sy(0, 0, HL + 0.9) - sy(0, 1.85, HL + 0.9);
        const pitch = Math.atan2(h, d - lz);
        if (pitch < (PMIN * Math.PI) / 180) continue;
        // (FARMIN: the far player at least this tall, and then the near one as big as can be)
        const FARMIN = Number(process.env.FARMIN ?? 0);
        if (farPx < FARMIN) continue;
        const score = FARMIN ? nearPx : farPx + 0.01 * pitch;
        if (!best || score > best.score) best = { d, h, lz, f, farPx: +farPx.toFixed(4), nearPx: +nearPx.toFixed(4), pitch: +((pitch * 180) / Math.PI).toFixed(1), farHead: +farHead.toFixed(3), nearFeet: +nearFeet.toFixed(3), farBase: +sy(0, 0, -HL).toFixed(3), net: +sy(0, 0, 0).toFixed(3), nearCornerX: +sx(WD / 2, 0, HL).toFixed(3), score };
      }
console.log(JSON.stringify(best));
