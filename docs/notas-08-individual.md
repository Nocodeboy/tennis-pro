# Individual 0.8: la CPU juega individual (agente B)

Rama del agente B. Toca cómo juega la CPU en **individual**: qué golpe elige, dónde se coloca y cuándo sube o se queda atrás, más los valores propios de cada rival en individual. Los dobles no cambian: dan exactamente los mismos números que la 0.7.

«Antes» es el código de la 0.7 (commit `ff86eae`), medido con las mismas semillas y herramientas.

## Qué cambia para el jugador

- **La CPU juega individual de verdad, no dobles con un solo jugador.**
  - Resta profundo y sube a la red detrás del resto.
  - Saca y se queda atrás: tras sacar, sigue atrás en su siguiente golpe el 33–100 % de las veces (antes, el 10–71 %). Los valores bajos son contra el novato, cuyas bolas cortas la obligan a subir.
  - Desde el fondo, contra quien está en la red, tira **passing** (paralelo o cruzado), **globos de ataque** con subida a la red detrás, bolas al cuerpo o, a veces, una dejada para subir.
  - Con los dos atrás: drives profundos. Una bola corta es un **golpe de aproximación** profundo, y sube a la red detrás.
  - En la red contra quien está atrás: **voleas** profundas o cortas y anguladas. Una bola que se levanta la remata.
  - Con los dos en la red, la dejada es un recurso más. Al rival que se abre le mete la bola rodada al hueco. Cuanto más dura el intercambio, más probable es que ataque.
- **La CPU no se queda en tierra de nadie.** Tras un passing, un globo o un drive desde el fondo vuelve al fondo. Solo sube detrás de un resto, una aproximación, una dejada o un globo de ataque.
- **Espera en la bisectriz de los ángulos del resto**, no siguiendo la bola. Los rivales flojos se pegan más al lado de la bola y dejan el cruzado abierto; Reina se coloca casi en la bisectriz.
- **Cada rival tiene un estilo de individual:**
  - **Paco:** jugador de fondo; casi siempre al centro; errores.
  - **Lola:** paciente; juega desde media pista con dejadas; sube poco y es algo más lenta que en dobles.
  - **Bruno:** pega fuerte desde el fondo (passing y drives) y solo sube detrás de una bola corta.
  - **Nuria:** sube detrás de todo y volea.
  - **Reina:** lo hace todo y busca el hueco; es la más rápida y la que mejor cubre.
- **Puntos más cortos:** mediana de 9 golpes (antes 11), p90 de 20 (antes 25) y peloteo más largo de 50 (antes 65). Partidos de 2,2 a 5,4 minutos de media.
- **Menos dejadas:**
  - De la CPU: 7–36 % de sus golpes (antes 9–61 %).
  - En total: 10–43 % de los golpes (antes 9–59 %).
  - Lo que queda alto son las dejadas del propio humano simulado: el nivel bueno tiene 0,7 de toque (`tools/humans.ts`).
- **El passing del humano depende del rival.** A Lola se la pasa con facilidad, a Nuria a veces y a Reina casi nunca. Antes, un cruzado perfecto ganaba a todos, también a Reina (ver «El passing del humano»).

## Cómo se ha hecho

- **`SINGLES` en `src/sim/brain.ts`** es el plan de juego de individual, con todos sus pesos documentados:
  - `singlesShot` elige el golpe y para qué sirve: resto, passing, globo de ataque, dejada, peloteo, aproximación, volea, dejada en la red, remate o bloqueo.
  - `passingShot` coloca el passing para que pase a `gap` metros del que volea, a la altura a la que está él: profundo, o corto y angulado si el profundo tendría que botar fuera.
  - `placeSingles` y `coverX` deciden si sube o se queda y dónde espera.
  - `SINGLES.on = 0` vuelve al cerebro, la presión y el golpe de marco de la 0.7, para comparar. Los rivales conservan sus valores de individual (`SOLO`).
- **`Controller.place` en `src/sim/match.ts`:** el controlador de la CPU decide su sitio tras su propio golpe. `afterHit` lo usa en individual; si no hay `place` (el humano) o en dobles, todo sigue igual. Una CPU colocada así espera en su sitio y no se arrastra hacia la bola.
- **Habilidades de individual y de dobles separadas:**
  - `DOUBLES_SKILLS` guarda los valores de la 0.7, y las parejas (`PAIRS`) los usan tal cual.
  - `RIVALS` es individual: los mismos valores más `SOLO`, los ajustes de individual.
  - Campos nuevos de `Skill`, solo de individual: `angle` (sentido de pista: con qué frecuencia busca el hueco en vez del centro o el cuerpo) y `rush` (con qué ganas sube a la red).

  | Rival | Individual (`SOLO`) |
  |---|---|
  | Paco | sentido de pista 0,3 |
  | Lola | 0,45 · sube 0,45 (en dobles 0,6) · 3,85 m/s (4,1) · reacción 0,31 s (0,27) · calidad 0,73 (0,77) |
  | Bruno | 0,5 · sube 0,3 (0,6) · calidad 0,77 (0,78) |
  | Nuria | 0,7 · calidad 0,80 (0,83) |
  | Reina | 0,85 · calidad 0,92 (0,87) · reacción 0,16 s (0,18) · 4,8 m/s (4,7) |

- **Defender en carrera cuesta (CPU, individual).** Una bola rápida (más de 12 m/s al salir) que la CPU volea tras correr más de medio metro, o que le cae por debajo de la cinta, es un bloqueo, no una volea:
  - hasta 0,6 de dificultad por la carrera (`onRunVolley`);
  - hasta 0,5 si cae por debajo de la cinta (`lowVolley`).

  Es lo que hace que un buen passing del humano fuerce errores.
- **Dos cambios compartidos con el humano (solo en individual):**
  - **Presión del peloteo:** 0,065 por golpe desde el 4.º (antes 0,04 desde el 6.º; en dobles, 0,055 desde el 6.º).
  - **Golpe de marco:** ×2 (`SINGLES.shank`), como ya tenían los dobles desde la 0.7.

  Afectan a los golpes de los dos jugadores, también al humano (`pressure()` y `shankOf()` en `brain.ts`).

## Números

### Escalera individual

`npx tsx tools/bot.ts 24 1`: % de partidos ganados y, entre paréntesis, de puntos. Antes → después, con el objetivo entre corchetes.

| Humano | Paco | Lola | Bruno | Nuria | Reina |
|---|---|---|---|---|---|
| Novato | 100 (72) → 100 (69) [100] | 71 (53) → 75 (58) [75] | 21 (43) → 38 (46) [33] | 0 (26) → 4 (34) [0] | 0 (16) → 0 (18) [0] |
| Medio | 100 (90) → 100 (92) [100] | 100 (76) → 100 (79) [100] | 100 (67) → 100 (72) [100] | 58 (50) → 54 (50) [58] | 4 (38) → 4 (34) [0] |
| Bueno | 100 (99) → 100 (97) [100] | 100 (87) → 100 (87) [100] | 100 (87) → 100 (89) [100] | 100 (66) → 100 (70) [100] | 67 (55) → 58 (51) [58] |

- Todas las casillas quedan a un partido o menos del objetivo (1 de 24 ≈ 4 %). Novato contra Bruno: 9 partidos ganados frente a 8.
- **Golpes por punto (media de `bot.ts`):**
  - novato: 7,7 / 12,7 / 12,3 / 15,5 / 14,3 → 7,9 / 9,9 / 10,8 / 11,9 / 10,3;
  - medio: 6,9 / 12,6 / 12,3 / 16,4 / 16,5 → 6,8 / 9,6 / 11,4 / 12,0 / 12,4;
  - bueno: 6,4 / 12,3 / 11,3 / 17,0 / 16,3 → 7,0 / 9,5 / 10,9 / 12,4 / 13,6.
- **Minutos por partido (media):**
  - novato: 3,1 / 5,5 / 4,8 / 4,6 / 3,9 → 3,3 / 4,0 / 4,6 / 4,2 / 3,1;
  - medio: 2,3 / 4,0 / 4,2 / 6,5 / 5,9 → 2,3 / 3,2 / 3,8 / 4,9 / 4,3;
  - bueno: 2,0 / 3,5 / 3,1 / 5,7 / 6,2 → 2,2 / 2,9 / 3,0 / 4,1 / 5,4.
- Ningún partido atascado (rally y clásica).
- **«No llegas» del novato** (% de los puntos): 17 / 13 / 19 / 13 / 14 → 18 / 19 / 31 / 24 / 34.
  - En individual, la bola al hueco es el arma, y el novato reacciona en 0,42 s.
  - El medio contra Reina pasa de 6 a 23.
  - Ver «Pendiente».
- **Ayuda 0** (12 partidos; % de puntos, entre paréntesis la 0.7):
  - novato: 72 / 48 / 37 / 33 / 11 (67 / 53 / 39 / 26 / 18);
  - medio: 90 / 75 / 62 / 55 / 30 (91 / 76 / 67 / 43 / 32);
  - bueno: 99 / 90 / 89 / 65 / 50 (98 / 86 / 85 / 71 / 50).
  - Partidos: novato 100 / 42 / 0 / 0 / 0, medio 100 / 100 / 92 / 67 / 0, bueno 100 / 100 / 100 / 83 / 50.
- **Ayuda 2** (12 partidos; % de puntos):
  - novato: 81 / 69 / 64 / 45 / 25 (0.7: 84 / 61 / 48 / 29 / 20);
  - medio: 98 / 84 / 81 / 63 / 40;
  - bueno: 97 / 86 / 90 / 71 / 54.
  - Partidos: novato 100 / 100 / 100 / 17 / 0.
  - La ayuda alta vale ahora bastante más que antes para el novato, porque le lleva a las bolas abiertas. Es un modo fácil de verdad.
- **Clásica** (`bot.ts 6 1 sideout`): sin atascos. Los partidos son más largos, como siempre en clásica (bueno contra Reina: 11,4 min).

### Largo de los puntos y duración

`npx tsx tools/review/singles.ts 24 1`: mediana / p90 / máximo de golpes por punto. El saque cuenta como golpe.

| Humano | Paco | Lola | Bruno | Nuria | Reina |
|---|---|---|---|---|---|
| Novato | 6/16/31 → 6/15/37 | 10/25/53 → 8/19/39 | 11/24/53 → 9/20/47 | 15/28/55 → 10/24/47 | 14/25/45 → 9/20/38 |
| Medio | 6/12/29 → 6/12/21 | 11/23/41 → 8/18/32 | 11/23/40 → 11/20/44 | 15/30/49 → 11/22/42 | 16/29/65 → 11/22/50 |
| Bueno | 5/11/17 → 7/11/27 | 11/23/31 → 9/16/25 | 10/21/41 → 10/19/37 | 15/31/49 → 11/22/41 | 16/27/49 → 12/23/43 |

- **En conjunto:** mediana 11 → 9, p90 25 → 20 y peloteo más largo 65 → 50.
- **Partidos:** de 1,7–10,2 a 1,8–7,3 minutos (p10 2,2 → 2,3; p90 6,4 → 5,2).
- **Objetivo orientativo** (mediana 7–10, p90 ≲ 18):
  - la mediana se cumple en conjunto (9) y casi en todas las casillas (6–12);
  - el p90 se queda en 20 en conjunto, y en 22–24 contra Nuria y Reina.
- **Lo que alarga:**
  - En los puntos de 18 golpes o más, el 50–70 % de los golpes se juegan con los dos en la red (contra Nuria y Reina, y en las casillas del medio y el bueno). Con el novato contra Paco y Bruno manda otra cosa: el humano en la red y la CPU atrás (55–60 %).
  - El humano en la red bloquea casi todos los ataques. Devuelve los remates y aceleraciones de la CPU el 63–89 % de las veces, a menudo con dejadas de la calidad mínima que siguen en juego.
  - Ver «Para el lado humano».

### Reparto de golpes

% de todos los golpes de los dos, sin contar el saque.
- **Passing:** drive o resto desde la mitad de atrás contra un jugador en la red.
- **Ataque:** aceleración o remate de volea.
- **Auto:** la bola alta y profunda del golpe automático del humano.

| | Resto | Drive | Passing | Dejada | Globo | Ataque | Remate | Auto | Voleas |
|---|---|---|---|---|---|---|---|---|---|
| Medio contra Nuria, antes | 6 | 22 | 2 | 51 | 2 | 8 | 7 | 2 | 44 |
| Medio contra Nuria, ahora | 9 | 19 | 10 | 35 | 4 | 12 | 6 | 5 | 48 |
| Medio contra Reina, antes | 6 | 16 | 1 | 57 | 2 | 9 | 6 | 1 | 40 |
| Medio contra Reina, ahora | 9 | 20 | 10 | 36 | 2 | 12 | 6 | 5 | 48 |
| Novato contra Lola, antes | 8 | 25 | 4 | 43 | 1 | 5 | 6 | 9 | 46 |
| Novato contra Lola, ahora | 11 | 23 | 10 | 27 | 2 | 8 | 5 | 13 | 46 |

**Dejadas** (% de los golpes; Paco / Lola / Bruno / Nuria / Reina):

| | Todos los golpes | Solo la CPU | Solo el humano |
|---|---|---|---|
| Novato | 9/43/33/49/55 → 10/27/17/31/31 | 9/46/22/42/52 → 7/23/12/21/24 | 9/40/45/55/58 → 13/32/22/41/37 |
| Medio | 14/45/35/51/57 → 15/35/25/35/36 | 10/49/26/49/58 → 9/31/19/28/29 | 18/41/44/52/56 → 21/39/30/42/42 |
| Bueno | 20/51/38/54/59 → 27/41/33/43/42 | 10/52/26/52/61 → 15/36/24/34/35 | 30/50/50/56/57 → 40/47/41/52/50 |

- **La CPU queda dentro del objetivo** (≲ 25–30 %) salvo contra el bueno (34–36 % con Lola, Nuria y Reina), que le juega dejada a dejada.
- **El humano simulado sigue dejando mucho:**
  - El pulgar del bueno elige dejada el 70 % de las veces con los dos en la red, y el automático también deja.
  - Esto lo decide `tools/thumb.ts` (agente A), no la CPU.

**Dónde golpea la CPU** (medio; Paco / Lola / Bruno / Nuria / Reina):

| | Antes | Ahora |
|---|---|---|
| Desde la red | 20 / 60 / 60 / 74 / 78 % | 21 / 47 / 36 / 57 / 56 % |
| Desde el fondo | 54 / 21 / 22 / 14 / 14 % | 61 / 37 / 41 / 27 / 26 % |
| Sube tras restar | 35 / 72 / 72 / 90 / 92 % | 32 / 59 / 52 / 86 / 93 % |
| Sigue atrás tras sacar | 71 / 40 / 40 / 20 / 15 % | 100 / 77 / 80 / 59 / 47 % |

### Cómo acaban los puntos

% de los puntos, medio; los demás niveles van en la misma línea.
- **Ganador:** el otro no llega o ni la toca, clasificado por el golpe que gana.
- **Error forzado:** fallo ante un ataque, un passing, un globo o una bola de más de 13 m/s, o un golpe de marco.

| Medio contra | Antes | Ahora |
|---|---|---|
| Paco | volea 49 · drive 18 · remate 11 · forzado 11 · no forzado 3 | volea 25 · remate 23 · forzado 22 · drive 11 · no forzado 6 · dejada 4 · passing 3 |
| Lola | volea 44 · remate 18 · drive 13 · forzado 12 · no forzado 8 · passing 2 | volea 26 · remate 22 · forzado 18 · no forzado 10 · drive 10 · dejada 5 · passing 4 |
| Bruno | volea 45 · remate 26 · forzado 13 · drive 6 · no forzado 5 | volea 42 · forzado 21 · remate 15 · no forzado 11 · drive 7 · passing 2 |
| Nuria | volea 36 · remate 29 · forzado 21 · no forzado 7 · drive 3 | forzado 32 · volea 31 · remate 17 · no forzado 8 · drive 5 · passing 3 |
| Reina | volea 38 · remate 28 · forzado 22 · no forzado 5 · drive 3 | volea 43 · forzado 26 · remate 16 · drive 6 · no forzado 3 · passing 3 |

- **Las formas de acabar se reparten más:** suben los errores forzados (el 15–32 % de los puntos, antes el 8–22 %) y aparecen passing ganadores (hasta un 7 %, antes hasta un 3 %) y dejadas ganadoras (hasta un 5 %).
- **La volea ganadora sigue siendo lo más común.** Es lo esperable en individual, donde gana quien llega antes a la red.
- **Passing de la CPU** (`singles.ts`): gana el 1–27 % (Reina contra el novato, 27 %), falla el 1–14 % y vuelve el 70–96 %.
- **Globos de la CPU:** casi nunca ganan directo (0 %). Sirven para echar atrás al que está en la red y subir.

### El passing del humano

`npx tsx tools/review/passing.ts <rival> 80 1`: el humano saca y se queda atrás. Cuando el rival está en la red y él atrás, tira el golpe de la variante con suelta perfecta. Cada casilla: % de puntos que gana en sus 3 golpes siguientes y, entre paréntesis, % de bolas que toca el rival. Antes → ahora.

| Golpe | Lola | Nuria | Reina |
|---|---|---|---|
| Paralelo a 2,2 m del centro | 28 (89) → 21 (86) | 4 (99) → 14 (90) | 6 (98) → 9 (98) |
| Paralelo a 2,7 m | 14 (94) → 41 (69) | 15 (90) → 8 (93) | 9 (94) → 24 (81) |
| Cruzado a 2,2 m | 85 (15) → 56 (45) | 5 (95) → 9 (95) | 6 (94) → 16 (93) |
| Cruzado a 2,7 m | 96 (3) → 76 (26) | 55 (46) → 24 (85) | 53 (49) → 9 (99) |
| Cruzado corto (bota a 3,6 m de la red) | 94 (5) → 90 (13) | 84 (15) → 40 (71) | 91 (8) → 10 (98) |
| Al hueco, a 2,7 m | 59 (45) → 64 (35) | 41 (60) → 10 (91) | 28 (74) → 15 (93) |
| Al cuerpo | 6 (95) → 19 (98) | 4 (99) → 8 (99) | 4 (98) → 4 (99) |
| Globo profundo | 3 (96) → 4 (99) | 0 (99) → 1 (95) | 1 (99) → 0 (98) |

- **Antes, el cruzado era un agujero:** todos los rivales se pegaban al lado de la bola, y un cruzado perfecto ganaba casi siempre, también a Reina.
- **Ahora depende del rival:**
  - a Lola se la pasa por los dos lados;
  - a Nuria, solo con el cruzado abierto o corto;
  - a Reina, casi nunca desde el fondo. Hay que pasarla cuando sube, o tras moverla.
- **Desde el fondo, contra un rival ya colocado en la red, el passing no suele ganar directo.** Es física:
  - Un drive de 20 m/s tarda unos 0,5–0,6 s en llegar al que volea.
  - En ese tiempo, la CPU (0,2 s de reacción y 4,6 m/s) cubre unos 2,5 m con la estirada.
  - Lo que sí hace un buen passing es forzar una volea defensiva que deja la siguiente bola: calidad 0,40–0,47 en el cruzado corto, frente a 0,59–0,67 de la volea de una bola al cuerpo (Nuria y Reina).
- **Con un pulgar medio** (±85 ms, ±14 px, contra Nuria), los passing a 2,7 m del centro se van fuera o a la red el 14–20 % de las veces; a 2,2 m, el 1 %. El riesgo del passing lo pone la puntería del humano.

### Dobles: sin cambios

`npx tsx tools/bot-doubles.ts 24 1` da **exactamente la misma salida** antes y después (diff vacío): las parejas usan `DOUBLES_SKILLS`, y todo lo nuevo pasa solo con `!m.doubles`.

### Sin fallos

- `npx tsx tools/review/fuzz.ts 40`: 40 partidos y 519 puntos, sin errores ni atascos.
- `node build.mjs` compila.

### Cuando el golpe automático deje de rematar solo (agente A)

`AUTOPUT=0 npx tsx tools/review/singles.ts 24 1` (`AUTO_SHOT.putAway = false`): % de partidos y, entre paréntesis, de puntos.

- **Novato:** 100 / 46 / 21 / 4 / 0 (69 / 49 / 44 / 31 / 14), frente a 100 / 75 / 38 / 4 / 0 (69 / 58 / 46 / 34 / 18).
- **Medio:** 100 / 100 / 100 / 50 / 4 (92 / 76 / 70 / 48 / 36), dentro de ±3 puntos.
- **Bueno:** 100 / 100 / 100 / 100 / 63 (97 / 87 / 89 / 70 / 53), dentro de ±2 puntos.

El novato es el que más depende del automático: el 59 % de sus golpes no los apunta. Contra Lola pierde 9 puntos. Si tras fusionar el control nuevo el novato queda corto contra Lola, la palanca es `SOLO.lola` (calidad 0,73 → 0,70, o reacción 0,31 → 0,33).

## Para el lado humano (agente A, solo descrito)

- **El drive del humano no cae a los pies del que volea.**
  - `kindForAim` da siempre 0,2 m sobre la cinta, así que un drive desde el fondo llega al que volea a la altura de la cintura.
  - Si un drive apuntado desde el fondo contra un rival en la red saliera más bajo (unos 0,1 m sobre la cinta) y con más liftado, caería a sus pies.
  - La CPU ya paga la volea baja y rápida (`SINGLES.lowVolley`). El passing que cae le cuesta: en el cruzado corto, los errores forzados pasan del 10 al 18 % (medido con Nuria antes de fijar la colocación final).
- **El humano en la red es un muro.**
  - Devuelve el 63–89 % de los remates y aceleraciones de la CPU, a menudo con bloqueos de calidad mínima que siguen en juego. Es lo que más alarga los puntos que quedan.
  - El golpe de marco ×2 de individual ya acorta algo. Lo demás es el reflejo y la ayuda del humano (`REFLEX`, `ASSIST`), compartidos con dobles, así que no se han tocado.
- **El pulgar simulado del bueno deja mucho** (70 % de dejadas con los dos en la red). Si A rehace `tools/thumb.ts`, un humano que con los dos en la red pruebe ángulos y passing acortaría los puntos y bajaría las dejadas totales.
- **El humano sube a la red tras casi cualquier golpe** (`netRush` del pulgar). En individual la CPU le castiga con passing y globos si sube detrás de una bola floja. Es buena enseñanza, pero el bot no lo aprende.

## Herramientas

- **`tools/review/singles.ts [partidos] [ayuda]`:** cómo se juega el individual. Por casilla:
  - escalera, mediana / p90 / máximo de golpes, minutos;
  - reparto de golpes del humano y de la CPU, y voleas;
  - desde dónde golpea la CPU y si sube o se queda;
  - cómo acaban los puntos y qué sale de cada passing, globo y ataque;
  - en qué posiciones se juegan los puntos de 18 golpes o más.

  Variables de entorno:
  - `MATRIX=1`: una línea por nivel.
  - `VARIANTS=archivo.json`: varias variantes de `SINGLES` y de habilidades en un solo proceso.
  - `TRACE=n TLEN=… TCAT=passing`: puntos golpe a golpe.
  - `AUTOPUT=0`, `TUNE`, `SINGLES`, `LEVELS`, `RIVALS`.
- **`tools/review/passing.ts [rival] [golpes] [ayuda]`:** la sonda del passing del humano.
  - `ONLY=…` limita las variantes.
  - `SIGMA` y `AIMPX` ponen un pulgar con error.
  - `PTRACE=n` saca la geometría de cada passing.
- **`tools/bot.ts`** acepta `SINGLES='{…}'`.
- **`TUNE` en `tools/bot-doubles.ts` y `tools/review/drallies.ts`** ahora cambia `DOUBLES_SKILLS`, las habilidades de los rivales en pareja.

## Riesgos al fusionar

- **`src/sim/brain.ts`:**
  - Lo nuevo va en un bloque propio: `SINGLES`, `singlesShot`, `passingShot`, `placeSingles` y `coverX`, entre `gapX` y `chooseShot`.
  - Además cambian:
    - `AIController.hit` (tres ganchos de individual) y `read` (guarda posición y velocidad);
    - `pressure()` y `shankOf()`, con una rama de individual;
    - los campos `angle` y `rush` de `Skill`;
    - la sección de rivales: `DOUBLES_SKILLS`, `SOLO`, `RIVALS` y `rv()` de `PAIRS`.
  - A toca `kindForAim` y `autoShot`, al final del archivo, así que no deberían chocar.
  - Si A cambia la firma de `pressure()` o `shankOf()`, hay que conservar la rama de individual.
- **`src/sim/match.ts`:** `Controller.place` (interfaz), el principio de `afterHit`, el array `placed` (más su reinicio en `setupServe`) y la condición de la espera de la CPU en `movePlayers`.
- **`RIVALS[i].skill` es ahora la habilidad de individual.** Quien la use para dobles se lleva la de individual. Solo pasa en la demo de fondo de `main.ts` y es solo estético; las parejas reales usan `PAIRS`.
- **`tools/thumb.ts` y `tools/humans.ts` son del agente A.** Si cambian, la escalera de individual se moverá (ver la sección del golpe automático).

## Pendiente

- **«No llegas» del novato sube** en individual (al 18–34 % de los puntos, desde el 13–19 %).
  - La escalera está en su sitio, pero lo verá en pantalla.
  - Palancas, de menor a mayor efecto:
    - `angle` más bajo para Lola y Bruno, que manda menos bolas al hueco;
    - un `SINGLES.margin` mayor, con bolas menos pegadas a la línea;
    - recomendar la ayuda alta al novato, que ahora le vale mucho.
- **El p90 se queda en 20–24 contra Nuria y Reina** (objetivo ≲ 18). Lo que queda es el muro del humano en la red (ver «Para el lado humano»). Del lado de la CPU, la palanca restante es la presión (`SINGLES.press` 0,08 desde el 3.º: p90 18–19), pero es más artificial.
- **Los globos de la CPU no ganan nunca directo**, porque el humano llega a todos corriendo hacia atrás. Sirven para ganar la red.
- **Hay que verlo en el móvil**, sobre todo:
  - si la CPU que se queda atrás tras sacar y tira passing se entiende;
  - si los rivales flojos dejando el cruzado se nota;
  - si el globo de ataque se lee.
