# Pickleball · Pro Tour (prototipo de encargo)

Juego de pickleball para web y móvil del estudio NocodeBoy, hecho por encargo. El nombre y la marca son provisionales: los pone el cliente y se cambian en `src/tour.ts`.

- **Estado y decisiones:** `docs/concepto.md`. Lo vigente está en las secciones del final; el detalle de cada versión, en `docs/notas-*.md`.
- **Versión:** 0.10 (11 oct 2026). Se juega en individual y en dobles contra la máquina, y tiene un modo entrenamiento. El online está pendiente.

## Compilar

```bash
npm install
node build.mjs          # dist/index.html y dist/artifact.html, con dist/assets/
npx tsc --noEmit -p .   # comprobación de tipos
```

`dist/` es una sola página HTML, más los personajes y las animaciones en `dist/assets/` (como `.json`). Para probarla hay que servir la carpeta con cualquier servidor estático, por ejemplo `npx serve dist`.

## Estructura

- `src/sim/`: simulación determinista. Vuelo de la bola en forma cerrada (`ball.ts`), reglas, movimiento y planes (`match.ts`), IA y golpes (`brain.ts`), y retos de entrenamiento (`drill.ts`).
- `src/`: control (`input.ts`, `human.ts`), menús, interfaz y partido (`main.ts`), grafismo de TV (`broadcast.ts`), textos en español e inglés (`i18n.ts`), audio sintetizado (`audio.ts`) y marca (`tour.ts`).
- `src/render/`:
  - escena, luz y niveles de calidad: `view.ts`, `look.ts`;
  - estadio: `stadium.ts`, `venue.ts`, `led.ts`, `crowd.ts`;
  - personajes: `chars.ts`, `keyposes.ts` y `body.ts`;
  - equipaciones, pala y bola: `outfit.ts`, `gear.ts`;
  - cámaras y repeticiones: `director.ts`, `replay.ts`.
- `assets/`: el modelo del jugador (`chars/hero.json`) y las animaciones (`anims/`), convertidos con `tools/prep-character.mjs` y `tools/prep-clip.mjs`. Los originales (`art/raw`) no están en el repositorio.
- `tools/`: bots y medidas. `bot.ts` y `bot-doubles.ts` miden la escalera con un pulgar simulado; en `review/` hay sondas, fuzz, retos y explicaciones; `poses.ts` mide las poses de los personajes, y hay scripts de captura con Playwright.

## Comprobaciones habituales

```bash
npx tsx tools/bot.ts 24 1          # escalera individual, ayuda media
npx tsx tools/bot-doubles.ts 12 1  # dobles
npx tsx tools/review/fuzz.ts 40    # partidos con pulgares al azar: sin fallos ni atascos
npx tsx tools/review/drills.ts 24 1  # retos de entrenamiento
npx tsx tools/poses.ts 90          # medidas de las poses
```
