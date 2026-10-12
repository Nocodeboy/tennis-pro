# Simulación de pádel 0.5 (12 oct): sets, físico y afinado medido

Notas del agente de juego y simulación, en una rama de experimento (`claude/eager-sagan-lq9ax0`). Lo pedido por Germán: «mejorar este juego y conseguir el mejor simulador de pádel calidad AAA». Lo que se ha hecho, en este orden: el formato de partido de verdad (sets al mejor de tres), el físico de los jugadores con la distancia recorrida, y una pasada de afinado sobre lo que las auditorías 04 dejaron pendiente, medida con sus propias sondas (`tools/audit/`, `tools/bot-doubles.ts`, `tools/review/`). El «antes» es `ba177e2` (0.4), medido con las mismas semillas sobre una copia del árbol.

## 1. Sets al mejor de tres (`Rules.sets`, `Match.sets`, evento `set`)

- **Reglas.** `Rules.sets` es 1 (un set, como hasta ahora y por defecto) o 3 (al mejor de tres: gana el partido quien gana dos). Cada set va a los juegos de siempre (2, 3, 4 o 6) con su tie-break a juegos iguales. Al acabar un set los juegos vuelven a 0-0 y el saque sigue rotando entre los cuatro por el orden del sorteo (`nextServer`), que es lo que hace la regla en la práctica.
- **Eventos.** `game` → `set` → (`over`). El evento `set` lleva los juegos del set, los sets de cada pareja y si acabó en tie-break; sale también en el último set, antes de `over`. `Match.setHist` guarda los juegos de cada set jugado (el último incluido) y `Match.setNo` dice cuál se juega.
- **Lo que no se modela:** el cambio de lado (no hay sol ni viento y la cámara se queda detrás de tu jugador) y el descanso largo entre sets (el físico se recupera igual que en un cambio de juego).
- **Interfaz** (`broadcast.ts`, `led.ts`, `main.ts`, `style.css`, `i18n.ts`):
  - el bug de TV lleva una columna de sets delante de los juegos, más pequeña y apagada, que gira al ganar un set;
  - «BOLA DE SET» como etiqueta bajo el bug y en la llamada del árbitro (la de partido sigue mandando);
  - el rótulo de set ganado, «SET · 1–0 · TÚ / DI NENO · 6–4», en el sitio del de juego;
  - el videomarcador muestra los sets en una columna propia y el LED «TÚ 1·3  40 – 15  0·2 RIVAL»;
  - la pausa dice el set en juego, los sets y los juegos de los sets jugados;
  - la pantalla final pone los juegos de cada set en pequeño y los sets en grande; el rótulo de victoria lleva los sets y, en la línea de arriba, los juegos de cada set («GANAN EL PARTIDO · 6–4 7–5»);
  - Ajustes → Partido → **Sets: un set / al mejor de tres**, con su nota; «Cómo se juega» lo menciona.
- **Comprobado** en la página real con Playwright (`tools/audit/ux/sets.py`, vertical y horizontal, español e inglés): el ajuste, el bug con sets, la bola de set, el rótulo de set, la pausa y el final de un partido al mejor de tres a 2 juegos. Sin errores de página (el único 404 es el `favicon.ico` que pide el navegador por su cuenta).

## 2. El físico (`FIT` en `match.ts`, `Player.fit`, `Player.dist`)

Cada jugador tiene unas piernas (`fit`, de 0 a 1):

- **Se gastan** con los metros corridos (0,0032 por metro al trote y hasta 2,6 veces más al esprint: cuadrático en la velocidad) y con los golpes fuertes (0,03 por unidad de potencia por encima de 0,4: un remate a tope, 0,018).
- **Vuelven** con la bola muerta (0,045 por segundo, × 0,8 con vel 50 de la ficha hasta × 1,2 con vel 95), y 0,1 más al acabar cada juego. Nunca por encima de un techo que baja 0,00005 por metro corrido en el partido (un partido largo se nota), ni por debajo de 0,35.
- **Cansado**, el jugador corre menos (velocidad punta × 1 − 0,28 × (1 − fit)), la CPU reacciona más tarde (hasta 0,14 s más; la del humano es la de su pulgar) y todos golpean algo peor (hasta 0,09 de calidad menos en cada contacto).
- **Órdenes de magnitud** (medidos en partidos CPU): cada jugador corre unos 25 m por punto; un punto cuesta 0,1 y la pausa devuelve 0,15, así que se llega fresco al siguiente salvo tras un peloteo largo (40 golpes, 60 m: 0,3, dos o tres puntos para recuperarse; el mínimo visto, 0,55). Un partido al mejor de tres a 6 juegos son 1,1 km por jugador y deja el techo en 0,95; tres sets largos, en 0,85.
- **Dónde se ve:** en la pausa («Físico · tú 88 % · Martín 85 %») y, al final, «Distancia recorrida · tú / Martín» en kilómetros. `FIT.k = 0` lo apaga (las sondas lo llevan puesto).
- **Lo que cambia en el código:** la velocidad punta y la reacción se leen ahora por `Match.vmax(p)` y `Match.reactOf(p)` en el planificador, los pies y el reparto de bolas en dobles; `Player.speed` y `Player.reaction` siguen siendo los de la carta.
- **Escalera con el físico puesto, sin más cambios** (`bot-doubles 12`, % de partidos): novato 100 · 92 · 58 · 8, medio 100 · 100 · 50 · 17, bueno 100 · 100 · 67 · 42; en la 0.4, 100 · 92 · 17 · 17, 100 · 100 · 42 · 8 y 100 · 92 · 50 · 33. Con 12 partidos por casilla el ruido es de ±14 puntos: en un set a 3 juegos el físico no mueve la escalera.

## 3. Afinado medido

Lo pendiente de `auditoria-04-simulacion.md` y `notas-04-simulacion.md`, con sus objetivos, y lo que se ha movido en cada caso.

### El globo obliga a bajar (`LOB.over` 0,25 → 0,4, `LOB.behind` 1,5 → 1,7)

El globo pasa 0,4 m por encima del alcance del rival y 1,7 m por detrás de él (antes 0,25 y 1,5). Se probaron seis variantes con `tools/audit/globos.ts` (`OVERHEAD.keepTo` 6,2 solo ya hacía bajar el 88 %: demasiado).

| `globos.ts 20` (CPU) | 0.4 | 0.5 |
|---|---|---|
| Globo bueno (q ≥ 0,85): obliga a bajar | 39 % | **54 %** |
| Globo flojo: obliga a bajar | 25 % | 30 % |
| La pareja que globea está arriba cuando le vuelve la bola (bueno) | 36 % | 42 % |
| Pico del globo bueno | 5,45 m | 5,85 m |

### Los siete atributos pesan parecido (`skillFrom`, `CARD`, `WHIFF.legs`)

- **ref** pesa menos: reacción de 0,31 a 0,235 s (antes 0,325 a 0,215) y lectura de 0,25 a 0,13 m (antes 0,27 a 0,11).
- **con** algo menos: calidad de 0,72 a 0,845 (antes 0,715 a 0,86) y dispersión de 0,14 a 0,09.
- **pot** más: potencia ±0,0045 por punto (antes 0,003), ritmo `CARD.pace` 0,0075 (antes 0,005), peso de la bola `CARD.weight.pot` 0,014 y tope `wMax` 0,22 (antes 0,01 y 0,15).
- **vel** más: velocidad de 3,9 a 5,2 m/s entre 55 y 85 (antes 4,0 a 5,0), tiempo para prepararse `CARD.setup` 0,75 (antes 0,55) y, nuevo, las piernas rápidas ponen el cuerpo detrás de la bola dura (`WHIFF.legs`: × 1 − 0,45 × (velocidad − 4,5)). Además el físico se recupera más deprisa con vel.
- **par** y **rem** más en su golpe: `CARD.par` 0,016 (antes 0,011), `CARD.rem` 0,012 (antes 0,01); **tq** `CARD.tqClear` 0,008 (antes 0,006).

`DELTA=20 npx tsx tools/audit/atributos.ts 40`: puntos de la pareja B (+20 en un atributo) menos la fila «igual» (0.4: igual 50,2; 0.5: igual 49,0; el ruido de la fila igual entre pasadas es de ±2 puntos).

| | pot | con | vel | ref | rem | par | tq |
|---|---|---|---|---|---|---|---|
| 0.4 | +2,7 | +13,0 | +3,7 | +14,5 | +7,4 | +4,5 | +7,0 |
| 0.5 | **+9,4** | +13,9 | +4,2 | +11,4 | **+9,1** | +5,4 | **+9,9** |

En las dos pasadas intermedias vel dio +6,0 y +6,7 y par +6,8 y +5,1: su efecto real está entre +4 y +7, por debajo del resto. En dobles la velocidad apenas decide puntos (dos jugadores cubren 10 m y los ganadores salen de la reacción), así que se le ha dado lo que es suyo sin inventarle más.

### A quién se juega (`pickOpp`, `PICK`)

Al subir la velocidad de Martín (vel 85 → 5,2 m/s) la CPU, que apunta al más lento, empezó a jugarle al humano dos de cada tres bolas (el bot pasó del 52 % al 67 % de las bolas de su pareja). Ahora apunta al de la ficha más floja, si hay 4 puntos de media o más entre los dos (tú 73 y Martín 75: al azar, como medía la 0.4); sin fichas, al más lento como antes. El bot vuelve al 51–56 %.

### El por 3 lo planifica la física (`por3Aim`, `POR.aimSpan`, `aimStep`, `aimVary`, `sideBias`)

- **Antes** la CPU remataba el por 3 hacia el centro con azar (`bx × 0,4 ± 1,2 m`). Apuntarlo a ciegas al lateral, que es por donde salen los por 3 de verdad, resultó peor (del 77 % al 35 % con la bola a 2,7 m y 2 m de la red): después del bote la bola llega al lateral por debajo de los 3 m.
- **Ahora**, antes de rematar, se calcula el vuelo con un contacto limpio (la misma cadena que `Match.launch`, sin azar) para cada destino de −3,6 a 3,6 m en pasos de 0,4 y se elige el que sale del recinto con más margen sobre la primera pared que toca tras el bote: el fondo (4 m) o un lateral (3 m alrededor de la red, 4 m junto al cristal de fondo), con 0,3 m de penalización al lateral, que es el camino más sensible al azar del contacto. Luego el azar de `Match.launch` decide. El latigazo sin apuntar del humano usa el mismo planificador; un latigazo apuntado se queda con su x.
- **Medido** (`tools/review/por.ts 120`, perfecto a potencia 1): 2,7 m a 2 m de la red, **91 %** (0.4: 88 %); 2,5 m a 2,5 m, 15 % (0.4: 19 %); 2,5 m a 3,5 m, 14 % (13 %). Nota: la 0.3 medía un 48 % a 2,5 m y 2,5 m; la física de la 0.4 (el cortado del bote, `SLICE`) ya lo había dejado en el 19 % antes de esta versión. Las salidas por el lateral son pocas (el por 3 es raro en la CPU, 6 en 746 puntos): el planificador las elige cuando la geometría las da, no las fuerza.

### La bandeja varía y la víbora no busca el cristal

- La bandeja ya no es «de máquina»: ritmo 0,98–1,22 (antes 1,1 fijo) y altura sobre la cinta con 0,15 m de azar. Velocidad de salida en partido: mediana 67, p90 77 km/h (antes 70 y 75).
- La víbora se apunta a 3,3–3,9 m del centro (antes 3,5–4,1, con la dispersión encontraba el cristal lateral antes del bote), pasa 0,28 m sobre la cinta y su ritmo varía. Víbora en partido (bot, `SHOTS=1`): 5 % de error y 12 % de puntos ganados (0.4: 6 % y 10 %).

### La pareja de la red (`PADEL.feetClear`, `rejaClear`, `netClear`, `chiquitaClear`, `LOW_VOLLEY.per`, `MISHIT`)

- Las voleas definitivas de la CPU pasaban a 8–12 cm de la cinta y, con el contacto imperfecto, muchas acababan en la red. Ahora pasan a 14–15 cm (como una volea de definición de verdad, que no roza la cinta), la volea baja castiga menos (`LOW_VOLLEY.per` 0,22, antes 0,3) y una volea mala desde la red se queda alta y corta más veces de las que muere en la red (`MISHIT.closeUp` 0,7, pifias 40/48/12 % red/alta/fuera). La chiquita de la defensa pasa a 18–43 cm de la cinta (antes 12–35: cada una era una volea a los cordones).
- Se probó también la volea definitiva más rápida (`putPace` 0,74, potencia de ataque 0,22): la pareja de la red bajó al 54,7 % por sus propios errores a la red. Revertido (0,8 y 0,18).

| `partidos.ts` | 0.4 | 0.5 |
|---|---|---|
| La pareja de la red gana (CPU contra CPU) | 60,0 % | 60,6 % |
| … de los que gana, ganadores propios | 29,5 % | 31,0 % |
| … de los que pierde, voleas suyas a la red | 27,4 % | 25,8 % |
| La pareja de la red gana (bot medio y Martín) | 59,9 % | 60,2 % (67,7 % y 61,9 % en dos pasadas intermedias) |
| N/N al golpear (CPU · bot) | 9,2 · 14,4 % | 9,6 · 17,8 % |

El objetivo (65–75 %) no se alcanza entre dos parejas CPU: las dos defienden demasiado bien con la chiquita y el globo, y cada mando que hace rematar más a la de arriba le cuesta más errores. Con el bot humano la medida oscila entre el 60 y el 68 % según la pasada (12 partidos: ±5 puntos). Queda pendiente.

### Resto de medidas

| `partidos.ts cpu 40` | 0.4 | 0.5 |
|---|---|---|
| Golpes por punto (media · mediana) | 12,5 · 11 | 12,3 · 11 |
| Segundos por punto | 14,0 | 14,3 |
| Cómo acaban: ganadores · red · pared · fuera | 33 · 47,6 · 16,2 · 3,0 % | 34 · 43,6 · 18,4 · 3,9 % |
| Pico del globo (mediana) | 5,27 m | 5,53 m |
| Bola viva que atraviesa a un jugador | 0,11 por punto | 0,13 |
| Pared directa · red (parejas fuertes, `errores.ts`) | 11,9 · 55,9 % | 14,1 · 50,8 % |
| Coste de `m.update(1/60)` (media · p99) | 0,018 · 0,34 ms | 0,020 · 0,33 ms |

**Escalera** (`SHOTS=1 npx tsx tools/bot-doubles.ts 12`, % de partidos; entre paréntesis, % de puntos):

| Humano | Paquito+Fede | Fede+Alejandro | Alejandro+Agustín | Agustín+Arturo |
|---|---|---|---|---|
| novato, 0.4 | 100 (74) | 92 (59) | 17 (43) | 17 (38) |
| novato, 0.5 | 100 (82) | 92 (60) | 8 (43) | 17 (38) |
| medio, 0.4 | 100 (80) | 100 (62) | 42 (48) | 8 (40) |
| medio, 0.5 | 100 (81) | 100 (62) | 0 (43) | 8 (39) |
| bueno, 0.4 | 100 (77) | 92 (66) | 50 (50) | 33 (46) |
| bueno, 0.5 | 100 (80) | 92 (67) | 50 (51) | **58 (50)** |

Con 12 partidos por casilla el % de partidos tiene ±14 puntos de ruido; el % de puntos (±3) es la medida: el bueno sube del 46 al 50 % contra los campeones, el medio baja del 48 al 43 % contra la tercera pareja y el resto no se mueve. El físico y la ficha de Martín (`PARTNER_ATTRS`) siguen siendo los mandos si se quiere escalonar más.

**Fuzz** (`tools/review/fuzz.ts 48`): 48 partidos y 675 puntos con pulgares al azar (66 ataques, 71 bloqueos, 4 por 3, 5 por 4 y 156 bajadas), 0 fallos y 0 atascados.

## 4. API (aditiva, salvo donde se dice)

- **`types.ts`:** `Player.fit` y `Player.dist`; `Rules.sets?` (1 | 3); evento `set`.
- **`match.ts`:** `FIT`; `Match.sets`, `setHist`, `setsToWin()`, `setNo`, `vmax(p)`, `reactOf(p)`, `fitCap(p)`; `MISHIT.closeUp` y `shankClose` cambian de valor. `LAUNCH` vive ahora en `brain.ts` (match.ts lo reexporta: nada que cambiar en las herramientas).
- **`brain.ts`:** `por3Aim(p, plan, power, d)`, `POR.aimSpan/aimStep/aimVary/sideBias`; `PICK`; `PADEL.feetClear/rejaClear/netClear/putPace/chiquitaClear`; `WHIFF.legs`; `LOB.over/behind`, `CARD`, `LOW_VOLLEY.per`, las pendientes de `skillFrom` cambian de valor. `specialShot(…, aim = null)` planifica el por 3 (antes era el centro con azar).
- **`human.ts`:** el por 3 sin apuntar pasa `null` a `specialShot`.
- **`main.ts`:** `Save.sets`; `setPoint(m)`; `rules()` lleva `sets`. **`broadcast.ts`:** `onEvent(…, { setPoint })`, `setStrap`. **`led.ts`, `venue.ts`, `view.ts`:** `drawScreen`/`drawBoard(…, intro, sets)`.
- **Herramientas:** `tools/audit/ux/sets.py` (capturas de los sets); `tools/stage-lib.ts` y `tools/poses-loco.ts` llevan `fit` y `dist` en sus jugadores.

## 5. Pendiente

- **La pareja de la red** entre dos parejas CPU se queda en el 60 % (objetivo 65–75 %). El siguiente mando que no se ha probado es la calidad de la chiquita y el globo de la defensa bajo presión (`PRESSURE`), no las voleas de arriba.
- **vel** pesa +4 a +7 con +20 (el resto, +9 a +14).
- **El por 3 a 2,5 m de altura** sale el 15 % de las veces con un latigazo perfecto: la física de la 0.4 lo dejó ahí. Si se quiere el 48 % de la 0.3, el mando es `POR.base` (la dispersión en profundidad de un contacto limpio, 0,6 m).
- **El punto de oro:** la pareja del humano sigue restando con el de la derecha; la interfaz no ofrece elegir.
- **Cambio de lado y descanso entre sets:** no se modelan. `tools/tv.py` no sabe de sets.
- **Probar en el móvil** el físico: si tras un peloteo de 40 golpes la bajada de velocidad (hasta un 13 %) se nota demasiado, `FIT.speed` y `FIT.run` son los mandos; y la columna de sets en el bug con nombres largos.
