# Formas de los jugadores 0.10 (11 oct): manos, cuerpos y público

Germán, tras jugar la 0.9: «lo único que sigue sin convencerme son algunos movimientos, poses y formas de los jugadores, que siguen pareciendo extrañas y poco naturales». Esta parte toca solo las **formas**: las manos, el cuerpo de cada jugador, una variante de mujer y el público. Los movimientos y las posturas (espera, brazo libre, golpes) son de H1. Todo con código: sin clips, sin modelos nuevos y sin créditos de Magnific.

## Qué se veía raro

1. **La mano libre, abierta como una garra** (dedos estirados y separados). Se ve en el primer plano de la tele antes del saque (la captura de Germán).
2. **La pala atravesaba una mano plana.** El mango entraba por el centro de la palma y salía entre el pulgar y el índice, con los cuatro dedos rectos.
3. **Todos con el mismo cuerpo exacto:** 1,78 m, los mismos hombros, el mismo pecho y los mismos brazos.
4. **El público: filas del mismo hombre** en la misma postura (las manos en las rodillas). En el plano de la tele antes del saque, la grada sale nítida justo detrás del jugador y se nota que todos son iguales.
5. **Lola, Nuria, Reina y Marta tienen el mismo cuerpo de hombre** (ver más abajo: esto sigue igual).

## Qué cambia

### Las manos (nuevo `src/render/body.ts`)

El modelo no tiene huesos en los dedos: cada mano es una pieza rígida pegada al hueso de la mano. Los dedos se doblan en la malla al cargar el modelo, sin huesos nuevos:

- **Cada dedo se dobla por tres sitios**: el nudillo y las dos articulaciones del dedo, colocadas a lo largo de cada dedo como en una mano real. Medí en el modelo dónde está cada dedo, de nudillo a punta.
- **Cada vértice sigue a los dedos que tiene cerca.** La piel entre dos dedos se reparte entre los dos, así que no se rasga. El pulgar va aparte.
- **El giro de cada articulación pasa un poco hacia la palma.** Así la piel del interior del pliegue apenas se pliega, y la de fuera se estira sobre el nudillo, como en una mano de verdad.
- **Mano de la pala: un puño alrededor del mango.**
  - El índice envuelve el mango por debajo y el corazón, el anular y el meñique se cierran cada vez más.
  - El pulgar pasa por encima.
  - La piel que aún quedaba dentro del mango se empuja hasta su superficie, y el empuje se reparte por la piel de alrededor.
  - El mango es el de `gear.ts`, donde lo pone `PADDLE_POSE`. Comprobado en primeros planos: los dedos lo rodean y no lo atraviesan.
- **Mano libre: medio cerrada y relajada.**
  - Los dedos van algo juntos y cada uno un poco más doblado que el anterior (el meñique, el que más).
  - El pulgar se queda como venía en el modelo: doblarlo rasgaba la piel entre el pulgar y la palma.
- **Normales:** las del modelo, giradas con cada dedo, y corregidas donde la piel se dobla. Se conservan las normales suaves del modelo.
- **Quedan unos pocos triángulos plegados.** En la mano de la pala son 27 (dentro del puño y bajo el mango). En la mano libre, 7 pequeños, en la palma. No se ven en los primeros planos.
- **El mango, en el modelo de 1,7 m, sale de la palma inclinado unos 34° hacia el pulgar.** En un agarre real iría más tumbado sobre la palma. No toqué `PADDLE_POSE`: cambiaría el ángulo de la cara de la pala en todos los golpes (ver «Para H1»).

### El cuerpo de cada jugador

Cada uno tiene su altura y su complexión. Antes, todos medían 1,78 m y eran iguales:

| Jugador | Altura | Complexión |
|---|---|---|
| Tú | 1,80 | hombros y pecho +2 %, brazos +3 % |
| Paco | 1,74 | barriga (cintura +12 %), cadera +5 %, cuello +6 %, hombros −2 % |
| Bruno | 1,87 | ancho: hombros y pecho +6 %, brazos +10 %, piernas +6 %, cuello +8 % |
| Lola | 1,75 | fibrosa: hombros −3 %, pecho −4 %, brazos −6 %, piernas −4 % |
| Nuria | 1,78 | algo más fina de cintura y brazos |
| Reina | 1,83 | atlética: hombros +3 %, brazos +4 %, cintura −3 % |
| Marta | 1,76 | hombros −2 %, cintura y cadera +3 % |

**Cómo se hace** (todo en el esqueleto de cada jugador; la malla es la misma para todos):

- **Altura:** la escala del modelo que ya tenía `CharacterView`. Todo lo que hay allí ya escala con ella: los pasos, el alcance y el contacto.
- **Hombros y cadera:** los brazos y las piernas cuelgan más hacia fuera o más hacia dentro. Solo de lado; ningún hueso se alarga ni se acorta.
- **Grosor** del pecho, la cintura, la cadera, los brazos, las piernas y el cuello: una escala de través en la piel de cada hueso. Engorda o adelgaza esa parte sin mover nada de lo que cuelga de ella, como la mano o la pala.

**Medido con `tools/poses.ts`.** Cinco partidos de 90 s (3 de CPU contra CPU y 2 de dobles), 27 000 fotogramas, con las complexiones (`CHARS=./chars-bodies.ts`) y sin ellas:

| | Sin complexiones | Con complexiones |
|---|---|---|
| Pala–bola en el contacto (p50 / p99 / máx.) | 0,2 cm / 24,6 cm / 26,8 cm | 0,2 cm / 21,6 cm / 29,8 cm (un remate) |
| Pie apoyado que patina (p50 / p99 / máx.) | 0,003 / 1,13 / 2,78 m/s | 0,003 / 1,14 / 4,20 m/s (un fotograma) |
| Pie separado del suelo (p50 / p99) | 3 / 86 mm | 4 / 85 mm |
| Codo, muñeca y espalda | — | igual (±0,5°) |
| Golpes empezados y cambios de golpe | 359 y 15 | 359 y 15 |
| Contacto pegado al cuerpo y por detrás de la cadera | 1,9 % y 0,7 % | 1,9 % y 0,7 % |

- **Los remates siguen siendo el peor caso**, como antes (bolas a 2,7 m). El más bajo (Paco, 1,74) llega algo peor y el más alto, mejor.
- **Probé también alturas de 1,64–1,70 para las mujeres** (ver abajo): ahí el peor remate se iba a 42 cm. Por eso ningún jugador baja de 1,74.

### La variante de mujer: probada y no activada

Hice un cuerpo de mujer con el mismo modelo, todo en código. Lo probé con Lola, Nuria, Reina y Marta:

- busto bajo la camiseta;
- mandíbula y barbilla más estrechas, nariz más fina, ceja menos marcada;
- el tupé aplastado (pelo recogido);
- hombros más estrechos, cintura, más cadera, brazos y cuello finos, manos más pequeñas;
- coleta que cuelga de la cabeza hacia la espalda;
- otra opción: media melena hasta la mandíbula;
- visera blanca;
- pantalón corto ajustado con el muslo al aire;
- en la pintura de la equipación: cejas finas en arco, labios y mejillas con algo de color, sin patillas y el pelo peinado hacia atrás.

**No la activo porque no pasa el criterio.** En la cámara de juego y en los planos de televisión (el de antes del saque y los rótulos de la presentación) se sigue leyendo como un hombre disfrazado:

- **La cara** es la de un hombre: la estructura y las sombras de la textura de la IA, aunque cambien las cejas y los labios.
- **Las rodillas y los gemelos** son de hombre, y con el pantalón corto se notan más.
- **Las proporciones**, sin esa cara ni esas piernas, solo dan un hombre delgado.

Las capturas están en `/tmp/pb-10-formas/mujer-descartada/`. **Hace falta un modelo de mujer hecho con IA** con el mismo esqueleto de Meshy de 24 huesos, para que sirvan los clips. Según la ficha, un modelo cuesta unos 1.000 créditos.

**El código se queda:**
- lo usa el público (abajo);
- un jugador lo usa si su complexión lleva `woman: true`;
- la coleta, la visera y la melena son piezas opcionales, cada una en sus huesos, que se pueden poner a cualquier jugador.

Con un modelo de mujer de verdad, la coleta y la visera servirían igual.

### El público (`src/render/crowd.ts`)

- **Dos cuerpos en el atlas: el hombre y la mujer** (con la media melena y el cuerpo de mujer de arriba).
  - Un 46 % del público son mujeres, algo más bajas y con su propia gama de pelo (más rubias y castañas) y de ropa.
  - Entre el personal de pista, un tercio de los oficiales son mujeres y casi todos los cámaras, hombres.
  - A la distancia del público, la melena y los hombros estrechos sí se leen como de mujer.
- **Una postura más: sentado con los brazos cruzados.** La tiene un 22 % del público, que además no gira la cabeza con la bola.
  - Las filas ya no son todas «manos en las rodillas».
  - Las manos del público son las nuevas: puño en la derecha y relajada la izquierda.
- **Desenfocado en los planos de televisión.**
  - Cada espectador se dibuja desde un nivel de mip del atlas más pequeño: hasta 2,4 niveles (un quinto del tamaño) en el plano del sacador, en las reacciones y en la vuelta de la victoria, y 1,4 niveles en la presentación, el acercamiento al saque y las repeticiones.
  - Se ve la forma y el color de cada uno, pero no la cara, como con un teleobjetivo.
  - Entra de golpe con el corte de plano y vuelve a enfocarse poco a poco al volver al juego.
  - En la cámara de juego no cambia nada.
  - No cuesta nada: es el mismo dibujo, con otra lectura del atlas.
- **Igual que antes:**
  - una sola llamada de dibujo para todo el público;
  - dos triángulos por persona;
  - las cabezas siguen la bola;
  - se levantan, aplauden y hacen fotos con flash.

## Coste

**Llamadas de dibujo y triángulos: igual.** Medido con `renderer.info` en el mismo fotograma de un peloteo, vertical 390 × 844:

| | Antes | Después |
|---|---|---|
| Individual, medio | 38 llamadas, 113.218 triángulos | 38, 113.218 |
| Individual, alto | 52, 113.232 | 52, 113.232 |
| Dobles, alto | 69, 187.128 | 69, 187.128 |

**Memoria de GPU:**
- **Atlas del público:** de 896 × 1232 a 1408 × 1242, dos texturas con mipmaps. Pasa de 11,2 a 17,8 MB en alto y medio (+6,6 MB) y de 2,8 a 4,5 MB en bajo (+1,7 MB). Son dos cuerpos y una postura más (de 56 a 132 viñetas), con viñetas algo más pequeñas (88 × 138 px, antes 112 × 176).
- **La malla original del modelo** queda en la GPU para el pintor de equipaciones: +0,65 MB. El pintor mide el cuerpo con las manos abiertas: con las de ahora, la muñequera se podía pintar en la punta de los dedos.
- **La malla de mujer** solo está en la GPU mientras se hornea el público y luego se libera.

**Memoria de la CPU:** la malla original (0,65 MB) y la de mujer (0,9 MB).

**Tiempo de carga** (en este servidor de 2 núcleos ocupado; en un móvil, calculo de 2 a 3 veces más):
- doblar los dedos de las dos manos: unos 20 ms;
- hacer la malla de mujer: unos 30 ms;
- hornear el público: dibuja 264 viñetas en lugar de 112 (2,4 veces más). En el renderizado por software pasa de unos 3–15 s a unos 10–18 s, pero ese tiempo no sirve para medir; en una GPU real deberían ser decenas de milisegundos;
- todo dentro de la pantalla de carga.

**Peso:**
- `dist/index.html` pasa de 1.084.547 a 1.105.904 bytes: +21 KB, +8,5 KB con gzip.
- No hay ningún asset nuevo: `hero.json` no cambia.

**Créditos de Magnific:** 0.

**De paso, se arregla una pequeña fuga:** cada vez que se volvía a hornear el público (al bajar a calidad baja) se perdía la textura de huesos del modelo que se usaba para hornearlo.

## Para H1 (movimiento y posturas)

- **La altura es por jugador:** sale de `kit.body.height` y `view.ts` se la pasa a `CharacterView`. Va de 1,74 a 1,87 m. Tu código ya escala con `this.height`; las herramientas que crean `CharacterView` sin complexión siguen a 1,78.
- **Los hombros cambian por jugador:**
  - `applyBuild` mueve de lado la posición local de `LeftArm` y `RightArm` en su hombro, entre −3 % y +6 % de la clavícula (unos ±1 cm).
  - La cadera (`LeftUpLeg` y `RightUpLeg`) no la cambia ningún jugador ahora mismo.
  - Ningún hueso cambia de largo.
- **El grosor no toca los huesos:** va en las matrices inversas de enlace de la piel, y cada jugador tiene su copia. La IK, los pies y la pala no lo notan.
- **Las manos son solo malla,** sin huesos nuevos. `RightHand` y `LeftHand` son los mismos.
- **Si cambias `PADDLE_POSE`:**
  - el empuje del mango sigue el nuevo sitio solo (lo lee al cargar);
  - pero los ángulos de los dedos de `GRIP` en `body.ts` están ajustados para el mango de ahora, y habría que mirarlos con `python3 tools/forms.py <dist> <out> hands`;
  - un agarre con el mango más tumbado sobre la palma permitiría cerrar mejor los dedos.
- **`tools/poses.ts` con las complexiones:** `CHARS=./chars-bodies.ts npx tsx tools/poses.ts 90` reparte las complexiones reales entre los personajes. Lo usé para la tabla de arriba.

## Archivos

- **Nuevos:**
  - `src/render/body.ts`: las manos, las complexiones y el cuerpo de mujer.
  - `tools/forms.py`: primeros planos de cada jugador (de frente, cerca, la cara y de espaldas), las dos manos de dos jugadores, la presentación y el plano de saque de la tele, la grada, la cámara de juego y los dobles.
  - `tools/chars-bodies.ts`: las complexiones para `tools/poses.ts`.
- **Cambiados:**
  - `src/render/chars.ts`, lo mínimo:
    - el tipo `Kit.body` y `CharAssets.rest` y `woman`;
    - en `loadCharAssets`, doblar los dedos y hacer la malla de mujer;
    - en el constructor de `CharacterView`, qué malla usar y `applyBuild`.

    La animación, la IK y las posturas no cambian.
  - `src/render/view.ts`, tres líneas:
    - el pintor de equipaciones mide sobre la malla original;
    - la altura de cada jugador;
    - el desenfoque de la grada según el plano de la tele.
  - `src/render/crowd.ts`: los dos cuerpos, los brazos cruzados y el desenfoque.
  - `src/kits.ts`: las complexiones.
  - `src/render/outfit.ts`: la cara, el pelo y el pantalón de mujer. Solo actúan con `Outfit.woman`, que ahora no usa nadie.

## Riesgos al fusionar

- **`chars.ts`:** mis cambios son pocos y están fuera de la animación (cabecera, interfaces, `loadCharAssets` y las dos primeras líneas del constructor). Si H1 reescribe el constructor, hay que conservar las dos líneas del principio: qué malla clona y `applyBuild`.
- **`view.ts`:** líneas sueltas en `load`, `setMatch` y `frame`.
- **`tools/poses.ts`** no lo toqué.

## Pendiente

- **Las mujeres siguen con el cuerpo de hombre.** Hace falta un modelo de mujer hecho con IA, con el mismo esqueleto; ver arriba.
- **Medir en un móvil real** el tiempo de carga (dedos, malla de mujer y horneado del público, que ahora es 2,4 veces más largo) y los 6,6 MB más del atlas en medio.
- **El agarre podría ser mejor** con el mango más tumbado sobre la palma (`PADDLE_POSE`, de H1).
- **Más variedad en el público,** si hace falta: otra postura sentada, gorras con forma o un tercer cuerpo (más grueso). Cada cuerpo más son unos +5–6 MB de atlas.
- **El pulgar de la mano libre** se queda como venía, algo estirado.

## Capturas

En `/tmp/pb-10-formas/`:
- **Comparaciones:**
  - `comparar-manos.png`: las dos manos de Tú y de Lola, desde la palma, el dorso y el lado del pulgar;
  - `comparar-jugadores.png` y `comparar-jugadores-cerca.png`;
  - `comparar-tv.png`: el plano de antes del saque, como el de Germán, y la presentación;
  - `comparar-publico.png`;
  - `comparar-juego.png`: el móvil en vertical, individual y dobles.
- **Las sueltas:** en `antes/` y `despues/`.
- **La variante de mujer descartada:** en `mujer-descartada/`, con su `montaje.png`.
