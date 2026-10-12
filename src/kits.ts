// Kits: what each player wears on the tour's centre court. Until every rival has their own AI-made model, they share
// the player's body and their kit is painted onto it (render/outfit.ts): a tennis shirt with its own cut, shorts,
// white socks, court shoes, wristbands, hair colour and skin tone, and their own racket (render/gear.ts draws it: the
// `paddle*` fields are the racket's frame colours now, `paddleLook.graphic` the frame, `graphic2` its accent, `grip`
// the overgrip). Sober, realistic colours, each rival told apart at a distance by the shirt's colour and cut; the
// human in red, his doubles partner in the same colours turned round (white with red). On clay and hard courts they
// wear their colours; on grass, all white with a thin trim in their colour (the grass-court tradition: onSurface).
// No real brands: the mark on the kit and the rackets is an invented one.
// (shirtHue … paddleEdge: the old CPU recolour, the fallback without a GPU painter.)

import type { Kit } from './render/chars';
import type { Build } from './render/body';
import type { CourtSurface } from './sim/court';

// Builds (render/body.ts): each player their own height and frame (all on the one man's body; the ids are the padel
// game's: paco Kasper Rud, lola Álex de Miñor, bruno Danil Medvédiev, nuria Yannik Siner, reina Carlos Alcarás, marta
// Marcel Granoyers).
const BUILDS: Record<string, Build> = {
  hero: { height: 1.8, shoulders: 1.02, chest: 1.02, arms: 1.03 },
  // the topspin baseliner: tall and solid, strong legs
  paco: { height: 1.83, shoulders: 1.01, chest: 1.01, legs: 1.04 },
  // the counterpuncher: small, wiry and light
  lola: { height: 1.72, shoulders: 0.96, chest: 0.95, waist: 0.94, arms: 0.94, legs: 0.96, neck: 0.95 },
  // the flat hitter: very tall and lanky, long arms
  bruno: { height: 1.94, shoulders: 1.02, chest: 0.97, waist: 0.96, arms: 0.98, legs: 0.98, neck: 0.98 },
  // the early hitter: tall and slim
  nuria: { height: 1.89, shoulders: 0.99, chest: 0.96, waist: 0.95, arms: 0.96, legs: 0.97 },
  // the champion: athletic, powerful legs
  reina: { height: 1.83, shoulders: 1.04, chest: 1.03, waist: 0.97, arms: 1.05, legs: 1.05 },
  // the doubles specialist: a little older, a touch heavier
  marta: { height: 1.9, shoulders: 1.0, waist: 1.03, seat: 1.02, arms: 0.99 },
};

/**
 * The players' own bodies on the player's skeleton (render/chars.ts Person; assets/chars/<name>.json), loaded with the
 * AI-made one. ia_jugador_*: a picture made with Qwen-Image and a mesh with TRELLIS 2 (MimicPC), mounted with
 * art/blender/trellis_persona.py (docs/notas-05-trellis.md): you (a), your partner Marcel (b), Medvédiev (c) and Alcarás
 * (d). Their skin, face and hair are their own (the kit's skin and hair do not apply). rb_male01 (Rocketbox,
 * docs/notas-04-rocketbox.md) stays in assets/ but is not loaded.
 */
export const PEOPLE = ['ia_jugador_a', 'ia_jugador_b', 'ia_jugador_d', 'ia_jugador_c'];

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
      hair: 0x2a1c14, skin: [1.12, 1.08, 1.05], wristL: WHITE, wristR: WHITE,
    },
    paddleLook: { shape: 'elongated', face: 'carbon', graphic: 0xc8372d, graphic2: 0xf2f2f2, grip: 0x1c1c1e },
    body: BUILDS.hero,
    model: 'ia_jugador_a',
  },
  css: '#b8302a',
  ink: '#ffffff',
};

export const RIVAL_KITS: Record<string, KitInfo> = {
  // Rud, topspin from the back: forest green with off-white sides, white shorts, striped socks, brown hair
  paco: {
    kit: {
      shirtHue: 145, shirtSat: 0.45, shirtLight: -0.3, shortsHue: 40, shortsLight: 0.5, paddle: 0x2d6cb5, paddleEdge: 0x1c2a44,
      outfit: {
        shirt: 0x2c5e43, panel: 0xeeede6, trim: 0xeeede6, logo: 0xeeede6, style: 'sides', panelCuffs: true,
        shorts: 0xebe9e3, shortsTrim: 0x2c5e43,
        socks: WHITE, socksTrim: 0x2c5e43, shoe: SHOE, shoeAccent: 0x2c5e43, sole: 0xd8cbb4,
        hair: 0x5a4632, skin: [1.04, 0.98, 0.95], wristR: 0x2c5e43,
      },
      paddleLook: { shape: 'standard', face: 'glass', graphic: 0x2d6cb5, graphic2: 0xffffff, grip: 0x1d1f24 },
      body: BUILDS.paco,
    },
    css: '#2c5e43',
    ink: '#ffffff',
  },
  // de Miñor, the counterpuncher: plum fading to aubergine, white wristbands
  lola: {
    kit: {
      shirtHue: 290, shirtSat: 0.4, shirtLight: -0.18, shortsHue: 260, shortsLight: -0.02, paddle: 0xd9468f, paddleEdge: 0x2a1a2a,
      outfit: {
        shirt: 0x6f3b7c, panel: 0x2d1832, trim: 0xeee6f2, logo: 0xeee6f2, style: 'fade',
        shorts: 0x2a1a30, shortsTrim: 0xd4b0e0,
        socks: WHITE, shoe: SHOE, shoeAccent: 0xa45fb8, sole: 0xf0f0f0,
        hair: 0x2a1a12, skin: [1.02, 0.98, 0.96], wristL: 0xeee6f2, wristR: 0xeee6f2,
      },
      paddleLook: { shape: 'hybrid', face: 'glass', graphic: 0xd9468f, graphic2: 0xffffff, grip: 0xf0f0f0 },
      body: BUILDS.lola,
    },
    css: '#6f3b7c',
    ink: '#ffffff',
  },
  // Medvédiev, flat and deep: all black, a graphite sash piped in orange, black wristbands (white socks: tennis)
  bruno: {
    kit: {
      shirtHue: 220, shirtSat: 0.12, shirtLight: -0.4, shortsHue: 220, shortsLight: -0.1, paddle: 0xe8702a, paddleEdge: 0x111214,
      outfit: {
        shirt: 0x17181b, panel: 0x34363c, trim: 0xe8702a, logo: 0xe8702a, style: 'sash', print: 'chevrons',
        shorts: 0x17181b, shortsTrim: 0xe8702a, shortsDouble: true,
        socks: WHITE, socksTrim: 0x17181b, shoe: 0x1d1e21, shoeAccent: 0xe8702a, sole: 0xeeeeee,
        hair: 0x141110, skin: [1, 1, 1], wristL: 0x17181b, wristR: 0x17181b,
      },
      paddleLook: { shape: 'elongated', face: 'carbon', graphic: 0xe8702a, graphic2: 0xf2f2f2, grip: 0x1c1c1e },
      body: BUILDS.bruno,
      model: 'ia_jugador_c',
    },
    css: '#1b1c20',
    ink: '#e8702a',
  },
  // Siner, the early hitter: petrol teal with dark side panels and a dotted print, auburn hair
  nuria: {
    kit: {
      shirtHue: 174, shirtSat: 0.6, shirtLight: -0.18, shortsHue: 180, shortsLight: -0.1, paddle: 0x18a090, paddleEdge: 0x0d3a3a,
      outfit: {
        shirt: 0x14857a, panel: 0x0d3a3a, trim: WHITE, logo: WHITE, style: 'sides', print: 'dots',
        shorts: 0x0d3a3a, shortsTrim: 0x6fd0c4,
        socks: WHITE, shoe: SHOE, shoeAccent: 0x14857a, sole: 0xf0f0f0,
        hair: 0x8a3d1f, skin: [1.04, 0.97, 0.95], wristL: 0x14857a, wristR: WHITE,
      },
      paddleLook: { shape: 'hybrid', face: 'light', graphic: 0x18a090, graphic2: 0x0d3a3a, grip: 0x1d1f24 },
      body: BUILDS.nuria,
    },
    css: '#14857a',
    ink: '#ffffff',
  },
  // Alcarás, the No. 1: gold with a navy yoke, navy shorts, dark hair, navy wristbands
  reina: {
    kit: {
      shirtHue: 42, shirtSat: 0.75, shirtLight: -0.05, shortsHue: 222, shortsLight: -0.05, paddle: 0xd6a531, paddleEdge: 0x1b2a49,
      outfit: {
        shirt: 0xd6a531, panel: 0x1b2a49, trim: 0xffffff, logo: 0x1b2a49, style: 'yoke',
        shorts: 0x1b2a49, shortsTrim: 0xd6a531,
        socks: WHITE, shoe: SHOE, shoeAccent: 0xd6a531, sole: 0xf0f0f0,
        hair: 0x3a2618, skin: [1.02, 0.98, 0.95], wristL: 0x1b2a49, wristR: 0x1b2a49,
      },
      paddleLook: { shape: 'elongated', face: 'carbon', graphic: 0xd6a531, graphic2: 0xffffff, grip: 0xf0f0f0 },
      body: BUILDS.reina,
      model: 'ia_jugador_d',
    },
    css: '#d6a531',
    ink: '#0f1a2e',
  },
};

/** Doubles: the human's partner (Marcel, id marta), in his colours turned round: white with a red chest band, charcoal shorts. */
export const PARTNER_KIT: KitInfo = {
  kit: {
    shirtHue: 216, shirtSat: 0, shirtLight: 0.3, shortsHue: 220, shortsLight: -0.1, paddle: 0xc8372d, paddleEdge: 0x1f2531,
    outfit: {
      shirt: WHITE, panel: 0xb8302a, trim: 0x1f2531, logo: 0xb8302a, style: 'band',
      shorts: 0x23272f, shortsTrim: WHITE,
      socks: WHITE, shoe: SHOE, shoeAccent: 0xb8302a, sole: 0xe9e9e9,
      hair: 0x3a2418, skin: [1.03, 0.99, 0.96], wristL: 0xb8302a, wristR: 0xb8302a,
    },
    paddleLook: { shape: 'standard', face: 'light', graphic: 0xc8372d, graphic2: 0x1f2531, grip: 0xf0f0f0 },
    body: BUILDS.marta,
    model: 'ia_jugador_b',
  },
  css: '#eef0f3',
  ink: '#1f2531',
};

/** Anyone's kit by id (rivals and the partner). */
export function kitOf(id: string): KitInfo {
  return RIVAL_KITS[id] ?? PARTNER_KIT;
}

/**
 * A kit for the court's surface: on grass, all white (the grass-court tradition) with a thin trim in the player's own
 * colour (the piping, the mark, the shorts' stripe, the shoes' accent, a wristband); on clay
 * and hard courts, the player's colours as they are. The menus' and the TV's colour (`css`) stays the player's.
 */
export const WHITE_ON_GRASS = true;
export function onSurface(k: KitInfo, s: CourtSurface | undefined): KitInfo {
  if (s !== 'grass' || !WHITE_ON_GRASS || !k.kit.outfit) return k;
  const o = k.kit.outfit;
  // (the player's colour: the shirt, unless the shirt is white already, then its panel)
  const c = isLight(o.shirt) ? o.panel : o.shirt;
  const IVORY = 0xf4f3ee;
  return {
    ...k,
    kit: {
      ...k.kit,
      shirtHue: 216,
      shirtSat: 0,
      shirtLight: 0.32,
      shortsHue: 216,
      shortsLight: 0.32,
      outfit: {
        ...o,
        shirt: WHITE,
        panel: IVORY,
        trim: c,
        logo: c,
        print: 'none',
        panelCuffs: false,
        shorts: WHITE,
        shortsTrim: c,
        socks: WHITE,
        socksTrim: null,
        shoe: SHOE,
        shoeAccent: c,
        sole: 0xf0f0f0,
        wristL: o.wristL != null ? WHITE : null,
        wristR: o.wristR != null ? c : null,
      },
    },
  };
}
/** is this sRGB colour near white (a white shirt) */
function isLight(c: number): boolean {
  return ((c >> 16) & 255) > 215 && ((c >> 8) & 255) > 215 && (c & 255) > 215;
}
