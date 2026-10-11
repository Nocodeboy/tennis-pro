# Blender en el pádel (12 oct): mobiliario modelado y luz de los focos horneada

Notas del agente de entorno 3D. Trae al pádel el proceso de Blender del pickleball 0.12 (modelado por código con `bpy` y horneado con Cycles; `notas-10-blender.md` y `notas-12.md` de aquel repositorio) y lo pasa a la pista de 20 × 10 m con su jaula. Blender 5.2.2 como módulo de Python (`pip install --break-system-packages bpy==5.2.2`), la misma versión que en el pickleball. Todo se hace por código: 0 créditos de Magnific.

## Qué cambia

### El mobiliario, modelado en Blender (`art/blender/props.py`)

Antes eran cajas en `venue.ts`. Ahora son modelos con la oclusión ambiental horneada en cada vértice con Cycles. Van todos en la malla del mobiliario: **una llamada de dibujo y la misma sombra**, como antes.

| Pieza | Dónde | Triángulos |
|---|---|---|
| **Silla alta del juez** (la del pickleball: estructura blanca con aspas, asiento azul, panel del torneo con línea lima, pantalla, escalera) | fuera de la jaula, en la línea de la red, a 0,8 m de la malla lateral izquierda, mirando a la pista; el juez sentado a 1,93 m | 3.608 |
| **Banquillos (2)** (banco acolchado, toalla, botellas, mochila de palas) | uno a cada lado de la silla del juez (a ±1,65 m de la red), fuera de la jaula y mirando a la pista; la mochila hacia la puerta | 2.580 |
| **Cámaras de TV (5)** (trípode, cabeza fluida, cuerpo, visor y objetivo largo) | las de siempre: dos detrás del fondo lejano, dos en las esquinas cercanas y la lateral en su plataforma frente al juez | 1.904 |
| **Taburetes de fotógrafos (6)**, con su bolsa | los de siempre: detrás del fondo lejano y en las esquinas cercanas | 636 |
| **Postes de la red (2), nuevos** | dentro de la jaula, con la espalda a ras de la malla lateral | 1.610 |

- **Postes de pádel:** poste rectangular de acero negro de 12 × 8 cm y 0,92 m (la altura de la red en los postes), sobre una placa atornillada al suelo.
  - En la cara de la red: la barra lateral de la red con sus bridas, la polea del cable de cabeza bajo la tapa y la anilla del cordón de abajo.
  - En el costado: el tensor (carcasa del trinquete, tambor, manivela con pomo lima) y el cable que sube hasta la polea.
  - Los dos tienen la manivela hacia el fondo cercano, para que se vea desde la cámara de juego.
  - Sustituyen a los postes redondos de `venue.ts`. La red sigue terminando en la cara del poste.
- **Fuera las sillas de los jueces de línea:** en el pádel profesional no hay jueces de línea.
- **Arreglo:** las dos cámaras de TV de las esquinas cercanas miraban hacia fuera de la pista (el signo del giro estaba al revés). Ahora apuntan al centro y el operador queda detrás.
- **La jaula no cambia.** Probé si convenía modelar en Blender la perfilería (postes, travesaños, marcos de las puertas) con su oclusión. No compensa: es acero negro casi sin luz, así que la oclusión apenas se nota; desde la cámara de juego un poste mide 2–3 píxeles; y para que la oclusión de postes de 4 m y travesaños de 10 m se vea hay que trocearlos mucho, con lo que costaría varias veces los 1.440 triángulos de ahora. El cristal, la malla y la perfilería siguen como en `cage.ts`.

**Cómo se carga:**
- Los modelos ya no van en `index.html` en base64, como en el pickleball. Van en **`assets/props/props.bin`** (170 KB; 93 KB con gzip), que se descarga junto a la página, como las animaciones.
- **`src/render/blender-props-data.ts`** (1,6 KB, generado) solo guarda los materiales y dónde empieza cada pieza en el binario.
- **`src/render/blender-props.ts`** lo descarga, lo descodifica y mete cada copia en la malla del mobiliario de `venue.ts`.
- **Mientras llega**, el mobiliario solo tiene las partes fijas (las carcasas de las vallas y la plataforma de la cámara). Llega durante el menú.
- **Si no llega** (sin el archivo), se quedan las cajas de antes. `?props=box` las enseña siempre, para comparar.

### La luz de los focos, horneada en el suelo (`art/blender/floorlight.py`)

La luz de los **36 focos** del anillo del techo sobre todo el suelo de dentro de las gradas (20,2 × 30 m), horneada con Cycles en una textura gris de 1024 × 1536 (2 cm por píxel): **`assets/light/floor.webp`, 29 KB**.

- **Qué se ve:**
  - la pista iluminada por igual en el centro y algo más oscura hacia las paredes;
  - las sombras suaves y cruzadas de la jaula: los postes, los travesaños y la malla de arriba, vistos por 36 focos a la vez. En el fondo lejano se ven como vetas diagonales suaves sobre el césped;
  - la sombra de la red y de sus postes;
  - fuera de la jaula, las sombras de las vallas, la silla del juez, los banquillos, las cámaras y los taburetes, y el suelo que se oscurece hacia las gradas.
- **El cristal casi no cuenta:** en el horneado deja pasar el 96 % de la luz, así que no da sombra de sus paños. La malla deja pasar el 82 % (`GLASS_CLEAR` y `WIRE_CLEAR` en `floorlight.py`).
- **`tools/scene-dump.py`** distingue ahora cada material por su shader: el cristal, la malla metálica y la red. También espera a que el mobiliario de Blender esté dentro.
- **Normalizado al centro de la pista** (|x| < 3,5 m y 1,5 < |z| < 7,5 m), que vale 1:
  - el centro queda entre 0,90 y 1,07;
  - toda la pista, entre 0,79 y 1,07.
- **Contraste:** potencia 1,5, la del pickleball. Probé 1,0, 1,2 y 1,5 con capturas.
  - El azul no se ensucia: el brillo y la saturación medios de la pista quedan iguales que sin horneado (V 0,55, S 0,97–0,99). La luz solo se reparte: el centro un poco más claro y las bandas junto a las paredes unos 5 niveles más oscuras.
  - Con 1,0 las sombras de la jaula casi no se veían; con 1,5 se leen y la pista sigue limpia.
- **Las manchas de contacto dibujadas** se quitan cuando llega la luz, porque la luz horneada ya trae las de verdad. Se queda una: la sombra al pie de la jaula por dentro, al 60 % (`FOOT_KEEP`). Como el cristal no hace sombra en el horneado, sin ella se perdía la línea que separa la pista del cristal en el fondo lejano.
- **Afecta a:** el césped, las líneas, los logotipos del suelo, el suelo del cuenco y el del mobiliario (solo lo que mira arriba a ras de suelo).
- `?light=off` la quita, para comparar. `?light=1.2,0.9` prueba otro contraste y otra cantidad sin recompilar.

### Herramientas
- **`tools/look.py`:**
  - nuevas vistas de cerca: `umpire`, `bench`, `tvcam`, `post` y `corner`;
  - `QUERY=props=box` (o `light=off`) en el entorno añade opciones a la URL;
  - la línea `INFO` trae lo que tardó el mobiliario en llegar (`props`).
- **`tools/scene-dump.py`:** nuevo, del pickleball, con los tipos de la jaula.
- **`art/blender/`:**
  - `props.py` y `floorlight.py`, pasados al pádel;
  - `retarget.py` y `padel_clip.py` (el `pickleball_clip.py` con las rutas del pádel), para que todo el proceso de animación viva en el repositorio. Son del agente de animación;
  - el `README.md` lo explica todo.

## Cómo se regenera

```bash
pip install --break-system-packages bpy==5.2.2
python3 art/blender/props.py --preview          # props.bin y blender-props-data.ts (≈2 min); hoja en /tmp/padel-props.png
node build.mjs && python3 tools/scene-dump.py dist /tmp/venue.json
python3 art/blender/floorlight.py /tmp/venue.json --quick   # para probar: 1 min, a 512×768
python3 art/blender/floorlight.py /tmp/venue.json           # el bueno: unos 20 min en esta máquina (CPU)
node build.mjs
```

Si cambia la jaula, el estadio o el sitio del mobiliario, hay que volver a hornear la luz (y si cambia el mobiliario, primero `props.py`).

## Coste

**Llamadas de dibujo y triángulos:** `tools/look.py … doubles`, 390 × 844, semilla 424242, el mismo fotograma del peloteo. Incluye la pasada de sombra y el posprocesado.

| Nivel | Llamadas antes → después | Triángulos antes → después |
|---|---|---|
| Alto | 76 → 76 | 201.900 → 250.600 |
| Medio | 62 → 62 | 201.900 → 250.600 |
| Bajo | 43 → 43 | 120.300 → 144.600 |

- **Llamadas:** las mismas. El mobiliario sigue siendo una malla, y las manchas de contacto también: con la luz horneada solo les queda el pie de la jaula. Sin esa sombra serían una llamada menos.
- **Triángulos:** el mobiliario de Blender son unos 25.300 en la escena (10.300 únicos). En alto y medio se cuentan dos veces porque también se dibujan en la pasada de sombra: +48.700. En bajo no hay sombra: +24.300. El pickleball añadió +62.000.
- **Texturas:** una más, la luz del suelo (1024 × 1536, un canal).

**Peso:**
- `index.html` pasa de 1.110 a 1.117 KB: +6,6 KB de código, contando lo que haya cambiado el otro agente a la vez;
- `assets/props/props.bin`: 170 KB (93 KB con gzip);
- `assets/light/floor.webp`: 29 KB.

En el pickleball el mobiliario sumaba 232 KB a la página; aquí no suma nada.

**Carga** (SwiftShader, CPU de escritorio, medido en la página):
- descodificar el binario: 7–8 ms;
- montar la malla del mobiliario con todas las copias: 27–29 ms.

Las dos cosas ocurren una vez, durante el menú. Con varios navegadores a la vez en la máquina subía a 45 y 98–164 ms. La descarga se solapa con la de los jugadores y las animaciones.

**En GPU:** el horneado no cuesta nada medible: el suelo ya se dibujaba y ahora multiplica por una textura. Los triángulos de más no se pueden medir en SwiftShader.

## Comprobado

- `tsc` sin errores en mis archivos. `node build.mjs` limpio.
- **Sin errores ni avisos en la consola** (cámara de juego, vistas de cerca y la presentación de la tele).
- **Capturas antes y después:**
  - cámara de juego en vertical y en horizontal (medio, dobles);
  - de cerca: silla del juez, banquillo, poste de la red, cámara de TV y esquina;
  - la presentación de la tele (`tools/tv.py`).
- **Nada dentro de la jaula** aparte de los postes de la red, nada que tape la cámara de juego ni los planos de la tele, y sin z-fighting: el poste deja 3 mm hasta la malla y, a 25 m, la precisión de profundidad es de una décima de milímetro.

## Pendiente

- **Probar en un móvil de verdad** los +48.700 triángulos de alto y medio. Si va justo, la salida barata:
  - sacar de la sombra las cámaras y los taburetes, que quedan fuera del mapa de sombras o en su borde: +1 llamada y −13.000 triángulos en la pasada de sombra;
  - o quitar las cámaras de las esquinas en bajo.
- **Las sombras de la jaula en el horneado:** si se ven demasiado cuadriculadas en el móvil, bajar `CONTRAST` a 1,3 o subir `WIRE_CLEAR`.
- **La perfilería de la jaula en Blender:** solo si se quiere más detalle de cerca (perfiles con canto redondeado, bisagras, placas de anclaje) para la tele. No compensa por la oclusión.
- **`.gitignore`:** no es mío. Convendría añadir `art/blender/out/` y `__pycache__/`, como en el pickleball: `padel_clip.py` escribe ahí.

## Capturas

En `/tmp/padel-blender-shots/`:
- `01-juego-vertical.png`: antes y después, 390 × 844;
- `02-juego-horizontal.png`: antes y después, 844 × 390;
- `03-pista.png`: la pista de cerca, antes y después (las sombras de la jaula);
- `04-juez.png`, `05-banquillo.png`, `06-poste.png` y `07-camara-tv.png`: de cerca, antes y después;
- `08-hoja-blender.png`: la hoja del mobiliario renderizada en Blender;
- `tv/`: la presentación de la tele.

## Archivos

- **Nuevos:**
  - `src/render/blender-props.ts`, `src/render/blender-props-data.ts` (generado) y `src/render/floorlight.ts`;
  - `assets/props/props.bin` y `assets/light/floor.webp`;
  - `art/blender/props.py`, `floorlight.py`, `retarget.py`, `padel_clip.py` y `README.md`;
  - `tools/scene-dump.py`.
- **Cambiados:** `src/render/venue.ts` y `tools/look.py`.
