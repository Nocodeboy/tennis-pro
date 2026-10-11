# Animación del pádel 0.2 (12 oct): los clips de captura del pickleball

Notas del agente de animación. Trae al pádel las animaciones de captura de movimiento del pickleball 0.12 (`Nocodeboy/Pickleball@cc00ccb`: `docs/notas-10-blender.md`, `notas-11-golpes.md`, `notas-12.md`, `art/blender/README.md`) y las mejoras de animación de la 0.11. El esqueleto es el mismo (`assets/chars/hero.json` es idéntico byte a byte en los dos repositorios), así que los clips se copian tal cual. Solo cambia la vista: la simulación no se toca.

«Antes» es el pádel 0.1 (`365d639`, clips de Meshy). Todo se midió con las mismas semillas.

## Qué cambia

| Clip | Antes (Meshy) | Ahora |
|---|---|---|
| **Correr** (`run`) | `run_v2` | `run_mocap`: la carrera 09_01 de CMU, más erguida y con la zancada de un corredor |
| **Andar** (`walk`) | `walk` | `walk_mocap` (CMU 35_01) |
| **Celebración** (`cheer`) | `cheer` | `cheer_mocap` (CMU 79_69): brazos arriba en V y manos a la cintura |
| **Lamento** (`lost`) | `lost` | `lost_mocap` (CMU 79_74): brazos abiertos, manos a la cabeza, se dobla |
| **Derecha** (`drive`) | `drive` | `drive_mocap` (pack de tenis de Rokoko), más compacta que la de tenis |
| **Remate, bandeja y víbora** | `smash` | `smash_mocap` (Rokoko), con salto propio y cada uno con su estilo |
| **Revés** | Meshy a una mano | **sin cambios.** El revés de pádel es a una mano y el de captura es un revés de tenis a dos manos |

- **Siguen siendo de Meshy:** volea, chiquita, estiradas y saque (no hay captura de esos golpes).
- **El brazo libre** de la derecha y del remate es el del tenista: `keyposes.ts` ya no se lo recoloca, ni le pone el final alto a la derecha. Solo gira la cara de la pala en el contacto de cada clip (`MOCAP_CONTACT`).
- **`?mocap=off`** en la URL vuelve a todos los clips de Meshy, para comparar.
- **Cómo se hace:** `MOCAP_FILES` y la tabla `MOCAP` de `chars.ts` (tiempos de contacto, `lead`, `lift`, salto), copiadas del pickleball 0.12 sin el revés.

### Derecha: de tenis, pero compacta
- **El clip** gira los hombros, lleva la pala atrás pronto y alta («pala alta», como se enseña en pádel), golpea delante de la cadera y termina sobre el hombro izquierdo.
- **Más corta que la del tenista:**
  - empieza 0,42 s antes del contacto (`lead`). En el pickleball eran 0,5 s; el clip entero son 0,63 s;
  - la pala va un 20 % menos atrás (`prep.back` 0,8).
  - La pala atrás queda a 1,39 m de alto (1,50 m con el clip tal cual). En las capturas, la preparación queda más cerca del cuerpo y el golpe es el mismo.
- **La cara de la pala llega más de cara a la bola:** 60° de mediana, antes 70°.

### Remate, bandeja y víbora sobre el remate de captura

**El problema:** la simulación golpea casi todos los remates a 2,85 m (mediana; como mucho 2,90).
- En este esqueleto, el brazo con la pala llega 0,77 m desde el hombro.
- De pie, la pala del remate de captura llega a 2,0 m.
- Para tocar una bola a 2,85 m, el cuerpo tiene que subir unos 0,7 m.

**Remate:** el del pickleball con más salto.
- El salto empieza con la bola a 2,0 m (`jumpFrom`) y sube hasta 0,72 m (`jumpMax`; en el pickleball, 0,62, porque allí las bolas iban a 2,75 m como mucho).
- Tiene el tiempo de vuelo de un salto de esa altura (el `SMASH_JUMP` de la 0.11).
- Con la bola por encima del alcance, el cuerpo se mete debajo: la cadera queda a 8 cm de la bola en horizontal como mucho (`OVER.under`), y el brazo sube recto a por ella.
- Se ve igual que en el pickleball: de lado bajo la bola señalándola con la mano libre, salto, tijera y la pala que baja cruzando el cuerpo.

**Bandeja y víbora:** también sobre el clip de captura. Se probó dejarlas en el remate de Meshy y se descartó, porque ese golpea por detrás de la cabeza, con la espalda arqueada (contacto 33 cm por detrás de la cadera). Lo que las distingue del remate:
- **Las piernas:** recogidas, sin tijera. Del clip solo llevan la mitad de las piernas (`OVER.legs` 0,5), y el resto es la postura de espera. Se ve un saltito con los dos pies.
- **El salto:** como mucho 0,58 m (`skip` en `MOCAP.smash`; con `?mocap=off`, los 0,5 m de antes en `OVER.skip`), un 20 % menos que el remate.
- **El cuerpo:** de lado (el hombro izquierdo hacia la red).
- **El final:** la pala va adelante y cruzada a la izquierda, a la altura del hombro, con la cara abierta. Las tablas `OVER.bandeja` y `OVER.vibora` no cambian.

**«Casi sin salto»** no se puede hacer con bolas a 2,85 m: con 0,3 m de salto, la pala se quedaría a unos 40 cm de la bola. Ver «Pendiente».

**El golpe solo se sabe en el contacto** (lo decide la IA o el dedo al soltar). Por eso la preparación es la misma para los tres:
- **El salto se decide al despegar y se mantiene hasta caer.** Antes, si el golpe resultaba ser otro, la altura cambiaba en el aire: con Meshy, 5 cm (0,5 frente a 0,55 m); con la captura habrían sido 14 cm.
  - Lejos de la red (a más de 4,5 m) se prepara una bandeja y salta 0,58 m.
  - Cerca de la red se prepara un remate y salta 0,72 m.
- **Las piernas van recogidas hasta que el golpe se revela como remate.** Solo entonces entra la tijera del clip. La mayoría de los remates son bandejas o víboras (54 de 78), y la tijera delataba el golpe antes de tiempo.

### Lo de la 0.11
- **El humano prepara el golpe con el contacto del círculo** mientras llega a él (`targetFor` en `chars.ts` y `willSwing` en `human.ts`).
- **Arreglo nuevo:** en el mismo fotograma de su golpe, el plan ya no existe y el círculo todavía es el de la bola siguiente. La vista saltaba a ese círculo y la pala acababa lejos de la bola recién jugada: 1,34 m y 1,22 m en dos de los tres partidos del humano. Ahora el círculo no se usa en los 0,25 s siguientes a su golpe.
- **Final del globo** (`LOB_FINISH`): desde el contacto, la pala sigue subiendo hacia la red con la cabeza hacia arriba.
- **El salto del remate de la 0.11** (`SMASH_JUMP`, con el tiempo de vuelo de verdad) lo usa ahora también el salto del pádel. `OVER.jump` queda para `?mocap=off`.

### Saque
Sigue igual: el saque de pádel por abajo, tras el bote, con el clip de Meshy. Con los clips nuevos, la pala sigue en la bola en el contacto (0 cm en los 52 saques medidos).

## Comprobado

**`tools/poses.ts 90`:** 8 partidos de 90 s (CPU, humano y dobles), 43.200 fotogramas, mismas semillas. «Pala» es la distancia de la pala a la bola en el contacto (mediana / p90 / máx.). «Delante» es el contacto delante de la cadera, a lo largo de donde mira la pelvis (mediana).

| Medida | Antes (Meshy) | Ahora |
|---|---|---|
| **Remate:** pala | 15,8 / 19,0 / 22,7 cm | **2,7 / 8,0 / 19,6 cm** |
| **Bandeja:** pala | 19,5 / 25,9 / 27,5 cm | **16,8 / 20,8 / 25,1 cm** |
| **Víbora:** pala | 20,4 / 25,7 / 29,1 cm | **16,9 / 20,8 / 26,0 cm** |
| **Remate, bandeja y víbora:** delante | −33 cm (detrás de la cabeza) | **+9 / +9 / +10 cm** |
| **Salto** (remate / bandeja y víbora) | 0,55 / 0,50 m | 0,72 / 0,58 m |
| **Derecha:** pala | 0,1 / 0,3 / 8,8 cm | 0,5 / 2,7 / 8,4 cm |
| **Derecha:** cara de la pala respecto a la bola | 70° | **60°** |
| **Derecha:** delante | 45 cm | 15 cm (golpea al lado de la cadera, con la cadera abierta) |
| **Derecha:** altura del final sobre el contacto | 0,23 m | 0,55 m (sobre el hombro, el del clip) |
| **Revés** (Meshy en los dos): pala | 0,1 / 5,0 / 24,1 cm | 0,1 / 5,0 / 20,9 cm |
| **Saque:** pala | 0 cm | 0 cm |
| **Cambios de golpe a mitad que se ven** | 18 | 19 |
| **Pie apoyado andando** (mediana) | 0,2 cm/s | 4,8 cm/s |
| **Pie apoyado en todo el partido** (p99 / máx.) | 1,22 / 4,5 m/s | 1,24 / 4,7 m/s |
| **Pies sobre el suelo** (p99, por los saltos) | 13,5 cm | 24,8 cm |
| **Espera congelada** | 2,3 % | 2,3 % |

- **La pala de la bandeja y la víbora** se queda a unos 17 cm de la bola. El tirón de la bola hacia la pala (`paddlePull` en `view.ts`, hasta 30 cm) lo tapa: en las capturas, la bola está en la pala.
- **El peor contacto** (1,08 m) es el mismo de antes: una estirada del humano a una bola anterior al círculo, ya descrita en la 0.11 del pickleball.
- **`npx tsx tools/review/fuzz.ts 12`:** 169 puntos, sin fallos ni atascos.
- **`tsc`** limpio en mis archivos; `node build.mjs` construye.
- **Capturas de cerca** en la página real (semilla 7, dobles) de cada golpe antes, en el golpe y después, con las dos versiones (`tools/closeups.py`, ver abajo). Se ven jugadores de pádel:
  - el remate, con salto y tijera, golpea delante y cae cruzando la pala;
  - la bandeja, de lado y con un saltito recogido, termina con la pala cruzada a la altura de la cintura;
  - la derecha prepara con la pala alta y golpea delante de la cadera.

## Herramientas
- **`tools/poses.ts`** añade una tabla por golpe con el remate, la bandeja y la víbora separados (comparten el clip, así que antes salían juntos en `paddle_smash`). Da la pala a la bola, el contacto delante de la cadera, la altura de la bola y el salto.
- **`tools/closeups.py`:**
  - nombra los remates por su golpe (`remate`, `bandeja`, `vibora`) y los fotografía durante el salto (−0,45 … +0,45 s);
  - añade momentos de carrera, andar, celebración y lamento;
  - opciones nuevas:
    - `KINDS` (cuántos de cada golpe);
    - `HIDE=1` (solo el jugador fotografiado, sin el compañero delante);
    - cámaras `wfront` y `wside` (más abiertas y altas, para los saltos);
    - `QUERY` (por ejemplo, `mocap=off`);
    - `ONLY` con prefijos (`remate0*`).

## Créditos y licencias
- **CMU (correr, andar, celebración y lamento).** La licencia permite el uso comercial y pide esta cita al publicar: «The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.»
- **Rokoko (derecha y remate).** Vienen del pack gratuito *Sports* de Rokoko, que no está en el repositorio: solo los clips ya pasados al jugador. **Hay que confirmar la licencia del pack en la web de Rokoko antes de publicar en una tienda.**

## Pendiente
- **La altura de la bandeja (es de la simulación).** En el pádel de verdad, la bandeja se golpea más baja que el remate, a la altura del brazo estirado (unos 2,3–2,6 m). La IA la golpea a 2,85 m, como el remate. Si la simulación la bajara, el `skip` del remate de captura podría bajar a 0,2–0,3 m y la bandeja casi no saltaría.
- **El final de la derecha** es el del tenista: alto, sobre el hombro. Si en el móvil se ve demasiado de tenis, habría que recortarlo (`out`) o bajarlo con la IK.
- **El pie apoyado al andar resbala unos 5 cm/s** con el andar de CMU (como en el pickleball).
- **Los saltos más altos** dejan los pies hasta 50 cm sobre el suelo en los remates. Hay que verlo en el móvil: ¿se ve exagerado el remate a 0,72 m?
- **Un revés de pádel de captura** (a una mano, con el cristal detrás) sustituiría al de Meshy. Faltan también volea, chiquita, estiradas y saque de captura.
- **Probar en un móvil de verdad** a la velocidad del juego.

## Capturas
Las dejé en `/tmp/padel-anim-shots/`:
- `remate.png`, `bandeja.png`, `vibora.png`: antes y después, de tres cuartos y de lado, de −0,45 a +0,45 s del contacto;
- `derecha.png`: Meshy, captura con 0,5 s y la versión compacta;
- `derecha-reves.png`: derecha y revés;
- `locomocion.png`: carrera, andar y celebración.

## Archivos
- **Nuevos:**
  - `assets/anims/{run,walk,cheer,lost,drive,smash}_mocap.json`;
  - esta nota.
- **Cambiados:**
  - `src/render/chars.ts`: `MOCAP`, `?mocap=off`, salto, `OVER`, círculo del humano y final del globo;
  - `src/render/keyposes.ts`: el brazo libre y el final de la derecha se dejan al clip de captura, y la cara de la pala se gira en su contacto;
  - `src/human.ts`: solo `willSwing`;
  - `tools/poses.ts` y `tools/closeups.py`.
