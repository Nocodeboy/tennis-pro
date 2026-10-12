# Simulación de pádel 0.3 (12 oct): potencia del gesto, por 3 y por 4, bajada y atributos

Notas del agente de juego y simulación. Lo pedido por Germán: la potencia sale de la velocidad del gesto, los remates por gesto (bandeja, víbora, remate, por 3 y por 4), la bajada de pared como golpe propio y atributos 0–99 visibles que mueven el juego de verdad. Todo está medido con `tools/bot-doubles.ts`, `tools/review/por.ts` (nuevo), `tools/review/fuzz.ts` y `tools/feet.ts`.

## Gesto → golpe (pulgar derecho)

| Gesto | Bola normal | Por encima de la cabeza | Bola que vuelve alta del cristal de fondo |
|---|---|---|---|
| Arrastrar y soltar con el dedo quieto | golpe colocado (potencia ≈ 0,3: más lento y seguro) | bandeja | bajada controlada, firme a las esquinas |
| Soltar con el dedo en movimiento | golpe normal (≈ 0,5) | bandeja | bajada controlada |
| Golpe rápido en cualquier dirección (no latigazo) | golpe fuerte (0,5–0,85) apuntado donde estaba el dedo antes del trazo | bandeja | bajada fuerte (≥ 0,7) |
| Latigazo hacia arriba | volea fuerte, al cuerpo o a lo apuntado | remate (a la reja o a los pies) | bajada fuerte, abajo a los pies o por el centro |
| Latigazo torcido hacia una pared | volea fuerte doblada | víbora | bajada fuerte |
| Latigazo recto a tope (≥ 0,9) | volea fuerte | **remate por 3** si la bola está alta (≥ 2,25 m) y cerca de la red (≤ 4,2 m); si no, remate | bajada fuerte |
| Latigazo hacia abajo (hacia el jugador) | golpe fuerte apuntado | **remate por 4** (liftado) | bajada fuerte |
| Toque | bloqueo | bloqueo | bloqueo |

- **Teclado:** Espacio = golpe normal (0,5). F = ataque: cuanto más tiempo se mantiene, más fuerte (0,7 al pulsar, 1 a los 0,6 s; `KEY_POWER`). **Shift+F = latigazo hacia abajo** (por 4 por encima de la cabeza).
- **Ratón:** igual que el dedo (la velocidad del ratón es la del trazo). Botón derecho = F; **Shift + botón derecho = por 4**.
- **El aro dorado** sigue decidiendo el momento y la calidad. La potencia solo cambia lo fuerte que sale.
- **Saque:** la potencia cuenta, pero entre 0,35 y 0,7 (`SERVE_POWER`).

## Modelo de potencia (`POWER` en brain.ts, aplicado en `Match.launch`)

`ShotSpec.power` va de 0 a 1 (0,5 neutro) y llega en el evento `hit` de todos los golpes, del humano y de la CPU.

- **Ritmo:** × (1 − (p − 0,5) × 0,36). Con potencia 1 vuela un 18 % antes; colocado (0,3), un 7 % después.
- **Altura sobre la cinta** (drive, volea, resto, saque, bajada): × (1 − (p − 0,5) × 0,5). Más fuerte es más plano y va más a la red.
- **Dispersión:** × (1 + (p − 0,5) × 0,9) por encima de 0,5 y × (1 − (0,5 − p) × 0,6) por debajo.
- **Pifias:** un golpe fuerte (> 0,6) a una bola incómoda suma pifias: (p − 0,6) × dificultad × 0,3 (`powerShank`).
- **Juego blando** (chiquita, dejada, globo): lo nota un 40 %. Un globo con potencia sale más bajo y más profundo.
- **Velocidad máxima:** 36 m/s de media en el vuelo (`LAUNCH.vmax`, ≈ 150 km/h a la salida de la pala).
- **Curva del dedo** (`STROKE`, `strokePower` en input.ts), medida en los últimos 80 ms:
  - hasta 60 px/s, 0,3;
  - a 300 px/s, 0,5;
  - en el umbral del latigazo (650 px/s), 0,6;
  - a 1.500 px/s, 1.
- **Medido** (`por.ts`, final):
  - un drive desde el fondo va a 21,3 / 22,6 / 24,7 / 26,5 m/s con potencia 0,3 / 0,5 / 0,75 / 1;
  - su dispersión pasa de 0,23 a 0,32 m.
- **CPU:** pega a la potencia de su carta (`Skill.power`, 0,5 a pot 75):
  - una muesca más en los ataques (+0,18);
  - colocado en el juego blando (0,35).

## Por 3 y por 4 (`POR`, `specialShot`, `specialOk` en brain.ts)

- **Por 3:** plano (efecto 0,04), lo más fuerte posible y lo más empinado que deja la red. Se apunta justo por encima de la cinta en la línea más recta desde el contacto. Bota alto y sale por encima del cristal o la malla.
- **Por 4:** liftado a tope (efecto 1), 1,1 m más profundo que el por 3. Bota, sube a lo alto del cristal de fondo (2,6–3 m), trepa y vuelve por encima de la red.
- **La física decide si sale.** Un contacto malo pierde ritmo (+50 % por unidad de q perdida) y se dispersa en profundidad 1 × (0,6 + 1 − q) m.
- **Regla nueva en el planificador** (`OVERHEAD.fromBehind`): una bola que vuelve del cristal de fondo por encima de 2,2 m viene por detrás del jugador y nadie la remata; se espera a que baje. Es lo que deja volar el por 4. También hace que algún remate plano vuelva solo a campo propio.

**Éxito medido** (`npx tsx tools/review/por.ts 120`, Agustín y Arturo defendiendo desde el fondo):

| Intento | Por 3, 2,7 m de altura a 2 m de la red | Por 3, 2,5 m a 2,5 m | Por 3, 2,5 m a 3,5 m | Por 4, 2,5 m a 2,5 m | Por 4, 2,5 m a 3,5 m |
|---|---|---|---|---|---|
| Perfecto, potencia 1 | 77 % | **48 %** | 12 % | **31 %** | 20 % |
| Bueno, 0,85 | 72 % | 25 % | 15 % | 22 % | 16 % |
| Normal, 0,7 | 67 % | 13 % | 8 % | 15 % | 3 % |
| Flojo, 0,6 | 36 % | 3 % | 1 % | 4 % | 0 % |

- **Remate plano normal** desde las mismas alturas: 0 %.
- **Fallos:** casi todos los intentos fallidos los devuelven, muchos desde arriba (una bola que se queda alta, «alta o mala» en la tabla).
- **CPU:** va a por ello pocas veces, según su carta (`Skill.por` sale de pot + rem): Alejandro mucho, Arturo bastante, Agustín poco, el resto nunca.
- **Bot humano:** busca el por 3 (latigazo a tope) y el por 4 (latigazo hacia abajo) según su nivel.

## Bajada (`isBajada`, `BAJADA`)

- **Qué es:** una bola que ya botó y vuelve del cristal de fondo, golpeada por encima de 1,35 m por un jugador atrás (a 6,65 m o más de la red).
- **Plan:** el `Plan` lleva ahora `wall: 'back' | 'side'`, la última pared desde el bote.
- **Planificador:** iguala esa bola alta a una cómoda a la cintura y le da un poco más (0,3 × el par de la carta, `Controller.bajada`). Un remate en la red sigue teniendo prioridad.
- **`ballCue`** devuelve `'bajada'`. La prioridad es `block` > `bajada` > `attack`.
- **CPU:** la juega si le da tiempo a prepararla (dificultad < 0,45):
  - contra una pareja en la red, fuerte a los pies o por el centro;
  - contra una pareja atrás, firme a una esquina sin llegar al cristal.
- **Un cambio en la dificultad:** la bola que vuelve del cristal de fondo da la mitad del castigo de «perseguir un globo» (`RUN_BACK` y `rushed`), porque hubo tiempo mientras iba al cristal.
- **Medido:** el 4 % de los golpes, a 1,75 m de mediana. Un 2 % acaba en error, un 1 % gana el punto y un 6 % fuerza el error del rival (el drive: 1 %, 4 % y 4 %).

## Atributos (attributes.ts, brain.ts)

| | pot | con | vel | ref | rem | par | tq | media |
|---|---|---|---|---|---|---|---|---|
| Paquito | 52 | 56 | 55 | 56 | 50 | 72 | 66 | 58 |
| Fede | 58 | 72 | 72 | 72 | 60 | 82 | 84 | 71 |
| Alejandro | 93 | 82 | 82 | 76 | 92 | 70 | 62 | 80 |
| Agustín | 80 | 82 | 86 | 86 | 86 | 78 | 93 | 84 |
| Arturo | 90 | 88 | 88 | 90 | 92 | 88 | 84 | 89 |
| Martín (compañero) | 60 | 82 | 85 | 84 | 64 | 82 | 70 | 75 |
| Tú (`HUMAN_ATTRS`) | 74 | 72 | 76 | 72 | 74 | 70 | 72 | 73 |

**CPU, una sola función** (`skillFrom(attrs, style)`):

- **vel:** velocidad (4,0 m/s a 55 y 5,0 a 85) y, junto con ref, la estirada (0,4–0,75 m).
- **ref:** reacción (0,34 → 0,19 s), primera lectura (0,30 → 0,08 m), voleas en la red y, con con, el temple. Con menos reacción, más veces le pasan las bolas sin tocarlas (`WHIFF`).
- **con:** calidad (0,70 a 55, +0,0055 por punto) y su dispersión.
- **pot:** potencia de los golpes firmes y, con rem, el por 3 y el por 4.
- **rem:** calidad de la bandeja, la víbora y el remate (`attrQ`, 0,0025 por punto respecto a con), tendencia a atacar y altura máxima (2,75 + rem × 0,002 m).
- **par:** bajadas (cuántas y con qué calidad) y calidad de todas las bolas que se juegan de pared.
- **tq:** tendencia y calidad de las chiquitas, las dejadas y los globos.

El **estilo** (`RIVAL_STYLES`) es el gusto de cada uno y la carta lo escala: Paquito globea y defiende, Fede es toque, Alejandro remata y busca el por 3 y el por 4, Agustín juega chiquitas y víboras, y Arturo lo hace todo.

**Humano** (`humanSkill(attrs)` y `HumanController.attrs`):

- **vel:** velocidad (5,0 m/s a 76, ±0,02 por punto). main.ts ya la toma de `HUMAN_SPEED`, que sale de la carta.
- **pot:** techo de potencia.
- **con:** suma a la calidad de sus contactos (±0,002 por punto respecto a 72).
- **rem:** alcance por arriba.
- **par:** cuánto espera el círculo una bajada.
- **El resto,** por `attrQ`, igual que en la CPU.

## Más ganadores: bolas que pasan sin tocarlas (`WHIFF`)

- **Antes:** toda bola dura volvía o acababa en la red, y solo un 19 % de los puntos acababa en ganador.
- **Ahora:** con prisa (`rushed` > 0,18), la CPU a veces ni toca la bola. La probabilidad es (prisa − 0,18) × 0,8 × reacción / 0,25, como mucho 0,35.
- **La bola sigue viva:** el compañero puede salvarla y, si bota dos veces, es un «miss».
- **El humano no pasa por esto:** sus reflejos son los suyos.

## Números

**Escalera** (`npx tsx tools/bot-doubles.ts 16`, set a 3 juegos con punto de oro):

| Humano | Paquito+Fede | Fede+Alejandro | Alejandro+Agustín | Agustín+Arturo |
|---|---|---|---|---|
| novato | 100 % (antes 100) | 100 (92) | 44 (58) | 13 (8) |
| medio | 100 (100) | 94 (100) | 56 (67) | 19 (17) |
| bueno | 100 (100) | 94 (100) | 75 (92) | **50** (58) |

Entre paréntesis, la medida de antes de los cambios: 12 partidos por casilla, mismo código de 0.2.

- **Golpes por punto:** de 12,0 a 13,5 (antes, de 13,0 a 15,0).
- **Partidos atascados:** ninguno.
- **Cómo acaban los puntos** (bueno, todas las parejas):
  - **ganadores, 31 %** (antes ≈ 19 %): 14,7 % nadie llega, 12,2 % no llega (incluye las que pasan sin tocarlas), 3,0 % vuelve por encima de la red (por 4 y remates que vuelven) y 0,9 % sale por encima de la pared (por 3);
  - errores: 35 % al cristal o la malla y 34 % a la red.
  - Con novato y medio, 32–33 % de ganadores.

**Por golpe** (bueno):

| Golpe | % de golpes | Gana el punto | Error | Fuerza el error |
|---|---|---|---|---|
| Volea fuerte | 22 % | 6 % | 10 % | 8 % |
| Remate | 3 % | 6 % | 1 % | 10 % |
| Víbora | 1,3 % | 6 % | 13 % | 11 % |
| Bandeja | 7 % | 3 % | 4 % | 9 % |
| Bajada | 4 % | 1 % | 2 % | 6 % |
| Por 3 | 48 intentos | 42 % | — | — |
| Por 4 | 62 intentos | 40 % | — | — |

- **Altura de la bandeja:** 2,48 m de mediana (antes ≈ 2,85). El planificador penaliza el contacto por encima de 2,5 m (`OVERHEAD`).
- **Por 3 y por 4 entre jugadores fuertes:** un 1 % y un 2 % de los puntos.
- **Fuzz** (`npx tsx tools/review/fuzz.ts 48`):
  - 48 partidos y 677 puntos, ahora también con latigazos hacia abajo y trazos rápidos de lado;
  - 0 fallos y 0 atascos;
  - todos los golpes llevan potencia.
- **Pies** (`tools/feet.ts`): 0 % de contactos tardíos en 764 planes, split step en el 100 % y trayectorias rectas (0,997).

## API para render e interfaz (añadida, nada roto)

- **Evento `hit`:** `power` siempre y `special` en los por 3 y por 4.
- **`ShotSpec`:**
  - `whiff?` (solo CPU, nunca llega a lanzarse);
  - en la bajada, `intent: 'attack'` cuando es por gesto.
- **`Plan.wall?: 'back' | 'side'`.**
- **`ballCue(...)`** devuelve `'attack' | 'block' | 'bajada' | null`, y también `HumanController.cue`.
- **`Input`:**
  - `Release.gesture` puede ser `'down'`;
  - `Release.power`;
  - `powerNow()`: la potencia si se soltara ahora, para la barra o el indicador de potencia;
  - `downHeld` (Shift+F o Shift + botón derecho mantenidos);
  - `attackHeld` ya no es cierto con Shift.
- **`HumanController`:**
  - `aim(m, p, plan, dx, dy, attack?, bend?, opts?: { power?, down? })`;
  - `AimResult.special?`, para que la vista previa diga «POR 3» o «POR 4»;
  - `attrs: Attributes`, que se puede cambiar;
  - getters `reachH` y `bajada`.
- **brain.ts:**
  - `Rival.attrs`;
  - `HUMAN_ATTRS` (también en attributes.ts), `PARTNER_ATTRS`, `RIVAL_ATTRS`, `RIVAL_STYLES`;
  - `skillFrom`, `humanSkill`, `attrQ`;
  - `POWER`, `POR`, `BAJADA`, `WHIFF`, `isBajada`, `specialOk`, `specialShot`.
- **match.ts:** `LAUNCH`, `OVERHEAD`, y `Controller.reachH?` y `Controller.bajada?`.

## Pendiente

- **El por 4 depende de la geometría:**
  - desde muy cerca y muy alto, a veces sale por encima de la pared en vez de volver (cuenta como punto, pero el evento dice `por4` y el motivo `exit`);
  - por debajo de 2,25 m o más allá de 4 m de la red casi nunca sale.
- **Medio contra los campeones** gana un 19 %. Si se quiere más escalonado, el siguiente mando es `WHIFF.k` (Martín también deja pasar bolas) o el ref de Martín.
- **Probarlo en el móvil:**
  - la curva de potencia (`STROKE`), porque soltar con el dedo quieto da un golpe colocado y quizá sorprenda;
  - el umbral de 0,9 del por 3 (≈ 1.330 px/s);
  - el latigazo hacia abajo (cono de 45°).
- **La víbora** apenas cambia; un 13 % de error sigue siendo alto.
- **`explain.ts`, `broadcast.ts` y la HUD** son de los otros agentes: no he tocado nada para «BAJADA», «POR 3» o la barra de potencia.
