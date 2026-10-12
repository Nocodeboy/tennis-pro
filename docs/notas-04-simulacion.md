# Simulación de pádel 0.4 (12 oct): arreglos de la auditoría 04

Notas del agente de juego y simulación. Responden a `docs/auditoria-04-simulacion.md` (A1–A7, 9–11) y a la parte de entrada y simulación de `docs/auditoria-04-jugabilidad.md` (A1, A2, B4, M2, M3, M6). Todo se ha medido con las sondas de los auditores, antes y después, con las mismas semillas. El «antes» es `07d8652` (medido sobre una copia del árbol en HEAD).

## 1. El gesto del pulgar (`src/input.ts`, `src/human.ts`)

- **Velocidad de pico.** La velocidad del trazo es el pico de los últimos movimientos (ventana `FLICK.peak` de 35 ms dentro de los últimos 80 ms; si el trazo es más corto, sobre su propia duración). No cuentan ni el tramo quieto anterior ni la muestra del `pointerup`, que repite la última posición: un levantado que llega hasta `FLICK.lift` (40 ms) después del último movimiento es un levantado en marcha.
- **Umbrales.** Latigazo desde 720 px/s de pico y 18 px de recorrido (escalados). Potencia: 0,6 en el umbral, 1 a 1.700 px/s. Un latigazo de 40–60 px en otros tantos ms da 0,71. El por 3 (0,9) pide unos 75 px en 50 ms.
- **Dónde apunta el ataque.** `strokeStart` salta las muestras quietas del final. El trazo empieza donde el dedo iba a menos del 60 % de su pico. Un latigazo desde parado no está apuntado (`ax = ay = 0`) y va al cuerpo del rival, como dice la ayuda. Un arrastre rápido desde el apoyo, sin pausa, es el propio apuntado: va donde se levanta.
- **Toque.** Tolerancia de 20 px y, además, no puede ser un latigazo. Una pulsación quieta más larga (hasta `TAP.hold`, 1,2 s) lleva `Release.quiet`. Si la bola tenía el aviso de BLOQUEO, es un bloqueo (`cuedBlock`).
- **Víbora.** Pide un trazo de 34° o más respecto a la vertical (`ATTACK.viboraDeg`). El arco natural del pulgar (15–30°) sigue siendo un remate recto. Por encima de la cabeza el cono de ataque llega a 72° (`FLICK.wideCone`): de 34° a 72° es víbora, ya no sale una «bandeja fuerte». En una bola que no va por encima de la cabeza, un trazo de más de 55° es un golpe fuerte apuntado.
- **El bot** (`tools/thumb.ts`) manda ya la muestra del levantado, como el navegador.

Tabla (`npx tsx tools/audit/gestos.ts`, la misma batería que `gest.py`; levantado a 12 ms y 120 Hz; bola alta a 2,6 m en la red):

| Gesto | Antes: lectura, potencia, golpe | Ahora |
|---|---|---|
| Latigazo de 40 px en 40 ms tras parar | golpe rápido 0,56 → bandeja a 8,2 m | **ataque 0,71** → remate al cuerpo |
| 50 px en 50 ms | golpe rápido 0,59 | **ataque 0,71** |
| 60 px en 60 ms | ataque 0,65, apuntado al final (9,1 m) | ataque 0,71, **sin apuntar → al cuerpo (4,2 m)** |
| 70 px en 50 ms | ataque 0,71 | ataque 0,88 |
| 80 px en 50 ms | ataque 0,76 | **por 3** (0,96) |
| 130 px en 80 ms | por 3 (0,94) | por 3 (0,97) |
| 30 px en 40 ms | soltar 0,52 | ataque 0,61 |
| Apunto, paro 100 ms y latigazo de 60 px | apuntado al final (40, −105) | **apuntado antes (40, −45)** |
| Arco de 15° / 25° / 30° | remate / **víbora** / víbora | remate / remate / remate |
| Torcido 40° / 50° | víbora | víbora |
| Torcido 60° / 70° | **bandeja fuerte** | víbora |
| Toque con temblor de 16 px | soltar 0,37 | **bloqueo** |
| Toque con temblor de 22 px | soltar 0,40 | soltar (fuera de tolerancia) |
| Arrastre y quieto / soltar en marcha / arrastre rápido | 0,30 / 0,44 / 0,56 | 0,30 / 0,48 / 0,57 (apunta donde se levanta) |
| Latigazo abajo de 60 px | por 4 (0,65) | por 4 (0,71) |

## 2. Los atributos ganan puntos (`brain.ts`: `skillFrom`, `attrQ`, `CARD`, `weightOf`)

- **Calidad por dominio del golpe** (`attrQ`, k = 0,0042 por punto, dos tercios de la pendiente de con):
  - rem: golpes por encima de la cabeza y voleas altas en la red;
  - par: bajadas, bolas de pared y defensa desde el fondo tras el bote;
  - tq: chiquitas, dejadas, globos y volea baja;
  - ref (con con): las voleas intermedias;
  - con: el resto.
- **La carta en el contacto** (`CARD`):
  - pot: los golpes firmes vuelan antes, sin más dispersión;
  - rem y par: su bola es menos incómoda;
  - tq: la chiquita pasa más baja;
  - vel: el tiempo para prepararse (`Plan.spare`, centrado) y llegar mejor cuando le pasan;
  - con: menos pifias.
- **El peso de la bola** (`weightOf`): la carta del que golpea hace la bola más difícil para el que la recibe. Cuenta pot en los golpes firmes, rem en los de por encima de la cabeza, tq en los blandos y par en la bajada. Tiene un tope de ±0,15.
- **El riesgo** (apuntar cerca de las líneas) ya no crece con pot: solo daba más errores.
- **ref:** algo menos de peso (reacción de 0,325 a 0,215 s, lectura y temple).
- **Alcance por encima de la cabeza:** 2,45 + rem × 0,0065 m.

`DELTA=20 npx tsx tools/audit/atributos.ts` (antes 30 partidos; ahora 40). Es el % de puntos de la pareja B, que tiene +20 en un atributo. La fila «(igual)» da el ruido de las semillas: ±2–3 puntos.

| | (igual) | pot | con | vel | ref | rem | par | tq |
|---|---|---|---|---|---|---|---|---|
| Antes | 51,4 | 47,9 | 61,7 | 48,5 | 62,8 | 47,3 | 50,9 | 50,2 |
| Ahora | 48,0 | **53,9** | 59,7 | **53,7** | 65,1 | **59,2** | **52,2** | **56,4** |
| Ahora − (igual) | 0 | +5,9 | +11,7 | +5,7 | +17,1 | +11,2 | +4,2 | +8,4 |
| % de partidos ahora | 42,5 | 65 | 87,5 | 80 | 95 | 87,5 | 62,5 | 75 |

Los siete atributos ganan ya puntos y partidos. rem y tq están en el objetivo. pot, vel y par se quedan por debajo (+4 a +6 sobre «igual»). ref sigue alto.

## 3. Las pifias no vuelan al cristal de fondo (`Match.launch`, `MISHIT`)

Una volea o un golpe por encima de la cabeza desde la red (`close`) que sale mal:
- se queda alta y corta (60 %) o va a la red;
- si es pifia: red, bola regalada alta y corta, o de marco por encima de la malla lateral.

Desde el fondo, un golpe malo:
- va largo solo el 30–40 % de las veces;
- el resto se queda corto o va a la red.

También he bajado el desvío lateral de la volea en la red y he separado de la malla la diana «a la reja» y la de la víbora.

`npx tsx tools/audit/errores.ts 40` (parejas fuertes) y `partidos.ts cpu 40`:

| | Antes | Ahora |
|---|---|---|
| Pared directa (fuertes) | 25,5 % de los puntos (56 % pifias, diana mediana 4,15 m) | **7,7 %** |
| Red (fuertes) | 34,1 % | 54,0 % |
| CPU contra CPU: pared / red / fuera | 33,5 / 31,0 / 0,2 % | **10,7** / 43,4 / 5,1 % |
| Bot medio: pared / red | 35,0 / 32,7 % | **12,8** / 42,7 % |

## 4. Red, globos y textura del punto

- **Globos** (`LOB`): pasan la red a 4,0–5,4 m (globo), 4,6–5,6 m (defensivo), 3,4–4,2 m (resto) y 3,2–3,8 m (globo de volea). La dispersión en profundidad es menor.
- **El planificador** (`OVERHEAD.keep`): la bola por encima de la cabeza entre la línea de la red y la de saque se juega de aire (bandeja, víbora) y mantiene la red. Si va más alta o más profunda, obliga a bajar.
- **Red contra red** (`PADEL.netLob` 0,45, `netDink` 0,3): más globo de volea, voleas firmes a los pies o por el centro y menos chiquita de volea.
- **Resto:** globo × 0,3; bajo (0,15–0,35 m sobre la cinta) y a 3,6–5,4 m, a los pies del sacador que sube.
- **El sacador** sube en el 85–100 % de los saques.

`partidos.ts cpu 40` (bot medio entre paréntesis; `LEVEL=medio partidos.ts bot 12`):

| | Antes | Ahora |
|---|---|---|
| Golpes por punto (media / mediana) | 11,7 / 11 (12,8 / 11) | 10,7 / 10 (11,7 / 10) |
| Segundos por punto (media) | 12,4 (12,6) | 11,9 (11,8) |
| Cómo acaban (ganadores / errores) | 34 / 65 % | 40 / 59 % (42 / 58 %) |
| La pareja de la red gana | 57,9 % (59,0) | **63,0 %** (**70,6 %**) |
| N/N al golpear | 19,2 % | 15,2 % |
| Pico del globo (mediana · p10–p90) | 3,81 · 3,3–4,4 m | **5,81 · 4,7–6,7 m** |
| Respuesta al globo sobre la red | de aire 62 % (bandeja 45 %), tras el bote 19 % | de aire 59 % (bandeja 44 %), tras el bote 3 % |
| Restos de globo | 34,8 % (29,6) | **15,4 %** (17,9) |
| Resto a los pies / bajo | 10,5 / 2,9 % | **43,2 / 75,2 %** |
| Sacador en la red en el 3.er golpe | 72,9 % (78,3) | 85,0 % (82,3) |
| Bola que atraviesa a un jugador | 0,61 por punto (0,64) | **0,05** (0,10) |
| Puntos por bola al cuerpo (`body`) | — | 4,0 % (4,2 %) |
| Coste de `m.update` (media · p99) | 0,010 · 0,22 ms | 0,019 · 0,31 ms |

Humano medio: 50,6 / 49,4 % de bolas con Martín (antes 50/50). Automáticos, 26 % (antes 24). Puntos perdidos sin tocar bola, 9,6 % (antes 9,2). Bolas suyas sin círculo, 4,0 % (antes 4,1).

## 5. La bola y los cuerpos (`Match`: `BODY`, `bodyHit`, `dodge`, `crosses`; `types.ts`)

- **Planificador:** un contacto cuyo camino (o la espera en el sitio) cruza la bola baja cuesta 1,5 más (`crosses`, con el recorrido previsto del jugador).
- **Paso lateral:** la CPU da un paso de 0,6 m cuando la bola le va a pasar a menos de 0,32 m al menos 0,3 s antes de su contacto, y nunca si el paso le cuesta ese contacto.
- **Reflejo:** antes de su reacción, la CPU solo puede bloquear de reflejo una bola que le llega al cuerpo, a menos de 0,6 m de donde está y desde la mitad de su reacción.
- **Regla (FIP):** si la bola viva toca a un jugador del equipo que recibe, el punto es del que golpeó. Es `PointReason 'body'`, y el evento `point` lleva `touched` con el jugador tocado.
- **Excepciones:**
  - su propio contacto (±0,12 s);
  - una bola a la que llegó y falló;
  - el humano tras el bote, porque sus pies son de su pulgar y nadie le aparta.

## 6. La bandeja se queda (`ball.ts`, `SLICE`)

En el bote, una bola cortada (efecto ≤ −0,3) conserva al menos el 60 % de su cortado y sale un poco más baja. En el cristal, el cortado la hace caer. El saque, con apenas cortado, no cambia.

| `fisica.ts`, contacto limpio | Antes | Ahora |
|---|---|---|
| Bandeja: altura a 1,5 m del cristal / sale hasta | 1,18 m / 4,23 m | **0,46 m / 2,32 m** |
| Víbora | 0,76 m / 3,07 m | **0,23 m / 1,91 m** |
| Drive liftado | 1,36 m / 5,27 m | igual |
| Saque | 0,50 m / 2,45 m | igual |

## 7. El aviso no cambia en el último momento (`ballCue`, `CUE`, `cuedBlock`)

- **Una decisión por bola:** se toma con el contacto previsto. Un contacto tras el cristal nunca es BLOQUEO (`underAttack` recibe el plan).
- **Cuándo puede cambiar:** solo mientras queden más de 0,4 s.
- **Toque gastado:** una pulsación quieta sobre una bola avisada como BLOQUEO sigue siendo bloqueo.

## 8. Puntos que decide el jugador

- Un golpe PERFECTO hace la bola más difícil para la CPU (`CARD.perfect`, +0,05).
- Las parejas con más control pifian menos (`CARD.shank`).
- El peso de la carta reparte puntos según lo que cada uno hace bien.

## 9. Punto de oro (`Match.goldenSide`, `goldenReturner`)

- **Quién resta:** lo elige la pareja que resta. La CPU elige a su mejor restador (con + ref + par/2), y el saque va a su cuadro, por la derecha o por la izquierda.
- **La pareja del humano** resta con el jugador de la derecha mientras la interfaz no ofrezca elegir. `Match.goldenSide = 'left'` lo cambia.

## 10. Escalera (`tools/bot-doubles.ts 12`)

`SHOTS=1 npx tsx tools/bot-doubles.ts 12` (% de partidos; entre paréntesis, % de puntos):

| Humano | Paquito+Fede | Fede+Alejandro | Alejandro+Agustín | Agustín+Arturo |
|---|---|---|---|---|
| novato, antes | 100 | 92 | 58 | 0 |
| novato, ahora | **100 (82)** | 83 (59) | 0 (41) | 0 (35) |
| medio, antes | 92 | 92 | 58 | 17 |
| medio, ahora | 100 (77) | 92 (62) | **58 (52)** | 0 (40) |
| bueno, antes | 100 | 92 | 75 | 33 |
| bueno, ahora | 100 (86) | 100 (65) | 50 (52) | **25 (43)** |

Golpes por punto: de 10,3 a 12,0 según la casilla. Cómo acaban los puntos: 41 % ganadores (antes 31), 41,5 % a la red y 13,8 % a la pared (antes 35). Fuzz (`tools/review/fuzz.ts 48`): 668 puntos, **0 fallos** y 0 atascados. Antes eran 716 puntos sin fallos.

## API nueva (aditiva)

- **`types.ts`:**
  - `PointReason` suma `'body'`;
  - el evento `point` lleva `touched?` (quién fue tocado);
  - `Plan.spare?`.
- **`input.ts`:**
  - `Release.quiet?`;
  - `strokeDeg(r)`;
  - `FLICK.peak`, `.lift`, `.wideCone`;
  - `TAP.hold`.
- **`human.ts`:**
  - `HumanController.overheadFor(m, p, plan, g)`: qué golpe por encima de la cabeza saldría con un gesto. `g` es una liberación o `input.gestureNow()`; devuelve `bandeja`, `vibora`, `smash`, o `smash` con `special: 'por3' | 'por4'`;
  - `card`.
- **`brain.ts`:**
  - `CARD`, `LOB`, `CUE`, `cuedBlock(m, pid)`;
  - `ATTACK.viboraDeg`;
  - `PADEL.netDink`;
  - `underAttack(m, p, plan?)`.
- **`match.ts`:**
  - `MISHIT`, `BODY`, `OVERHEAD.keep`;
  - `Match.goldenSide`;
  - `Controller.card?`.
- **`ball.ts`:** `SLICE`.

## Pendiente

- **Atributos:** pot, vel y par quedan en +4 a +6 puntos con +20 (el objetivo era +5 a +12). ref queda en +17, por encima del resto. El siguiente mando son el `CARD.setup` de vel, el `CARD.par` y la pendiente de la reacción.
- **La red:** la pareja de la red gana el 63 % (CPU) y el 71 % (bot), con el objetivo en el 65–75 %. Ahora pierde sobre todo con sus voleas a la red (era el cristal). Un paso a medio camino de esta sesión llegó al 72–74 %, pero era un efecto del paso lateral mal hecho: los defensores se apartaban de su bola.
- **El globo:** sube y cuelga, pero casi todos los que llegan se juegan de aire (bandeja con `OVERHEAD.keep`). Solo un 3 % obliga a bajar, y el objetivo era 50–60 %. Habría que bajar `OVERHEAD.keep` (1,3) o mirar `lobDeep`.
- **N/N:** 15 % de los golpes (objetivo ≤ 10 %).
- **Escalera:** el bueno gana el 25 % de los partidos (43 % de los puntos) contra los campeones, frente a un objetivo del 35–50 %. Con 12 partidos por casilla el ruido es de ±14 puntos. Martín pierde muchos puntos a la red contra las parejas fuertes; su carta (`PARTNER_ATTRS`) es el mando.
- **Errores «out» (3–5 %):** son pifias de marco por encima de la malla lateral, que antes eran errores al cristal.
- **`gest.py`:** no lo he vuelto a pasar en la página (hace falta `node build.mjs`, y el otro agente compila `dist/`). La batería ampliada está en el script y la tabla de arriba sale de `tools/audit/gestos.ts`, con el Input y el HumanController reales.
- **Probar en un móvil:** la curva de potencia está calibrada con trazos de velocidad constante. Un latigazo real, con el perfil de campana, da en el pico un 20–40 % más que su media, así que quizá haya que subir `FLICK.full`.

## Segunda pasada (12 oct, tarde): globo, red contra red, escalera y gestos en la página

Las tres lagunas de la primera pasada. El «antes» es `6d2c567`. Sonda nueva: `tools/audit/globos.ts` (`MODE=bot` para el humano).

### Globo, golpe de transición

Se ha traído lo que resolvió el pickleball 0.11.

- **Altura sobre el rival, no sobre la red** (`clearOver` en `ball.ts`, `lobClear` y `LOB` en `brain.ts`). El globo pasa 1,5 m por detrás de cada rival que está en la red (`LOB.behind`, su posición leída 0,3 s adelante) y por encima de su alcance (`reachH`, la carta de rem).
  - **Margen de la CPU:** 0,25 m más hasta 0,5 según su prudencia y hasta 0,4 de azar.
  - **Globo defensivo:** 1 m.
  - **Humano:** 0,6 m (`HumanController.aim`, así que la vista previa del arco coincide).
  - **Límites:** de 3,0 a 5,6 m sobre la cinta.
- **Hacia atrás se corre más despacio al perseguir un globo** (`BACK.k` 0,72, `runLen`, `Match.backK`). Lo cuentan el planificador, el círculo, `takeCost`, `canMake` y los pies de la CPU y del humano.
- **Zona de la bandeja:** la bola por encima de la cabeza se juega de aire, para mantener la red, hasta 6,8 m de la red (`OVERHEAD.keepTo`). Más atrás, de espaldas y a la carrera, cuesta 0,5 por metro (`OVERHEAD.deep`). Así el globo bueno obliga a bajar y el corto o bajo se remata.
- **La CPU globea cuando la bola lo permite:** el peso del globo se multiplica por 1 − 1,6 × dificultad (`LOB.ease`) y por cuántos rivales hay en la red. El globo de volea al bajar ya no existe: perseguido por un globo y de aire, devuelve con una volea firme al fondo.
- **La pareja que globea** solo sube tras su globo si pasa a la pareja de la red. Si se lo van a jugar de aire delante (`Match.cover`), espera atrás. Tras una chiquita solo sube si es buena (q > 0,75).

| Globo sobre una pareja en la red (CPU, `globos.ts 20`) | Antes | Ahora |
|---|---|---|
| Globos (% de los golpes) | 20 % | **14 %** (bot: 12 %) |
| Bueno (q ≥ 0,85): obliga a bajar (bota o remate desde el fondo) | 32 % | **40 %** (bot: 42 %) |
| Bueno: jugado de aire cerca de la red | 68 % | 59 % |
| Flojo (q < 0,85): jugado de aire (rematado o con bandeja) | 76 % | 73 % |
| Pico del globo (bueno · flojo) | 6,1 · 5,8 m | 5,5 · 5,2 m |
| Dónde bota el bueno | 7,6 m | 8,0 m |

### Red contra red

`PADEL.netLob` 0,9 (por la facilidad de la bola) y voleas más duras a los pies y por el centro (`PADEL.netPace` 0,8), más la espera tras el globo de arriba. La volea baja castiga menos (`LOW_VOLLEY.per` 0,3).

| `partidos.ts cpu 40` | Antes | Ahora |
|---|---|---|
| N/N al golpear | 15,2 % | **8,7 %** |
| Golpes por punto · segundos | 10,7 · 11,9 | 12,4 · 14,1 |
| La pareja de la red gana | 63,0 % | 60,0 % (bot: 61,3 %) |
| Pared directa · red | 10,7 · 43,4 % | 16,6 · 46,3 % (fuertes: 11,7 · 55,4 %) |
| Bola al cuerpo (`body`) | 4,0 % | 1,0 % (bot: 5,5 %, casi todo voleas al cuerpo antes del bote) |
| Bola que atraviesa a un jugador | 0,05 por punto | 0,11 |

Con el bot (humano medio y Martín), N/N es del 14,8 %: el pulgar simulado juega su propio intercambio de red.

La bola que va al cristal y que el jugador espera para jugarla de pared ya no le cuenta como «cuerpo» (la deja pasar). Por eso el «atraviesa» sube algo, aunque sigue muy por debajo del 0,61 de la auditoría.

### Escalera

Solo cartas: Agustín ref 86 → 83; Arturo con 88 → 86 y ref 90 → 86.

`bot-doubles.ts 12`, % de partidos (puntos):

| | Paquito+Fede | Fede+Alejandro | Alejandro+Agustín | Agustín+Arturo |
|---|---|---|---|---|
| novato | 100 (73) | 83 (59) | 42 (44) | 0 (35) |
| medio | 100 (80) | 92 (61) | **50 (50)** | 25 (44) |
| bueno | 100 (79) | 92 (66) | 58 (51) | **33 (45)** |

Con 16 partidos por casilla, el bueno gana a los campeones el 38 %. Atributos +20 (`atributos.ts 40`, igual = 49,9 %): pot 53,1 · con 63,5 · vel 53,7 · ref 63,2 · rem 57,3 · par 54,7 · tq 56,9.

### Gestos en la página real

`node build.mjs` y `tools/audit/ux/gest.py 390 844 0.012`. Chrome no manda `pointermove` mientras el dedo está quieto. Por eso el inicio del trazo era la primera muestra del latigazo: en la página daba `ay` de −8 a −15 px en los latigazos desde parado, y el de 20 px en 25 ms salía como toque. Arreglo: si antes del trazo hay un hueco de más de `FLICK.gap` (30 ms), el trazo empieza donde estaba el dedo antes del hueco. Ahora la página y la sonda de Node dan lo mismo:

| Gesto (página real) | Lectura |
|---|---|
| Latigazo de 40 / 50 / 60 px en otros tantos ms | ataque 0,71–0,72, `ax = ay = 0` (al cuerpo) |
| 70 px en 50 ms / 80 px en 50 ms / 90 px en 50 ms | 0,88 / **0,96 (por 3)** / 1 |
| 30 px en 40 ms · 20 px en 25 ms | ataque 0,61 · 0,63 |
| Torcido 15 / 25 / 30 / 40 / 50 / 60 / 70° | ataque (remate hasta 30°, víbora desde 34°) |
| Apunto, paro y latigazo · apunto sin pausa y latigazo | ataque apuntado en (40, −45) · igual (0,72 / 0,80) |
| Latigazo abajo / abajo en diagonal | `down` 0,71 / 0,72 |
| Toque · temblor de 10 · 16 px | toque |
| Temblor de 22 px | soltar 0,51 |
| Toque quieto de 0,35 · 0,6 s | `quiet` (bloqueo si el aviso era BLOQUEO) |
| Colocado / normal / apuntar rápido / corregir | 0,30 / 0,48 / 0,57 / 0,53 |

Fuzz (`fuzz.ts 48`): 676 puntos, 0 fallos y 0 atascados.

### Bloqueo de reflejo ante la bola al cuerpo (`Match.reflexBlock`, `BODY.block`, `BODY.blockQ`)

- **Cuándo:** la bola que va a tocar a un jugador (humano o CPU) 0,14 s o más después del golpe del otro lado ya no es punto.
- **Qué hace el jugador:** la pala se mete en medio y sale un bloqueo de reflejo, con la calidad que da el tiempo: 0,45 a 0,14 s y +1 por segundo, como mucho 0,70. Lleva `timing` `'auto'` e `intent` `'block'`.
- **Cuándo sigue siendo punto (`body`):** solo la bola imposible, sin tiempo, o el resto antes de botar.

| | Antes | Ahora |
|---|---|---|
| Puntos `body` (CPU / bot medio) | 1,0 / 5,5 % | **0 / 0 %** en 40 + 48 partidos |
| Bloqueos de reflejo | — | 0,4 % de los golpes (0,05 por punto); ninguno acaba el punto directamente |
| Golpes por punto (CPU / bot) | 12,4 / 13,0 | 12,5 / 13,5 |
| Escalera (bot-doubles 12) | bueno contra campeones 33 %, medio contra pareja 3 50 % | 33 % (46 % de los puntos), 42 % (48 %); novato contra las parejas 1 y 2: 100 / 92 % |

Fuzz 48: 674 puntos, 0 fallos y 0 atascados.

### Sigue pendiente

- **El globo bueno** obliga a bajar el 40–42 % de las veces, en el límite bajo del objetivo. Los mandos son `LOB.behind`, `LOB.over` y `OVERHEAD.keepTo`.
- **La pareja de la red** gana el 60–61 % (el objetivo era 65–75 %). Sigue perdiendo por sus voleas a la red.
- **Escalera:** el bueno contra los campeones queda en el 33–38 % según el número de partidos, en el borde del 35–50 %.
