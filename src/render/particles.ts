import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
uniform float uSoft;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = 1.0 - smoothstep(uSoft, 1.0, d);
  if (a <= 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

/** A pool of camera-facing soft points with per-particle colour, alpha and size. */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private geo: THREE.BufferGeometry;
  readonly max: number;
  count = 0;
  readonly mat: THREE.ShaderMaterial;

  constructor(max: number, opts: { additive?: boolean; soft?: number; depthWrite?: boolean } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 }, uSoft: { value: opts.soft ?? 0.3 } },
      transparent: true,
      depthWrite: opts.depthWrite ?? false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  begin() {
    this.count = 0;
  }
  push(x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 4] = r;
    this.col[i * 4 + 1] = g;
    this.col[i * 4 + 2] = b;
    this.col[i * 4 + 3] = a;
    this.size[i] = size;
  }
  end(scale: number) {
    this.geo.setDrawRange(0, this.count);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    this.mat.uniforms.uScale.value = scale;
  }
}

/** Simple CPU particle list for visual-only effects (smoke, steam, sparks, debris). */
export interface FxP {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  r: number;
  g: number;
  b: number;
  a: number;
  grav: number;
  drag: number;
}

export class FxList {
  items: FxP[] = [];
  constructor(public cap: number) {}
  clear() {
    this.items.length = 0;
  }
  add(p: Partial<FxP> & { x: number; y: number; z: number; life: number }) {
    if (this.items.length >= this.cap) return;
    this.items.push({ vx: 0, vy: 0, vz: 0, s0: 0.3, s1: 0.6, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 0, max: p.life, ...p });
  }
  update(dt: number) {
    let w = 0;
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = 1 - p.drag * dt;
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy *= -0.3;
      }
      this.items[w++] = p;
    }
    this.items.length = w;
  }
  draw(ps: Particles, fadeIn = 0.1) {
    for (const p of this.items) {
      const t = 1 - p.life / p.max;
      const a = p.a * Math.min(1, t / fadeIn) * (1 - t);
      ps.push(p.x, p.y, p.z, p.s0 + (p.s1 - p.s0) * t, p.r, p.g, p.b, a);
    }
  }
}
