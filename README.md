# Pádel · Pro Tour (prototipo)

Juego de pádel en 3D para web y móvil, propio del estudio Nocodeboy Games. El nombre y la marca son provisionales: los decide el estudio y se cambian en `src/tour.ts` (y el título de la página en `build.mjs`).

- **Origen:** copia del juego de pickleball del estudio (`Nocodeboy/Pickleball@2f15030`, versión 0.10), convertida en pádel. Las notas de diseño del pickleball siguen en `docs/pickleball/` como referencia (la interfaz que se hereda: `notas-09-interfaz.md`).
- **Versión:** 0.3 (12 oct 2026): atributos 0–99 visibles en fichas de jugador, la fuerza del golpe según la velocidad del gesto, la bajada de pared y los remates por 3 y por 4 (`docs/notas-03-interfaz.md` y `docs/notas-03-simulacion.md`).
- **0.4 (en curso, rama `v0.4`):** tú, tu pareja, Galván y Arturo con cuerpo, cara y pelo propios hechos con IA en MimicPC (Qwen-Image + TRELLIS 2), montados en el esqueleto del jugador (`docs/notas-05-trellis.md`); el conversor de vídeo a clip del pickleball 0.13.
- **0.2:** animaciones de captura de movimiento y mobiliario y luz de Blender, traídos del pickleball 0.12.
- **Estado:** se juega siempre en dobles: tú y Martín Di Neno (tu pareja, la CPU) contra un cuadro de cuatro parejas de la máquina, de octavos a la final. Pista de 20 × 10 m con cristal y malla; la bola rebota en las paredes y se puede jugar después del bote. Puntuación de pádel (15-30-40, punto de oro o ventajas, un set corto con tie-break). Marcador de televisión con juegos y puntos, saque y segundo saque, punto de oro, iguales, tie-break y banners de falta, let y de cada forma de acabar el punto (a la red, pared directa, doble falta, por 3, por 4…). Cada jugador tiene una ficha con su media y siete atributos de 0 a 99 (potencia, control, velocidad, reflejos, remate, pared y toque) que mueven su juego; se ven en la presentación del partido, en el cuadro (la media de cada pareja) y en «Tu pareja». Textos en español e inglés. Sin online, sin modo individual y sin entrenamiento (se quitaron al pasar del pickleball).

## Compilar

```bash
npm install
node build.mjs          # dist/index.html y dist/artifact.html, con dist/assets/
npx tsc --noEmit -p .   # comprobación de tipos
```

`dist/` es una sola página HTML, más los personajes y las animaciones en `dist/assets/` (como `.json`). Para probarla hay que servir la carpeta con cualquier servidor estático, por ejemplo `npx serve dist`.

## Estructura

- `src/sim/`: simulación determinista. Pista, paredes y red (`court.ts`), vuelo de la bola y rebotes en cristal y malla (`ball.ts`), reglas, puntuación, movimiento y planes (`match.ts`), IA, golpes y el cuadro de parejas (`brain.ts`).
- `src/`: control (`input.ts`, `human.ts`), menús, ajustes y flujo del partido (`main.ts`), grafismo de TV y marcador (`broadcast.ts`), por qué se ganó o perdió cada punto (`explain.ts`), textos en español e inglés (`i18n.ts`), audio sintetizado: pala, bote, cristal y malla (`audio.ts`), equipaciones (`kits.ts`) y marca, apellidos y cabezas de serie (`tour.ts`).
- `src/render/`:
  - escena, luz y niveles de calidad: `view.ts`, `look.ts`;
  - estadio y pista: `stadium.ts`, `venue.ts`, `led.ts`, `crowd.ts`;
  - personajes: `chars.ts`, `keyposes.ts` y `body.ts`;
  - equipaciones, pala y bola: `outfit.ts`, `gear.ts`;
  - cámaras y repeticiones: `director.ts`, `replay.ts`.
- `assets/`: el modelo del jugador (`chars/hero.json`) y las animaciones (`anims/`), convertidos con `tools/prep-character.mjs` y `tools/prep-clip.mjs`. Los originales (`art/raw`) no están en el repositorio.
- `tools/`: bots y capturas. `bot-doubles.ts` mide el cuadro con un pulgar simulado, `review/fuzz.ts` juega partidos con pulgares al azar, `poses.ts` mide las poses, y hay scripts de captura con Playwright (`screens.py`: menús, partido y final en un móvil vertical; `hud.py`: los indicadores en pantalla).

## Comprobaciones habituales

```bash
npx tsx tools/bot-doubles.ts 12 1          # el cuadro de parejas, ayuda media
npx tsx tools/review/fuzz.ts 40            # partidos con pulgares al azar: sin fallos ni atascos
python3 tools/screens.py /tmp/padel-screens  # capturas de menús, fichas, avisos, marcador y final (necesita dist/)
python3 tools/screens.py /tmp/padel-h dist en 844x390 8784  # lo mismo en inglés y en horizontal
```

## Para depurar en el navegador

`window.__pb`: `start(i)` empieza el partido contra la pareja `i` del cuadro (sin la presentación de TV; `start(i, true)` con ella), `match` es el partido en juego, `autopilot()` hace que tu jugador juegue solo, y `manual` + `advance(seg)` paran el bucle y avanzan el partido a mano para capturas. Para las capturas de la 0.3: `forceCue = 'bajada'` (o `'attack'`) muestra ese aviso sea cual sea la bola, y `fakePoint(ganador, motivo, golpe, especial)` lanza un punto con el golpe que lo decidió (cartel, público y sonido), por ejemplo `fakePoint(0, 'exit', 'smash', 'por3')`.
