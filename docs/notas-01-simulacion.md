# Simulación de pádel 0.1 (11 oct): física, reglas, IA y escalera

Notas del agente de juego y simulación. Parte de la conversión rápida del líder (pista, paredes, reglas, puntuación) y la valida, la corrige y la afina. Todo está medido con scripts y con los bots (`tools/bot-doubles.ts`, `tools/review/fuzz.ts`, `tools/feet.ts`). Los bots usan el `Input` y el `HumanController` reales, movidos por pulgares simulados (`tools/thumb.ts`).

## Qué cambia para el jugador

- **La IA juega al pádel, no al pickleball.** La pareja que manda en la red gana el punto:
  - desde atrás contra una pareja en la red: **globo** para subir, **chiquita** a los pies y, de vez en cuando, un drive que pasa;
  - en la red: voleas al fondo y a las esquinas, a los pies, o **a la reja** (cruzada corta contra la malla lateral, donde la bola muere);
  - por encima de la cabeza: **bandeja**, **víbora** o **remate**; un remate fuerte y plano a veces sale **por 3**.
- **Las parejas se mueven juntas.** Suben tras un buen globo o una chiquita, bajan las dos cuando las globean y aguantan la red si uno de los dos coge el globo de bandeja.
- **Los rivales se llaman** Paquito, Fede, Alejandro, Agustín y Arturo; el compañero, Martín. Los apellidos están en `tour.ts`, que es del agente de interfaz.
- **El apuntado del humano es de pádel:**
  - cerca de la red, bola suave (chiquita o dejada);
  - más allá del cristal de fondo, globo;
  - una bola alta, bandeja;
  - un latigazo, remate; un latigazo torcido hacia una pared, víbora.

## Física (src/sim/ball.ts)

Se comprobó con trazas y no se tocó casi nada:

| Prueba | Resultado |
|---|---|
| Drive liftado (22 m/s) que bota a 7 m | Sale del cristal de fondo a 7 m/s y pasa a **1,1 m de altura a 8,5 y 7,5 m de la red**. A ritmo lento (1,3×), 1,3–1,4 m. Bota otra vez hacia los 5 m: se juega cómodo. |
| Cortado (-0,6) igual de profundo | Sale **bajo** (0,5 m a 8,5 m) y muere antes, como «la bola que se queda». |
| Liftado | Trepa en el cristal. |
| Globo (2,3–3 m sobre la cinta) | Pico de 3–4 m; bota a 8–9 m y vuelve del fondo a 1,8–1,9 m. |
| Malla | Mata la bola: de 7 a 2,8 m/s, desviada de forma determinista. |
| `wallTime` | Es analítica, así que nunca se salta una pared ni la vuelve a detectar (la bola sale 0,1 mm separada). En 170.000 fotogramas no hay ni un fallo. |

**Cambio 1: la restitución del suelo en botes fuertes.** Antes perdía 0,015 por m/s a partir de 6 m/s y ahora pierde **0,005** (`BOUNCE_Y - 0.005·(vn − 6)`).
- Con el valor anterior, **ningún remate podía salir por 3**: incluso a 40 m/s el bote no pasaba la malla de 3 m.
- La hierba con arena devuelve casi todo en vertical. Los golpes normales (impacto vertical de 4–6 m/s) no cambian.
- Ahora sale por 3 cerca de la mitad de los remates pegados para eso (fuertes, planos y al centro de la media pista), que son el 6 % de todos los remates. En total, en torno al 1 % de los puntos (0,8 % en la escalera con el humano).

**Cambio 2: la bola muerta (`Match.deadBounces`).**
- Buscaba los botes desde el paso anterior y no desde el inicio de su tramo: si el punto acababa a mitad de paso, la bola atravesaba el suelo y el cristal (103 fotogramas bajo el suelo en 4 partidos).
- Ahora recorre todos los eventos del paso.
- Si la bola sale por encima de una pared, cae fuera de la pista. Si va rodando, se para en el cristal.

## Reglas comprobadas (src/sim/match.ts)

Con un servidor guionizado y llamadas directas a `award`:

- **Saque:**
  - a la red → falta y segundo saque;
  - fuera del cuadro → falta;
  - toca la cinta y bota dentro → **let**, se repite el mismo saque (también dos veces seguidas);
  - bota dentro y va a la malla lateral → falta (`serveFence`);
  - dos faltas → punto (`doubleFault`).
- **Puntuación:**
  - 40-40 con punto de oro: el siguiente punto gana el juego;
  - con ventajas: 40-AD → 40-40 → AD-40 → juego;
  - set a 3 (4-2 gana, 3-2 sigue), tie-break a 7 con diferencia de 2 cuando el marcador llega a 3-3.
- **Rotación del saque:** cada juego saca un jugador distinto, alternando equipos (0, 2, 1, 3). En el tie-break, el primer saque es del siguiente en el turno y después dos puntos cada uno, alternando la derecha y la izquierda.

**Error encontrado:** la CPU apuntaba el saque a `HL − 0,7` (pasada la línea de saque). Todos los saques eran falta y el partido nunca acababa. Ahora apunta al cuadro: a la T, al cuerpo o abierto al cristal lateral, y el segundo saque es más seguro.

## La IA de pádel (src/sim/brain.ts)

Se ha borrado todo lo de individual (`SINGLES`, `singlesShot`, `placeSingles`, `coverX`, `passingShot`, `SOLO`). Se queda la maquinaria que funcionaba: `Skill`, `roll`, `read`, `difficulty`/`rushed`, `pressure`, `shankOf`, `pickOpp`, `gapX` y el castigo del golpe automático repetido. `chooseShot` es nuevo y sus pesos están en `PADEL`:

| Situación | Qué hace |
|---|---|
| Resto | Bajo a los pies del sacador que sube, o globo por encima del de la red (`lob × returnLob`) |
| Bola por encima de la cabeza (a menos de 4,5 m de la red) | Remate (`attack × remate`) y, si es fuerte y empinado, por 3 (`attack × risk × por3`). Si no, víbora a la pared lateral (`attack × vibora`) o bandeja al fondo. Desde más atrás, solo bandeja. |
| Red, bola que sube por encima de la cinta | La remata: a la reja (cruzada corta a la malla), a los pies o, si están atrás, dejada |
| Red contra pareja atrás | Volea profunda a las esquinas o corta cruzada (`touch × shortVolley`) |
| Red contra red | Volea baja a los pies, volea fuerte al cuerpo (`attack × netHard`, más cuanto más largo el peloteo) o globo (`lob × netLob`) |
| Atrás contra pareja en la red | Globo, chiquita, passing, drive a los pies; la bola alta en media pista se baja a los pies |
| Atrás contra atrás | Drive profundo y por el centro (pegar fuerte no sirve: vuelve del cristal), aproximación con la bola corta, algún globo |
| Perseguido por un globo | Globo alto de vuelta o bola suave a los pies |

**Dificultades nuevas** (son las que acortan los puntos):

- `LOW_VOLLEY`: una volea por debajo de 0,9 m tiene que levantarse (+0,6 por metro).
- `RUN_BACK`: una bola que te ha pasado y tienes que perseguir hacia tu cristal, más de 2 m por detrás de donde estabas (+0,09 por metro, como mucho 0,4).
- Una bola pegada al cristal o en la esquina estorba el golpe.
- **Presión** (`PRESSURE`):
  - empieza en el 4.º golpe y sube 0,06 por golpe;
  - el 60 % va al contacto y el 50 % a que la bola se quede alta (`popOf`);
  - en pádel la mayoría de los puntos acaban en error, más cuanto más largo el peloteo.
- `SHANK`: la pifia empieza 0,25 por encima del suelo de calidad (0,1 para el humano, al que su momento ya lo juzga el aro). Ya no está solo en la red: la mitad de las pifias de un golpe fuerte van **directas al cristal** (de fondo, o lateral si se cruzó).
- `LONG` (`match.ts`): un golpe fuerte mal dado se va largo como mucho 2,6 m × (1 − q). En una media pista de 10 m, el drive profundo fallado acaba en el cristal.

**Planificador** (`PLAN_SPARE`, `match.ts`). La CPU elegía la volea más temprana a la máxima estirada y fallaba una de cada once bolas. Ahora un contacto con menos de 0,2 s de margen cuesta 4 por segundo que falta, y prefiere dejar botar la bola o jugarla de pared. Fallos de CPU: del 9 % al 1,5 %.

**Movimiento** (`afterHit`, `cover`):
- el sacador sube a la red; el restador se queda atrás salvo con un resto bueno;
- un globo bueno contra una pareja en la red sube a los dos;
- una chiquita desde atrás sube con probabilidad 0,35 + 0,6 × netRush;
- las voleas y los golpes por encima de la cabeza mantienen la red;
- un drive desde la línea de saque es una aproximación;
- si los globean, bajan los dos, salvo que el compañero coja la bola de bandeja o víbora por delante de la línea de saque: entonces aguantan los dos arriba.

**Medido** (8 partidos CPU, con un script de prueba que no está en el repositorio):
- uno arriba y otro abajo solo en el 12 % de los golpes;
- tras un globo bueno, la pareja que lo pega está arriba en el 56 % de las réplicas;
- la pareja globeada que lo coge de bandeja o víbora sigue entera en la red.

## Rivales

Mismos ids, nombres nuevos. El jugador humano corre a `HUMAN_SPEED` = 5,0 m/s (antes 4,6): la pista es el doble de larga.

| id | Nombre | Velocidad | q | Estilo |
|---|---|---|---|---|
| paco | Paquito | 4,0 | 0,70 | Defiende desde el fondo, globea mucho, poco ataque |
| lola | Fede | 4,5 | 0,79 | Lo devuelve todo, globo y paciencia |
| bruno | Alejandro | 4,9 | 0,85 | Pegador: remata, víbora, por 3 |
| nuria | Agustín | 5,0 | 0,85 | Toque: chiquitas, dejadas, víboras |
| reina | Arturo | 5,1 | 0,88 | Completo |
| marta | Martín (compañero) | 5,0 | 0,85 | Constante, en el revés |

CPU contra CPU (12 partidos, % de puntos): Paquito+Fede contra Fede+Alejandro, 32 %; Fede+Alejandro contra Alejandro+Agustín, 38 %; Alejandro+Agustín contra Agustín+Arturo, 38 %. La escalera está bien ordenada.

## Apuntado del humano (src/human.ts y brain.ts)

- **Mapa:**
  - sin arrastre, la bola va a `AIM_D0` = 6,5 m de la red, por el centro;
  - 1 m de lado son `pxPerM` px y 1 m de fondo son `pxPerM × AIM_Z` (0,7) px;
  - pasado `HL + AIM_LOB` (10,4 m) es globo (`lobShape`: de alto y a 7,4 m hasta más plano y a 9,3 m).
- **Tipos de golpe** (`kindForAim`):
  - más cerca que `AIM_SOFT` (4,2 m): chiquita en la red o dejada desde atrás;
  - por encima de la cabeza: **bandeja**;
  - si no: volea en la red o drive atrás.
- **Latigazo** (`kindForAim(…, attack, bend)`):
  - bola alta → remate;
  - con el trazo torcido 0,7 m o más (`ATTACK.viboraBend`) → **víbora** a la pared de ese lado;
  - si no → volea fuerte.
- **Toque** (`blockShot`): bola suave baja que muere a 2,8–3,8 m.
- **Saque:**
  - sin arrastre, al centro del cuadro diagonal (2,2 m del centro, a 5,35 m de la red);
  - las teclas mueven 0,9 m de lado y 1 m de fondo.
  - el golpe automático (sin apuntar) devuelve un resto bajo, una bandeja, una volea firme al centro de la otra media pista o un globo si los rivales están en la red.
- **Teclado:** ↓↓ chiquita, ↓ bola suave, 0 drive a la línea de saque, ↑ al fondo, ↑↑ globo, ↑↑↑ globo profundo.
- **La forma de la API no cambia:** `AimResult` sigue siendo x, z, kind, clear, pace, ok. Se exportan además `AIM_D0`, `AIM_Z` y `AIM_LOB`.

## Escalera medida

`npx tsx tools/bot-doubles.ts 16` (16 partidos por casilla, set a 3 juegos con punto de oro, ayuda 1):

| Humano | Paquito+Fede | Fede+Alejandro | Alejandro+Agustín | Agustín+Arturo |
|---|---|---|---|---|
| novato | 100 % | 94 % | 63 % | 13 % |
| medio | 100 % | 100 % | 69 % | 13 % |
| bueno | 100 % | 100 % | 88 % | **44 %** |

- **Golpes por punto:** 12,7–14,7.
- **Minutos por partido:** 3,8–7,2.
- **Peloteo más largo:** 46 golpes.
- **Partidos atascados:** ninguno.
- **Cómo acaban los puntos** (todas las casillas):
  - ≈42 % red;
  - ≈35 % cristal o malla directos (`wall`);
  - ≈19 % ganadores y bolas que no se alcanzan (`winner` + `miss`);
  - ≈1 % por 3;
  - el resto, dobles faltas.
- **Por último golpe:**
  - chiquita o volea baja a la red, 24 %;
  - volea al cristal, 14 %;
  - volea a la red, 14 %;
  - volea ganadora, 11 %;
  - drive al cristal, 4 %;
  - víbora y bandeja al cristal, 5 %;
  - remate por 3, 0,8 %.
- **Golpes jugados:**
  - voleas, 22 % (más un 15 % de chiquitas y voleas suaves);
  - globos, 13 %;
  - drives, 10 %;
  - bandejas, 7 %;
  - remates, 3 %;
  - víboras, 2 %.
- **Juego desde el cristal** (CPU): el 57 % de las bolas que se juegan tras el bote vienen de una pared (41 % del cristal de fondo), a una altura mediana de 0,94 m.

**Fuzz:** `npx tsx tools/review/fuzz.ts 48`, con 48 partidos de pulgares al azar (todas las ayudas, los dos modos de golpe, punto de oro y ventajas): 706 puntos, 0 fallos, 0 atascos. Comprueba:
- que no haya NaN;
- que nadie cruce la red ni el cristal;
- que la bola nunca baje del suelo;
- que la bola no salga de la pista salvo por encima de una pared.

**Pies** (`tools/feet.ts`): un 0 % de contactos tardíos en 846 planes, split step en el 100 % de los golpes y trayectorias rectas (0,997).

## Herramientas

- `tools/bot-doubles.ts [partidos] [ayuda] [juegos=3] [oro=1]`:
  - variables de entorno `PADEL`, `PRESSURE`, `SHANK`, `TUNE`…;
  - `SHOTS=1` da la mezcla de golpes y cómo acaban los puntos.
- `tools/thumb.ts`:
  - tácticas de pádel (resto bajo o globo, globo y chiquita contra la red, bandeja por encima de la cabeza);
  - en la espera sigue al compañero y sube tras su propio globo;
  - **error corregido**: no repetía el saque tras una falta y el partido se quedaba parado.
- `tools/humans.ts`: más globo en los tres niveles.
- `tools/review/fuzz.ts` y `tools/feet.ts`: adaptados a pádel; el individual se ha quitado.

## Pendiente y riesgos

- **Martín falla mucho** («martín-net» es la primera causa de puntos perdidos contra las parejas fuertes): lleva el doble de bolas que el humano en la red. Se nota más contra Arturo.
- **Hay poco «por 4»** (0 en 280 puntos de CPU): la física lo permite (un remate al centro de 5 m vuelve hasta la red), pero la IA no lo busca.
- **La víbora del humano** sale con el trazo torcido 0,7 m o más. Hay que probarla en el móvil: quizás sea demasiado fácil sacarla sin querer.
- **El ≈19 % de ganadores** está por debajo de un partido real (30–40 %). Para subirlo sin alargar los puntos, el siguiente paso sería la volea a la reja del humano.
- **Las paredes no tienen en cuenta la pala:** una bola a menos de 0,3–0,38 m del cristal no se puede golpear (`WALL_GAP`). Está bien para la CPU; habrá que ver si al humano le parece injusto.
- **`explain.ts` y `broadcast.ts`** (no son míos) aún no compilan contra la puntuación nueva; el agente de interfaz los está cambiando.
