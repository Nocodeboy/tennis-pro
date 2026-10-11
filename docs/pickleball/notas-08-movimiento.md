# Movimiento de los jugadores 0.8 (10 oct)

Germán probó la 0.7: «los jugadores han mejorado, pero muchos de sus movimientos aún no parecen naturales». Marcó tres
cosas: **correr y frenar**, **los golpes** y **esperar entre golpes**. El modelo le vale.

Todo el trabajo está en `src/render/chars.ts`. La simulación (`match.ts`) no cambia: los partidos son idénticos a la 0.7 y
la escalera no se mueve. No se ha generado ningún clip nuevo (0 créditos gastados; saldo de Magnific: 1.522).

## Cómo se miró

- **Vídeo de la página real** (`tools/seq.py`, nuevo): un partido con semilla avanzado a mano a 30 fotogramas por segundo,
  con la cámara de juego (móvil en vertical) y dos cámaras cercanas que siguen a cada jugador (de tres cuartos, por
  delante y a su derecha). La simulación no usa `Math.random`, así que dos versiones con los mismos argumentos enseñan
  los mismos instantes. `tools/seqcmp.py` las pone lado a lado; `tools/seqscan.py` busca los peloteos de un partido para
  elegir qué filmar; `tools/strip.py` saca tiras de fotogramas. Con renderizado por software tarda unos 2 s por imagen.
- **Monigotes** (`tools/sticks.ts` + `tools/sticks.py`, nuevos): el `CharacterView` real en Node, en los mismos partidos
  que `tools/poses.ts`, dibujado como esqueleto desde detrás y de lado (antes y después juntos). Tarda segundos, para
  iterar. `FIND=drive,3` busca el tercer drive de un jugador; `FIND=start|stop` un arranque o una frenada.
- **Medidas** (`tools/poses.ts`, 8 partidos de 4 minutos, mismas semillas). Medidas nuevas en `tools/posemetrics.js`:
  inclinación al arrancar, al frenar y en los giros; pie apoyado al arrancar, frenar y girar; espera congelada; postura de
  espera (rodillas, cadera, torso, pala); pala al correr; anchura de los pies en el contacto; contacto delante de la
  cadera, por detrás y pegado al cuerpo; antelación del golpe y cambios de golpe que se ven.
- **Coste** (`tools/charcost.ts`, nuevo): lo que tarda `CharacterView.update` por jugador y fotograma.
- `tools/swing-path.ts` (nuevo): el recorrido de la pala de cada golpe, con el contacto y el punto más atrás.

## Qué no parecía humano (0.7), de lo que más se ve a lo que menos

| Qué se veía | Causa en el código |
|---|---|
| **Al correr, la pala por encima de la cabeza**, como si la agitara | `run_v2` bracea con la pala hasta 1,6 m; nada lo frenaba (pala al correr p90 1,15 m) |
| **De lado y deprisa, la pala estirada delante como una bandeja** | el brazo de la pala del lateral (`shuffle_v2`) va estirado; y el cuerpo solo se giraba a correr por encima de 2,2–3,4 m/s, así que iba de lado a 3,5–4 m/s |
| **Corriendo hacia la bola, el tronco congelado más de un segundo** | los golpes de arranque largo (dejada 1,58 s, estirada 1,13 s, revés 0,95 s) tomaban todo el tronco desde el principio de su clip, que casi no se mueve |
| **Esperando, una estatua** con la pala a la cintura | el clip de espera apenas se mueve (menos de 7° en cualquier hueso, la cadera 9 mm): 23,5 % de los fotogramas de espera congelados, pala a 0,94 m, rodillas a 33° |
| **Arranques sin anticipación**: tronco recto y la pierna de atrás estirada | nada inclinaba el cuerpo según la aceleración (inclinación al arrancar: −0,3° de mediana) y el pie apoyado no se soltaba hasta quedar a 26 cm |
| **Frenadas sin plantar** | sin inclinación hacia atrás (−1,1°, es decir, hacia delante) ni bajada de cadera |
| **Golpes que cambian a mitad** (estirada → drive, revés → dejada…) | cada vez que la IA afinaba el plan se cambiaba de clip hasta 0,2 s antes del contacto: 167 de 1.587 golpes, 61 a menos de 0,45 s |
| **El drive, una postura de portero**: pies a 0,76 m, cadera muy baja, brazos abiertos | el clip del drive ya va abierto y agachado (pies a 0,8 m, cadera a 0,73 m en el contacto) y el código bajaba la cadera 20 cm más con bolas bajas |
| **La pala atrás en el último instante** | el clip del drive la lleva atrás 0,16 s antes del contacto y solo 25 cm; con bolas a media altura el IK entraba 0,23 s antes |
| **Entre puntos, quien no celebra ni se lamenta se queda quieto** | sin reacción no había nada: el mismo clip de espera |

Lo que se sospechaba y **no** era un problema medible: bolas por detrás del cuerpo (0,5 % de los contactos, sin contar los
remates; el remate parece detrás de la cadera porque la cadera se gira de lado, pero se golpea delante de la cabeza) y
bolas pegadas al cuerpo (2,4 % a menos de 35 cm de la cadera).

## Qué cambia

**Correr y frenar**
- **El cuerpo se inclina según lo que hacen los pies** (`LEAN`): hacia delante al arrancar, hacia atrás al frenar y hacia
  dentro en los giros, según la aceleración de la simulación (suavizada 0,07 s): 0,011 rad por m/s² (0,016 al frenar),
  como mucho 15° hacia delante y 12,6° hacia atrás. Es un giro del tronco con la cadera desplazada por encima de los pies
  (el 55 % del giro se toma desde los tobillos); los muslos conservan la orientación del clip, para que el pie apoyado no
  se incline con el cuerpo. Al frenar fuerte, la cadera baja hasta 6 cm. En los golpes la inclinación es la mitad, y
  nada justo en el contacto (si no, una volea a la carrera fallaba por 30–40 cm).
- **Anticipación de la CPU**: en las últimas 0,16 s de su reacción, carga (cadera 3,5 cm abajo) y se inclina 7° hacia
  donde va a salir.
- **Primer paso antes**: en un arranque explosivo desde parado, el pie de atrás da el paso con el 60 % de la distancia de
  antes (no se queda la pierna estirada).
- **Desplazamientos largos, corriendo**: a partir de 1,6–2,4 m/s el cuerpo se gira a correr si le quedan más de 1,5–3 m
  hasta la bola o su sitio (antes, siempre por encima de 2,2–3,4 m/s). El lateral queda para un paso o dos.
- **La pala, llevada** (`CARRY`): corriendo, andando o hacia atrás, el brazo de la pala va un 55 % hacia como lo lleva la
  postura de espera, delante; de lado, un 70 %. Se acabó agitarla por encima de la cabeza y la bandeja.

**Los golpes**
- **No cambian a mitad** (`commit`): un golpe empezado se mantiene aunque la IA afine el plan; la estirada del cuerpo y
  el brazo lo llevan a la bola. Solo cambia si su pala apenas se ha movido todavía (12 cm de su recorrido) o si la bola
  pasa de verdad al otro lado del cuerpo (más de 30 cm).
- **Los golpes de arranque largo empiezan a mitad** (`SwingDef.lead`): dejada 0,8 s, estirada 0,85 s, revés 0,7 s antes del
  contacto, desde donde su clip ya se mueve.
- **Corriendo hacia la bola, los brazos siguen corriendo** (`RUN_ARMS`) hasta 0,5 s antes del contacto (el golpe se queda
  con el 40 % del tronco), y el golpe lo toma entero a 0,28 s. Suavizado, para que un acelerón o un contacto que se
  retrasa no hagan saltar el brazo.
- **Preparación del drive a tiempo** (`SwingDef.prep`): el IK lleva la pala atrás desde 0,42 s antes con cualquier bola
  (antes solo con las bajas), la pala llega atrás pronto y espera, y va 1,6 veces más atrás que en el clip (detrás de la
  cadera). Luego el golpe hacia delante a su velocidad.
- **El drive y la volea, menos abiertos** (`SwingDef.legs`, `SwingDef.drop`): sus piernas son el 55 % y el 50 % del clip
  (el resto, la postura de espera) y la cadera baja como mucho 9 y 8 cm (el revés, 12). Pies en el drive: 0,76 → 0,61 m.
- **Cierre de postura**: casi parado o plantado para golpear, si los pies quedan más de 16 cm más abiertos que en el
  clip, el que está más lejos da un paso hacia dentro.

**Esperar entre golpes** (`IDLE`)
- **Atento según el juego**: del todo cuando la bola viene, al 70 % cuando su lado golpea después, 90 % restando, 40 %
  sacando, nada con el punto acabado (suavizado 0,35 s).
- **Postura**: atento, la cadera 4 cm más baja, el pecho 6° adelante y la pala arriba delante (el brazo 13° adelante y el
  codo 20° más doblado): pala a 1,05 m (antes 0,94).
- **Vivo**: el peso pasa de un pie al otro (la cadera ±1,6 cm, la pelvis ±2,3° con ella, cada jugador con su ritmo, unos
  2,7 s), respira (el pecho ±0,9° cada 3,6 s), y detrás de la cocina rebota sobre las puntas (1,1 cm, 2,2 por segundo)
  hasta que el rival va a golpear y entra el paso de espera. De pie, cada 1,5–3 s un pie se recoloca 3–6 cm.
- **Entre puntos**: la pala baja, y el peso se mueve más despacio y más amplio.
- Solo de pie: andando despacio no hay postura de espera.

## Resultado

`tools/poses.ts 240`, 8 partidos de 4 minutos, mismas semillas, antes (0.7) → después (mediana / p90 salvo donde se diga):

| Medida | Antes | Después |
|---|---|---|
| Cambios de golpe | 167 de 1.587 golpes | 54 de 1.474 |
| … a menos de 0,45 s del contacto | 61 | 35 |
| Espera congelada (fotogramas) | 23,5 % (309 tramos de más de 0,25 s, hasta 0,63 s) | 2,2 % (12 tramos, hasta 0,47 s) |
| Pala esperando, altura | 0,94 / 0,95 m | 1,05 / 1,11 m |
| Rodillas esperando | 33° / 44° | 43° / 53° |
| Cadera esperando | 0,865 m | 0,838 m |
| Pala corriendo, altura (p90 / máx.) | 1,15 / 1,65 m | 0,99 / 1,61 m |
| Inclinación al arrancar (hacia donde empuja) | −0,3° / 9,3° | 4,5° / 13,7° |
| Inclinación al frenar (hacia atrás) | −1,1° / 12,9° | 1,8° / 17,1° |
| Inclinación en los giros (hacia dentro) | −2,9° / 15,4° | 0,1° / 18,5° |
| Pies en el contacto, drive / volea | 0,76 / 0,77 m | 0,61 / 0,61 m |
| Contacto delante de la cadera, drive (p10 / p50) | 0,29 / 0,37 m | 0,34 / 0,42 m |
| Lo más alto de la pala antes de un drive bajo | 0,99 / 1,15 m | 0,96 / 1,11 m |
| Pie apoyado, en total (p90 / p99) | 0,177 / 1,13 m/s | 0,171 / 1,15 m/s |
| … quieto | 0,076 m/s | 0,083 m/s |
| … arrancando / frenando | 0,29 / 0,72 m/s | 0,35 / 0,79 m/s |
| … de lado / andando | 0,51 / 0,46 m/s | 0,56 / 0,53 m/s |
| … corriendo | 0,85 m/s | 0,76 m/s |
| … en la dejada | 0,20 m/s | 0,12 m/s |
| Saltos de postura (°/s, p90 / p99) | 182 / 726 | 187 / 747 |
| Pala–bola en el contacto (p90 / p99) | 0,3 / 22,8 cm | 0,3 / 23,1 cm |
| … drive / volea (máx.) | 62 / 6 cm | 56 / 7 cm |
| Contacto por detrás de la cadera (sin remates) | 0,5 % | 1,0 % |
| Contacto pegado al cuerpo (< 35 cm) | 2,4 % | 2,2 % |

A velocidad fija (`tools/poses-loco.ts`): pie apoyado p90 0,46 → 0,42 m/s; de lado a 2,5 m/s, 1,05 → 0,27 (a esa
velocidad, con camino por delante, ya corre); arranques y frenadas, máximo 1,35–1,39 → 1,10–1,19 m/s (hacia atrás,
3,98 → 3,86).

**Coste** (`tools/charcost.ts`, un ordenador cargado con capturas en paralelo; lo mejor de 3 pasadas): 54 → 64 µs por
jugador y fotograma de mediana (+10 µs, +18 %). Cada hueso girado se pone al día solo en su cadena y el esqueleto entero
una vez. Con cuatro jugadores en un móvil serán unas décimas de milisegundo más; falta medirlo en uno real.

## Vídeos

En `/tmp/pb-08-movimiento/` (mismos instantes antes y después; en cada vídeo, de izquierda a derecha, la cámara de juego,
la cercana al jugador de abajo y la cercana al rival; antes arriba, después abajo; 30 fps):
- `comparacion-individual.mp4` (y `-lento`, a 0,4×): contra Bruno, la espera al resto, el resto, un peloteo de 12
  golpes y el final del punto (14 s).
- `comparacion-dobles.mp4` (y `-lento`): Marta y tú contra Lola y Bruno, un peloteo de 9 golpes (10,5 s).
- `tiras/`: los momentos clave, antes y después por parejas: `1-espera-al-resto` (pala arriba, postura),
  `2-arranque-y-carrera-lateral` (primer paso, pala llevada), `3-golpe-bajo-preparacion` (menos portero, pala atrás
  antes), `4-rival-corre-a-la-red` (sin agitar la pala), `5-final-del-punto` (pala bajada, peso que se mueve),
  `6-dobles-peloteo`.
- `antes-*/` y `despues-*/`: cada versión sola (`seq.mp4`), sus fotogramas y lo que hacía cada cuerpo en cada fotograma
  (`estado.json`).

## Pendiente

- **Pie apoyado algo más vivo al arrancar, de lado, andando y al frenar** (p90 +0,05–0,07 m/s): el cuerpo se inclina y los pies dan
  más pasos; en algún fotograma suelto, al frenar girando, un pie se posa aún deprisa (máximo 7 m/s en un fotograma, antes
  3,7).
- **Quedan 54 cambios de golpe**: la mayoría al principio del golpe (estirada de revés → drive o dejada, drive →
  estirada) o porque la bola pasa al otro lado. Para quitarlos del todo la IA tendría que decidir el contacto antes
  (`brain.ts`, no tocado). Lo mismo con los golpes que se reajustan sin cambiar de clip (el contacto se mueve unos
  centímetros y el brazo lo sigue).
- **El drive sigue siendo el clip abierto y plano de Meshy** rehecho en código. Un drive de verdad (abajo arriba,
  preparación temprana con giro de hombros, pies a la anchura de los hombros) se vería mejor de cerca. Prompt (382
  caracteres): *"A right-handed pickleball player hits a forehand drive: from a ready stance he turns his shoulders early
  and takes the paddle back behind his right hip at waist height, steps in with the left foot, swings low to high and
  meets the ball in front of the left foot at knee to waist height, follows through over the left shoulder, then
  recovers to ready."* Y la volea de verdad (prompt en `docs/concepto.md`).
- **Los remates y algunas estiradas del humano** siguen a 25–90 cm de la bola en el contacto (como antes; el imán lo tapa).
- **En la cámara de juego, al restar, el jugador de abajo queda en la esquina** de la pantalla (cámara, `view.ts`).
- Medir el coste en un móvil de verdad.
