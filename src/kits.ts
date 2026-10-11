// Kits: what each player wears on the pro tour's centre court. Until every rival has their own AI-made model, they
// share the player's body and their kit is painted onto it (render/outfit.ts): a technical shirt with its own cut,
// shorts, socks, shoes, hair colour and skin tone, and their own paddle (render/gear.ts). Sober, realistic colours,
// each rival told apart at a distance by the shirt's colour and cut; the human in red, his doubles partner in the same
// colours turned round (white with red). No real brands: the mark on the kit and the paddles is an invented one.
// (shirtHue … paddleEdge: the old CPU recolour, the fallback without a GPU painter.)

import type { Kit } from './render/chars';
import type { Build } from './render/body';

// Builds (render/body.ts): each player their own height and frame (all on the one man's body: the women's body made
// in code does not pass for a woman in the close-ups, see docs/notas-10-formas.md, so Lola, Nuria, Reina and Marta
// keep the model's body for now).
const BUILDS: Record<string, Build> = {
  hero: { height: 1.8, shoulders: 1.02, chest: 1.02, arms: 1.03 },
  // a Sunday player: a little shorter, a belly, a thicker neck
  paco: { height: 1.74, shoulders: 0.98, chest: 1.03, waist: 1.12, seat: 1.05, legs: 1.02, neck: 1.06 },
  // the hitter: tall and broad, heavy arms
  bruno: { height: 1.87, shoulders: 1.06, chest: 1.06, arms: 1.1, legs: 1.06, neck: 1.08 },
  // wiry and light
  lola: { height: 1.75, shoulders: 0.97, chest: 0.96, waist: 0.95, arms: 0.94, legs: 0.96, neck: 0.95 },
  nuria: { height: 1.78, shoulders: 0.99, waist: 0.98, arms: 0.98 },
  // the champion: tall and athletic
  reina: { height: 1.83, shoulders: 1.03, chest: 1.02, waist: 0.97, arms: 1.04, legs: 1.02 },
  marta: { height: 1.76, shoulders: 0.98, waist: 1.03, seat: 1.03, arms: 0.98 },
};

export interface KitInfo {
  kit: Kit;
  /** avatar colour in the menus (the shirt's) */
  css: string;
  ink: string;
}

const WHITE = 0xf1f2f4;
const SHOE = 0xf2f2f2;

export const HERO: KitInfo = {
  kit: {
    shirtHue: null,
    paddle: 0xc8372d,
    paddleEdge: 0x15171a,
    outfit: {
      shirt: 0xb8302a, panel: 0x1f2531, trim: WHITE, logo: WHITE, style: 'band', print: 'pinstripe',
      shorts: 0x23272f, shortsTrim: 0xb8302a,
      socks: WHITE, shoe: SHOE, shoeAccent: 0xb8302a, sole: 0xe9e9e9,
      hair: 0x2a1c14,
    },
    paddleLook: { shape: 'elongated', face: 'carbon', graphic: 0xc8372d, graphic2: 0xf2f2f2, grip: 0x1c1c1e },
    body: BUILDS.hero,
  },
  css: '#b8302a',
  ink: '#ffffff',
};

export const RIVAL_KITS: Record<string, KitInfo> = {
  // the Sunday player: forest green with off-white sides, white shorts, striped socks, salt-and-pepper hair
  paco: {
    kit: {
      shirtHue: 145, shirtSat: 0.45, shirtLight: -0.3, shortsHue: 40, shortsLight: 0.5, paddle: 0x2d6cb5, paddleEdge: 0x1c2a44,
      outfit: {
        shirt: 0x2c5e43, panel: 0xeeede6, trim: 0xeeede6, logo: 0xeeede6, style: 'sides', panelCuffs: true,
        shorts: 0xebe9e3, shortsTrim: 0x2c5e43,
        socks: WHITE, socksTrim: 0x2c5e43, shoe: SHOE, shoeAccent: 0x2c5e43, sole: 0xd8cbb4,
        hair: 0x6e6a64, skin: [1.04, 0.98, 0.95],
      },
      paddleLook: { shape: 'standard', face: 'glass', graphic: 0x2d6cb5, graphic2: 0xffffff, grip: 0x1d1f24 },
      body: BUILDS.paco,
    },
    css: '#2c5e43',
    ink: '#ffffff',
  },
  // the wall specialist: plum fading to aubergine through halftone dots, a white wristband
  lola: {
    kit: {
      shirtHue: 290, shirtSat: 0.4, shirtLight: -0.18, shortsHue: 260, shortsLight: -0.02, paddle: 0xd9468f, paddleEdge: 0x2a1a2a,
      outfit: {
        shirt: 0x6f3b7c, panel: 0x2d1832, trim: 0xeee6f2, logo: 0xeee6f2, style: 'fade',
        shorts: 0x2a1a30, shortsTrim: 0xd4b0e0,
        socks: WHITE, shoe: SHOE, shoeAccent: 0xa45fb8, sole: 0xf0f0f0,
        hair: 0x2a1a12, skin: [1.02, 0.98, 0.96], wristL: 0xeee6f2,
      },
      paddleLook: { shape: 'hybrid', face: 'glass', graphic: 0xd9468f, graphic2: 0xffffff, grip: 0xf0f0f0 },
      body: BUILDS.lola,
    },
    css: '#6f3b7c',
    ink: '#ffffff',
  },
  // the hitter: all black, a graphite sash piped in orange, black socks and shoes, black wristbands
  bruno: {
    kit: {
      shirtHue: 220, shirtSat: 0.12, shirtLight: -0.4, shortsHue: 220, shortsLight: -0.1, paddle: 0xe8702a, paddleEdge: 0x111214,
      outfit: {
        shirt: 0x17181b, panel: 0x34363c, trim: 0xe8702a, logo: 0xe8702a, style: 'sash', print: 'chevrons',
        shorts: 0x17181b, shortsTrim: 0xe8702a, shortsDouble: true,
        socks: 0x1a1a1c, shoe: 0x1d1e21, shoeAccent: 0xe8702a, sole: 0xeeeeee,
        hair: 0x141110, skin: [0.86, 0.78, 0.72], wristL: 0x17181b, wristR: 0x17181b,
      },
      paddleLook: { shape: 'elongated', face: 'carbon', graphic: 0xe8702a, graphic2: 0xf2f2f2, grip: 0x1c1c1e },
      body: BUILDS.bruno,
    },
    css: '#1b1c20',
    ink: '#e8702a',
  },
  // all touch at the net: petrol teal with dark side panels and a dotted print, auburn hair
  nuria: {
    kit: {
      shirtHue: 174, shirtSat: 0.6, shirtLight: -0.18, shortsHue: 180, shortsLight: -0.1, paddle: 0x18a090, paddleEdge: 0x0d3a3a,
      outfit: {
        shirt: 0x14857a, panel: 0x0d3a3a, trim: WHITE, logo: WHITE, style: 'sides', print: 'dots',
        shorts: 0x0d3a3a, shortsTrim: 0x6fd0c4,
        socks: WHITE, shoe: SHOE, shoeAccent: 0x14857a, sole: 0xf0f0f0,
        hair: 0x5b2f1d, skin: [1.02, 0.97, 0.95], wristL: 0x14857a,
      },
      paddleLook: { shape: 'hybrid', face: 'light', graphic: 0x18a090, graphic2: 0x0d3a3a, grip: 0x1d1f24 },
      body: BUILDS.nuria,
    },
    css: '#14857a',
    ink: '#ffffff',
  },
  // the club champion: gold with a navy yoke, navy shorts, dark blonde
  reina: {
    kit: {
      shirtHue: 42, shirtSat: 0.75, shirtLight: -0.05, shortsHue: 222, shortsLight: -0.05, paddle: 0xd6a531, paddleEdge: 0x1b2a49,
      outfit: {
        shirt: 0xd6a531, panel: 0x1b2a49, trim: 0xffffff, logo: 0x1b2a49, style: 'yoke',
        shorts: 0x1b2a49, shortsTrim: 0xd6a531,
        socks: WHITE, shoe: SHOE, shoeAccent: 0xd6a531, sole: 0xf0f0f0,
        hair: 0x8e6a3e, skin: [1.0, 0.97, 0.95],
      },
      paddleLook: { shape: 'elongated', face: 'carbon', graphic: 0xd6a531, graphic2: 0xffffff, grip: 0xf0f0f0 },
      body: BUILDS.reina,
    },
    css: '#d6a531',
    ink: '#0f1a2e',
  },
};

/** Doubles: the human's partner (Marta), in his colours turned round: white with a red chest band, charcoal shorts. */
export const PARTNER_KIT: KitInfo = {
  kit: {
    shirtHue: 216, shirtSat: 0, shirtLight: 0.3, shortsHue: 220, shortsLight: -0.1, paddle: 0xc8372d, paddleEdge: 0x1f2531,
    outfit: {
      shirt: WHITE, panel: 0xb8302a, trim: 0x1f2531, logo: 0xb8302a, style: 'band',
      shorts: 0x23272f, shortsTrim: WHITE,
      socks: WHITE, shoe: SHOE, shoeAccent: 0xb8302a, sole: 0xe9e9e9,
      hair: 0x3a2418, skin: [1.03, 1.0, 0.98], wristL: 0xb8302a,
    },
    paddleLook: { shape: 'standard', face: 'light', graphic: 0xc8372d, graphic2: 0x1f2531, grip: 0xf0f0f0 },
    body: BUILDS.marta,
  },
  css: '#eef0f3',
  ink: '#1f2531',
};

/** Anyone's kit by id (rivals and the partner). */
export function kitOf(id: string): KitInfo {
  return RIVAL_KITS[id] ?? PARTNER_KIT;
}
