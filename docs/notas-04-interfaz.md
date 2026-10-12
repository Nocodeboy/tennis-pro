# 0.4 · Interfaz: cámara, pulgar y avisos

*12 oct 2026.* Arreglos de cámara, HUD y textos que pedía la auditoría de jugabilidad (`auditoria-04-jugabilidad.md`: A3, M1, M2, M4, M5, B1, B2 y B3) y los textos del punto nuevo «al cuerpo» que añade la simulación. La simulación y el control (A1, A2, M3, M6) van en otras notas.

## Cámara

**Vertical (M4 y A3).** La cámara está más alta, con unos grados más de campo y mira más cerca, así que la pista sube en la pantalla. El fondo cercano queda a unos tres cuartos de la altura (y ≈ 615 de 844, antes 691). Debajo quedan la valla de publicidad y la grada, que es donde descansan los pulgares, así que ya no tapan a tu jugador. Parámetros (`view.ts`, `cam`):

| | Distancia | Altura | Mira a | Campo |
|---|---|---|---|---|
| Vertical, antes | 23 | 13 | 0,25 | 46° |
| Vertical, ahora | 23 | 15,5 | 3,5 | 48° |
| Horizontal, antes | 22,75 | 11 | 0 | 34° |
| Horizontal, ahora | 22,5 | 10,5 | 1,0 | 29° |

- **El seguimiento lateral tiene tope** (`View.frameX`). La cámara sigue yendo hacia tu lado y hacia la bola, pero nunca tanto como para sacar del cuadro a Martín, a ti (con medio metro de cuerpo a cada lado) o tu círculo: deja un margen del 10 % del ancho.
  - Con dos poses de prueba calcula el intervalo de x de cámara que deja dentro todos esos puntos y recorta el seguimiento a ese intervalo.
  - Si no caben todos (la pareja pegada a las dos paredes laterales), mandan tu jugador y tu círculo.
- **Más atrás de unos 23,5 m la cámara se mete en la grada cercana** y la imagen sale negra (probado a 25 m).
- **La malla y el acero del fondo cercano ya no cruzan a los jugadores** (`cage.ts`). El muro que está entre la cámara y la pista deja la malla en un 5 % (antes un 18 %) y el acero desaparece del todo (antes quedaba un píxel de cada cuatro, en líneas punteadas). El cristal sigue igual: un 20 % de tinte y los reflejos. Con un ángulo de TV desde la grada lateral pasa lo mismo con ese muro lateral.

**Horizontal (M5).** La cámara está más baja y con un objetivo más largo. El cristal del fondo lejano toca casi el borde de arriba y el fondo cercano, el de abajo. La pista ocupa unos 476 px de 844 (antes 392, del 46 % al 56 %) y los rivales miden unos 45 px (antes 35).

## El pulgar derecho (A3)

- **La pista sube en la pantalla** (ver la cámara): con el pulgar en reposo abajo a la derecha, ya no tapa a tu jugador ni el aro de tiempo, que ahora salen por encima.
- **Copia del aro de tiempo en la etiqueta del golpe.** Mientras apuntas, la etiqueta junto al destino (DRIVE, BANDEJA…) lleva delante un aro pequeño que se cierra igual que el grande. Se pone dorado en la ventana de PERFECTO y rojo o gris si se pasa. Está arriba, donde se mira al apuntar, lejos del dedo.
  - En el saque hace lo mismo con el pulso del saque.
  - La etiqueta y el abanico de golpes se apartan también del aro grande, no solo de los rivales.

## Golpes por encima (M2)

- **Abanico de opciones.** Con el dedo apoyado sobre una bola por encima de la cabeza, debajo de la etiqueta (que dice lo que sale al soltar, normalmente BANDEJA) aparecen unas pastillas pequeñas con lo que daría cada latigazo:
  - «↑ REMATE»;
  - «⇈ POR 3», a tope, solo si la bola lo permite;
  - «↖↗ VÍBORA»;
  - «↓ POR 4».

  Se calculan con `kindForAim` (`brain.ts`), la misma regla que usa el golpe, así que siguen los umbrales de la simulación (víbora desde 34°, potencia del por 3). Solo salen las que dan algo distinto de soltar: en una bajada no hay abanico. Con teclado salen «F», «F mantenida» y «⇧F». El abanico va debajo de la etiqueta o encima, según tape menos a los rivales y al aro.
- **Etiqueta del golpe que salió.** Tras cualquier golpe tuyo por encima sale su nombre sobre la cabeza también con los indicadores mínimos: REMATE, VÍBORA, BANDEJA, BAJADA, POR 3 o POR 4. Debajo, en pequeño, va PERFECTO, Pronto o Tarde si toca. Dura 1,15 s (las demás etiquetas, 0,75 s).

## Pistas (M1)

- **Cola de pistas** (`setHint`, `hintTick`): cada pista dura al menos 2,5 s antes de que otra (o nada) ocupe su sitio. La que llega con la línea ocupada espera turno.
- **Prioridades:** las pistas sobre la bola que viene (ataca, bloqueo, bajada, por 3) se adelantan a las generales que esperan. Además, solo se piden si la línea está libre en ese momento: si no, esperan a otra bola y no se dan por vistas.
- **Pista ya cumplida:** cuando el jugador hace lo que pide una pista (sacar, golpear), esta se va al cumplir su tiempo y, si aún esperaba, ya no sale (`doneHint`).
- **Repetición o presentación de TV:** mientras la TV tiene la pantalla, el tiempo de la pista no corre.
- En la primera partida de prueba (`play.py --menu`) las pistas salen en t = 0; 3,1; 5,5; 7,9; 20,7; 31,9 y 85,0 s. Ninguna se pisa.

## Detalles (B1, B2, B3)

- **B1 · Cartel de punto:** una línea pequeña encima del motivo dice de quién es el punto: «PUNTO VUESTRO» o «PUNTO DE GALVÁN / TAPIRA» (en inglés, «YOUR POINT» o «POINT GALVÁN / TAPIRA»).
- **B2 · Saque en la primera partida:** el aro del saque sale tenue alrededor de la bola en la mano antes de apoyar el dedo, como el aro de enseñanza del peloteo, hasta el primer saque. La pista dice ahora «suelta con el aro de la bola pequeño».
- **B3 · Joystick:**
  - el pomo es un anillo, no un disco, y la base es más transparente;
  - sobre tu pareja o sobre ti baja al 40 %;
  - con la pista más arriba, el pulgar izquierdo cae normalmente sobre la valla, por debajo de la pista.

## Punto «al cuerpo»

La simulación añade el motivo `body`: la bola toca a un jugador del equipo que la recibe y el punto es del que golpeó. Lo que sale en pantalla:

- **Cartel:** «LE DIO EN EL CUERPO» (o «TE DIO EN EL CUERPO» si te dio a ti), con la línea de quién es el punto.
- **Explicación** (`explain.ts`): «Tu volea le dio a Galván en el cuerpo» o «El remate de Galván te dio en el cuerpo».
- **Para la TV y la llamada de golpe** (`broadcast.ts`, `explain.ts`) cuenta como punto ganado: aplausos, repetición y «¡Remate!» si fue de remate.

## Cómo comprobarlo

- **Guion nuevo:** `tools/audit/ux/ui.py [etiqueta] [portrait|landscape|both]`. Juega con un pulgar real y otro virtual, apunta un drive, una chiquita y una bola por encima, y pinta un pulgar translúcido en cada captura. El JSON dice:
  - si el pulgar tapa a tu jugador, el aro o el círculo;
  - cuántos fotogramas tienen algún jugador cortado por el borde;
  - cuánto ancho ocupa la pista y cuánto miden los rivales.
- **Otra compilación:** `PADEL_DIST=/otra/dist` (lo lee `lib.py`) sirve para comparar con la versión de antes.

| Medida (vertical salvo indicación) | Antes | Ahora |
|---|---|---|
| Fotogramas con un jugador cortado | 1014 de 4149 (24 %) | 31–105 de unos 4000 (1–3 %) |
| Fotogramas con tu círculo pegado al borde | 98 | 9–14 |
| Bola por encima: pulgar sobre tu jugador y el aro | sí | no |
| Rivales, alto en horizontal | 35 px | 45–49 px |
| Pista, ancho en horizontal | 392 px | 476 px |

Las cifras de «ahora» varían entre pasadas porque la simulación cambió a la vez y los peloteos no son los mismos.

**Pendiente:**
- comprobar en un móvil real dónde apoya cada uno el pulgar;
- el caso raro de la pareja pegada a las dos paredes en el fondo, que todavía corta a Martín;
- ver si el hueco de valla y grada bajo la pista en vertical (unos 230 px) se puede aprovechar.
