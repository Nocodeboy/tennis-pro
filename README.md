# Tenis · Pro Tour (prototipo, rama `tenis`)

Juego de tenis en 3D para web y móvil, propio del estudio Nocodeboy Games. El nombre y la marca son provisionales: los decide el estudio y se cambian en `src/tour.ts` (y el título de la página en `build.mjs`).

> **Esta rama no se fusiona en `main`.** `main` es el pádel y se publica sola en Vercel ([padel-pro-one.vercel.app](https://padel-pro-one.vercel.app)). El tenis vive en la rama `tenis`, con su propia vista previa de Vercel (con inicio de sesión). Si el tenis pasa a ser un juego publicado, se le hace su propio repositorio desde esta rama.

- **Origen:** el motor del pádel 0.6 de `main` (`33e2ba3`) más lo que el pickleball sabía de individual (`Nocodeboy/Pickleball`). Las notas del pádel siguen en `docs/` y las del pickleball en `docs/pickleball/` como referencia; las del tenis, en `docs/tenis/`.
- **Versión:** 0.1 (12–13 oct 2026), la primera jugable:
  - **individual** contra un cuadro de cinco rivales, de dieciseisavos a la final;
  - **dobles** con tu pareja, Marcel Granoyers, contra cuatro parejas, de octavos a la final;
  - **tres superficies**, cada una con su bote: pista dura, tierra batida y hierba;
  - pista ITF con líneas de individual y dobles, red con palos de individual, raqueta con cuerdas, revés a dos manos, cortados y saque por arriba;
  - puntuación de tenis: 15-30-40 con ventajas o punto decisivo, sets a 2, 3, 4 o 6 juegos con tie-break, un set o al mejor de 3 o de 5 (tie-break a 10 en el quinto);
  - marcador de televisión con hasta cinco sets, bola de break, de set y de partido, carteles de ace, doble falta, fuera (con los centímetros), let y ganador;
  - textos en español e inglés.
- **Detalle:** `docs/tenis/concepto.md` (estado, números y pendientes), `docs/tenis/contrato.md` (lo que comparten simulación, gráficos e interfaz) y las notas de cada parte: `notas-01-simulacion.md`, `notas-01-graficos.md` y `notas-01-interfaz.md`.

## Compilar

```bash
npm install
node build.mjs          # dist/index.html y dist/artifact.html, con dist/assets/
npx tsc --noEmit -p .   # comprobación de tipos
```

`dist/` es una sola página HTML, más los personajes y las animaciones en `dist/assets/` (como `.json`). Para probarla hay que servir la carpeta con cualquier servidor estático, por ejemplo `npx serve dist`.

## Estructura

- `src/sim/`: simulación determinista.
  - `court.ts`: la pista ITF, las líneas en juego (individual o dobles), la zona libre y las vallas;
  - `ball.ts`: el vuelo de la bola y el bote de cada superficie (`GROUND`);
  - `match.ts`: reglas, saque, puntuación, físico, movimiento, el planificador de contactos y el modelo de error (`SCATTER`);
  - `brain.ts`: la IA (`TENNIS`, individual y dobles), los rivales y sus fichas, y el control compartido con el humano.
- `src/`: control (`input.ts`, `human.ts`), menús, ajustes y flujo del partido (`main.ts`), grafismo de TV y marcador (`broadcast.ts`), por qué se ganó o perdió cada punto (`explain.ts`), textos (`i18n.ts`), audio (`audio.ts`), equipaciones (`kits.ts`) y marca, apellidos y cabezas de serie (`tour.ts`).
- `src/render/`: escena y cámara (`view.ts`, `look.ts`), estadio y pista de tres superficies (`stadium.ts`, `venue.ts`, `textures.ts`, `led.ts`, `crowd.ts`), personajes y golpes (`chars.ts`, `keyposes.ts`, `body.ts`), equipaciones y raqueta (`outfit.ts`, `gear.ts`), tele y repeticiones (`director.ts`, `replay.ts`).
- `assets/`: los jugadores (`chars/`) y las animaciones (`anims/`; el revés a dos manos, `backhand_mocap.json`, viene del pickleball).
- `tools/`: bots, medidas y capturas (abajo).

## Comprobaciones habituales

```bash
npx tsx tools/bot.ts singles 16 hard          # la escalera de individual: tres niveles de humano contra los cinco rivales
npx tsx tools/bot.ts doubles 12 clay          # la de dobles, en tierra
SHOTS=1 LEVELS=medio npx tsx tools/bot.ts singles 10 grass   # golpes, velocidades, cómo acaban los puntos
npx tsx tools/review/fuzz.ts 120              # partidos con pulgares al azar: sin fallos ni atascos
npx tsx tools/render/poses-tenis.ts 70        # la raqueta en la bola y las poses, con la simulación real
python3 tools/tenis/play.py /tmp/tenis-play singles clay 2   # un partido en el navegador, fotograma a fotograma (necesita dist/)
python3 tools/ui/screens.py /tmp/tenis-ui     # menús, fichas, ajustes, marcador y carteles (necesita dist/)
```

`tools/bot.ts` acepta `[singles|doubles] [partidos por casilla] [superficie] [juegos] [sets] [ayuda] [punto decisivo]` y variables de entorno para probar otros valores sin tocar el código (`TENNIS`, `PRESSURE`, `WHIFF`, `REACH`…; la lista está en la cabecera del fichero).

## Para depurar en el navegador

`window.__pb`: `start(i)` empieza un individual contra el rival `i` del cuadro (`startDoubles(i)`, dobles contra la pareja `i`; `start(i, true)` con la presentación de TV), `setSurface('clay')` y `setMode('doubles')` cambian el torneo, `match` es el partido en juego, `autopilot()` hace que tu jugador juegue solo, y `manual` + `advance(seg)` paran el bucle y avanzan el partido a mano para capturas. `fakePoint(ganador, motivo, golpe, golpes, fuera?)` lanza un punto con su cartel, por ejemplo `fakePoint(0, 'winner', 'serve', 1)` (un ace).
