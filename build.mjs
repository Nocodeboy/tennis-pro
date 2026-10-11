// Builds the prototype into one self-contained page (the studio's pattern):
//   dist/index.html     web build
//   dist/artifact.html  the same page for the Claude artifact (fonts from Google Fonts, no analytics)
// Usage: node build.mjs [--dev]
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const prod = !process.argv.includes('--dev');
const VERSION = '0.10.0';
const css = readFileSync('src/style.css', 'utf8');
const fonts =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,700;1,800&family=Barlow:wght@500;600;700&display=swap">';

const res = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: prod,
  format: 'iife',
  target: ['es2022', 'safari15'],
  write: false,
  legalComments: 'none',
  define: { __VERSION__: JSON.stringify(VERSION) },
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const body = `<div id="app">
<canvas id="c" aria-label="Pickleball"></canvas>
<div id="touch"></div>
<div id="fx"></div>
<div id="flash"></div>
<div id="hud" hidden></div>
<div id="banner"></div>
<div id="toast" aria-live="polite"></div>
<div id="hint" hidden></div>
<div id="screens"></div>
</div>`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#06080c">
<title>Pickleball Pro Tour</title>
<meta name="description" content="Pickleball in 3D on the Pro Tour: hold, aim and release. Dinks, drives, lobs and speed-ups with the real rules.">
${fonts}
<style>${css}</style>
</head>
<body>
${body}
<script>${js}</script>
</body>
</html>
`;
// the artifact host wraps the page in its own document skeleton: title, fonts and styles first, then the body
const fragment = `<title>Pickleball Pro Tour</title>
${fonts}
<style>${css}</style>
${body}
<script>${js}</script>
`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', page);
writeFileSync('dist/artifact.html', fragment);
// the AI-made players and their animations are fetched next to the page
cpSync('assets', 'dist/assets', { recursive: true });
console.log(`dist/index.html ${(page.length / 1024).toFixed(0)} KB · v${VERSION}`);
