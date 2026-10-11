// Everything in the stadium that gives off its own light, in one mesh and one draw call: the LED boards round the
// court and the LED ribbons on the stands (the tournament's provisional brand, made-up sponsors and the score, on a
// timer), the faces of the floodlights under the roof, the glazing of the hospitality boxes and the two video boards.
// Unlit and bright (HDR: the high tier's bloom picks the floodlights up), with the LED dot grid drawn per pixel and
// faded to its average where a dot is smaller than a pixel (no moiré at a distance).
//
// Every quad carries its own instructions (aLed): the length one message takes (T, m), the panel's height (H, m), a
// phase (s) and a mode (cycle the messages, scroll them, a floodlight, a lit window, the video board). The text lives
// in two canvases: the static atlas (one message a row) and the dynamic one (the video board, and below it the score
// as an LED message), redrawn only when the score changes.

import * as THREE from 'three';

export const LED = { cycle: 0, scroll: 1, lamp: 2, glass: 3, screen: 4 } as const;

/** a message row's length over its height: the canvas row is 8:1, drawn stretched so it shows right at this aspect */
export const LED_ASPECT = 5.5;
const ROW_W = 1024;
const ROW_H = 128;
const ROWS = 8;
const STRETCH = ROW_W / ROW_H / LED_ASPECT;

/** the type of the boards (provisional brand: the client puts in its own) */
export const HEAD_FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
export const TEXT_FONT = '"Barlow", Arial, sans-serif';
const INK = '#0a0e14';
const WHITE = '#f4f6f8';
const BALL = '#e2f04a';

type Draw = (x: CanvasRenderingContext2D, w: number, h: number) => void;

/** fits a line of text into maxW (px, in the row's stretched space) at most `size` px tall */
function fitText(x: CanvasRenderingContext2D, text: string, size: number, weight: number, font: string, maxW: number) {
  let s = size;
  for (let i = 0; i < 12; i++) {
    x.font = `${weight} ${s}px ${font}`;
    if (x.measureText(text).width <= maxW) break;
    s *= 0.92;
  }
}

/** One message: background, an optional mark, the words (all in the row's own unstretched coordinates). */
function message(bg: string, parts: [string, string][], opts: { mark?: Draw; size?: number; rule?: string } = {}): Draw {
  return (x, w, h) => {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    if (opts.rule) {
      x.fillStyle = opts.rule;
      x.fillRect(0, h - 7, w, 3);
      x.fillRect(0, 4, w, 3);
    }
    // (the words in the middle 72 % of the row: a board shorter than a message still shows all of it)
    const maxW = w * 0.72;
    const size = opts.size ?? 76;
    const full = parts.map((p) => p[0]).join(' ');
    fitText(x, full, size, 700, HEAD_FONT, maxW - (opts.mark ? 70 : 0));
    const widths = parts.map((p) => x.measureText(p[0]).width);
    const gap = x.measureText(' ').width;
    const total = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1) + (opts.mark ? 70 : 0);
    let cx = (w - total) / 2;
    if (opts.mark) {
      x.save();
      x.translate(cx + 28, h / 2);
      opts.mark(x, 56, 56);
      x.restore();
      cx += 70;
    }
    x.textBaseline = 'middle';
    x.textAlign = 'left';
    parts.forEach(([t, col], i) => {
      x.fillStyle = col;
      x.fillText(t, cx, h * 0.54);
      cx += widths[i] + gap;
    });
  };
}

/** a ball: the tour's mark */
const ballMark =
  (fill: string, ink: string): Draw =>
  (x, w) => {
    const r = w * 0.42;
    x.fillStyle = fill;
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = ink;
    for (const [a, b] of [
      [-0.35, -0.3],
      [0.3, -0.25],
      [0, 0.1],
      [-0.3, 0.38],
      [0.32, 0.36],
    ])
      x.fillRect(a * r - 3, b * r - 3, 6, 6);
  };
/** a wing (a made-up airline) and a drop (a made-up water), a coin (a made-up bank), a bolt (a made-up drink) */
const wing: Draw = (x, w) => {
  x.fillStyle = WHITE;
  x.beginPath();
  x.moveTo(-w * 0.45, w * 0.18);
  x.lineTo(w * 0.45, -w * 0.3);
  x.lineTo(w * 0.1, w * 0.3);
  x.closePath();
  x.fill();
};
const drop: Draw = (x, w) => {
  x.fillStyle = '#6cc0ff';
  x.beginPath();
  x.moveTo(0, -w * 0.45);
  x.bezierCurveTo(w * 0.4, -w * 0.05, w * 0.4, w * 0.42, 0, w * 0.42);
  x.bezierCurveTo(-w * 0.4, w * 0.42, -w * 0.4, -w * 0.05, 0, -w * 0.45);
  x.fill();
};
const coin: Draw = (x, w) => {
  x.strokeStyle = BALL;
  x.lineWidth = 6;
  x.beginPath();
  x.arc(0, 0, w * 0.38, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = BALL;
  x.fillRect(-w * 0.2, -4, w * 0.4, 8);
};
const bolt: Draw = (x, w) => {
  x.fillStyle = '#ff8a2a';
  x.beginPath();
  x.moveTo(w * 0.1, -w * 0.45);
  x.lineTo(-w * 0.25, w * 0.05);
  x.lineTo(0, w * 0.05);
  x.lineTo(-w * 0.1, w * 0.45);
  x.lineTo(w * 0.25, -w * 0.08);
  x.lineTo(0, -w * 0.08);
  x.closePath();
  x.fill();
};

/** the rows of the atlas (index = row): the tour, the court, four made-up sponsors, the tour's short mark, off */
export const ROW = { tour: 0, court: 1, bank: 2, water: 3, energy: 4, air: 5, mark: 6, off: 7 } as const;
const MESSAGES: Draw[] = [
  message(INK, [
    ['PRO TOUR', WHITE],
    ['FINALS', BALL],
  ], { rule: '#1b2533' }),
  message('#10161e', [['CENTER COURT', BALL]], { size: 80, rule: '#2a3340' }),
  message('#0f2a44', [['BASELINE BANK', WHITE]], { mark: coin }),
  message('#0b3560', [['VOLLEY WATER', WHITE]], { mark: drop }),
  message('#0b0b0d', [
    ['THIRD SHOT', WHITE],
    ['ENERGY', '#ff8a2a'],
  ], { mark: bolt }),
  message('#173843', [['LOB AIR', WHITE]], { mark: wing, size: 84 }),
  message('#121a24', [['PRO TOUR', WHITE]], { mark: ballMark(BALL, '#8a9a1e'), rule: BALL }),
  (x, w, h) => {
    x.fillStyle = '#05070a';
    x.fillRect(0, 0, w, h);
  },
];

/**
 * The static messages, one a row (redrawn once the display font has loaded). `setScale`: 1, or 0.5 for low memory
 * (the canvas redrawn at that size and uploaded again).
 */
export function ledAtlas(scale = 1): { tex: THREE.CanvasTexture; redraw: () => void; setScale: (s: number) => void } {
  const c = document.createElement('canvas');
  c.width = ROW_W * scale;
  c.height = ROW_H * ROWS * scale;
  const x = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  const redraw = () => {
    MESSAGES.forEach((m, r) => {
      x.save();
      x.scale(scale, scale);
      x.translate(0, r * ROW_H);
      x.beginPath();
      x.rect(0, 0, ROW_W, ROW_H);
      x.clip();
      // (drawn wide: the row is shown squeezed to LED_ASPECT)
      x.scale(STRETCH, 1);
      m(x, ROW_W / STRETCH, ROW_H);
      x.restore();
    });
    tex.needsUpdate = true;
  };
  redraw();
  const setScale = (s: number) => {
    if (s === scale) return;
    scale = s;
    c.width = ROW_W * s;
    c.height = ROW_H * ROWS * s;
    // (a new size: the old storage on the GPU goes, the next draw uploads it again)
    tex.dispose();
    redraw();
  };
  return { tex, redraw, setScale };
}

/** The dynamic canvas: the video board (top 384 px) and the score as an LED message (bottom 128 px). */
export function screenCanvas(): { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  return { canvas, tex };
}

/**
 * Repaints the video board and the LED score with the names, the score and who serves. `intro`: the match is being
 * presented (the board shows who plays whom instead of the score).
 */
export function drawScreen(b: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture }, left: string, right: string, sl: number, sr: number, serving: 0 | 1 | null, footer: string, intro = false) {
  const x = b.canvas.getContext('2d')!;
  const w = b.canvas.width;
  // ---- the video board (1024 × 384)
  const h = 384;
  x.fillStyle = INK;
  x.fillRect(0, 0, w, h);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(40,60,90,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  x.textBaseline = 'middle';
  const rowY = [112, 222];
  // a rule between the two lines
  x.fillStyle = '#1b2533';
  x.fillRect(48, 167, w - 96, 3);
  const names = [left, right];
  const scores = [sl, sr];
  if (intro) {
    // who plays whom
    x.fillStyle = INK;
    x.fillRect(0, 0, w, 300);
    x.fillStyle = g;
    x.fillRect(0, 0, w, 300);
    x.textAlign = 'center';
    x.fillStyle = BALL;
    fitText(x, 'CENTER COURT', 34, 700, HEAD_FONT, 600);
    x.fillText('CENTER COURT', w / 2, 62);
    x.fillStyle = WHITE;
    fitText(x, `${left}  VS  ${right}`, 96, 700, HEAD_FONT, w - 120);
    x.fillText(`${left}  VS  ${right}`, w / 2, 172);
  }
  for (let i = 0; i < (intro ? 0 : 2); i++) {
    x.textAlign = 'left';
    x.fillStyle = WHITE;
    fitText(x, names[i], 84, 700, HEAD_FONT, 600);
    x.fillText(names[i], 96, rowY[i]);
    x.textAlign = 'right';
    x.fillStyle = BALL;
    x.font = `700 118px ${HEAD_FONT}`;
    x.fillText(String(scores[i]), w - 70, rowY[i] + 4);
    if (serving === i) {
      x.beginPath();
      x.arc(62, rowY[i], 13, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.fillStyle = '#121a24';
  x.fillRect(0, h - 74, w, 74);
  x.fillStyle = BALL;
  x.fillRect(0, h - 74, w, 4);
  x.fillStyle = WHITE;
  x.textAlign = 'center';
  fitText(x, footer, 38, 700, HEAD_FONT, w - 120);
  x.fillText(footer, w / 2, h - 36);
  // ---- the score as an LED message (1024 × 128, drawn stretched as the atlas rows)
  x.save();
  x.translate(0, h);
  x.beginPath();
  x.rect(0, 0, w, ROW_H);
  x.clip();
  x.scale(STRETCH, 1);
  const rw = w / STRETCH;
  x.fillStyle = INK;
  x.fillRect(0, 0, rw, ROW_H);
  x.fillStyle = BALL;
  x.fillRect(0, ROW_H - 7, rw, 3);
  x.fillRect(0, 4, rw, 3);
  x.textBaseline = 'middle';
  const a = `${left} ${sl}`;
  const bb = `${sr} ${right}`;
  fitText(x, `${a} – ${bb}`, 72, 700, HEAD_FONT, rw * 0.7);
  const wa = x.measureText(a).width;
  const wd = x.measureText(' – ').width;
  const wb = x.measureText(bb).width;
  let cx = (rw - wa - wd - wb) / 2;
  x.textAlign = 'left';
  x.fillStyle = WHITE;
  x.fillText(a, cx, ROW_H * 0.54);
  cx += wa;
  x.fillStyle = BALL;
  x.fillText(' – ', cx, ROW_H * 0.54);
  cx += wd;
  x.fillStyle = WHITE;
  x.fillText(bb, cx, ROW_H * 0.54);
  x.restore();
  b.tex.needsUpdate = true;
}

// ------------------------------------------------------------------ geometry
export interface LedParams {
  /** the length one message takes (m): LED_ASPECT × the message height */
  T: number;
  /** the panel's height (m) */
  H: number;
  phase: number;
  mode: number;
}

/** Collects the emissive quads (positions, uv in metres along / up the panel, the panel's parameters). */
export class EmissiveBuilder {
  private P: number[] = [];
  private U: number[] = [];
  private A: number[] = [];
  private I: number[] = [];
  private t = new THREE.Vector3();
  private s = new THREE.Vector3();
  private n = new THREE.Vector3();

  /**
   * A quad from its four corners (bottom left, bottom right, top right, top left as seen from the front), its u (m) at
   * the left and the right edge, and the side it faces (`front`): flipped if the corners wind the other way.
   */
  quad(bl: THREE.Vector3, br: THREE.Vector3, tr: THREE.Vector3, tl: THREE.Vector3, u0: number, u1: number, p: LedParams, front: THREE.Vector3) {
    const k = this.P.length / 3;
    for (const v of [bl, br, tr, tl]) this.P.push(v.x, v.y, v.z);
    this.U.push(u0, 0, u1, 0, u1, p.H, u0, p.H);
    for (let i = 0; i < 4; i++) this.A.push(p.T, p.H, p.phase, p.mode);
    this.n.crossVectors(this.t.subVectors(br, bl), this.s.subVectors(tl, bl));
    if (this.n.dot(front) >= 0) this.I.push(k, k + 1, k + 2, k, k + 2, k + 3);
    else this.I.push(k, k + 2, k + 1, k, k + 3, k + 2);
  }

  /** A flat panel: centre, its right and up directions (unit), size; it faces right × up. */
  panel(c: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, w: number, h: number, p: LedParams, u0 = 0) {
    const r = right.clone().multiplyScalar(w / 2);
    const u = up.clone().multiplyScalar(h / 2);
    const bl = c.clone().sub(r).sub(u);
    const br = c.clone().add(r).sub(u);
    const tr = c.clone().add(r).add(u);
    const tl = c.clone().sub(r).add(u);
    this.quad(bl, br, tr, tl, u0, u0 + w, p, new THREE.Vector3().crossVectors(right, up));
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('aLed', new THREE.Float32BufferAttribute(this.A, 4));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ the material
/** the order the boards show their messages in, and the ribbons theirs (−1: the score) */
const BOARD_SEQ = [ROW.tour, ROW.bank, -1, ROW.water, ROW.court, ROW.energy, -1, ROW.air];
const RIBBON_SEQ = [ROW.mark, ROW.bank, ROW.tour, ROW.water, ROW.court, ROW.energy, ROW.air, -1];
const seqFn = (name: string, seq: number[]) =>
  `float ${name}( float k ) { float i = mod( k, ${seq.length}.0 ); ${seq.map((r, j) => `if ( i < ${j}.5 ) return ${r.toFixed(1)};`).join(' ')} return 0.0; }`;

/** how bright each kind is (linear, before the exposure and the tone curve) */
export const GAIN = { led: 1.9, lamp: 26, glass: 0.55, screen: 1.8 };

export function emissiveMaterial(atlas: THREE.Texture, dyn: THREE.Texture): { mat: THREE.MeshBasicMaterial; time: { value: number } } {
  const time = { value: 0 };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  // (for memory estimates: the textures it samples)
  m.userData.tex = { atlas, dyn };
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.uniforms.uAtlas = { value: atlas };
    s.uniforms.uDyn = { value: dyn };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aLed;\nvarying vec4 vLed;\nvarying vec2 vLuv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLed = aLed;\nvLuv = uv;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime; uniform sampler2D uAtlas; uniform sampler2D uDyn;
        varying vec4 vLed; varying vec2 vLuv;
        ${seqFn('pbBoardSeq', BOARD_SEQ)}
        ${seqFn('pbRibbonSeq', RIBBON_SEQ)}
        float pbHash( float n ) { return fract( sin( n * 91.3458 ) * 47453.5453 ); }
        // a message row (−1: the score, from the dynamic canvas) at q (0…1 across the row, 0…1 up)
        vec3 pbRow( float row, vec2 q ) {
          q.y = clamp( q.y, 0.03, 0.97 );
          if ( row < -0.5 ) return texture2D( uDyn, vec2( q.x, q.y * 0.25 ) ).rgb;
          return texture2D( uAtlas, vec2( q.x, ( ${ROWS - 1}.0 - row + q.y ) / ${ROWS}.0 ) ).rgb;
        }
        // the LED dots (16 mm pitch): crisp up close, their average where a dot is under a pixel
        float pbDots( vec2 m ) {
          vec2 g = m / 0.016;
          vec2 fw = fwidth( g );
          vec2 d = fract( g ) - 0.5;
          float dot = 1.0 - smoothstep( 0.28, 0.46, length( d ) );
          float vis = 1.0 - smoothstep( 0.35, 0.9, max( fw.x, fw.y ) );
          return mix( 1.0, 0.45 + 1.25 * dot, vis );
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          float T = vLed.x; float H = vLed.y; float ph = vLed.z; float mode = vLed.w;
          vec2 m = vLuv;
          vec3 c;
          if ( mode < 0.5 ) {
            // a board: a message every 6 s (the boards a beat apart), wiped in from below
            float tt = uTime + ph;
            float slot = floor( tt / 6.0 );
            float w = smoothstep( 0.0, 0.45, tt - slot * 6.0 );
            float qx = fract( m.x / T );
            float qy = m.y / H;
            c = qy < w ? pbRow( pbBoardSeq( slot ), vec2( qx, qy + 1.0 - w ) ) : pbRow( pbBoardSeq( slot - 1.0 ), vec2( qx, qy - w ) );
            c *= ${GAIN.led.toFixed(2)} * pbDots( m );
          } else if ( mode < 1.5 ) {
            // a ribbon: the messages one after another, running to the left
            float u = m.x / T + ( uTime + ph ) * ( 0.55 / T );
            c = pbRow( pbRibbonSeq( floor( u ) ), vec2( fract( u ), m.y / H ) ) * ${GAIN.led.toFixed(2)} * pbDots( m );
          } else if ( mode < 2.5 ) {
            // a floodlight: 6 × 3 round lamps behind glass, the housing dark between them
            vec2 q = vec2( m.x / T, m.y / H ) * vec2( 6.0, 3.0 );
            vec2 fw = fwidth( q );
            vec2 d = fract( q ) - 0.5;
            float lamp = 1.0 - smoothstep( 0.30, 0.42, length( d ) );
            float vis = 1.0 - smoothstep( 0.25, 0.8, max( fw.x, fw.y ) );
            c = vec3( 0.93, 0.96, 1.0 ) * ${GAIN.lamp.toFixed(1)} * mix( 0.42, lamp + 0.03, vis );
          } else if ( mode < 3.5 ) {
            // the boxes' glazing: warm rooms behind mullions every 1.6 m, each lit a little differently
            float bay = floor( m.x / 1.6 );
            float fx = fract( m.x / 1.6 );
            float qy = m.y / H;
            float mull = smoothstep( 0.02, 0.06, fx ) * smoothstep( 0.98, 0.94, fx ) * ( 1.0 - 0.9 * ( smoothstep( 0.72, 0.74, qy ) - smoothstep( 0.77, 0.79, qy ) ) );
            // (some rooms dim, a few dark: the glass reflects the night in front of them)
            float hb = pbHash( bay + ph );
            float lit = hb < 0.18 ? 0.12 : 0.35 + 0.75 * hb;
            vec3 room = mix( vec3( 1.0, 0.58, 0.3 ), vec3( 1.0, 0.82, 0.6 ), qy ) * ( 0.25 + 0.75 * qy * qy );
            // (people in the rooms: a darker band low down, broken up)
            room *= 1.0 - 0.45 * smoothstep( 0.5, 0.25, qy ) * step( 0.35, pbHash( floor( m.x / 0.55 ) + ph * 3.0 ) );
            c = room * lit * mull * ${GAIN.glass.toFixed(2)};
          } else {
            // a video board
            c = texture2D( uDyn, vec2( m.x / T, 0.25 + 0.75 * clamp( m.y / H, 0.0, 1.0 ) ) ).rgb * ${GAIN.screen.toFixed(2)} * pbDots( m * 1.6 );
          }
          diffuseColor.rgb *= c;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'pb-emissive';
  return { mat: m, time };
}
