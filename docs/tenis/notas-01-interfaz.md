# Tenis 0.1 · Interfaz: modos, superficie, marcador y textos

*12 oct 2026.* Es la parte de interfaz de la conversión del pádel al tenis (contrato: `contrato.md`). Cubre los menús, los dos cuadros, la superficie, los ajustes de reglas, el marcador y los carteles de TV, las explicaciones, el sonido, las equipaciones y la marca. La simulación y los gráficos van en sus propias notas.

Ficheros tocados: `src/main.ts`, `broadcast.ts`, `explain.ts`, `i18n.ts`, `tour.ts`, `kits.ts`, `audio.ts`, `style.css`, `icons.ts`, `build.mjs`, `assets/sfx` y `tools/ui/` (nuevo).

## Modos y cuadros

- **Individual y Dobles**, con un selector encima de «Jugar». Cada modo guarda su progreso: `beaten` (rivales ganados, de 0 a 5) y `beatenPairs` (parejas ganadas, de 0 a 4).
- **Individual:** tú contra `RIVALS`, en un cuadro de 32 jugadores con cinco partidos (dieciseisavos, octavos, cuartos, semifinal y final). El partido se crea con dos `PlayerCfg` (tú en el equipo 0, el rival en el 1) y un `AIController`.
- **Dobles:** tú y Marcel Granoyers (`PARTNER`) contra `PAIRS`, en un cuadro de 16 parejas con cuatro partidos (de octavos a la final). Es igual que en el pádel.
- **El menú cambia con el modo:** el partido de fondo (Siner contra Alcarás, o dos parejas), la entrada «Tu ficha» o «Tu pareja», el cuadro y la siguiente ronda.
- **Bajo el título del cuadro** salen el tamaño del cuadro, la superficie y el formato.

## Superficie

- **Es del torneo:** los dos cuadros se juegan en la que elijas en *Ajustes → Superficie* (Dura, Tierra batida o Hierba; por defecto, Dura). Va en `rules.surface`.
- **Dónde se ve:**
  - una muestra de color y su nombre en el menú (junto al cuadro), en el cuadro, en la ficha del partido y en el final;
  - en la cortinilla de TV: «Final · Pista Central · Hierba» (`venue()` en `tour.ts`).
- **Al cambiarla en Ajustes,** el partido de fondo pasa a la pista nueva.
- **En hierba todos visten de blanco,** con un filete de su color (`onSurface()` en `kits.ts`). Las fichas y la TV mantienen el color de cada jugador.

## Reglas en Ajustes y valores por defecto

| Ajuste | Opciones | Por defecto |
|---|---|---|
| Sets | Un set · Al mejor de 3 · Al mejor de 5 | Un set |
| Juegos por set | 2 · 3 · 4 · 6 (tie-break a 7 con empate) | 4 |
| Con 40-40 | Ventajas · Punto decisivo | Ventajas |
| Superficie | Dura · Tierra batida · Hierba | Dura |

**Por qué un set a 4 juegos.** Un set a 6 dura entre 12 y 20 minutos, demasiado para la primera partida en un móvil. A 4 juegos se queda en unos 6 a 10 minutos: es el formato corto que existe de verdad (Fast4) y conserva el tie-break. Las ventajas, porque es la regla del circuito; el punto decisivo queda como opción. El partido completo (al mejor de 3 o de 5 a 6 juegos) está a un toque en Ajustes. La duración real hay que medirla con el bot cuando la simulación esté lista.

## Guardado

Clave nueva, `tenis-proto-v1`, para no leer el guardado del pádel cuando los dos juegos están en el mismo origen. Estos son sus campos:

```ts
{ sound, music, games: 2|3|4|6, sets: 1|3|5, golden: boolean, surface: 'hard'|'clay'|'grass',
  mode: 'singles'|'doubles', beaten: 0..5, beatenPairs: 0..4,
  tutorial, lang?, swing, assist, replays, recover, haptics, hud, skips, played, coach, seen: string[] }
```

Al cargar, los valores que no son válidos vuelven al de por defecto, y los progresos se recortan a su cuadro.

## Marcador y carteles de TV (`broadcast.ts`)

- **El marcador** muestra, por lado, una columna con los juegos de cada set terminado (el ganador del set, en claro), los juegos del set en curso y los puntos.
  - Caben hasta cinco sets: con cinco, las columnas son cuatro más la del set en curso.
  - Al acabar el partido se quitan los puntos y los juegos del ganador se encienden.
- **Etiquetas bajo el marcador y en la llamada del juez:**
  - «Bola de partido» y «Bola de set»;
  - «Bola de break», cuando al que resta le falta un punto para el juego (nunca en el tie-break; si además es bola de set, gana la de set);
  - «Iguales», «Ventaja» y «Punto decisivo»;
  - «Tie-break».
- **La llamada del juez** dice «Iguales» o «Ventaja Alcarás», o el tanteo con el que saca primero. `stakes(m)` decide lo que vale cada punto.
- **Las tiras inferiores:**
  - «Juego», o «Break» sobre fondo dorado cuando gana el que resta;
  - «Set · 1–1 · Alcarás 7–6 (5)»: los puntos del tie-break salen de contar sus puntos;
  - «Juego, set y partido · 6–4 6–7(5) 3–6 7–5 4–2».
- **Carteles del punto:**
  - ace: «¡Ace!» o «Ace» si es del rival;
  - doble falta;
  - «¡Fuera!», con «por 4 cm» si se fue por menos de 30 cm (sale del `out` del bote);
  - la falta de saque, también con la distancia;
  - let («primer saque» o «segundo saque»);
  - a la red;
  - «¡Ganador!», o el golpe por su nombre: «¡Passing!», «¡Globo!» (si el rival estaba en la red), «¡Remate!», «¡Dejada!», «¡Volea!»;
  - en los errores, debajo, «Error forzado» o «Error no forzado».
- **Público:** se calla mientras la bola está en juego (`audio.inPlay`: desde que se prepara el saque hasta el final del punto) y aplaude al acabar. En la doble falta hay un «uy» y unos pocos aplausos.
- **Repeticiones:** valen sobre todo el remate, el passing, el globo y la dejada. La etiqueta dice el golpe: «REPETICIÓN · REVÉS».
- **Sin rastro del pádel:** no quedan pared, cristal, por 3, por 4 ni bajada, ni carteles ni avisos de ellos.

## Final del partido

- Muestra los juegos de cada set, con los puntos del tie-break pequeños junto al 6 del que lo perdió, y los sets.
- Las estadísticas son las de la TV: aces y dobles faltas, primeros saques dentro, bolas de break ganadas, puntos ganados sin error, errores (los tuyos y los de Marcel en dobles), golpes perfectos, peloteo más largo y distancia recorrida.
- Los números de saque los cuenta `broadcast.ts` (`bc.serve`) a partir de los eventos.

## Explicaciones (`explain.ts`)

- **Motivos de punto del contrato:**
  - el ace (saque bueno que nadie toca);
  - red, con los centímetros que faltaron;
  - fuera, larga o ancha y por cuánto;
  - doble falta (a la red, pasada del cuadro, fuera del cuadro);
  - resto de volea;
  - passing paralelo o cruzado, y globo por encima del que está en la red;
  - al cuerpo.
- **Derecha o revés:** «tu derecha» o «el revés de Siner», según la mano del golpe (`lastHit.hand`).
- **Error forzado o no forzado:** es forzado si la bola llegó rápida, sin tiempo o con el jugador estirado (`FORCED`). Los umbrales de velocidad son de tenis (`SPEED`, `FORCED`) y están por medir con la simulación nueva.
- **Consejos entre puntos:** los mismos patrones de antes, con textos de tenis.

## Textos (`i18n.ts`)

- Todo el vocabulario es de tenis, en español y en inglés. No quedan chiquita, bandeja, víbora, bajada, cristal, malla, pala ni punto de oro.
- Atributos (`saq` Saque/SAQ/SRV y `red` Red/RED/NET) y líneas de los rivales, según el contrato.
- «Cómo se juega» tiene diez apartados:
  1. Dos pulgares.
  2. Arrastra para colocarla.
  3. La fuerza está en el gesto.
  4. Ataca y defiende.
  5. Por encima de la cabeza (remate colocado o fuerte).
  6. El saque.
  7. Reglas reales.
  8. Puntuación.
  9. Superficies.
  10. Dobles.
- El dibujo de la pista es de tenis, con el pasillo, los cuadros de saque y el color de la superficie.
- **Avisos:**
  - fuera el de la bajada y el del por 3;
  - entra el del remate (`tut.smash`, una vez en la vida);
  - el abanico sobre la cabeza enseña solo «↑ REMATE FUERTE».

## Marca (`tour.ts`, `build.mjs`)

- **Nombres y eventos:** «TENIS · PRO TOUR» (en inglés, «TENNIS · PRO TOUR»), provisional. El evento es «PRO TOUR OPEN».
- **Apellidos, rankings y cabezas de serie** según el contrato:

| Jugador | Ranking | Cabeza de serie |
|---|---|---|
| Rud | 41 | — |
| de Miñor | 17 | 8 |
| Medvédiev | 6 | 4 |
| Siner | 2 | 2 |
| Alcarás | 1 | 1 |
| Granoyers | 4 de dobles | — |

- **Siguen las notas del PES y del riesgo legal.**
- **Página:** título «Tennis Pro Tour» y descripción de tenis.
- **Versión: `0.1.0-tenis`.** Es una línea propia: el tenis tiene su propio repositorio y su numeración, aparte del pádel.

## Sonido (`audio.ts`)

- **Quitado:** el cristal, la malla, el crujido del por 3 y del por 4 y el evento `wall`. Fuera también `cristal-*.mp3` de `assets/sfx`, que el build copiaba a `dist/`.
- **Raqueta:** `audio.racket()` con las tomas de pala. `paddle()` se queda como alias para `tools/audio`.
- **Bote según la superficie (`SURF`):**
  - en pista dura, la toma tal cual;
  - en tierra, más sordo y grave, con un raspado de arcilla;
  - en hierba, suave, bajo y corto.
- **Zapatillas según la superficie:** chirrido en pista dura, arrastre largo en tierra y casi nada en hierba.

## Para depurar (`window.__pb`)

| Gancho | Qué hace |
|---|---|
| `start(i, tv?, 'singles' \| 'doubles')` | Empieza un partido. Por defecto, individual contra el rival `i` |
| `startSingles(i)` | Individual contra el rival `i` |
| `startDoubles(i)` | Dobles contra la pareja `i` |
| `setMode(m)` | Cambia el modo |
| `setSurface(s)` | Cambia la superficie |
| `screen(name)` | Abre una pantalla |
| `fakePoint(ganador, motivo, golpe, golpes, fuera?, mano?)` | Simula un punto. `fakePoint(0, 'winner', 'serve', 1)` es un ace y `fakePoint(1, 'out', 'drive', 7, 0.04)` es un fuera por 4 cm |
| `fakeEvent(e)` | Lanza cualquier evento |

`autopilot()` funciona en los dos modos; `match`, `manual`, `advance` y `forceCue` (`'attack'` o `'block'`) siguen como estaban.

**Capturas:** `python3 tools/ui/screens.py [salida] [dist] [es|en] [390x844|844x390] [puerto]`. Saca unas 50 pantallas: menús, cuadros, fichas, ajustes, la ficha del partido, la cortinilla, los carteles, el marcador en todos sus estados, las tiras y los finales a uno, tres y cinco sets.

## Comprobado

- **Sin errores de tipos** en mis ficheros.
- **Build de prueba:** como `brain.ts` y `match.ts` siguen siendo de pádel, compilé una copia aparte, fuera del repositorio, con la simulación de HEAD, mi interfaz y los añadidos mínimos para individual.
- **Capturas** en vertical (390 × 844) y en horizontal (844 × 390), en español y en inglés, sin errores en la página.
- **Lo que no se ha visto todavía:** la pista y los jugadores de las capturas siguen siendo los del pádel.

## Pendiente

- **De la simulación:**
  - que `bounce.out` llegue también en la falta de saque, para el «por 4 cm»;
  - confirmar que el ace es `winner` con `rally === 1`. Yo cuento también `miss` y `letGo` con `rally === 1`, porque en tenis cualquier saque bueno sin tocar es ace;
  - que `human.cue()` ya no devuelva `'bajada'`;
  - que `kindForAim` dé `smash` con el latigazo, para el abanico;
  - que `audio.squeak` y `onDeadBounce` sigan llegando desde la vista.
- **De gráficos:**
  - que la vista sepa la superficie y si el partido es individual o de dobles (hoy solo le paso las equipaciones, ya vestidas de blanco en hierba);
  - los rótulos del estadio («PRO TOUR FINALS», «CENTER COURT» y los patrocinadores de pádel como «Glasswall Bank» o «Bandeja Energy») son de `render/`;
  - si la raqueta usa `paddleLook`, el marco va en `graphic` y el acento en `graphic2`.
- **Medir con el bot:**
  - la duración real de un set a 4 y a 6 juegos;
  - los umbrales de velocidad de `explain.ts` (`SPEED`, `FORCED`) y de la repetición (`FAST`);
  - el reparto entre errores forzados y no forzados.
- **Sonido:**
  - tomas propias de tenis (raqueta con cordaje, bote de la bola de tenis, «Out!» del juez de línea);
  - escuchar en un móvil el bote de cada superficie.
- **Probar en un móvil real:** el selector de modo encima de «Jugar» y el marcador con cuatro columnas de sets a 390 px.

## Resuelto con la simulación de tenis (13 oct)

- **`bounce.out`** llega también en las faltas de saque.
- **El ace** es todo saque bueno que nadie toca (`rally === 1`, sin error: `winner`, `miss` o `letGo`), como se contaba aquí. Lo mismo cuenta `tools/bot.ts`.
- **`human.cue()`** solo devuelve `'attack'`, `'block'` o `null`. **`kindForAim`** da `smash` con el latigazo sobre una bola por encima de la cabeza.
- **Umbrales medidos con el bot** (`explain.ts`, `broadcast.ts`):
  - un golpe de fondo sale a 108 km/h de mediana y a 131–135 km/h en el p90, y da 1,3 s al otro;
  - `SPEED.fast` pasa a 36 m/s (130 km/h), `SPEED.vin` a 24, `FORCED` a 0,75 s, 25 y 38 m/s, y `FAST` de las repeticiones a 38 m/s.
- **Duración:** un set a 4 juegos dura de 5 a 15 minutos con el humano simulado, según lo igualado.
- **Concordancia:** «tu revés se fue largo», «tu derecha se fue larga» (`{g}` en `x.long` y `x.wide`).
