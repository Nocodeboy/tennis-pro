// The padel court's cage (court.ts, WALL): the back walls glass to 3 m with wire mesh to 4 m, the side walls 2 m of
// full glass, 2 m of the step (glass to 2 m, mesh to 3 m) and the 12 m round the net in mesh to 3 m with two doors a
// side (closed: the ball plays them as mesh), on black steel posts and rails.
//
// Built for a phone: three meshes, three draw calls (none in the shadow pass).
//  · the glass: 18 quads, one material. Mostly clear with a faint green tint, more of the stadium reflected at a
//    glancing angle (Fresnel), its polished edges and a ball's impact (a flash and a ring that fade) in the shader;
//  · the wire mesh: a few big quads, the weave worked out per pixel (no texture, no moiré: as the net in venue.ts),
//    a little wobble where a ball hits it (vertex shader);
//  · the steel: posts, rails, the glass' fittings and the doors in one opaque mesh that casts the cage's shadows.
// A wall between the camera and the court (the near back wall from the gameplay camera, a side wall from a TV angle
// in the stands) fades: the glass to a hint, the mesh to a trace and the steel away, so nothing hides the players.

import * as THREE from 'three';
import { HL, W, WALL } from '../sim/court';

/** how many impacts the glass shows at once */
const IMPACTS = 4;
/** the side mesh's doors: centre (m from the net), width, height */
export const DOOR = { z: 3.0, w: 0.9, h: 2.05 };
/** the glass' tint and how clear it is head on */
const GLASS = { tint: 0xd8efe6, alpha: 0.07, edge: 0.012 };

/** One panel of a wall: the plane of the wall (axis 'x': a side wall at x = s·W/2; 'z': a back wall at z = s·HL). */
interface Panel {
  axis: 'x' | 'z';
  s: 1 | -1;
  /** along the wall: from a to b (z for a side wall, x for a back wall), and from y0 to y1 */
  a: number;
  b: number;
  y0: number;
  y1: number;
}

export interface Cage {
  group: THREE.Group;
  /** a ball met a wall: the glass flashes and keeps a fading mark, the mesh shakes a little */
  impact(x: number, y: number, z: number, surface: 'glass' | 'mesh', speed: number): void;
  /** advance the clock of the marks and the wobble (s) */
  update(dt: number): void;
}

/** the glass and the mesh of the four walls (court.ts, WALL) */
function panels(): { glass: Panel[]; mesh: Panel[] } {
  const glass: Panel[] = [];
  const mesh: Panel[] = [];
  const hw = W / 2;
  for (const s of [1, -1] as const) {
    // the back wall: five panels of glass 2 m wide, the mesh over them
    for (let i = 0; i < 5; i++) glass.push({ axis: 'z', s, a: -hw + i * 2, b: -hw + (i + 1) * 2, y0: 0, y1: WALL.glassH });
    mesh.push({ axis: 'z', s, a: -hw, b: hw, y0: WALL.glassH, y1: WALL.topH });
  }
  for (const s of [1, -1] as const)
    for (const e of [1, -1]) {
      // a side wall from the back wall at e·HL: the full glass, the step, then the mesh to the net
      const z0 = e * HL;
      const z1 = e * (HL - WALL.glassLen);
      const z2 = e * (HL - WALL.glassLen - WALL.stepLen);
      glass.push({ axis: 'x', s, a: Math.min(z0, z1), b: Math.max(z0, z1), y0: 0, y1: WALL.glassH });
      mesh.push({ axis: 'x', s, a: Math.min(z0, z1), b: Math.max(z0, z1), y0: WALL.glassH, y1: WALL.topH });
      glass.push({ axis: 'x', s, a: Math.min(z1, z2), b: Math.max(z1, z2), y0: 0, y1: WALL.stepH });
      mesh.push({ axis: 'x', s, a: Math.min(z1, z2), b: Math.max(z1, z2), y0: WALL.stepH, y1: WALL.stepTopH });
    }
  // the side mesh round the net, one quad a side
  const zm = HL - WALL.glassLen - WALL.stepLen;
  for (const s of [1, -1] as const) mesh.push({ axis: 'x', s, a: -zm, b: zm, y0: 0, y1: WALL.meshH });
  return { glass, mesh };
}

/** a point on a panel's wall plane: u along the wall, y up, `out` m out of the court */
function onWall(p: Panel, u: number, y: number, out = 0): [number, number, number] {
  return p.axis === 'x' ? [p.s * (W / 2 + out), y, u] : [u, y, p.s * (HL + out)];
}

/**
 * The panels as quads (cut into cells of about `cell` m so the vertex shader can bend them), with: uv in metres
 * across the panel, the panel's size, and the inward normal (into the court) for the fade.
 */
function panelGeometry(list: Panel[], cell: number): THREE.BufferGeometry {
  const P: number[] = [];
  const N: number[] = [];
  const U: number[] = [];
  const S: number[] = [];
  const I: number[] = [];
  for (const p of list) {
    const len = p.b - p.a;
    const h = p.y1 - p.y0;
    const nu = Math.max(1, Math.round(len / cell));
    const nv = Math.max(1, Math.round(h / cell));
    const nIn = p.axis === 'x' ? [-p.s, 0, 0] : [0, 0, -p.s];
    const k = P.length / 3;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const u = (i / nu) * len;
        const v = (j / nv) * h;
        P.push(...onWall(p, p.a + u, p.y0 + v));
        N.push(...nIn);
        U.push(u, v);
        S.push(len, h);
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = k + j * (nu + 1) + i;
        I.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 2));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}

/**
 * How much a wall is between the camera and the court (0 … 1), from its inward normal: the camera on the outside of
 * that wall's plane. (GLSL, vertex stage: `n` the inward normal, `w` the world position.)
 */
const FADE_GLSL = /* glsl */ `
float pbCageFade( vec3 n, vec3 w ) {
  return smoothstep( 0.3, 1.5, -dot( cameraPosition - w, n ) );
}`;

/**
 * The glass: a standard material (the stadium's environment map gives the reflections) drawn with premultiplied
 * alpha, so a reflection stays bright on clear glass: the colour is the tinted light let through times the alpha,
 * plus the reflection at full strength. Alpha grows with the angle (Fresnel), at the polished edges, and with an
 * impact. A faded wall keeps a fifth of its tint and of its reflections.
 */
function glassMaterial(imp: { value: THREE.Vector4[] }, time: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: GLASS.tint, roughness: 0.06, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.onBeforeCompile = (s) => {
    s.uniforms.uImp = imp;
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aSize;\nvarying vec2 vPane;\nvarying vec2 vSize;\nvarying vec3 vPbW;\nvarying float vFade;\n${FADE_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPane = uv; vSize = aSize;
        vPbW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vFade = pbCageFade( normal, vPbW );`,
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec4 uImp[ ${IMPACTS} ]; uniform float uTime;
        varying vec2 vPane; varying vec2 vSize; varying vec3 vPbW; varying float vFade;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // the polished edge of the panel (a pale green line, the 1 cm gap to the next panel darker)
          vec2 e2 = min( vPane, vSize - vPane );
          float ed = min( e2.x, e2.y );
          float fw = max( fwidth( ed ), 1e-4 );
          float edge = 1.0 - smoothstep( ${GLASS.edge.toFixed(3)} - fw, ${GLASS.edge.toFixed(3)} + fw, ed );
          float gap = 1.0 - smoothstep( 0.0, 0.004 + fw, ed );
          // more reflection at a glancing angle
          float nv = abs( dot( normal, geometryViewDir ) );
          float fres = pow( 1.0 - nv, 5.0 );
          // the floodlights' sheen on the glass: soft diagonal streaks across each panel (what tells glass from air on
          // a broadcast), and a little more towards the top
          float sd = ( vPane.x + vPane.y * 0.55 ) / 2.2;
          float sheen = 0.5 * smoothstep( 0.06, 0.0, abs( fract( sd + 0.18 ) - 0.5 ) - 0.16 ) + 0.35 * smoothstep( 0.03, 0.0, abs( fract( sd * 1.7 + 0.61 ) - 0.5 ) - 0.04 );
          sheen *= 0.4 + 0.6 * smoothstep( 0.0, vSize.y, vPane.y );
          // a ball's impact: a quick flash, then a ring that spreads and a mark that fades over a second and a half
          float hit = 0.0;
          for ( int i = 0; i < ${IMPACTS}; i++ ) {
            vec4 im = uImp[ i ];
            float age = uTime - im.w;
            if ( age < 0.0 || age > 1.6 ) continue;
            float d = distance( vPbW, im.xyz );
            float flash = exp( - d * d / 0.012 ) * exp( - age * 9.0 );
            float r = 0.06 + age * 0.5;
            float ring = exp( - pow( ( d - r ) / 0.025, 2.0 ) ) * exp( - age * 3.2 ) * 0.5;
            float mark = exp( - d * d / 0.004 ) * ( 1.0 - smoothstep( 0.3, 1.6, age ) ) * 0.35;
            hit += flash + ring + mark;
          }
          float keep = mix( 1.0, 0.2, vFade );
          float a = ( ${GLASS.alpha.toFixed(3)} + 0.3 * fres + 0.5 * edge + 0.05 * sheen ) * keep;
          a = clamp( a + hit * 0.5, 0.0, 1.0 ) * ( 1.0 - gap * 0.6 );
          vec3 through = totalDiffuse * mix( 1.0, 0.75, edge );
          vec3 col = through * a + totalSpecular * keep * ( 0.5 + 0.5 * fres ) + vec3( 0.8, 0.88, 1.0 ) * ( sheen * 0.05 * keep + hit * 0.9 );
          gl_FragColor = vec4( col, a );
        }`,
      );
  };
  m.customProgramCacheKey = () => 'pb-glass';
  return m;
}

/**
 * The wire mesh (welded, cells 5 cm, wires 3 mm), worked out per pixel and filtered by how much a pixel covers, as
 * the net: crisp up close, a dark veil where a cell is a pixel or less. Matte black steel. A hit shakes it: the
 * vertices round the impact swing in and out along the normal, dying away.
 */
function meshMaterial(wob: { value: THREE.Vector4 }, wobAmp: { value: number }, time: { value: number }): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0x15171b, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  m.onBeforeCompile = (s) => {
    s.uniforms.uWob = wob;
    s.uniforms.uWobAmp = wobAmp;
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uWob; uniform float uWobAmp; uniform float uTime;\nvarying vec2 vWire;\nvarying float vFade;\n${FADE_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWire = uv / 0.05;
        {
          vec3 w = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
          float age = uTime - uWob.w;
          if ( age >= 0.0 && age < 1.2 ) {
            float d = distance( w, uWob.xyz );
            transformed += objectNormal * uWobAmp * exp( - d * d / 0.5 ) * exp( - age * 4.5 ) * sin( age * 46.0 );
          }
          vFade = pbCageFade( objectNormal, w );
        }`,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWire;\nvarying float vFade;')
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
        {
          vec2 fw = max( fwidth( vWire ), vec2( 1e-4 ) );
          vec2 d = abs( fract( vWire + 0.5 ) - 0.5 );
          const float cw = 0.065; // wire width in cells
          vec2 cov = clamp( ( 0.5 * cw + 0.5 * fw - d ) / fw, 0.0, 1.0 );
          cov = min( cov, vec2( cw ) / fw );
          vec2 far = smoothstep( vec2( 0.3 ), vec2( 1.0 ), fw );
          cov = mix( cov, vec2( 0.14 ), far );
          // (a wall in front of the camera keeps only a trace: its wires crossed the near players in dark bands)
          diffuseColor.a *= ( 1.0 - ( 1.0 - cov.x ) * ( 1.0 - cov.y ) ) * mix( 1.0, 0.05, vFade );
        }`,
      );
  };
  m.customProgramCacheKey = () => 'pb-wiremesh';
  return m;
}

/**
 * The steel: posts, rails, fittings and doors in one mesh (black powder coat, a little sheen). A faded wall's steel is
 * dithered to a ghost (the mesh stays opaque and sorted as any other).
 */
function steelMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.42, metalness: 0.55 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 aIn;\nvarying float vFade;\n${FADE_GLSL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = pbCageFade( aIn, ( modelMatrix * vec4( transformed, 1.0 ) ).xyz );');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      {
        // (a 4 × 4 ordered dither: a wall half in front of the camera keeps a ghost of its frame; one right in front of
        // it, none: its rails crossed the near players as dotted lines)
        const float B[ 16 ] = float[ 16 ]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
        ivec2 q = ivec2( mod( floor( gl_FragCoord.xy ), 4.0 ) );
        if ( vFade > ( B[ q.x + 4 * q.y ] + 0.5 ) / 16.0 ) discard;
      }`,
    );
  };
  m.customProgramCacheKey = () => 'pb-steel';
  return m;
}

/** Collects the steel's boxes (each with the inward normal of its wall, for the fade). */
class Steel {
  private parts: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  /** a box sx × sy × sz at (x, y, z) turned by ry, belonging to the wall whose inward normal is (nx, 0, nz) */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, nx: number, nz: number, ry = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    g.applyMatrix4(this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e.set(0, ry, 0)), this.one));
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = nx;
      a[i * 3 + 2] = nz;
    }
    g.setAttribute('aIn', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    this.parts.push(g);
  }
  geometry(): THREE.BufferGeometry {
    let count = 0;
    for (const g of this.parts) count += g.attributes.position.count;
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'aIn']) {
      const arr = new Float32Array(count * 3);
      let o = 0;
      for (const g of this.parts) {
        const a = g.attributes[name].array as Float32Array;
        arr.set(a, o);
        o += a.length;
      }
      out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
    }
    for (const g of this.parts) g.dispose();
    out.computeBoundingSphere();
    return out;
  }
}

/** The posts, the rails, the glass' fittings and the doors. */
function steel(): THREE.BufferGeometry {
  const st = new Steel();
  const hw = W / 2;
  const P = 0.07; // a post's section
  const RL = 0.045; // a rail's section
  const O = P / 2 + 0.004; // posts and rails stand just outside the wall's plane
  // ---- the back walls: posts every 2 m behind the glass joints, to the top of the mesh; the rails at 3 and 4 m
  for (const s of [1, -1]) {
    const z = s * (HL + O);
    for (let i = 0; i <= 5; i++) {
      const x = -hw + i * 2;
      st.box(x, WALL.topH / 2, z, P, WALL.topH, P, 0, -s);
    }
    for (const y of [WALL.glassH, WALL.topH - RL / 2]) st.box(0, y, z, W + P, RL, RL, 0, -s);
    // the glass' fittings: two clamps at each joint, on the court side (a black plate and its bolt head)
    for (let i = 1; i < 5; i++)
      for (const y of [0.45, 2.55]) {
        st.box(-hw + i * 2, y, s * (HL - 0.008), 0.09, 0.11, 0.012, 0, -s);
        st.box(-hw + i * 2, y, s * (HL - 0.017), 0.03, 0.03, 0.008, 0, -s);
      }
  }
  // ---- the side walls
  for (const s of [1, -1]) {
    const x = s * (hw + O);
    const zs = HL - WALL.glassLen; // the full glass ends
    const zm = HL - WALL.glassLen - WALL.stepLen; // the step ends: the mesh to the net
    for (const e of [1, -1]) {
      // the corner post is the back wall's; one where the full glass meets the step, one where the step ends
      st.box(x, WALL.topH / 2, e * zs, P, WALL.topH, P, -s, 0);
      st.box(x, WALL.stepTopH / 2, e * zm, P, WALL.stepTopH, P, -s, 0);
      // the rails: the top of the full glass' mesh, the glass' top, the step's top and its glass
      const mid = (a: number, b: number) => (e * (a + b)) / 2;
      st.box(x, WALL.topH - RL / 2, mid(HL, zs), RL, RL, WALL.glassLen, -s, 0);
      st.box(x, WALL.glassH, mid(HL, zs), RL, RL, WALL.glassLen, -s, 0);
      st.box(x, WALL.stepTopH - RL / 2, mid(zs, zm), RL, RL, WALL.stepLen, -s, 0);
      st.box(x, WALL.stepH, mid(zs, zm), RL, RL, WALL.stepLen, -s, 0);
      // a fitting between the full glass and the step's glass
      for (const y of [0.45, 1.6]) st.box(s * (hw - 0.008), y, e * zs, 0.012, 0.11, 0.09, -s, 0);
    }
    // the mesh round the net: posts every 2 m, a rail along the top and a kick rail at the foot
    for (let z = -zm + 2; z < zm - 0.5; z += 2) st.box(x, WALL.meshH / 2, z, P * 0.85, WALL.meshH, P * 0.85, -s, 0);
    st.box(x, WALL.meshH - RL / 2, 0, RL, RL, zm * 2, -s, 0);
    st.box(x, 0.03, 0, RL, 0.06, zm * 2, -s, 0);
    st.box(x, 1.5, 0, RL * 0.7, RL * 0.7, zm * 2, -s, 0);
    // the doors, one each side of the net: a frame round the opening, a mid rail and a handle (closed with mesh)
    for (const e of [1, -1]) {
      const zc = e * DOOR.z;
      const F = 0.05;
      for (const dz of [-DOOR.w / 2, DOOR.w / 2]) st.box(x, DOOR.h / 2, zc + dz, F, DOOR.h, F, -s, 0);
      st.box(x, DOOR.h, zc, F, F, DOOR.w + F, -s, 0);
      st.box(x, 1.0, zc, F * 0.7, F * 0.7, DOOR.w, -s, 0);
      // (the handle on the outside, a latch on the inside)
      st.box(x + s * 0.05, 1.05, zc + e * (DOOR.w / 2 - 0.12), 0.03, 0.16, 0.025, -s, 0);
      st.box(x - s * 0.04, 1.05, zc + e * (DOOR.w / 2 - 0.1), 0.02, 0.06, 0.04, -s, 0);
    }
  }
  return st.geometry();
}

export function buildCage(): Cage {
  const g = new THREE.Group();
  const time = { value: 0 };
  const imp = { value: Array.from({ length: IMPACTS }, () => new THREE.Vector4(0, -99, 0, -99)) };
  const wob = { value: new THREE.Vector4(0, -99, 0, -99) };
  const wobAmp = { value: 0 };
  const { glass, mesh } = panels();
  const glassMesh = new THREE.Mesh(panelGeometry(glass, 99), glassMaterial(imp, time));
  // (the glass first among the see-through things: the net, the lines and the markers inside the court over it)
  glassMesh.renderOrder = -1;
  const wire = new THREE.Mesh(panelGeometry(mesh, 0.5), meshMaterial(wob, wobAmp, time));
  wire.renderOrder = -1;
  // (no shadow from the key light: the frame's long hard stripes across the court read as lines, and the ball's own
  // shadow is the cue that matters there; the foot of the walls has its baked contact shade, venue.ts)
  const frame = new THREE.Mesh(steel(), steelMaterial());
  frame.receiveShadow = true;
  g.add(glassMesh, wire, frame);
  let next = 0;
  return {
    group: g,
    impact(x, y, z, surface, speed) {
      if (surface === 'glass') {
        // (a soft ball barely marks it)
        if (speed < 3) return;
        imp.value[next].set(x, y, z, time.value);
        next = (next + 1) % IMPACTS;
      } else {
        wob.value.set(x, y, z, time.value);
        wobAmp.value = Math.min(0.06, 0.004 * speed);
      }
    },
    update(dt) {
      time.value = (time.value + dt) % 3600;
    },
  };
}
