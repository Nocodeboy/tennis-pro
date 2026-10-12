// The players' kits: a pro tour's technical shirts, shorts, socks and court shoes painted onto the one AI-made body.
//
// The model's colour texture is a Tripo atlas (coral shirt with white side panels, navy shorts, white socks and shoes):
// its islands are scattered, so the kit is not painted in texture space but on the body. Once per kit the mesh is
// drawn into its own UV layout (each texel lands where it is on the texture) with the bind pose's position at every
// texel: the shirt's cut (side panels, yoke, chest band, sash or fade, piping, rib collar and cuffs), a sublimated
// tone-on-tone print, the chest mark, the shorts' side stripes and waistband, the socks' stripes, the shoes' heel and
// sole, a wristband, the hair's colour and the skin's tone are all worked out from where the texel is on the body, and
// the folds and shading of the AI's texture are kept (each texel's brightness against the mean of what it was). The
// edges between garment and skin follow the texture's own colours, so they stay soft. The islands are then padded a
// few texels out (copies drawn shifted) so the mipmaps do not bleed.
//
// A second, small texture holds what each texel is made of for a physical material: sheen (cloth, a touch on skin),
// roughness (skin 0.55, knit 0.8, prints 0.45, rubber soles), how much of the fabric's knit relief shows, and the
// specular strength (skin's is lower than plastic's). See playerMaterial.
//
// Everything is measured on the bind pose of assets/chars/hero.json (metres, 1.7 m tall, facing +z, its right is −x).
// If the model changes, the zones below must be measured again (tools/kits.py shows the result).
//
// A player's own body (a Rocketbox person on the same skeleton and rest pose, render/chars.ts Person) comes with a
// mask of what each texel is and where its clothes end (BodyZones): its kits are painted from those (see uMask), with
// the same cut, colours and marks.

import * as THREE from 'three';

/** A kit's design. Colours are sRGB hex. */
export interface Outfit {
  shirt: number;
  /** side panels and the style's second colour */
  panel: number;
  /** piping, rib collar and cuffs */
  trim: number;
  /** the chest mark */
  logo: number;
  /** the shirt's cut over its side panels: plain sides, a shoulder yoke, a chest band, a diagonal sash, a fade to the hem */
  style: 'sides' | 'yoke' | 'band' | 'sash' | 'fade';
  /** a tone-on-tone sublimated print */
  print?: 'none' | 'pinstripe' | 'dots' | 'chevrons';
  /** the cuffs in the panel colour instead of the trim */
  panelCuffs?: boolean;
  shorts: number;
  /** side stripe (and the mark) of the shorts */
  shortsTrim: number;
  /** two thin stripes down the side instead of one */
  shortsDouble?: boolean;
  socks: number;
  /** the two stripes at the top of the socks (null: plain) */
  socksTrim?: number | null;
  shoe: number;
  shoeAccent: number;
  sole: number;
  hair: number;
  /** the skin's tone: a multiplier on the model's (1, 1, 1 as it is) */
  skin?: [number, number, number];
  /** a wristband on the left wrist, the right one or both (sRGB hex; null: none) */
  wristL?: number | null;
  wristR?: number | null;
  /** a woman's face and hair (the women's body, render/body.ts): thinner arched brows, a touch of colour on the lips
   * and cheeks, no sideburns, the hair combed back */
  woman?: boolean;
}

/**
 * Where a player's own body's clothes end, measured on its rest pose (art/blender/persona.py; metres, 1.7 m model):
 * the sleeves (|x| of their end), the shirt's hem, the shorts' hem and the top of the shoes.
 */
export interface BodyZones {
  cuff: number;
  hem: number;
  shortsHem: number;
  shoeTop: number;
}

const STYLE = { sides: 0, yoke: 1, band: 2, sash: 3, fade: 4 } as const;
const PRINT = { none: 0, pinstripe: 1, dots: 2, chevrons: 3 } as const;

/** The two textures a kit is drawn with. */
export interface KitLook {
  map: THREE.Texture;
  aux: THREE.Texture;
}

const BAKE_VERT = /* glsl */ `
uniform vec2 uOffset;
varying vec2 vUv;
varying vec3 vP;
void main() {
  vUv = uv;
  vP = position;
  gl_Position = vec4( ( uv + uOffset ) * 2.0 - 1.0, 0.0, 1.0 );
}`;

/**
 * The kit at one texel (pass 0: linear albedo; pass 1: sheen, roughness, knit, specular). Zones in bind-pose metres:
 * shirt from the hem (0.863) to the neckline (1.458 at the back and sides, down to 1.402 at the front) and out to the
 * cuffs (|x| 0.33); the original white side panel within 0.36 rad of the side; shorts from the waist (0.862) to the hem
 * (0.576 inside the leg … 0.605 outside); socks to 0.228, the shoe's collar at 0.104 (heel 0.142, tongue 0.165).
 */
const BAKE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D map;
uniform float uPass;
uniform vec4 uMean;      // linear luminance of the texture's coral, navy, white and hair
uniform float uSkinMean;
uniform vec3 uSkinCol;   // the texture's mean skin colour (linear)
uniform vec3 cShirt, cPanel, cTrim, cLogo, cShorts, cShortsTrim, cSocks, cSocksTrim, cShoe, cShoeAccent, cSole, cHair, cWristL, cWristR;
uniform vec3 uSkin;
uniform float uStyle, uPrint, uPanelCuffs, uShortsDouble, uSockStripes, uWristL, uWristR, uWoman;
// a player's own body (persona.py, Rocketbox): a mask says what each texel is (red: skin 0, shirt 1, trousers 2,
// shoes 3, hair 4, other 5, times 40), so its kit is not guessed from the colours; uZones: where its sleeves, shirt,
// shorts and shoes end (BodyZones); uCuff, uShortsHem: where the cuffs and the shorts' hem are (the AI body's own by default)
uniform sampler2D maskMap;
uniform float uMask, uCuff, uShortsHem;
uniform vec4 uZones;
varying vec2 vUv;
varying vec3 vP;
#define PI 3.14159265

// inside where d < 0, anti-aliased over about a texel
float inside( float d ) {
  float w = max( fwidth( d ), 1e-6 ) * 0.75;
  return 1.0 - smoothstep( -w, w, d );
}
vec3 hsl( vec3 c ) {
  float mx = max( c.r, max( c.g, c.b ) ), mn = min( c.r, min( c.g, c.b ) );
  float l = ( mx + mn ) * 0.5, d = mx - mn;
  float s = d < 1e-4 ? 0.0 : d / max( 1e-4, 1.0 - abs( 2.0 * l - 1.0 ) );
  float h = 0.0;
  if ( d > 1e-4 ) {
    if ( mx == c.r ) h = mod( ( c.g - c.b ) / d, 6.0 );
    else if ( mx == c.g ) h = ( c.b - c.r ) / d + 2.0;
    else h = ( c.r - c.g ) / d + 4.0;
    h *= 60.0;
  }
  return vec3( h, s, l );
}
// the mark (an invented one: two slanted chevrons), in a unit box: < 0 inside
float mark( vec2 q ) {
  q.x -= 0.22 * q.y;
  float ax = abs( q.x );
  float d = min( abs( q.y - 0.17 + 0.78 * ax ) - 0.09, abs( q.y + 0.15 + 0.78 * ax ) - 0.09 );
  return max( d, ax - 0.44 );
}
// the tone-on-tone print at a point of the surface (u across, v up, metres): 0 … 1
float printAt( vec2 p ) {
  if ( uPrint < 0.5 ) return 0.0;
  if ( uPrint < 1.5 ) return inside( abs( fract( ( p.x + p.y ) / 0.016 ) - 0.5 ) * 0.016 - 0.0013 );
  if ( uPrint < 2.5 ) {
    vec2 g = p / 0.007;
    g.x += 0.5 * floor( g.y );
    vec2 f = fract( g ) - 0.5;
    return inside( length( f ) * 0.007 - 0.0016 );
  }
  vec2 g = vec2( p.x / 0.03, p.y / 0.03 );
  float row = abs( fract( g.y + abs( fract( g.x ) - 0.5 ) ) - 0.5 );
  return inside( row * 0.03 - 0.0022 );
}

void main() {
  vec3 lin = texture2D( map, vUv ).rgb;
  vec3 c = pow( max( lin, 0.0 ), vec3( 1.0 / 2.2 ) );
  vec3 H = hsl( c );
  float h = H.x, s = H.y, l = H.z;
  float L = dot( lin, vec3( 0.2126, 0.7152, 0.0722 ) );
  float x = vP.x, y = vP.y, z = vP.z, ax = abs( x );

  // how much the texel looks like skin (the garments' edges blend on it): the coral of the shirt is too saturated
  float skinC = smoothstep( 2.0, 7.0, h ) * ( 1.0 - smoothstep( 45.0, 55.0, h ) ) * smoothstep( 0.1, 0.17, s ) * ( 1.0 - smoothstep( 0.68, 0.8, s ) )
    * smoothstep( 0.14, 0.2, l ) * ( 1.0 - smoothstep( 0.88, 0.94, l ) );
  bool navy = h > 195.0 && h < 255.0 && s > 0.18;

  // ---- where on the body
  float te = atan( x / 0.175, z / 0.145 );                 // round the torso: 0 front, ±PI back, +PI/2 its left
  float neckY = 1.458 - 0.056 * pow( max( cos( te ), 0.0 ), 2.0 );
  bool arm = ax > 0.215 && y > 1.2;
  float phi = atan( z + 0.068, y - 1.348 );                 // round the arm: 0 on top, ±PI underneath
  float tl = atan( ax - 0.13, z + 0.006 );                  // round the leg: + outwards
  float wShirt = 0.0, wShorts = 0.0, wFoot = 0.0, wHair = 0.0;
  if ( y > 0.8 && y < neckY + 0.03 && ax < 0.36 && !( navy && y < 0.9 ) )
    // (sure inside, and up to just past the collar's and the cuffs' seams: beyond those the texture's skin decides)
    wShirt = ( y > 0.875 && y < neckY + 0.005 && ax < 0.325 ) ? 1.0 : 1.0 - skinC;
  else if ( y > 0.53 && y < 0.9 && ax < 0.28 )
    wShorts = ( y > 0.615 && y < 0.85 ) ? 1.0 : 1.0 - skinC;
  else if ( y < 0.245 )
    wFoot = y < 0.2 ? 1.0 : 1.0 - skinC;
  else if ( y > 1.49 && !( z > 0.06 && y < 1.615 ) )
    wHair = ( 1.0 - smoothstep( 0.22, 0.36, l ) ) * ( 1.0 - skinC );

  // ---- the shirt
  float whiteness = 1.0 - smoothstep( 0.3, 0.55, s );
  // (0.10: the AI texture's baked highlights, kept at full strength, made dark kits look like latex: the folds stay,
  // their highlights are compressed)
  float detShirt = clamp( mix( 1.0, L / mix( uMean.x, uMean.z, whiteness ), 0.7 ), 0.45, 1.18 );
  float sd = abs( abs( te ) - PI * 0.5 );
  // side panels where the AI's white ones were, up to the armpit, and under the sleeves
  float panelD = arm ? ( 2.45 - abs( phi ) ) * 0.05 : max( ( sd - 0.36 ) * 0.16, y - 1.31 );
  float styleD = 1.0;
  if ( uStyle > 0.5 && uStyle < 1.5 ) styleD = arm ? 1.345 - y : 1.315 + 0.02 * step( cos( te ), 0.0 ) - y;    // yoke
  else if ( uStyle > 1.5 && uStyle < 2.5 ) styleD = arm ? 1.0 : abs( y - 1.205 ) - 0.024;                    // chest band
  else if ( uStyle > 2.5 && uStyle < 3.5 ) styleD = arm ? 1.0 : abs( y - 1.07 + 0.78 * x * sign( cos( te ) ) ) - 0.065; // sash
  vec2 sp = arm ? vec2( phi * 0.05, ax ) : vec2( te * 0.165, y );
  vec3 shirt = cShirt;
  if ( uStyle > 3.5 ) {
    // fade to the panel colour towards the hem, through halftone dots
    float t = ( 1.0 - smoothstep( 0.9, 1.2, y ) ) * ( arm ? 0.0 : 1.0 );
    vec2 g = sp / 0.009;
    g.x += 0.5 * floor( g.y );
    float dots = inside( length( fract( g ) - 0.5 ) - 0.62 * sqrt( t ) );
    shirt = mix( shirt, cPanel, max( dots * step( 0.02, t ), step( 0.97, t ) ) );
  }
  shirt = mix( shirt, cPanel, inside( styleD ) );
  float edge = inside( abs( styleD ) - 0.0022 ) * ( uStyle > 0.5 && uStyle < 3.5 ? 1.0 : 0.0 );
  shirt = mix( shirt, cPanel, inside( panelD ) );
  // (darker on light cloth, lighter on dark: tone on tone)
  shirt = mix( shirt, shirt * 0.92 + vec3( 0.005 ), 0.7 * printAt( sp ) );
  edge = max( edge, inside( abs( panelD ) - 0.0022 ) );
  shirt = mix( shirt, cTrim, edge );
  float collar = arm ? 0.0 : inside( neckY - 0.014 - y );
  float cuff = arm ? inside( uCuff - ax ) : 0.0;
  shirt = mix( shirt, cTrim, collar );
  shirt = mix( shirt, mix( cTrim, cPanel, uPanelCuffs ), cuff );
  // the mark on the left chest, a small one under the collar at the back
  float logo = inside( mark( vec2( x - 0.085, y - 1.312 ) / 0.044 ) ) * step( 0.04, z );
  logo = max( logo, inside( mark( vec2( -x, y - 1.392 ) / 0.028 ) ) * step( z, -0.05 ) * ( arm ? 0.0 : 1.0 ) );
  shirt = mix( shirt, cLogo, logo );
  vec3 shirtAlb = shirt * detShirt;

  // ---- the shorts
  float detShorts = clamp( mix( 1.0, L / uMean.y, 0.65 ), 0.45, 1.12 );
  vec3 shorts = cShorts;
  float waist = inside( 0.83 - y );
  float side = tl - PI * 0.5;
  float stripe = uShortsDouble > 0.5
    ? max( inside( abs( side * 0.095 - 0.007 ) - 0.0025 ), inside( abs( side * 0.095 + 0.007 ) - 0.0025 ) )
    : inside( abs( side * 0.095 ) - 0.011 );
  stripe *= 1.0 - waist;
  shorts = mix( shorts, shorts * 0.72, waist );
  shorts = mix( shorts, cShortsTrim, stripe );
  float hemY = uShortsHem + 0.013 * sin( tl );
  float slogo = inside( mark( vec2( x - 0.17, y - hemY - 0.045 ) / 0.032 ) ) * step( 0.0, z ) * step( 0.0, x );
  shorts = mix( shorts, cShortsTrim, slogo );
  vec3 shortsAlb = shorts * detShorts;
  // (a woman's: fitted and shorter, bare thigh below the hem, a band of the trim colour at it)
  float thigh = uWoman * ( 1.0 - smoothstep( 0.69, 0.698, y ) );
  shortsAlb = mix( shortsAlb, cShortsTrim * detShorts, uWoman * inside( abs( y - 0.703 ) - 0.005 ) );

  // ---- socks and shoes
  float detWhite = clamp( L / uMean.z, 0.4, 1.3 );
  float zA = z + 0.062;
  float shoeTop = max( 0.104, mix( 0.104, 0.142, 1.0 - smoothstep( -0.05, -0.03, zA ) ) );
  shoeTop = max( shoeTop, mix( 0.104, 0.165, smoothstep( 0.03, 0.055, zA ) ) );
  float shoe = inside( y - shoeTop );
  vec3 sock = cSocks;
  float sst = uSockStripes * max( inside( abs( y - 0.2 ) - 0.0035 ), inside( abs( y - 0.212 ) - 0.0035 ) );
  sock = mix( sock, cSocksTrim, sst );
  vec3 sh = cShoe;
  float heel = inside( zA + 0.04 ) * inside( y - shoeTop + 0.006 ) * inside( 0.035 - y );
  sh = mix( sh, cShoeAccent, heel );
  sh = mix( sh, cShoeAccent, inside( abs( y - 0.036 ) - 0.003 ) );
  sh = mix( sh, cSole, inside( y - 0.033 ) );
  sh = mix( sh, cSole * 0.45, inside( y - 0.008 ) );
  float soleK = inside( y - 0.038 );
  vec3 footAlb = mix( sock, sh, shoe ) * detWhite;

  // ---- hair, skin and wristbands
  vec3 hairAlb = cHair * clamp( L / uMean.w, 0.3, 1.8 );
  vec3 skinAlb = lin * uSkin;
  if ( uWoman > 0.5 ) {
    // a woman's face (measured on the model's face, bind pose): the brows' dark kept only in a thin arch, the rest of
    // them skin; the lips and the cheeks a little rosier; the sideburns skin; the hair combed back (fine streaks)
    vec3 skinFlat = uSkinCol * uSkin * clamp( L / uSkinMean, 0.9, 1.15 );
    float dark = 1.0 - smoothstep( 0.24, 0.42, l );
    float bt = clamp( ( ax - 0.012 ) / 0.046, 0.0, 1.0 );
    float yc = 1.5838 + 0.0042 * sin( PI * min( bt * 1.35, 1.0 ) ) - 0.003 * smoothstep( 0.8, 1.0, bt );
    float hw = 0.0024 * ( 1.0 - 0.5 * bt );
    float box = inside( abs( y - 1.5865 ) - 0.0125 ) * inside( abs( ax - 0.034 ) - 0.031 ) * step( 0.07, z );
    float band = inside( abs( y - yc ) - hw );
    skinAlb = mix( skinAlb, skinFlat, box * ( 1.0 - band * 0.75 ) * dark );
    float lip = 1.0 - smoothstep( 0.55, 1.0, length( vec2( x / 0.025, ( y - 1.5085 ) / 0.0085 ) ) );
    skinAlb *= mix( vec3( 1.0 ), vec3( 1.13, 0.8, 0.84 ), lip * step( 0.085, z ) );
    float cheek = 1.0 - smoothstep( 0.0, 1.0, length( vec2( ( ax - 0.047 ) / 0.02, ( y - 1.533 ) / 0.015 ) ) );
    skinAlb *= mix( vec3( 1.0 ), vec3( 1.05, 0.96, 0.96 ), cheek * step( 0.05, z ) );
    float burn = ( 1.0 - smoothstep( 1.585, 1.605, y ) ) * smoothstep( -0.025, 0.005, z ) * smoothstep( 0.05, 0.066, ax ) * step( 1.5, y );
    skinAlb = mix( skinAlb, skinFlat, burn * dark );
    wHair *= 1.0 - burn;
    float sc = mix( x, y, smoothstep( 0.045, 0.075, ax ) );
    float st = 0.5 + 0.5 * sin( sc * 1500.0 + sin( z * 80.0 + x * 40.0 ) * 2.0 );
    hairAlb = cHair * mix( clamp( L / uMean.w, 0.5, 1.5 ), 0.72 + 0.56 * st, 0.55 );
  }
  // the AI's texture left a little of the coral shirt on the hands and past the sleeves: skin there
  float stray = ( h < 22.0 || h > 345.0 ? 1.0 : 0.0 ) * smoothstep( 0.45, 0.62, s ) * smoothstep( 0.25, 0.32, l ) * ( y > 1.47 && z > 0.03 ? 0.0 : 1.0 );
  skinAlb = mix( skinAlb, uSkinCol * uSkin * clamp( L / uSkinMean, 0.5, 1.3 ), stray );
  float wr = inside( abs( ax - 0.62 ) - 0.034 ) * step( 1.25, y ) * step( 0.5, ax );
  float wrL = wr * step( 0.0, x ) * uWristL, wrR = wr * step( x, 0.0 ) * uWristR;
  vec3 detSkin = vec3( clamp( L / uSkinMean, 0.4, 1.4 ) );
  skinAlb = mix( skinAlb, cWristL * detSkin, wrL );
  skinAlb = mix( skinAlb, cWristR * detSkin, wrR );

  if ( uMask > 0.5 ) {
    // their own body: the shirt where theirs is (the kit's cut and marks from where the texel is; the cuffs at their
    // sleeves' end), the shorts where theirs are, down to their own hem; below, their legs to the socks (painted on the
    // skin above the shoes) and the court shoes painted on theirs; the face and the hair as they are (the hair tinted
    // to the kit's colour looked like plastic)
    float cls = floor( texture2D( maskMap, vUv ).r * 255.0 / 40.0 + 0.5 );
    bool isShirt = abs( cls - 1.0 ) < 0.5, isShorts = abs( cls - 2.0 ) < 0.5, isShoe = abs( cls - 3.0 ) < 0.5, isHair = abs( cls - 4.0 ) < 0.5;
    bool isSkin = cls < 0.5;
    float detM = clamp( mix( 1.0, L / uMean.x, 0.7 ), 0.5, 1.15 );
    vec3 shirtM = shirt * detM;
    float detS = clamp( mix( 1.0, L / uMean.y, 0.65 ), 0.5, 1.12 );
    vec3 shortsM = shorts * detS;
    // socks over the ankles' skin, court shoes over theirs
    // (the shoes keep the light and dark of theirs, so the upper, the toe and the laces show; then the sole and a band
    // of the accent colour over it, from the floor up)
    float detK = clamp( mix( 1.0, L / uSkinMean, 0.4 ), 0.85, 1.1 );
    float detF = clamp( mix( 1.0, L / uMean.z, 0.75 ), 0.45, 1.25 );
    vec3 shoeM = cShoe * detF;
    // (their shoes are low and plain: the collar in the accent colour tells them from the socks)
    shoeM = mix( shoeM, cShoeAccent * clamp( detF, 0.8, 1.1 ), inside( abs( y - uZones.w + 0.008 ) - 0.008 ) );
    shoeM = mix( shoeM, cShoeAccent * clamp( detF, 0.8, 1.1 ), inside( abs( y - 0.037 ) - 0.007 ) );
    shoeM = mix( shoeM, cSole, inside( y - 0.028 ) );
    shoeM = mix( shoeM, cSole * 0.4, inside( y - 0.008 ) );
    // (up to the top of their shoes, whatever the mask says, it is shoe)
    isShoe = isShoe || ( !isShirt && !isShorts && !isHair && y < uZones.w );
    vec3 footM = isShoe ? shoeM : sock * detK;
    float sockTop = 0.228;
    float wS = isShirt ? 1.0 : 0.0, wP = isShorts ? 1.0 : 0.0, wF = isShoe || ( isSkin && y < sockTop && !arm ) ? 1.0 : 0.0;
    if ( uPass < 0.5 ) {
      vec3 alb = isSkin ? skinAlb : lin;
      alb = mix( alb, shirtM, wS );
      alb = mix( alb, shortsM, wP );
      alb = mix( alb, footM, wF );
      gl_FragColor = vec4( min( alb, vec3( 0.86 ) ), 1.0 );
    } else {
      vec4 skinMt = vec4( 0.22, 0.56, 0.0, 0.7 );
      skinMt = mix( skinMt, vec4( 1.0, 0.97, 1.0, 0.1 ), max( wrL, wrR ) );
      vec4 m = skinMt;
      m = mix( m, vec4( 0.35, 0.5, 0.0, 0.8 ), isHair ? 1.0 : 0.0 );
      vec4 shirtMt = mix( vec4( 0.6, 0.86, 1.0, 0.1 ), vec4( 0.7, 0.9, 1.0, 0.1 ), max( collar, cuff ) );
      shirtMt = mix( shirtMt, vec4( 0.1, 0.45, 0.0, 0.6 ), logo );
      m = mix( m, shirtMt, wS );
      m = mix( m, mix( vec4( 0.32, 0.88, 0.55, 0.08 ), vec4( 0.1, 0.45, 0.0, 0.6 ), slogo ), wP );
      m = mix( m, isShoe ? mix( vec4( 0.25, 0.52, 0.5, 0.4 ), vec4( 0.1, 0.75, 0.0, 0.3 ), inside( y - 0.028 ) ) : vec4( 1.0, 0.95, 1.0, 0.1 ), wF );
      gl_FragColor = m;
    }
    return;
  }

  if ( uPass < 0.5 ) {
    vec3 alb = skinAlb;
    alb = mix( alb, hairAlb, wHair );
    alb = mix( alb, shirtAlb, wShirt );
    alb = mix( alb, mix( shortsAlb, uSkinCol * uSkin * clamp( L / uMean.y, 0.85, 1.12 ), thigh ), wShorts );
    alb = mix( alb, footAlb, wFoot );
    gl_FragColor = vec4( min( alb, vec3( 0.86 ) ), 1.0 );
  } else {
    // sheen, roughness, knit relief, specular strength
    vec4 skinM = vec4( 0.22, 0.56, 0.0, 0.7 );
    skinM = mix( skinM, vec4( 1.0, 0.97, 1.0, 0.1 ), max( wrL, wrR ) );
    vec4 hairM = vec4( 0.35, 0.5, 0.0, 0.8 );
    // (cloth reflects little: on the simplified mesh a stronger specular shows its facets as patches on dark kits)
    // (0.10: less sheen and specular on cloth: under the stadium's back light dark shorts and shirts read as latex)
    vec4 shirtM = mix( vec4( 0.6, 0.86, 1.0, 0.1 ), vec4( 0.7, 0.9, 1.0, 0.1 ), max( collar, cuff ) );
    shirtM = mix( shirtM, vec4( 0.1, 0.45, 0.0, 0.6 ), logo );
    vec4 shortsM = mix( vec4( 0.32, 0.88, 0.55, 0.08 ), vec4( 0.1, 0.45, 0.0, 0.6 ), slogo );
    shortsM = mix( shortsM, vec4( 0.22, 0.56, 0.0, 0.7 ), thigh );
    vec4 footM = mix( vec4( 1.0, 0.95, 1.0, 0.1 ), mix( vec4( 0.25, 0.52, 0.5, 0.4 ), vec4( 0.1, 0.75, 0.0, 0.3 ), soleK ), shoe );
    vec4 m = skinM;
    m = mix( m, hairM, wHair );
    m = mix( m, shirtM, wShirt );
    m = mix( m, shortsM, wShorts );
    m = mix( m, footM, wFoot );
    gl_FragColor = m;
  }
}`;

const COPY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  vec4 c = texture2D( tSrc, vUv );
  if ( c.a < 0.5 ) discard;
  gl_FragColor = c;
}`;

/**
 * the islands' padding: copies drawn this far out (texels, at 1024), in 8 directions, the farthest first. The gaps
 * between the islands fill with their own colours, so the small mipmaps (a player far down the court) do not bleed a
 * neutral grey into the seams: on a dark kit that showed as light patches along them.
 */
const PAD = [40, 26, 16, 10, 6, 3.5, 1.5];

/** mean luminance (linear) of the texture's coral, navy, white, hair (dark) and skin, as the crowd tells them apart */
function means(img: CanvasImageSource & { width: number; height: number }): { m: THREE.Vector4; skin: number; col: THREE.Vector3 } {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, S, S);
  const px = x.getImageData(0, 0, S, S).data;
  const sum = [0, 0, 0, 0, 0];
  const cnt = [0, 0, 0, 0, 0];
  const skinRgb = [0, 0, 0];
  const lin = (v: number) => Math.pow(v / 255, 2.2);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    const d = mx - mn;
    const s = d < 1e-4 ? 0 : d / Math.max(1e-4, 1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d > 1e-4) h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    const k = (h < 22 || h > 345) && s > 0.5 && l > 0.38 ? 0 : h > 195 && h < 255 && s > 0.2 ? 1 : l > 0.6 && s < 0.35 ? 2 : l < 0.24 ? 3 : h > 4 && h < 50 && s > 0.12 && l > 0.16 && l < 0.92 ? 4 : -1;
    if (k < 0) continue;
    sum[k] += 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]);
    cnt[k]++;
    if (k === 4) for (let j = 0; j < 3; j++) skinRgb[j] += lin(px[i + j]);
  }
  const m = (k: number, def: number) => (cnt[k] > 20 ? sum[k] / cnt[k] : def);
  const n = Math.max(1, cnt[4]);
  const col = cnt[4] > 20 ? new THREE.Vector3(skinRgb[0] / n, skinRgb[1] / n, skinRgb[2] / n) : new THREE.Vector3(0.45, 0.28, 0.2);
  return { m: new THREE.Vector4(m(0, 0.3), m(1, 0.03), m(2, 0.7), m(3, 0.015)), skin: m(4, 0.3), col };
}

/**
 * The same means for a player's own body (see BodyZones), read from its mask: its shirt, its trousers, its shoes, its
 * hair and its skin (linear luminance; and the skin's colour).
 */
function maskedMeans(img: HTMLImageElement, mask: HTMLImageElement): { m: THREE.Vector4; skin: number; col: THREE.Vector3 } {
  const S = 256;
  const read = (im: HTMLImageElement) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const x = cv.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(im, 0, 0, S, S);
    return x.getImageData(0, 0, S, S).data;
  };
  const px = read(img);
  const mk = read(mask);
  const sum = [0, 0, 0, 0, 0];
  const cnt = [0, 0, 0, 0, 0];
  const skinRgb = [0, 0, 0];
  const lin = (v: number) => Math.pow(v / 255, 2.2);
  for (let i = 0; i < px.length; i += 4) {
    const c = Math.round(mk[i] / 40);
    if (c < 0 || c > 4) continue;
    sum[c] += 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]);
    cnt[c]++;
    if (c === 0) for (let j = 0; j < 3; j++) skinRgb[j] += lin(px[i + j]);
  }
  const m = (k: number, def: number) => (cnt[k] > 20 ? sum[k] / cnt[k] : def);
  const n = Math.max(1, cnt[0]);
  const col = cnt[0] > 20 ? new THREE.Vector3(skinRgb[0] / n, skinRgb[1] / n, skinRgb[2] / n) : new THREE.Vector3(0.45, 0.28, 0.2);
  return { m: new THREE.Vector4(m(1, 0.1), m(2, 0.2), m(3, 0.05), m(4, 0.3)), skin: m(0, 0.3), col };
}

const lin = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);

interface Entry {
  look: KitLook;
  rts: THREE.WebGLRenderTarget[];
  refs: number;
  used: number;
}

/**
 * Paints the kits (once per kit, kept while a player wears it; see `keep`). Needs the renderer: the view makes
 * one when the model has loaded (CharAssets.painter); without it the characters fall back to a recolour on the CPU.
 */
export class KitPainter {
  private mesh: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera();
  private bake: THREE.ShaderMaterial;
  private src: THREE.Texture;
  private maskTex: THREE.Texture | null = null;
  private kits = new Map<object, Entry>();
  private clock = 0;
  /**
   * how many kits are kept in all, counting the idle ones (beyond it the idle ones go, oldest first): a singles match
   * holds two, doubles four; painting one again takes a few milliseconds of GPU
   */
  keep = 2;
  /** the colour texture's size (the material one is a quarter of it across) */
  size = 1024;

  constructor(
    private renderer: THREE.WebGLRenderer,
    template: THREE.Object3D,
    image: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
    /** a player's own body: what each texel is (see BAKE_FRAG) and where its clothes end; its kits are painted from them */
    own?: { mask: HTMLImageElement; zones: BodyZones },
  ) {
    let geo: THREE.BufferGeometry | null = null;
    template.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !geo) geo = (o as THREE.Mesh).geometry;
    });
    if (!geo) throw new Error('no mesh');
    this.src = new THREE.Texture(image as HTMLImageElement);
    this.src.flipY = false;
    this.src.colorSpace = THREE.SRGBColorSpace;
    this.src.needsUpdate = true;
    const mm = own ? maskedMeans(image as HTMLImageElement, own.mask) : means(image as HTMLImageElement);
    let maskTex: THREE.Texture | null = null;
    if (own) {
      maskTex = this.maskTex = new THREE.Texture(own.mask);
      maskTex.flipY = false;
      maskTex.colorSpace = THREE.NoColorSpace;
      maskTex.minFilter = maskTex.magFilter = THREE.NearestFilter;
      maskTex.generateMipmaps = false;
      maskTex.needsUpdate = true;
    }
    const z = own?.zones;
    const v3 = () => ({ value: new THREE.Vector3() });
    this.bake = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.src },
        uOffset: { value: new THREE.Vector2() },
        uPass: { value: 0 },
        uMean: { value: mm.m },
        uSkinMean: { value: mm.skin },
        uSkinCol: { value: mm.col },
        cShirt: v3(), cPanel: v3(), cTrim: v3(), cLogo: v3(), cShorts: v3(), cShortsTrim: v3(), cSocks: v3(), cSocksTrim: v3(),
        cShoe: v3(), cShoeAccent: v3(), cSole: v3(), cHair: v3(), cWristL: v3(), cWristR: v3(),
        uSkin: { value: new THREE.Vector3(1, 1, 1) },
        uStyle: { value: 0 }, uPrint: { value: 0 }, uPanelCuffs: { value: 0 }, uShortsDouble: { value: 0 }, uSockStripes: { value: 0 },
        uWristL: { value: 0 }, uWristR: { value: 0 }, uWoman: { value: 0 },
        maskMap: { value: maskTex }, uMask: { value: own ? 1 : 0 },
        uZones: { value: z ? new THREE.Vector4(z.cuff, z.hem, z.shortsHem, z.shoeTop) : new THREE.Vector4() },
        // (the cuff's rib 1.7 cm wide, as the AI body's)
        uCuff: { value: z ? z.cuff - 0.017 : 0.313 },
        uShortsHem: { value: z ? z.shortsHem : 0.59 },
      },
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.bake);
    this.mesh.frustumCulled = false;
    // a lost context takes the painted textures with it: paint them again
    renderer.domElement.addEventListener?.('webglcontextrestored', () => {
      for (const [kit, e] of this.kits) this.draw(kit as Outfit, e.rts);
    });
  }

  /** The textures for a kit (painted the first time); `release` when the player wearing it goes. */
  paint(kit: Outfit): KitLook {
    let e = this.kits.get(kit);
    if (!e) {
      const rts = [this.target(this.size, THREE.SRGBColorSpace), this.target(this.size / 4, THREE.NoColorSpace)];
      this.draw(kit, rts);
      e = { look: { map: rts[0].texture, aux: rts[1].texture }, rts, refs: 0, used: 0 };
      this.kits.set(kit, e);
    }
    e.refs++;
    e.used = ++this.clock;
    this.trim();
    return e.look;
  }

  release(kit: Outfit) {
    const e = this.kits.get(kit);
    if (e) e.refs = Math.max(0, e.refs - 1);
  }

  /** the GPU memory the kits hold (bytes: colour and material textures with their mipmaps) */
  bytes(): number {
    let b = 0;
    for (const e of this.kits.values()) for (const rt of e.rts) b += rt.width * rt.height * 4 * (4 / 3);
    return b;
  }

  private trim() {
    if (this.kits.size <= this.keep) return;
    const idle = [...this.kits.entries()].filter(([, e]) => e.refs === 0).sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of idle) {
      if (this.kits.size <= this.keep) break;
      for (const rt of e.rts) rt.dispose();
      this.kits.delete(k);
    }
  }

  private target(size: number, cs: THREE.ColorSpace) {
    const rt = new THREE.WebGLRenderTarget(size, size, {
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      colorSpace: cs,
    });
    rt.texture.anisotropy = 4;
    return rt;
  }

  private setKit(k: Outfit) {
    const u = this.bake.uniforms;
    const set = (n: string, hex: number) => {
      const c = lin(hex);
      (u[n].value as THREE.Vector3).set(c.r, c.g, c.b);
    };
    set('cShirt', k.shirt);
    set('cPanel', k.panel);
    set('cTrim', k.trim);
    set('cLogo', k.logo);
    set('cShorts', k.shorts);
    set('cShortsTrim', k.shortsTrim);
    set('cSocks', k.socks);
    set('cSocksTrim', k.socksTrim ?? k.socks);
    set('cShoe', k.shoe);
    set('cShoeAccent', k.shoeAccent);
    set('cSole', k.sole);
    set('cHair', k.hair);
    set('cWristL', k.wristL ?? 0);
    set('cWristR', k.wristR ?? 0);
    const sk = k.skin ?? [1, 1, 1];
    (u.uSkin.value as THREE.Vector3).set(sk[0], sk[1], sk[2]);
    u.uStyle.value = STYLE[k.style];
    u.uPrint.value = PRINT[k.print ?? 'none'];
    u.uPanelCuffs.value = k.panelCuffs ? 1 : 0;
    u.uShortsDouble.value = k.shortsDouble ? 1 : 0;
    u.uSockStripes.value = k.socksTrim != null ? 1 : 0;
    u.uWristL.value = k.wristL != null ? 1 : 0;
    u.uWristR.value = k.wristR != null ? 1 : 0;
    u.uWoman.value = k.woman ? 1 : 0;
  }

  /** both textures of a kit: each pass drawn once into a scratch target, then copied with its padding */
  private draw(kit: Outfit, rts: THREE.WebGLRenderTarget[]) {
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevAuto = r.autoClear;
    const prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.autoClear = false;
    this.setKit(kit);
    rts.forEach((rt, pass) => {
      const size = rt.width;
      // (8 bits in the target's own colour space: sRGB keeps the dark kits' precision, and any phone renders to it)
      const scratch = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, colorSpace: rt.texture.colorSpace as THREE.ColorSpace, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      this.bake.uniforms.uPass.value = pass;
      (this.bake.uniforms.uOffset.value as THREE.Vector2).set(0, 0);
      this.scene.add(this.mesh);
      r.setRenderTarget(scratch);
      r.setClearColor(0x808080, 0);
      r.clear(true, false, false);
      r.render(this.scene, this.cam);
      this.scene.remove(this.mesh);
      // the copies, all in one render (the mipmaps are made once, after it)
      const copies: THREE.Mesh[] = [];
      const copyMats: THREE.ShaderMaterial[] = [];
      let order = 0;
      for (const d of [...PAD, 0])
        for (let i = 0; i < (d ? 8 : 1); i++) {
          const a = (i / 8) * Math.PI * 2;
          const k = d ? Math.max(1, (d * size) / 1024) : 0;
          const m = new THREE.ShaderMaterial({
            uniforms: { tSrc: { value: scratch.texture }, uOffset: { value: new THREE.Vector2((Math.cos(a) * k) / size, (Math.sin(a) * k) / size) } },
            vertexShader: BAKE_VERT,
            fragmentShader: COPY_FRAG,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const c = new THREE.Mesh(this.mesh.geometry, m);
          c.frustumCulled = false;
          c.renderOrder = order++;
          copies.push(c);
          copyMats.push(m);
          this.scene.add(c);
        }
      r.setRenderTarget(rt);
      r.setClearColor(pass === 0 ? 0x6a6a6a : 0x808080, 1);
      r.clear(true, false, false);
      r.render(this.scene, this.cam);
      for (const c of copies) this.scene.remove(c);
      for (const m of copyMats) m.dispose();
      scratch.dispose();
    });
    r.setRenderTarget(prevRT);
    r.setClearColor(prevClear, prevAlpha);
    r.autoClear = prevAuto;
    r.shadowMap.autoUpdate = prevShadow;
    // the source and the mask are only read here: out of the GPU until the next kit (some 10 MB a body; three.js uploads
    // them again from the images, which stay)
    this.src.dispose();
    this.maskTex?.dispose();
  }
}

/** A small tile of knitted fabric's relief (a tangent-space normal map), repeated across the atlas. */
let knit: THREE.Texture | null = null;
function knitTexture(): THREE.Texture | null {
  if (knit) return knit;
  try {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d')!;
    const img = x.createImageData(S, S);
    // height: rows of little loops (a piqué knit), 8 by 8 to the tile
    const ht = (i: number, j: number) => {
      const u = ((i % S) + S) % S;
      const v = ((j % S) + S) % S;
      const cu = (u % 8) / 8 - 0.5;
      const cv = (((v + (Math.floor(u / 8) % 2) * 4) % 8) / 8) - 0.5;
      return Math.max(0, 1 - (cu * cu * 6 + cv * cv * 3.2) * 2.2);
    };
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const dx = ht(i + 1, j) - ht(i - 1, j);
        const dy = ht(i, j + 1) - ht(i, j - 1);
        const n = new THREE.Vector3(-dx * 1.2, dy * 1.2, 1).normalize();
        const o = (j * S + i) * 4;
        img.data[o] = (n.x * 0.5 + 0.5) * 255;
        img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
        img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
        img.data[o + 3] = 255;
      }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(72, 72);
    t.colorSpace = THREE.NoColorSpace;
    knit = t;
    return t;
  } catch {
    return null;
  }
}

/**
 * The players' material: physical, with the kit's sheen (cloth, a touch on skin), roughness and specular strength from
 * its material texture, and the knit's relief only on fabric. (The sheen map's red channel is its amount and blue the
 * knit's: patched in, the rest is three's own.)
 */
export function playerMaterial(look: KitLook, alpha?: THREE.Texture | null): THREE.MeshPhysicalMaterial {
  const nt = knitTexture();
  const m = new THREE.MeshPhysicalMaterial({
    map: look.map,
    // (0.10: one roughness and a low specular for the whole body; read per texel from the aux texture, the cloth came
    // out far glossier than its 0.86–0.88 and dark kits looked like latex under the stadium's back light)
    roughness: 0.88,
    metalness: 0,
    specularIntensity: 0.18,
    sheen: 1,
    sheenColor: new THREE.Color(0.26, 0.26, 0.26),
    sheenColorMap: look.aux,
    sheenRoughness: 0.55,
    envMapIntensity: 0.9,
    ...(nt ? { normalMap: nt, normalScale: new THREE.Vector2(0.45, 0.45) } : {}),
    // (a player's own body: the hair's strands and the lashes cut out of their cards, seen from both sides)
    ...(alpha ? { alphaMap: alpha, alphaTest: 0.5, side: THREE.DoubleSide } : {}),
  });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_fragment>', THREE.ShaderChunk.lights_physical_fragment.replace('texture2D( sheenColorMap, vSheenColorMapUv ).rgb', 'vec3( texture2D( sheenColorMap, vSheenColorMapUv ).r )'))
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', '#ifdef USE_SHEEN_COLORMAP\n\tmapN.xy *= normalScale * texture2D( sheenColorMap, vSheenColorMapUv ).b;\n#else\n\tmapN.xy *= normalScale;\n#endif'));
  };
  m.customProgramCacheKey = () => (alpha ? 'player-kit-a' : 'player-kit');
  return m;
}
