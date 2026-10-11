// Training props (src/training.ts): the ball machine on the far side, made from a few shapes so it reads at a glance
// from the gameplay camera (an orange box on wheels, a hopper full of balls, a dark barrel aimed at the player), the
// targets on the court and the zone a ball should land in. They are added to the view's scene and taken away again;
// nothing in the view changes.

import * as THREE from 'three';
import { MOUTH, type Target } from '../sim/drill';

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const LIME = 0xdcff3c;
const GOLD = 0xffd23a;
const WHITE = 0xffffff;
/** the model is built life-size with its mouth at (0, 0.72, 0.45) and drawn bigger, so that the mouth is at MOUTH */
const SCALE = MOUTH.y / 0.72;
const BARREL_Y = 0.72;
const BARREL_Z = 0.45;


export class DrillProps {
  readonly group = new THREE.Group();
  private machine = new THREE.Group();
  private barrel = new THREE.Group();
  private targets: { ring: THREE.Mesh; dot: THREE.Mesh; t: Target; flash: number }[] = [];
  private zone: THREE.Mesh | null = null;
  private zoneA = 0;
  private recoil = 0;
  private puffs: { m: THREE.Mesh; life: number }[] = [];
  private disposables: { dispose(): void }[] = [];

  constructor(private scene: THREE.Scene) {
    this.buildMachine();
    this.machine.scale.setScalar(SCALE);
    this.group.add(this.machine);
    scene.add(this.group);
  }

  private mat(color: number, rough = 0.6, metal = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    this.disposables.push(m);
    return m;
  }
  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.disposables.push(g);
    return g;
  }

  private buildMachine() {
    const body = this.mat(0xff7a1a, 0.5);
    const dark = this.mat(0x1d2a3a, 0.45, 0.2);
    const tyre = this.mat(0x15181c, 0.9);
    const lime = this.mat(LIME, 0.5);
    const shell = this.mat(0xe8eef3, 0.35);
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.machine) => {
      const o = new THREE.Mesh(this.geo(g), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    // the body on four wheels, a lime band around it
    add(new THREE.BoxGeometry(0.62, 0.44, 0.56), body, 0, 0.42, 0);
    add(new THREE.BoxGeometry(0.635, 0.06, 0.575), lime, 0, 0.5, 0);
    for (const x of [-0.27, 0.27])
      for (const z of [-0.2, 0.2]) {
        const w = add(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 14), tyre, x, 0.1, z);
        w.rotation.z = Math.PI / 2;
      }
    // the hopper: an open funnel on top, full of balls
    const hop = add(new THREE.CylinderGeometry(0.34, 0.18, 0.34, 18, 1, true), shell, 0, 0.82, -0.04);
    (hop.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const ballG = this.geo(new THREE.SphereGeometry(0.055, 10, 8));
    const ballM = this.mat(0xe6f53a, 0.5);
    ballM.emissive = new THREE.Color(0x4a5a00);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + (i % 2) * 0.3;
      const r = i < 7 ? 0.2 : 0.08;
      const b = new THREE.Mesh(ballG, ballM);
      b.position.set(Math.cos(a) * r, i < 7 ? 0.93 : 0.98, -0.04 + Math.sin(a) * r);
      this.machine.add(b);
    }
    // the barrel, aimed at the player (+z: the near side), with a lime ring at the mouth
    this.barrel.position.set(0, BARREL_Y, 0.18);
    this.machine.add(this.barrel);
    const tube = add(new THREE.CylinderGeometry(0.075, 0.085, 0.36, 14), dark, 0, 0, 0.1, this.barrel);
    tube.rotation.x = Math.PI / 2;
    const lip = add(new THREE.TorusGeometry(0.075, 0.018, 8, 18), lime, 0, 0, BARREL_Z - 0.18, this.barrel);
    lip.castShadow = false;
  }

  /** Where the machine stands (world; it faces the near side) and the targets and the zone of the challenge. */
  set(machine: { x: number; z: number } | null, targets: Target[], zone: { x0: number; x1: number; z0: number; z1: number } | null) {
    this.machine.visible = !!machine;
    if (machine) this.machine.position.set(machine.x, 0, machine.z);
    for (const t of this.targets) {
      this.group.remove(t.ring, t.dot);
    }
    this.targets = [];
    const ringG = this.geo(new THREE.RingGeometry(0.8, 1, 40));
    const dotG = this.geo(new THREE.RingGeometry(0.34, 0.5, 32));
    for (const t of targets) {
      const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      const dot = new THREE.Mesh(dotG, new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
      for (const m of [ring, dot]) {
        m.rotation.x = -Math.PI / 2;
        m.renderOrder = 3;
        m.position.set(t.x, 0.018, t.z);
        m.scale.setScalar(t.r);
        this.disposables.push(m.material as THREE.Material);
        this.group.add(m);
      }
      this.targets.push({ ring, dot, t, flash: 0 });
    }
    if (this.zone) this.group.remove(this.zone);
    this.zone = null;
    if (zone) {
      const z = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(zone.x1 - zone.x0, zone.z1 - zone.z0)), new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0.16, depthWrite: false }));
      this.disposables.push(z.material as THREE.Material);
      z.rotation.x = -Math.PI / 2;
      z.renderOrder = 2;
      z.position.set((zone.x0 + zone.x1) / 2, 0.011, (zone.z0 + zone.z1) / 2);
      this.zone = z;
      this.group.add(z);
    }
  }

  /** Moves the targets (the serve's box changes sides). */
  moveTargets(targets: Target[]) {
    targets.forEach((t, i) => {
      const k = this.targets[i];
      if (!k) return;
      k.t = t;
      k.ring.position.set(t.x, 0.018, t.z);
      k.dot.position.set(t.x, 0.018, t.z);
    });
  }

  /** A ball left the machine: the barrel kicks back and a puff comes out of the mouth. */
  fire() {
    this.recoil = 1;
    if (REDUCED) return;
    const m = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.09, 10, 8)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    this.disposables.push(m.material as THREE.Material);
    const p = this.machine.position;
    m.position.set(p.x, MOUTH.y, p.z + MOUTH.z + 0.05);
    this.group.add(m);
    this.puffs.push({ m, life: 0.35 });
  }

  /** A ball landed on target `i`: it flashes gold. A ball in the zone: the zone lights up for a moment. */
  hit(i: number) {
    const k = this.targets[i];
    if (k) k.flash = 1;
  }
  zoneHit() {
    this.zoneA = 1;
  }

  update(dt: number, time: number) {
    this.recoil = Math.max(0, this.recoil - dt * 5);
    this.barrel.position.z = 0.18 - 0.06 * Math.sin(this.recoil * Math.PI);
    for (const k of this.targets) {
      k.flash = Math.max(0, k.flash - dt * 1.6);
      const ringM = k.ring.material as THREE.MeshBasicMaterial;
      const dotM = k.dot.material as THREE.MeshBasicMaterial;
      ringM.color.setHex(k.flash > 0 ? GOLD : WHITE);
      dotM.color.setHex(k.flash > 0 ? GOLD : LIME);
      const s = k.t.r * (1 + (REDUCED ? 0 : 0.18 * k.flash + 0.03 * Math.sin(time * 3)));
      k.ring.scale.setScalar(s);
      k.dot.scale.setScalar(s);
      dotM.opacity = 0.6 + 0.35 * k.flash;
    }
    if (this.zone) {
      this.zoneA = Math.max(0, this.zoneA - dt * 2);
      (this.zone.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.22 * this.zoneA;
    }
    for (const p of this.puffs) {
      p.life -= dt;
      p.m.scale.setScalar(1 + (0.35 - p.life) * 5);
      (p.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / 0.35) * 0.55;
      p.m.position.z += dt * 0.8;
    }
    for (const p of this.puffs.filter((x) => x.life <= 0)) this.group.remove(p.m);
    this.puffs = this.puffs.filter((x) => x.life > 0);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
