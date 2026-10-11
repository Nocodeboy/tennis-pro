# Posturas y movimientos de los jugadores 0.10 (11 oct)

Germán, tras jugar la 0.9 (que le parece divertida): «lo único que sigue sin convencerme son algunos movimientos, poses y
formas de los jugadores, que siguen pareciendo extrañas y poco naturales». En sus capturas: un primer plano de televisión
antes de un saque (brazos rígidos, la pala plana a la altura de la tripa, la mano libre abierta), y dos de dobles (la
compañera de blanco con el brazo libre estirado hacia fuera y la pala colgando detrás; el jugador de rojo con la pala
levantada a un lado, rígida; todos muy erguidos).

Esta parte toca el movimiento y las posturas. Las formas (dedos cerrados, cuerpos distintos, variante femenina, público)
las hace otro agente en paralelo. No hay clips nuevos ni captura de movimiento: todo con código. La simulación no cambia
(el bot da exactamente lo mismo: `npx tsx tools/bot.ts 12 1`, misma salida byte a byte).

## Cómo se miró

- **Como lo ve Germán:** la página real, con la cámara de juego del móvil en vertical (390 × 844) y en horizontal, en
  individual y en dobles, y el plano de televisión que encuadra al que saca. Herramientas nuevas: `tools/closeups.py`
  (primeros planos en la página de cada situación: esperando el saque, el saque, esperando en el peloteo, cada golpe
  antes, en y después del contacto; de frente, de tres cuartos, de lado, de espaldas, las manos, y la cámara de juego) y
  `tools/tvserve.py` (el plano de televisión antes de cada saque, a 30 fotogramas por segundo). Las dos versiones, con
  los mismos argumentos, enseñan los mismos instantes.
- **Medido:** `tools/poses.ts 240` (8 partidos de 4 minutos, mismas semillas) con medidas nuevas en
  `tools/posemetrics.js`, y `tools/posecmp.py` para ponerlas antes y después.

## Qué no parecía humano o no parecía pickleball (0.9), de lo que más se ve a lo que menos

| Qué se veía | Cuánto | Causa en el código |
|---|---|---|
| **La espera, como un camarero con una bandeja.** Codos pegados al cuerpo, antebrazos hacia delante, la pala plana a la altura de la tripa, la mano libre abierta al lado, el cuerpo erguido. Es lo que más tiempo está en pantalla | pala plana el 25 % de la espera, su cabeza a 38° sobre la horizontal, cara a 51° de la red; codo 6 cm por detrás del pecho; mano libre a 35 cm de la pala; tronco a 11°, rodillas a 43° | el clip `ready` de Meshy, y el retoque de la 0.8 (`IDLE.paddleUp/armFwd`) que subía la pala doblando el codo y adelantando el brazo, sin girarla: subía la bandeja |
| **Entre puntos, peor:** la pala plana casi siempre | 91 % de los fotogramas | el mismo retoque al revés para «bajar la pala» |
| **El saque (lo que enseña la tele):** la bola en la mano abierta a la altura de la tripa; al preparar el saque, el brazo libre se va hacia fuera con la bola a la altura del hombro (la compañera de blanco de la captura) | mano libre «en ala» en el 44 % de los fotogramas del saque; bola a 0,77 m del suelo, 19 cm delante de la cadera | el clip `serve` lleva la mano libre a un lado; la bola se dibujaba en la muñeca (`ballInHand`) |
| **El brazo libre en los golpes**, hacia fuera del cuerpo | en el 24 % de los fotogramas de golpe (estiradas 71–90 %, revés 24 %, remate 19 %, drive y dejada 8 %); colgando en la dejada | los clips de Meshy |
| **La pala al desplazarse:** de lado, estirada como una bandeja y la mano libre en la cadera; andando, la mano libre colgando y abierta; corriendo, la pala por encima de la cabeza o, con el arreglo de la 0.8, levantada al lado del hombro (el de rojo de la captura) | pala al moverse hasta 1,6 m | `shuffle_v2`, `walk`, `run_v2`, y `CARRY` (llevar el brazo un 55–70 % hacia una espera que ya estaba mal) |
| **Los golpes:** el drive termina bajo y cruzado a la cadera, no alto sobre el hombro contrario; la volea era el drive a medio recorrido (gira el tronco, la pala atrás); la cara de la pala casi de canto en el contacto | final del drive 11 cm por debajo del pecho; cara a 68° de donde va la bola (drive 80°, remate 79°) | el clip `drive` (plano, a la altura del pecho, Meshy); la volea usaba el mismo clip (`CLIP_FILES.volley = 'drive'`, `scale 0.5`); el IK apunta el mango de la pala a la bola pero no gira su cara |
| **Transiciones:** de la espera al descanso (y al revés, justo cuando la tele enseña a los jugadores antes del saque) la mezcla pasaba por la pala plana; al mezclar lateral, andar y correr la pala se ponía de lado | — | mezclas de clips con la pala en posiciones muy distintas (cabeza arriba / cabeza abajo; cara a la red / de canto) |

Lo que **no** era un problema: los pies (no patinan: 0,15 m/s p90, como antes), la pala llegando a la bola (0,3 cm p90) y
los saltos de postura (iguales o menores).

## Qué cambia

### Poses clave hechas por código y horneadas en los clips al cargar (`src/render/keyposes.ts`, nuevo)

Al cargar el modelo, una copia del esqueleto se pone en cada fotograma de los clips y se recoloca con objetivos en el
marco del cuerpo: dónde va la muñeca de la pala y hacia dónde mira la pala (su cabeza y su cara), dónde va la palma libre,
dónde quedan los pies. Brazos y piernas se colocan con un IK anatómico: el codo y la rodilla solo se doblan sobre su
bisagra (medida en los clips), el antebrazo gira (pronación) y la muñeca se queda dentro de sus límites. El resultado se
escribe otra vez como clip, y todo lo demás (el IK del golpe que lleva la pala a la bola, las mezclas, los pies) funciona
sobre esos clips como antes, sin coste por fotograma.

**La espera de pickleball** (sustituye al clip `ready`, sobre sus propios pies y su balanceo):
- Rodillas dobladas, cadera 5,5 cm más baja y 4,5 cm más atrás, la pelvis y la espalda adelantadas (tronco a 15° en el
  clip, unos 24° con el «atento» del juego), la cabeza levantada. Los pies donde estaban, 3 cm más juntos.
- La pala delante del pecho: la muñeca delante del ombligo, el codo doblado (~60°) y por delante del cuerpo, la cabeza de
  la pala hacia arriba (unos 50°) y la cara mirando a la red. La mano libre en el cuello de la pala, con la palma hacia
  dentro (las manos de los clips iban con la palma hacia arriba, como pidiendo).
- Más agachado en la línea de cocina que en el fondo (`IDLE.lowDeep`).

**Entre puntos** (`rest`, nuevo): de pie, la pala floja delante de la cintura, la cabeza hacia delante y arriba y el canto
a la red, la mano libre en su borde, los codos junto al cuerpo. Pasar de la espera al descanso gira la pala sobre sí misma y
la baja: ya no pasa por plana.

**El que va a sacar** (`serveset`, nuevo): la bola en la palma delante del cuerpo, a la altura de la cintura, el brazo
libre doblado; la pala abajo junto a la pierna derecha, con la cara a la red. El saque sale de ahí: la pala va atrás desde
esa postura hacia el golpe del clip, y la bola sigue en la mano delante del cuerpo hasta que se suelta (0,35 s antes del
contacto); después el brazo libre se queda delante y se recoge (el clip lo llevaba hacia fuera). La bola se dibuja en la
palma, no en la muñeca (`ballInHand`).

**El brazo libre en cada golpe** (claves en el marco del pecho, nunca estirado del todo):
- Derecha (drive): señala la bola mientras la pala va atrás y se recoge hacia el costado izquierdo en el contacto.
- Revés: acompaña la pala atrás en su cuello y se suelta hacia atrás para equilibrar.
- Dejada: delante a la izquierda, a la altura de la cintura. Remate: apunta a la bola y baja al pecho. Estiradas: atrás y
  afuera, con el codo doblado. Volea: junto al pecho.

**Los golpes:**
- **Drive con final alto:** después del contacto la pala sube y cruza hasta encima del hombro izquierdo (la cara de la
  pala termina 23 cm por encima del pecho; antes, 11 cm por debajo).
- **Volea propia** (antes era el drive a medio recorrido): desde la guardia, preparación corta (7 cm), empujón corto hacia
  delante con la cara a la red y el codo sin bloquear, se sostiene un momento y vuelve a la guardia. Las piernas, las de
  la espera. Sirve de bloqueo.
- **La cara de la pala en el contacto:** alrededor del contacto, el antebrazo y la muñeca giran la pala sobre su eje para
  que la cara mire hacia delante: abierta en la dejada, algo en drives y voleas, cerrada en el remate. No en las estiradas
  (a toda extensión, la pala alineada con el brazo es la que más llega; girada fallaba la bola por 10–30 cm) ni en el
  saque (su pala apunta hacia delante en el contacto, con la cabeza por debajo de la muñeca como manda el reglamento, y
  ningún giro sobre sí misma le pone la cara de frente). Se probó a girarla en tiempo de juego: daba tirones de la mano
  (p99 de 631 a 2.167 °/s); horneada en el clip es suave.
- **Saque por abajo:** ya lo era: contacto a 0,70 m, la cabeza de la pala 14 cm por debajo de la muñeca.

**Al desplazarse:** el lateral, andar y la carrera hacia atrás llevan la pala arriba delante como la espera (un poco más
baja, la mano libre algo separada). Corriendo, la pala por delante a la cintura con la cabeza hacia delante y arriba y la
cara a la red, con el braceo del clip pero corto (40 %). Todas con la cara a la red: mezcladas entre sí, la pala ya no
se pone de lado.

### En el juego (`src/render/chars.ts`)

- Tres bucles de pie mezclados: espera, descanso entre puntos (con el punto acabado, en 0,8 s) y el que saca antes de su
  preparación (en 0,3 s). La vida de la espera (peso de un pie al otro, respiración, rebote, recolocar un pie) se aplica a
  los tres.
- Fuera el retoque del brazo de la espera (`IDLE.paddleUp/armFwd`): la postura ya viene hecha. El «atento» adelanta menos
  el pecho (0,05 rad, antes 0,1) porque la espera ya está adelantada, y baja la cadera 3,5 cm en la línea de cocina y una
  cuarta parte de eso en el fondo.
- `CARRY` solo entre puntos (andando de vuelta, la pala floja como en el descanso): al moverse en juego, los bucles ya
  llevan la pala como deben.
- La volea usa su propio clip entero (`scale`, `upper` y `legs` fuera).
- Un golpe empezado se considera «aún quieto» según su propio recorrido (la volea corta, que mueve poco la pala, cambiaba
  de golpe a mitad: 3 → 12 veces; ahora 6).

## Resultado

`tools/poses.ts 240`, 8 partidos de 4 minutos, mismas semillas (CPU contra CPU, humano simulado y dobles), antes (0.9) →
después; mediana / p90 salvo donde se diga. Espera: de pie sin golpe ni reacción, con la bola en juego o esperando el
saque. Entre puntos: de pie con el punto acabado.

| Medida | Antes | Después |
|---|---|---|
| Pala plana (la cara a menos de 35° de mirar arriba), en la espera | 24,6 % | 5,0 % |
| … entre puntos | 90,8 % | 4,8 % |
| Cabeza de la pala sobre la horizontal, en la espera | 38° / 45° | 48° / 50° |
| Cara de la pala frente a la red, en la espera (0° = de frente) | 51° / 65° | 42° / 59° |
| Centro de la cara de la pala respecto al hueso del pecho, en la espera | −16 / −10 cm | −8 / −7 cm |
| Codo de la pala por delante del pecho, en la espera | −6 / −5 cm | +5 / +6 cm |
| Mano libre al cuello de la pala, en la espera | 35 / 39 cm | 9,5 / 13 cm |
| … entre puntos | 23 / 31 cm | 12 / 13 cm |
| Rodillas en la espera, en la cocina / en el fondo | 43° / 43° | 61° / 53° |
| Tronco desde la vertical, en la espera | 11° / 15° | 24° / 28° |
| Cadera detrás de los pies, en la espera | −3 / 0 cm | +1,5 / +5,6 cm |
| Bola en la mano antes del saque: altura / delante de la cadera | 0,77 / 0,20 m | 0,98 / 0,32 m |
| Pala del que va a sacar, altura | 0,95 m | 0,66 m (abajo, junto a la pierna) |
| Brazo libre «en ala» (la palma a más de 38 cm hacia el lado del pecho, no delante), en los golpes | 24,3 % | 0,0 % |
| … en el saque / estiradas / revés / remate | 43,8 / 71–90 / 23,7 / 19,0 % | 0 / 0 / 0 / 0 % |
| Brazo libre estirado (codo a menos de 15°) | 0,0 % | 0,0 % |
| Final del drive: lo más alto de la pala respecto al pecho en los 0,4 s siguientes | −11 / −8 cm | +23 / +25 cm |
| Cara de la pala frente a la salida de la bola en el contacto (0° = de cara) | 68° / 87° | 62° / 82° |
| … drive / remate / dejada | 80° / 79° / 41° | 65° / 55° / 38° |
| Pala por delante de la muñeca en el contacto, dejada / volea | 26 / 27 cm | 25 / 26 cm (igual) |
| Saque: altura del contacto / cabeza de la pala bajo la muñeca | 0,70 m / 14 cm | igual |
| Pala–bola en el contacto (p50 / p90 / p99) | 0,2 / 0,4 / 29 cm | 0,2 / 0,3 / 31 cm |
| … volea (p99) | 5,6 cm | 0,4 cm |
| Saltos de postura (°/s, p90 / p99) | 183 / 751 | 163 / 651 |
| … la mano de la pala (p99) | 631 | 225 |
| … en el saque / la volea / de lado (p99) | 1.338 / 708 / 914 | 867 / 566 / 725 |
| Pie apoyado deslizando (p90, m/s) | 0,16 | 0,15 |
| Cambios de golpe a mitad (los que se ven) | 63 (52) | 64 (52) |
| Espera congelada | 2,2 % | 2,5 % |
| Muñeca de la pala doblada (respecto a la del esqueleto en reposo), en todo / en los golpes | 0° / 11° (p50) | 47° / 30° (p50); p90 57°, el tope es 60° |

La muñeca sube porque la espera, con este agarre, pide la muñeca montada: sostener la pala con la cabeza arriba y la cara
a la red sale a unos 45–55° de la mano del esqueleto en reposo (se buscó el codo que menos la doblara y no baja). En las
capturas de cerca no se ve forzada. La pala al moverse va más alta (mediana 1,07 m, antes 0,84): es la guardia delante del
cuerpo, no por encima de la cabeza (máximo igual, 1,6 m).

## Coste

- **Por jugador y fotograma** (`tools/charcost.ts 60`, alternando versiones, con la máquina ocupada): p50 66–68 → 61–62 µs,
  p90 128–130 → 114–117 µs. Baja un poco: ya no hay que mezclar el brazo hacia la espera al moverse ni retocarlo al
  esperar.
- **Al cargar:** hornear las poses cuesta unos 50 ms con el código ya compilado por el navegador y 150–270 ms la primera
  vez en este ordenador (casi todo es calentamiento del JIT; la carga entera era de unos 200 ms). En un móvil puede ser
  medio segundo más de pantalla de carga. Si molesta, se pueden guardar los clips horneados como archivos (pero habría que
  regenerarlos si cambia el modelo).
- Nada de memoria de GPU ni llamadas de dibujo: solo clips.

## Para el otro agente (formas: dedos, cuerpos, variante femenina)

- `keyposes.ts` trabaja sobre el esqueleto de la plantilla (`gltf.scene`) al cargar, antes de medir contactos y pasos.
  Si la carga del modelo cambia, la llamada `refineClips(...)` de `loadCharAssets` debe seguir justo antes de
  `findContact`/`gaitOf`.
- Las bisagras del codo y la rodilla son constantes del esqueleto (`HINGES`, medidas con `hingesOf`, que se queda para las
  herramientas). Si cambia el esqueleto (otro rig), hay que volver a medirlas.
- Escalar huesos por jugador después de cargar no rompe nada: los clips guardan giros. Con brazos más largos o más cortos
  la pala queda algo más lejos o más cerca del pecho; el IK del golpe mide sus longitudes en cada fotograma.
- La mano libre: la palma es el eje −x de su hueso; la bola del saque se dibuja 7,5 cm más allá de la muñeca y 4,5 cm por
  encima. Con los dedos cerrados sobre el mango y entreabiertos en la mano libre, la espera y la bola en la mano se verán
  todavía mejor (las manos abiertas eran parte de lo que veía Germán).
- El agarre de la pala (`PADDLE_POSE`) no cambia.

## Archivos

- **Nuevos:** `src/render/keyposes.ts` (las poses clave), `tools/closeups.py`, `tools/tvserve.py`, `tools/posecmp.py`.
- **Cambiados:** `src/render/chars.ts` (la llamada a `refineClips`, los bucles de pie, `IDLE`, `CARRY`, `ballInHand`,
  la volea, la quietud de un golpe empezado), `tools/posemetrics.js` (medidas de la espera, entre puntos, el que saca,
  el brazo libre, la cara de la pala, el final del drive, la pala por delante de la muñeca), `tools/poses.ts` (las
  imprime; `HITS=1` guarda cada contacto).

## Vídeos y capturas

En `/tmp/pb-10-posturas/` (antes y después en los mismos instantes, misma semilla; ver el `LEEME.txt` de la carpeta):
- `tiras/primeros-planos-frente/todo.png`: cada situación de frente, como la tele (esperando el saque, preparándolo,
  desplazándose, dejada, volea, derecha, revés, remate, estirada), antes a la izquierda y después a la derecha; también
  `primeros-planos-lado/`, `camara-de-juego-vertical/`, `camara-de-juego-horizontal/`, `dobles-frente/` y
  `dobles-camara-de-juego/`.
- `tv-antes-del-saque-individual.mp4` y `-dobles.mp4` (y `-lento`): el plano de televisión antes de cada saque, como la
  captura de Germán (antes arriba, después abajo); `tiras/tv-teleobjetivo-*.png`, el teleobjetivo sobre el que saca,
  ampliado.
- `comparacion-individual.mp4` y `comparacion-dobles.mp4` (y `-lento`, a 0,4×): cámara de juego del móvil en vertical,
  cerca del jugador de abajo y cerca del rival; antes arriba, después abajo (10 y 9 s de partido). `tiras/video-*.png`,
  los mismos fotograma a fotograma cada 0,1 s.
- `antes/`, `despues/`: cada versión sola y la captura de Germán.

Se sacan con `tools/closeups.py` + `tools/cmpsheet.py`, `tools/tvserve.py` y `tools/seq.py` sobre las dos compilaciones.

## Pendiente

- **La cara de la pala en la volea, el revés y el saque** sigue casi como antes (65–70° de la salida de la bola): en la
  volea y el revés el IK del golpe la gira al llevarla a la bola; en el saque la pala del clip apunta hacia delante.
  Un saque y una volea de verdad (clips) lo arreglarían de raíz; prompts en `docs/concepto.md` y en las notas de la 0.8.
- **Muñeca montada en la espera** (mediana 47° respecto al esqueleto en reposo): se ve bien de cerca, pero con otro
  agarre (`PADDLE_POSE`) la pala saldría con la muñeca más recta. Cambiar el agarre mueve todos los golpes: aparte.
- **Medio segundo más de carga en móvil**, por medir en uno de verdad (ver Coste).
- **La pala al moverse va más alta** que antes (es la guardia); si en la cámara de juego se ve demasiado, se baja en
  `GUARD_MOVE`.
- Los clips que siguen siendo de Meshy sin rehacer (lamento, celebración) no se han tocado.
