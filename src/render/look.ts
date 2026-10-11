// The broadcast look, the same on every quality tier: a filmic tone curve (AgX) with a TV grade folded into it
// (contrast, saturation, warm highlights and cool shadows) and a fine dither against banding. It runs inside the
// tone-mapping step of every material (low and medium draw straight to the screen: no post-processing pass at all)
// or in the OutputPass (high, after the bloom), so it costs a few instructions per pixel and no render target.
// The vignette is a CSS layer over the canvas (the compositor draws it; no full-screen pass on the GPU).

import * as THREE from 'three';

export interface LookParams {
  /** contrast around mid grey, in display space (1: none) */
  contrast: number;
  /** saturation after the tone curve (1: none) */
  sat: number;
  /** AgX "look" power on the encoded signal (Blender's Punchy uses 1.35) and its saturation */
  power: number;
  agxSat: number;
  /** lift of the deepest shadows (display space) */
  lift: number;
  /** split toning: warm highlights, cool shadows */
  warm: number;
  cool: number;
  /** 1: ACES instead of AgX under the grade (look development) */
  aces: number;
}

/** a night broadcast: deep (not crushed) blacks with a cool cast, the floodlit court clean and saturated */
export const LOOK: LookParams = { contrast: 1.12, sat: 1.0, power: 1.35, agxSat: 1.3, lift: 0.008, warm: 0.006, cool: 0.02, aces: 0 };

const f = (v: number) => v.toFixed(4);

/** Puts the broadcast curve in place of three's CustomToneMapping (before any material compiles). */
export function installLook(p: LookParams = LOOK) {
  // (look development: ?look=contrast:1.1,sat:0.95 overrides the values)
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('look');
    if (q)
      for (const kv of q.split(',')) {
        const [k, v] = kv.split(':');
        if (k in p && Number.isFinite(+v)) (p as unknown as Record<string, number>)[k] = +v;
      }
  }
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  const stub = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  if (!chunk.includes(stub)) return;
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(
    stub,
    /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  // AgX (three's matrices and sigmoid) with a punchier look on the encoded signal
  const mat3 pbInset = mat3(
    vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
    vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
    vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
  const mat3 pbOutset = mat3(
    vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
    vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
    vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 ) );
  const float pbMinEv = - 12.47393;
  const float pbMaxEv = 4.026069;
  if ( ${f(p.aces)} > 0.5 ) {
    color = pow( ACESFilmicToneMapping( color ), vec3( 1.0 / 2.2 ) );
  } else {
  color *= toneMappingExposure;
  color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
  color = pbInset * color;
  color = max( color, 1e-10 );
  color = clamp( ( log2( color ) - pbMinEv ) / ( pbMaxEv - pbMinEv ), 0.0, 1.0 );
  color = agxDefaultContrastApprox( color );
  {
    color = pow( max( color, 0.0 ), vec3( ${f(p.power)} ) );
    float l2 = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = l2 + ${f(p.agxSat)} * ( color - l2 );
  }
  color = pbOutset * color;
  color = LINEAR_REC2020_TO_LINEAR_SRGB * pow( max( color, 0.0 ), vec3( 2.2 ) );
  color = pow( max( color, 0.0 ), vec3( 1.0 / 2.2 ) );
  }
  // (display-referred here, sRGB primaries: the grade works on what the eye sees)
  color = max( color, 0.0 );
  {
    float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = mix( vec3( l ), color, ${f(p.sat)} );
    color = ( color - 0.46 ) * ${f(p.contrast)} + 0.46;
    color += vec3( 1.0, 0.35, -0.6 ) * ${f(p.warm)} * smoothstep( 0.5, 1.0, l ) + vec3( -0.5, 0.0, 1.0 ) * ${f(p.cool)} * ( 1.0 - smoothstep( 0.0, 0.4, l ) );
    color = ${f(p.lift)} + color * ( 1.0 - ${f(p.lift)} );
    // a dither of half a display step (interleaved gradient noise): no banding in the sky or the soft shadows
    float n = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    color += ( n - 0.5 ) / 255.0;
  }
  return pow( clamp( color, 0.0, 1.0 ), vec3( 2.2 ) );
}`,
  );
}

/** A soft broadcast vignette over the canvas (HTML, under the HUD). */
export function vignette(canvas: HTMLCanvasElement, strength = 0.26): HTMLDivElement | null {
  if (typeof document === 'undefined' || !canvas.parentElement) return null;
  const d = document.createElement('div');
  d.setAttribute('aria-hidden', 'true');
  d.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse 78% 74% at 50% 48%, rgba(0,0,0,0) 58%, rgba(6,12,20,${strength.toFixed(2)}) 100%)`;
  canvas.after(d);
  return d;
}
