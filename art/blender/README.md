# Blender en el pádel

Todo lo de esta carpeta se hace con Blender por código, como módulo de Python, sin abrir Blender. Viene del pickleball 0.12 (su `art/blender/`), pasado a la pista de pádel.

```bash
pip install --break-system-packages bpy==5.2.2
```

## Mobiliario de la pista (`props.py`)

Modela en Blender el mobiliario que antes eran cajas en `src/render/venue.ts`:

- **Silla alta del juez:** estructura blanca con aspas, plataforma, asiento y respaldo acolchados, reposabrazos, panel delantero en el azul del torneo con su línea lima, la pantalla del juez y la escalera. Va fuera de la jaula, en la línea de la red, junto a la malla lateral izquierda.
- **Banquillos (2):** banco acolchado con estructura de aluminio, una toalla doblada que cuelga, botellas (en el suelo y en el banco) y una mochila de palas. Uno a cada lado de la silla del juez, fuera de la jaula, con la mochila hacia la puerta.
- **Cámaras de TV (5):** trípode de tres patas con su travesaño, cabeza fluida con barras de paneo hacia el operador, cuerpo, visor, batería y objetivo largo con su parasol.
- **Postes de la red (2), nuevos:** poste rectangular de acero (12 × 8 cm, 0,92 m) con la espalda a ras de la malla lateral, sobre una placa atornillada al suelo. En la cara de la red, la barra lateral de la red con sus bridas, la polea del cable de cabeza bajo la tapa y la anilla del cordón de abajo. En el costado, el tensor (carcasa del trinquete, tambor y manivela con pomo lima) y el cable que sube hasta la polea. En los dos postes la manivela mira al fondo cercano.
- **Taburetes de los fotógrafos (6),** con una bolsa al lado.

Las sillas de los jueces de línea del pickleball no están: en el pádel profesional no hay jueces de línea.

La oclusión ambiental se hornea en cada vértice con Cycles. Cada pieza se hornea sola, con un suelo debajo.

La salida son dos archivos:
- **`assets/props/props.bin`** (170 KB), que la página descarga como las animaciones. Por pieza, un bloque con, por vértice, la posición en mm, la normal, el material y la oclusión;
- **`src/render/blender-props-data.ts`** (1 KB): los materiales y dónde empieza cada pieza en el binario.

`src/render/blender-props.ts` lo descarga y lo descodifica, y `venue.ts` mete cada copia en la malla del mobiliario: sigue siendo una llamada de dibujo y la misma sombra. Para ver las cajas de antes, se añade `?props=box` a la URL; también salen si la página no encuentra el binario.

```bash
python3 art/blender/props.py            # regenera props.bin y blender-props-data.ts (≈2 min)
python3 art/blender/props.py --preview  # y además /tmp/padel-props.png
```

**Peso:** unos 10.300 triángulos únicos; en la escena hay unos 25.300 (5 cámaras, 6 taburetes, 2 banquillos y 2 postes), el doble con la pasada de sombra.

## Luz de los focos en el suelo (`floorlight.py`)

La luz de los 36 focos del anillo del techo sobre todo el suelo de dentro de las gradas, horneada con Cycles:
- la pista azul iluminada por igual y la luz cayendo hacia las paredes y las gradas;
- las sombras suaves y cruzadas de la perfilería y la malla de la jaula, la red, sus postes, las vallas y el mobiliario;
- el oscurecimiento al pie de todo.

El cristal casi no cuenta: deja pasar el 96 % de la luz, así que no hay sombra de sus paños. La malla deja pasar el 82 % (`GLASS_CLEAR` y `WIRE_CLEAR`).

1. **`tools/scene-dump.py`** saca de la página el estadio tal como se monta, con el mobiliario de Blender ya dentro: las mallas en coordenadas del mundo, cada una con su tipo (sólido, cristal, malla metálica o red), y cada foco con su dirección.
2. **`floorlight.py`** pone cada foco como un foco suave de Blender y hornea la luz directa y un rebote en una textura sobre el suelo (1024 × 1536 sobre 20,2 × 30 m, 2 cm por píxel).
3. La textura se normaliza al centro de la pista (= 1) y se guarda en gris en `assets/light/floor.webp`.
4. **`src/render/floorlight.ts`** hace que los materiales del suelo multipliquen su luz por ella, con algo de contraste (potencia 1,5). Las sombras nítidas de la luz principal siguen en directo. Las manchas de contacto dibujadas se quitan, salvo la sombra al pie de la jaula por dentro, más suave.

```bash
node build.mjs && python3 tools/scene-dump.py dist /tmp/venue.json
python3 art/blender/floorlight.py /tmp/venue.json            # ≈10 min en CPU (--quick: 1 min, a 512×768)
```

`?light=off` en la URL la quita, para comparar; `?light=1.2,0.9` prueba otro contraste y otra cantidad. Si cambian el estadio, la jaula o el mobiliario, hay que volver a hornearla.

## Animaciones de captura de movimiento (`retarget.py`, `padel_clip.py`)

Las herramientas del pickleball para pasar capturas de movimiento al esqueleto del jugador, copiadas aquí para que todo el proceso viva en el repositorio (las usa el agente de animación; `padel_clip.py` es el `pickleball_clip.py` de aquel repositorio con las rutas del pádel). Lo que sigue es el método tal como se usó en el pickleball 0.10–0.12.

### Carrera

`assets/anims/run_mocap.json` es la carrera de un corredor de verdad: el clip 09_01 de la base de datos de captura de movimiento de CMU, pasado al esqueleto de Meshy del jugador.

- **El rol `run` usa este archivo** (`CLIP_FILES` en `chars.ts`).
- **El brazo de la pala lo sigue colocando `keyposes.ts`;** las piernas, el tronco y el brazo libre son los de la captura.

Cómo se hace:

1. **El jugador:** `hero.json` se vuelve a montar como GLB y se importa en Blender.
2. **La conversión:** se pasa de Blender a los giros locales del glTF original y al revés. Comprobado ida y vuelta con un clip del juego: 0° de error.
3. **El retargeting:** para cada hueso, el giro respecto a la pose en T. Se alinea la dirección de cada hueso y también el eje del codo y de la rodilla:
   - el del jugador se mide en los clips de Meshy del juego;
   - el del actor, en el BVH.
4. **El ciclo:** el tramo de dos pasos que mejor cierra, sin avance y con la cadera sobre su sitio de reposo. Los últimos 4 fotogramas se funden con el primero.

```bash
git clone https://github.com/una-dinosauria/cmu-mocap   # BVH de CMU
python3 art/blender/padel_clip.py dist validar      # ida y vuelta con run_v2
python3 art/blender/padel_clip.py dist ciclo cmu-mocap/data/009/09_01.bvh assets/anims/run_mocap.json run_mocap
```

**Licencia de CMU:**
- se puede usar en proyectos comerciales;
- no se pueden revender los datos sueltos;
- si se publica algo con ellos, se agradece la cita: «The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.»

### Más clips de CMU

Con el mismo método (`tramo` corta un trozo de una toma, en el sitio):

| Rol | Toma | Trozo | Qué hace |
|---|---|---|---|
| `walk` | 35_01 «walk» | ciclo de dos pasos (1,13 s) | andar entre puntos; la pala la sigue llevando `keyposes.ts`. Se probó también 07_01: el pie apoyado resbalaba el doble |
| `cheer` | 79_69 «very happy» | fotogramas 80–310 (1,9 s) | brazos arriba en V y manos a la cintura |
| `lost` | 79_74 «upset» | fotogramas 206–446 (2,0 s) | brazos abiertos, manos a la cabeza, se dobla y se incorpora |

```bash
cd cmu-mocap && git checkout HEAD -- data/079/79_69.bvh   # el clon es parcial: cada toma se baja aparte
python3 art/blender/padel_clip.py dist tramo cmu-mocap/data/079/79_69.bvh assets/anims/cheer_mocap.json cheer_mocap 80 310 120
python3 art/blender/padel_clip.py dist ciclo cmu-mocap/data/035/35_01.bvh assets/anims/walk_mocap.json walk_mocap
```

### Golpes (pack de tenis de Rokoko)

El derechazo, el revés a dos manos y el remate son de un tenista de verdad: `Tennis_mixamo.fbx` del pack gratuito *Sports* de Rokoko (esqueleto de Mixamo, 24 fps), pasado al jugador con `MAPA_MIXAMO`.

| Clip | Fotogramas | Mira al frente en | Contacto | Qué hace |
|---|---|---|---|---|
| `drive_mocap` | 127–159 | 121 | 0,633 s | giro de hombros, pala atrás pronto, golpe delante de la cadera derecha y final alto sobre el hombro izquierdo |
| `backhand_mocap` | 172–210 | 166 | 1,0 s | revés a dos manos con giro completo, final alto a la derecha |
| `smash_mocap` | 318–384 | 300 | 1,667 s | de lado bajo la bola señalándola con la mano libre, salto al golpe y tijera |

- **«Mira al frente en»:** un fotograma en el que el jugador está de cara a la red (en posición de espera antes del golpe). Todo el clip se gira para que ahí mire al frente; el actor se va girando entre golpe y golpe.
- **El contacto** se mide en el juego con `npx tsx tools/swing-path.ts drive backhand smash` (la mano a su máxima velocidad delante del cuerpo; en el remate, la pala en lo más alto) y se fija en `chars.ts` (`MOCAP`).
- **`keyposes.ts` no les toca el brazo libre** (es el del tenista) ni el final del derechazo; solo gira la cara de la pala en su contacto.
- **Derecha y revés llevan `lift`:** para una bola baja, la pala va atrás a la altura de la bola y sube después. El revés a dos manos llega menos lejos que el de Meshy a una mano, y sin esto fallaba las bolas bajas.
- **Derecha:** empieza 0,5 s antes del contacto (`lead`), no con todo su arranque. Así hay menos cambios de golpe a mitad que se vean.
- **Remate:** llega menos alto que el de Meshy (el contacto es delante de la cabeza, no detrás). Su salto (el `SMASH_JUMP` de la 0.11) empieza con la bola a 2,0 m y sube hasta 0,62 m (`jumpFrom` y `jumpMax`). Con eso la pala queda a 3 cm de la bola de mediana; con Meshy, a 4 cm. Detalle en `docs/notas-12.md`.

```bash
python3 art/blender/padel_clip.py dist tramo Sports/Tennis_mixamo.fbx assets/anims/smash_mocap.json smash_mocap 318 384 24 300
python3 art/blender/padel_clip.py dist ver assets/anims/smash_mocap.json /tmp/smash.png 0.2 1.667   # hoja de frente y de lado
```

**El pack de Rokoko no está en el repositorio:** solo los clips ya pasados al jugador. Antes de publicar el juego en una tienda hay que confirmar la licencia del pack en la web de Rokoko.

`?mocap=off` en la URL vuelve a los clips de Meshy (correr, andar, golpes y reacciones), para comparar, si el juego lo conserva.
