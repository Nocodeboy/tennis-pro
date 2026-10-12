# Tenis 0.1 · Simulación: bola, reglas, saque, individual y dobles, IA

*12–13 oct 2026.* Es la parte de simulación de la conversión del pádel al tenis (contrato: `contrato.md`). Ficheros: `src/sim/*`, `src/human.ts`, `tools/bot.ts`, `tools/thumb.ts`, `tools/humans.ts`, `tools/review/fuzz.ts`. Las medidas son de `tools/bot.ts` con el humano simulado (los pulgares de `tools/thumb.ts` sobre el `HumanController` real).

## La pista y la bola

- **Pista ITF** (`court.ts`): 23,77 × 10,97 m con las líneas de individual (8,23 m) dentro. Qué líneas valen lo dice `COURT.singles`, que pone el partido según tenga dos o cuatro jugadores. La red mide 0,914 m en el centro y 1,07 m en los palos de individual o en los postes de dobles.
- **Sin paredes.** Detrás de las líneas hay la zona libre de una pista del circuito (6,4 m al fondo y 3,66 m a los lados) y luego las vallas de la grada (`BOARDS`).
  - La bola viva que llega a las vallas acaba el punto: si ya había botado dentro, es del que la pegó; si no, es fuera.
  - La bola muerta rebota en ellas, blanda (`boardBounce`).
- **La resistencia del aire** sigue siendo la lineal que sustituye a la cuadrática (`dragFor`); solo se sube el tope para los tiros rápidos (de 0,6 a 1,4 s⁻¹). Comprobada contra la integración cuadrática con la bola de tenis (C 0,02 m⁻¹), en el punto de llegada:

| Tiro | Error en largo | Error en alto |
|---|---|---|
| Saque a 55 m/s, −5°, 0,45 s | 7 cm | 0 |
| Saque a 45 m/s, −3°, 0,5 s | 9 cm | 0 |
| Derecha a 30 m/s, 8°, 0,85 s | 4 cm | 3 cm |
| Derecha a 25 m/s, 12°, 1 s | 5 cm | 5 cm |
| Globo a 20 m/s, 30°, 1,6 s | 2 cm | 18 cm |
| Globo alto a 12 m/s, 55°, 2,4 s | 18 cm | 17 cm |

- **El efecto pesa más que en el pádel:** con liftado a tope, la bola cae con 1,55 g (antes 1,3) y la superficie de la bola gira a 10 m/s (unas 3.000 rpm). Con cortado a tope, 0,7 g: flota.
- **El bote depende de la superficie** (`GROUND` en `ball.ts`), con el mismo modelo de bola rígida con rozamiento del pádel:

| Superficie | Restitución | Rozamiento | Velocidad ITF aprox. |
|---|---|---|---|
| Dura | 0,76 | 0,60 | 40 (media-rápida) |
| Tierra batida | 0,81 | 0,78 | 25 (lenta) |
| Hierba | 0,69 | 0,48 | 48 (rápida) |

  Un drive plano y rápido conserva al botar el 70 % de su velocidad horizontal en dura, el 61 % en tierra y el 75 % en hierba. Un tiro liftado llega a rodar en las tres. La tierra hace botar más alto y la hierba más bajo. `setGround` lo pone el partido en cada paso (`Match.apply`, con `COURT.singles`), así que dos partidos vivos a la vez, el del menú y el de verdad, no se pisan.

## Reglas y puntuación (`match.ts`)

- **Individual o dobles** según el número de jugadores (2 o 4). En individual el saque cambia cada juego; en dobles rota entre los cuatro, y cada uno resta siempre desde el mismo lado durante el set, como en el pádel.
- **El saque es por arriba** (`SERVE_SPOT`):
  - el sacador está 15 cm detrás de la línea de fondo, a 0,55 m de la marca central en individual y a 2,4 m en dobles;
  - le pega a 2,75 m de altura (`SERVE_HEIGHT`), 35 cm dentro de la pista y 25 cm a su derecha (`Match.serveContact`);
  - el contacto llega 1,05 s después de que empieza el movimiento (`SERVE_WINDUP`), lo que dura el saque de la animación.
- **Faltas:** fuera del cuadro o a la red (ya no existe la falta de malla). El let es el del pádel. Al botar, `bounce.out` dice por cuánto se fue, también en el saque: es lo que usa el «¡Fuera! por 4 cm».
- **Puntuación:** 15-30-40 con ventajas o punto decisivo (`Rules.golden`). Los sets se juegan con tie-break al empatar a juegos: un set, al mejor de 3 o al mejor de 5.
  - El tie-break va a 7. En el quinto set de un partido a cinco va a 10 (`tiebreakTo`), como en los Grand Slams desde 2022.
  - Con punto decisivo, el que resta elige el lado: la CPU escoge en dobles a su mejor restador y en individual el lado de iguales.
- **Una bola que vuelve sola por encima de la red,** como una dejada con mucho cortado, es punto del que la pegó.

## Dónde esperan y cómo se mueven

- **Al fondo** esperan más o menos lejos según la superficie (`BACK_Z`): en dura, a 0,9 m de la línea; en tierra, 0,9 m más atrás; en hierba, 0,4 m más cerca.
- **El que resta** se coloca más atrás para el primer saque que para el segundo. Medvédiev se pone 1,3 m más atrás todavía (`Skill.retBack`). Lo probé con 2,5 m, pero en vertical se salía de la pantalla.
- **Individual:** se espera en la bisectriz del ángulo de la respuesta (`Match.bisector`), desde donde el rival le va a pegar a la bola que va de camino. Los rivales con menos sentido de la pista se inclinan hacia el lado de la bola (`Mover.shade`) y dejan abierto el cruzado.
- **Dobles:** cada uno cubre su mitad, como en el pádel. La formación de base es uno arriba y otro atrás: el compañero del que saca empieza en la red y el del que resta, en la línea de saque. Un globo que pasa por encima del que está en la red lo manda atrás.
- **Tras su golpe** (`afterHit`):
  - en individual, la CPU decide con el golpe (`placeSingles`): sube detrás de un golpe de aproximación, de una dejada o de un globo de ataque, y se queda atrás después de un golpe de peloteo, de un globo defensivo o de un passing;
  - el saque y volea depende de `netRush`: es más frecuente con el primer saque y en dobles.
- **Dónde tienen los pies para cada golpe** (`REACH`): golpes de fondo, a 0,72 m de la bola (con la pala eran 0,55); voleas, a 0,62 m; remates, a 0,3 m. La bola, 30 cm delante del cuerpo. Medido con `tools/render/poses-tenis.ts` sobre partidos reales: punto dulce a la bola en el contacto, derecha 0,2 cm de mediana (4,4 cm en el p90), remate 0,2 cm, saque 7 cm.
- **La altura del contacto** (`COMFORT`): entre 0,75 y 1,35 m cuesta poco, y fuera de esa franja, más.
  - Antes había una sola altura ideal (1 m). En tierra la CPU esperaba a que bajara la bola alta y planeaba golpearla detrás de las vallas: un 9–27 % de los saques del humano acababan en ace.
  - Ahora la pega a la altura del hombro o subiendo, y no hay contacto más allá de la zona libre.

## El error (`SCATTER`)

En el pádel cada golpe caía a menos de 20 cm de donde se apuntaba (el cristal perdonaba). En tenis eso hacía peloteos de 15 a 24 golpes y casi ningún error. Ahora:

- **La bola cae alrededor del objetivo con una gaussiana:** σ = 0,14 + 1,9 × (1 − calidad) m a lo ancho, y 1,3 veces eso a lo largo.
  - Un buen contacto (0,9) se desvía unos 0,33 m; uno flojo (0,6), 0,9 m.
  - La potencia lo agranda o lo calma, como en el pádel (`POWER`).
- **La altura sobre la red** se desvía 0,85 σ, y cada metro de más lleva la bola 1,5 m más lejos: alta y larga, o baja y a la red, van juntas.
- **El saque se dispersa** 0,6 veces lo que un golpe de peloteo y su altura lo alarga menos, sobre todo con liftado.
- **Se mantienen los fallos de golpe del pádel** (`MISHIT`: la bola que se queda corta y alta, la que se va larga, el golpe de marco), con el largo a 1,4.

## La IA (`brain.ts`)

- **Ficha de 7 atributos** (`pot`, `con`, `vel`, `ref`, `saq`, `red`, `tq`), convertida en juego con `skillFrom`:
  - calidad: de 0,78 con control 55 a 0,93 con control 90;
  - velocidad: de 5,0 a 6,2 m/s;
  - reacción: de 0,30 a 0,22 s;
  - alcance del remate: de 2,95 a 3,1 m.

  El saque va con `saq` y el resto con `ref` y `con`; voleas y remates, con `red`; dejadas, globos y cortados, con `tq` (`attrQ`).
- **El plan de juego** (`TENNIS`, con sus pesos documentados):
  - **saque:** primer saque plano o cortado a la T, al cuerpo o abierto, más rápido cuanto mejor `saq`; segundo saque liftado, con margen y alto sobre la red;
  - **resto:** un primer saque fuerte se bloquea al centro; un segundo saque se ataca; a quien sube detrás del saque, a los pies;
  - **peloteo:** cruzado y profundo con liftado, un cambio a la paralela de vez en cuando, y a la pista abierta si el rival está fuera (rematando el punto si la bola lo permite: `openHit`);
  - **bola corta:** aproximación y red, ganador o dejada;
  - **estirado o empujado atrás:** cortado o bola alta para ganar tiempo;
  - **contra el que está en la red:** passing paralelo o cruzado (`passingShot`), globo liftado o bola a los pies;
  - **en la red:** si la bola sube, se remata a la pista abierta; si no, volea profunda o dejada de volea.
- **Dobles** (`doublesShot`):
  - cruzado al que está atrás, lejos del que está en la red, y el globo por encima del de la red;
  - contra los dos en la red, a los pies por el centro;
  - en la red, volea al centro o a los pies, y remate al hueco.
  - Los mismos jugadores suben más (`doublesStyle`) y su contacto es 0,035 menos limpio (`DOUBLES_Q`): con dos cubriendo la pista, la calidad de individual hacía imbatible a la última pareja.
- **En apuros juegan más seguro** (`SAFE`): con la dificultad de la bola apuntan hasta 1 m más dentro de la línea lateral, 1,4 m más dentro de la de fondo y 0,6 m más alto sobre la red.
- **Golpear corriendo cuesta** (`RUN_WIDE`): un golpe de fondo a más de 2,2 m de donde estaban es hasta 0,28 más difícil, menos para los rápidos.
- **El cortado lo deciden al salir a por la bola** (`Plan.kind`, en `AIController.read`), para que la vista prepare el golpe desde arriba: si la bola les abre, les queda baja o les llega al revés, según su `slice`.
- **La presión del peloteo** empieza en el 4.º golpe y suma 0,045 por golpe.

## Los rivales

| Rival | Media | Ficha (pot/con/vel/ref/saq/red/tq) | Juego |
|---|---|---|---|
| Kasper Rud | 63 | 66/64/62/60/64/56/69 | fondo con mucho liftado, sube poco |
| Álex de Miñor | 72 | 60/74/92/84/62/66/66 | lo devuelve todo, poca pegada |
| Danil Medvédiev | 80 | 82/86/78/84/88/66/76 | plano y profundo, gran saque, resta desde muy atrás |
| Yannik Siner | 83 | 92/90/84/90/80/72/73 | pega fuerte y pronto, juega seguro |
| Carlos Alcarás | 88 | 92/87/93/89/84/86/85 | lo hace todo |
| Marcel Granoyers (tu pareja) | 78 | 70/85/68/88/78/90/69 | especialista de dobles, muy bueno en la red |

Respecto al contrato, Siner (control y reflejos a 90) y Granoyers (control 85 y reflejos 88) suben, a cambio de toque, para que la escalera de individual y la final de dobles salgan bien medidas. Las medias no cambian.

## El control del humano (`human.ts`)

- **Apuntado:** soltar sin arrastrar apunta a 9 m de la red (`AIM_D0`), unos 2,9 m dentro de la línea de fondo. Más corto que 4,5 m (`AIM_SOFT`), dejada; pasada su línea de fondo, globo.
- **El saque sale del gesto,** con las mismas cifras que el de la CPU:
  - latigazo: plano;
  - soltar normal: cortado;
  - soltar quieto: liftado.

  **El segundo saque es liftado** salvo que se dé un latigazo. El plano arriesga (−0,06 de calidad) y el liftado asegura (+0,06).
- **Latigazo hacia abajo** (Mayús+F): cortado. Una bola que se saca al límite, baja y desde el fondo, se corta sola.
- **El toque** en la red es una volea suave; desde el fondo, un resto o golpe bloqueado y cortado al centro, profundo (`blockShot`).
- **El ataque sin apuntar** va a la pista abierta, lejos del rival (`attackTarget`), y no al cuerpo como en el pádel.
- **Los avisos** son «¡Atácala!» (bola alta en la red o bola corta a media pista, `ATTACKABLE`) y «Bloquea» (un remate o una volea fuerte que te llega a la red). Ya no hay «Bajada».

## Medidas

Individual en pista dura, un set a 4 juegos con ventajas, 16 partidos por casilla. Los porcentajes son de partidos ganados y, entre paréntesis, de puntos:

| Humano | Rud | de Miñor | Medvédiev | Siner | Alcarás |
|---|---|---|---|---|---|
| Novato | 100 (73) | 50 (50) | 0 (41) | 0 (38) | 0 (29) |
| Medio | 100 (76) | 100 (61) | 44 (49) | 38 (48) | 13 (41) |
| Bueno | 100 (83) | 94 (64) | 94 (58) | 69 (54) | 38 (46) |

Dobles, pista dura, 12 partidos por pareja:

| Humano | Rud + de Miñor | de Miñor + Medvédiev | Medvédiev + Siner | Siner + Alcarás |
|---|---|---|---|---|
| Novato | 100 (67) | 75 (55) | 33 (47) | 8 (42) |
| Medio | 100 (72) | 83 (57) | 58 (54) | 25 (45) |
| Bueno | 100 (75) | 92 (61) | 100 (60) | 42 (48) |

Los golpes (`SHOTS=1`, nivel medio, pista dura):

| Golpe | % de los golpes | Gana el punto | Error | Velocidad al salir (mediana / p90) | Tiempo desde el golpe anterior |
|---|---|---|---|---|---|
| Golpe de fondo (CPU) | 33 % | 2 % | 10 % | 108 / 132 km/h | 1,32 s |
| Golpe de fondo (tú) | 23 % | 2 % | 9 % | 109 / 133 km/h | 1,31 s |
| Cortado (tú) | 7 % | 1 % | 8 % | 101 / 109 km/h | 1,29 s |
| Saque (tú / CPU) | 7 % / 6 % | 0 / 1 % | — | 148 / 184 · 112 / 213 km/h | — |
| Resto (CPU / tú) | 5 % / 5 % | 2 % | 7 % / 6 % | 97–100 / 128 km/h | 0,86 / 1,02 s |
| Remate (CPU / tú) | 1 % / 0,5 % | 32 % / 49 % | 14 % / 10 % | 134–141 / 212–215 km/h | 1,1–1,4 s |
| Volea (CPU / tú) | 1 % / 1 % | 28 % / 7 % | 28 % / 31 % | 83 / 176 · 67 / 117 km/h | 0,7–0,8 s |
| Dejada (CPU) | 1 % | 3 % (fuerza el error un 18 %) | 1 % | 51 / 63 km/h | 1,30 s |

Los puntos acaban en ganador un 22 % (14 % sin que nadie la toque, 7 % sin llegar), en fuera un 60 %, en la red un 18 % y en doble falta un 0,5 %. Golpes por punto: 7–13 según el rival.

- **El saque de la CPU:** entra el 64–76 % de los primeros saques (el circuito ronda el 62 %), con un 0–2 % de dobles faltas por punto de saque. Va a 140–220 km/h el primero y a unos 85–90 km/h el liftado.
- **El saque del humano simulado:** 67–85 % de primeros saques dentro y 0–3 % de dobles faltas.
- **Superficies (nivel medio, 12 partidos):** en dura, 75/61/49/47/39 % de los puntos contra los cinco rivales; en tierra, 74/61/47/55/35; en hierba, 80/59/49/49/43. La hierba da los puntos más cortos (7,6–9,9 golpes) y la tierra los más largos (8,6–12,1).
- **Fuzz:** 320 partidos con pulgares al azar (individual y dobles, las tres superficies, sets sueltos y al mejor de tres) y más de 5.000 puntos, sin fallos ni atascos (`tools/review/fuzz.ts`).

## Herramientas

- `tools/bot.ts`: la escalera de individual o dobles en cualquier superficie, con el saque (primeros dentro, aces, dobles faltas) y, con `SHOTS=1`, los golpes de cada lado (`tú` / `cpu`): veces, ganadores, errores, errores que fuerzan, altura del contacto, velocidad y tiempo desde el golpe anterior. Con `QS=1`, la calidad media de la CPU por golpe.
  - Sustituye a `tools/bot-doubles.ts`.
  - Las variables de entorno cambian valores sin tocar el código: `TENNIS`, `PRESSURE`, `WHIFF`, `REACH`, `POACH`, `TUNE`…
- `tools/thumb.ts` y `tools/humans.ts`: el humano simulado de tenis. Saca plano, cortado o liftado y apunta el saque como lo haría una persona que ve el arco. Corta las bolas que se saca al límite, sube detrás de una aproximación según su `netRush` y elige sus golpes con reglas de tenis.
- `tools/review/fuzz.ts`: individual y dobles, tres superficies, sets sueltos y al mejor de tres. Comprueba que nadie pasa la red ni las vallas y que la bola tampoco.
- `tools/tenis/play.py`: un partido real en el navegador, con fotogramas del saque (lanzamiento, trofeo, contacto), del peloteo y de los puntos.
- **Quitadas:** las sondas del pádel (`tools/audit/*.ts`, `tools/review/por.ts`) y su escenificación (`tools/stage*.ts`, `tools/poses.ts`). Siguen en la historia del repositorio y en `padel-pro`; las de render del tenis están en `tools/render/`.

## Pendiente

- **Peloteos algo largos:** de 8 a 12 golpes por punto; en el circuito son 4–5. Para un juego de móvil está bien, pero más ganadores lo harían más vivo. Hoy los puntos acaban en un 22–29 % en ganadores, y en el circuito en un 30–35 %.
- **Pocos aces del humano** (0–1 % de sus puntos de saque): el humano simulado apunta al centro del cuadro. Falta medir a una persona que busque las líneas.
- **Dobles con poca red:** la CPU juega desde la red un 10–15 % de sus golpes; en dobles profesional es mucho más.
- **El físico** (`FIT`) está calibrado para el pádel: en un partido a cinco sets habrá que mirarlo.
- **La superficie no cambia a los jugadores:** Rud no es mejor en tierra ni hay especialistas de hierba. Se podría ajustar la ficha por superficie.
- **Probar en un móvil real:** la ventana del golpe con el tiempo del tenis (1,3 s entre golpes de fondo, 0,8–1,1 s para restar) y el saque por gesto.
