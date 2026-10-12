# Gráficos del tenis 0.1 (12 oct): pista, red, raqueta, golpes, saque y cámara

Notas del agente de render. Convierte el render del pádel 0.6 en una pista central de tenis: la misma noche de torneo bajo focos, con aspecto de retransmisión, pero con pista ITF en tres superficies, red de tenis, raqueta con cuerdas, revés a dos manos, cortados y saque por arriba. Todo es procedural o sale de clips que ya había: 0 créditos de Magnific, ningún asset nuevo salvo `assets/anims/backhand_mocap.json`, que viene del pickleball.

Las medidas salen de `src/sim/court.ts` (`W_D`, `W_S`, `L`, `SERVICE`, `NET_C`, `NET_S`, `POST_X`, `STICK_X`, `RUN`, `BOARDS`). Si la simulación cambia una medida, la pista la sigue.

## Qué se ve

### La pista (`venue.ts`, `textures.ts`)
- **Fuera la jaula.** Se borran `cage.ts` (cristal, malla, perfilería e impactos) y todo lo que leía paredes: `View.wallFx`, `watchWalls`, `sideSurface`, `backSurface`, `clearOfCage` y `WALL` en el director.
- **Líneas ITF de 5 cm.** Las líneas de fondo miden 10 cm. Hay líneas laterales de dobles y de individual, línea de saque entre las de individual, línea central de saque de una línea de saque a la otra y marca central de 10 cm. Las medidas son por fuera de la línea, que cuenta como dentro. El borde se dibuja con la huella del píxel, como en el pádel.
- **Zona libre hasta las vallas**, en `BOARDS` (±9,145 × ±18,285 m). Las vallas son el muro de la grada con su cinta LED: el cuenco del estadio (`stadium.ts`, `BOWL`) sale ahora de `BOARDS`, con un radio de esquina de 2,5 m.
- **Tres superficies**, cada una con su pintura (`floorPaint`, unos 5 cm por texel), su grano en mosaico (`floorDetail`, 512² o 256² en calidad baja) y su manera de recibir la luz (`FLOOR_LOOK`):

| | Dentro / fuera | Grano | Desgaste |
|---|---|---|---|
| Dura | azul `#2f62a0` / verde `#3c7a50` (Nueva York) | acrílico con arena, motas claras y oscuras, un brillo suave | más pálido y liso detrás de las líneas de fondo y en los puntos de saque y resto; marcas de goma |
| Tierra | ladrillo `#bf6438` dentro y fuera, más oscuro hacia las vallas | polvo de ladrillo con grumos, mate | pasadas de la estera de 2 m a lo ancho con su reborde, zonas húmedas, 46 deslizamientos (dos surcos de suela que acaban en un montoncito oscuro), pisadas |
| Hierba | franjas segadas de 0,915 m paralelas a la red, dentro y fuera | briznas en la dirección del corte | tierra pelada detrás de cada línea de fondo (unos 6 × 2,5 m, bordes irregulares) y caminos junto a las laterales de individual |

- **Líneas según la superficie:** blanco puro en dura y hierba; en tierra, cinta blanca algo empolvada (`#f0e6dc`), más rugosa.
- **El rótulo «PRO TOUR FINALS / CENTER COURT»** se pinta en la zona libre de detrás de cada fondo, solo en pista dura.
- **Cambiar de superficie** rehace la pintura y el grano: 125–215 ms y 60–80 ms. Libera los de la anterior (unos 3 MB) y vuelve a hornear el mapa de entorno, porque el color de la pista está en los reflejos.

### La red y los postes (`venue.ts`)
- **Postes redondos verde oscuro** (r 5,5 cm) en `POST_X`, de 1,07 m, con tapa, placa y la manivela en el poste del árbitro.
- **Red de cuadro de 4 cm por píxel** (la misma técnica que el pádel), de poste a poste y hasta el suelo.
- **Cinta blanca de 5 cm** que sigue la caída, cinta central y bandas en los postes.
- **Palos de individual en `STICK_X`**, visibles solo en individual. La caída de la red va entre los palos o entre los postes, como `netHeight()`: 0,914 m en el centro y 1,07 m en el palo o el poste.
- **Se sigue moviendo** cuando la bola da en la red (`netFx`).

### La raqueta (`gear.ts`)
- **Medidas:** 68,5 cm de largo; cabeza oval de 32 × 25 cm (tres formas, con los nombres de `PaddleLook`: `elongated` 32,5 × 24,4; `standard` 32 × 25; `hybrid` 31,5 × 24,8); perfil de 25 × 13 mm.
- **Forma:** garganta abierta (dos brazos que salen del mango), empuñadura octogonal con overgrip, tapón y collarín.
- **Cuerdas por píxel:** 16 × 19, de 1,4 mm, con la marca inventada estarcida. De lejos se vuelven un velo, sin moiré.
- **Los kits no cambian de nombre** (`paddle`, `paddleEdge`, `paddleLook`), pero ahora pintan el marco:
  - `face`: carbono negro con acentos, pintado o blanco;
  - `graphic`: el color principal; `graphic2`: las bandas de las 3 y las 9 en punto;
  - `edge`: el protector y la garganta.
- **Coste:** 1.520 triángulos + 46 de cuerdas; tres llamadas, como la pala. Las cuerdas no proyectan sombra.
- **Punto dulce** a `RACKET.face` = 0,44 m de la mano: es lo que la IK lleva a la bola. Antes, el centro de la pala estaba a 0,255 m.
- **La mano** cierra sobre el mismo mango (`body.ts`, sin cambios: 13,5 × 17 mm con overgrip).

### Golpes (`chars.ts`, `keyposes.ts`)
- **Fuera el pádel:** bajada, bandeja, víbora, por 3, por 4, `special`, `Plan.wall`, `Plan.bajada` y la tabla `OVER` del pádel.
- **Revés a dos manos de captura** (`backhand_mocap`, del pickleball) en todos los reveses que no son cortados. Contacto a 1,0 s.
  - La mano izquierda va al mango, 9,5 cm por encima de la derecha, con IK del brazo izquierdo sobre su codo (`twoHands`).
  - La suelta 0,32 s después del contacto.
  - Medido: mano izquierda a 4–6 cm de la empuñadura en el contacto.
- **Derecha de captura** (`drive_mocap`) con su preparación entera (0,5 s).
- **Cortados** (`slice` y `drop`, con el swing `slice` / `slice_l`):
  - recorrido de arriba abajo: la raqueta, 34 cm por encima de la bola antes del contacto; después, 32 cm por debajo, y el final delante, no por encima del hombro;
  - cara abierta (0,5 rad);
  - el cortado de derecha usa el cuerpo de la derecha; el de revés, a una mano, el revés del vídeo de KNSU.
  - Si el plan no dice que es un cortado (`Plan.kind`, si la simulación lo da) o el humano no lo apunta (`CharacterView.aimKind`, que pone la vista), solo cambia el final.
- **Voleas compactas:** de derecha, el puñetazo corto de antes; de revés, `volley_l` nuevo (el revés a una mano con el 40 % de su recorrido).
  - La volea se elige también al subir a la red, hasta unos 7 m de ella.
- **Remate:** `smash_mocap` con salto si la bola pasa de 2,2 m (máximo 0,5 m).
- **Caras en el contacto:**
  - planas en los golpes liftados (el recorrido de abajo arriba da el efecto);
  - algo abiertas en las voleas;
  - algo cerradas en el saque y el remate.

### El saque por arriba (`keyposes.ts`, `SERVE_CLIP`; la bola en `view.ts`)
- **Base:** piernas y tronco del remate de captura (`smash_mocap`), con el tiempo remapeado para que el contacto caiga en el segundo 1,05 del clip, el `SERVE_WINDUP` del contrato. El clip arranca con el `serveStart`. Encima:
  - **piernas en plataforma:** la postura del remate en 0,9 s, sin su patada de tijera;
  - **flexión** de 7,5 cm en la posición de trofeo;
  - **tronco** hacia la pista e inclinado a la izquierda en el contacto, con el hombro de golpeo arriba;
  - **brazos con poses clave:** la raqueta baja junto a la pierna y sube por detrás; trofeo con el codo a la altura del hombro; caída de la raqueta tras la espalda; contacto con el brazo estirado, alto y delante; final cruzado hacia la izquierda;
  - **mano izquierda:** sujeta la bola contra la garganta de la raqueta, sube recta, suelta en el segundo 0,38 y señala la bola en el trofeo;
  - **salto** a la bola (`SERVE_JUMP`): 38 cm para un contacto a 2,75 m.
- **La bola** está en la mano izquierda hasta la suelta (la misma proporción del armado que en el clip). Después vuela con gravedad real hasta el punto de contacto del `windup`: sube unos 18 cm por encima y cae sobre la raqueta.
  - El sacador en espera usa el primer fotograma del saque (`serveset`), con la bola en la mano.
- **Medido** (`tools/render/stage-tenis.ts`, el saque del contrato: contacto a 2,75 m, 0,35 m dentro de la línea y 0,25 m a la derecha):
  - el punto dulce queda a 7,3 cm de la bola; `paddlePull` lo tapa;
  - en partido (`poses-tenis`): 5,4 cm.

### Cámara de juego (`view.ts`, `cam`)
La vista clásica de la tele: alto, detrás del fondo cercano, sobre la grada y por debajo del videomarcador. La busqué con `tools/render/frame-search.ts`, que proyecta la pista y los jugadores y prueba alturas, distancias, puntos de mira y focales.

| | Distancia | Altura | Mira a | Campo de visión | Ángulo |
|---|---|---|---|---|---|
| Vertical | 27 m | 11,5 m | 10 m | 51° | 34° |
| Horizontal | 25,5 m | 8,5 m | 4,5 m | 28° | 22° |

- **Vertical (390 × 844):**
  - la cabeza del jugador lejano, al 11 % de la altura (bajo el marcador);
  - el fondo lejano, al 17 %; la red, al 30 %;
  - los pies del jugador cercano, al 59 %, muy por encima de la zona de los pulgares y con sitio para 3–4 m detrás de la línea;
  - un jugador mide un 5 % de la altura en el fondo lejano y un 9 % en el cercano. En el pádel eran el 12 % y el 18 % en una pista de 20 m.
  - Las esquinas cercanas de dobles se salen por los lados, pero la pista de individual cabe. El seguimiento lateral (`frameX`) mantiene dentro a los de tu lado.
- **Horizontal (844 × 390):** el fondo lejano al 17 % y el cercano al 92 %, con toda la pista de dobles y la zona libre a los lados. Un jugador mide un 10 % de la altura lejos y un 22 % cerca.
- **La órbita del menú** es una elipse algo mayor (15 × 23 m a 9,5 m de altura).
- **El mapa de sombras** cubre la pista y la zona de juego: ±8,1 × ±16,1 m.

### Estadio, mobiliario, tele (`stadium.ts`, `venue.ts`, `crowd.ts`, `led.ts`, `director.ts`)
- **Junto a la red, fuera de la línea de dobles:** la silla del árbitro, a 0,95 m del poste, y los banquillos de los jugadores contra la valla, a cada lado de la silla.
- **Jueces de línea:** 8 sentados en taburetes contra las vallas. 4 en el lateral de enfrente del árbitro, a la altura de las líneas de fondo y de saque, y 4 en los fondos, a la altura de una lateral de dobles y de una de individual.
  - Los props de Blender no traen silla de juez: se usa el taburete.
  - El mobiliario se sigue horneando en una sola llamada.
- **Recogepelotas:** 2 agachados junto a los postes y 4 de pie en los fondos, con su propio uniforme (`dress: 'kid'`, azul).
- **Cámaras de tele:** en las cuatro esquinas y una lateral frente al árbitro, con su operador. Hay 4 fotógrafos en las esquinas de los fondos.
- **Vallas:** el muro de la grada con su cinta LED. No hay vallas LED sueltas como en la jaula del pádel.
- **Patrocinadores inventados** sin pádel: GLASSWALL BANK pasa a ser BASELINE BANK, y BANDEJA ENERGY, TOPSPIN ENERGY.
- **Director:**
  - el vuelo de presentación cruza por encima de la pista (ya no entra en una jaula);
  - repeticiones: lateral en la grada sobre las vallas, inversa sobre la valla del fondo y baja junto al poste, fuera de la línea de dobles;
  - `clearOfBoards` aparta de las vallas cualquier cámara baja.
  - Comprobado en capturas: presentación, reacción, saque lejano, las tres repeticiones y la victoria.

### Luz del suelo
La luz horneada en Blender (`assets/light/floor.webp`, `floorlight.ts`) se hizo para la jaula de 20 × 10 m y sus sombras. **La he quitado:** borré el fichero y el módulo, y `?light=` ya no hace nada. El charco de luz de los focos va pintado en el color del suelo: la zona libre se oscurece un 10–14 % hacia las vallas. El oscurecimiento al pie de postes, mobiliario y vallas lo hacen los decals de siempre. Rehornearla para la pista de tenis queda pendiente (necesita Blender, que aquí no hay).

## API para `main.ts` (interfaz)
- **No hace falta llamar a nada nuevo para jugar:** `view.setMatch(m, kits)` ya lee la superficie (`m.rules.surface`, dura por defecto) y si es individual o dobles (`m.doubles`, o `m.players.length === 4` mientras `match.ts` no lo dé).
- **`view.setCourt(surface, singles)`** cambia la pista sin partido, por ejemplo al tocar la superficie en Ajustes con el partido de fondo del menú. Solo vuelve a hornear el entorno si cambia la superficie.
- **`view.court`** devuelve `{ surface, singles }`, la pista dibujada.
- **Quitado:** `view.wallFx` y `HUE.bajada`. `view.cue` acepta `'attack' | 'block' | null`. `aimHue` tiene color para `slice` (azul claro). `aimHue('bajada')` ya no existe.
- **Sin cambios:** `CharacterView.onHit` recibe `{ kind, power }` (sin `special`) y la vista pone `aimKind` sola desde `view.aim`.

## Coste
**Llamadas y triángulos:** `renderer.info` de un peloteo de dobles a 390 × 844, con la pasada de sombras. El tenis se mide con `tools/render/cost.py` y `hshots.py … info`; el pádel, con su HEAD (`tools/look.py`) en la misma máquina.

| Nivel | Tenis | Pádel 0.6 |
|---|---|---|
| Alto | 68–69 llamadas, 251.800 triángulos | 74 llamadas, 250.800 triángulos |
| Medio | 55 llamadas, 244.200–251.800 triángulos | 60 llamadas, 250.800 triángulos |
| Bajo | 40 llamadas, 145.600 triángulos | — |

- **Individual (alto):** 53 llamadas y 177.600 triángulos.
- **Desaparecen la jaula y la luz horneada:** −5 llamadas y menos sobreimpresión (el cristal a pantalla completa). Las raquetas cuestan lo que costaban las palas, y el cuenco es algo mayor (50.500 triángulos entre grada y mobiliario).
- **Texturas del suelo:** pintura de 360 × 708 (224 × 440 en baja) y grano de 512² (256²). Solo una superficie en memoria.
- **Página** (con el banco de pruebas, el mismo código del render): unos 2,1 MB sin minificar.

## Medidas de los golpes
**Golpes escenificados** (`npx tsx tools/render/stage-tenis.ts`): punto dulce a la bola en el contacto.

| Golpe | Punto dulce a la bola | Salto | Notas |
|---|---|---|---|
| Derecha (0,55–1,45 m) | 0,3–1,5 cm | — | también a 0,95–1,0 m pegada al cuerpo: 0,2 cm |
| Revés a dos manos (0,55–1,45 m) | 0–0,2 cm | — | la mano izquierda a 4–6 cm del mango |
| Cortado de derecha | 0,3–0,7 cm | — | la raqueta 1,29 m antes y 0,73 m 0,3 s después; en la derecha liftada, 1,82 m |
| Cortado de revés | 0,5–7,2 cm | — | |
| Volea de derecha | 0,1 cm | — | |
| Volea de revés | 1,5 cm | — | |
| Remate a 2,7 m | 5 cm | 50 cm | |
| Saque a 2,75 m | 7,3 cm | 38 cm | |

**En partido:** `node tools/render/run-shim.mjs tools/render/poses-tenis.ts 90`, la simulación de pádel con el saque del contrato reescrito, 3 partidos CPU y 3 de dobles. Mediana de punto dulce a la bola (p90 entre paréntesis):
- derecha 0,2 cm (2,8), n = 171;
- volea 0,2 (0,5);
- revés 0,1 (0,2);
- remate 0,3 (12,3);
- saque 5,4 cm.

**Arreglo de la derecha:** antes del cambio de `rel` en `reachBall`, una derecha a la cadera pegada al cuerpo fallaba por 7 cm de mediana y hasta 23. La raqueta, 18,5 cm más larga que la pala, pasaba la cabeza de largo.

## Pendiente
- **Probar en un móvil de verdad:** las cuerdas por píxel, la red y el tamaño de los jugadores en vertical (5 % y 9 % de la altura).
- **Cuando `match.ts` sea el de tenis:**
  - comprobar el saque con el `windup` de verdad (contacto, lado y altura) y el individual con dos jugadores;
  - mientras tanto lo he probado con `tools/render/harness.ts`, que reescribe el saque y esconde a los compañeros;
  - si el plan trae `Plan.kind`, los cortados se preparan desde atrás; sin él, solo cambia el final.
- **Luz de los focos horneada** para la pista de tenis (`art/blender/floorlight.py` con la nueva escena). Sin Blender aquí.
- **Silla de juez de línea en Blender:** ahora es un taburete. Una silla con respaldo daría más tenis.
- **Revés a una mano** para quien lo juegue: ahora todos llevan el de dos manos, y el de una mano solo sale en cortados y voleas.
- **Saque liftado y cortado** con su propio lanzamiento: ahora el lanzamiento es el mismo para cualquier `spin`.
- **El remate a más de 2,9 m** aún se queda a unos 12 cm (p90); `paddlePull` lo tapa.
- **`tools/` que no son míos** (`tools/poses.ts`, `tools/stage-lib.ts`, `screens.py`…) siguen con el pádel (bajada, por 3). Mis copias están en `tools/render/`.

## Capturas de referencia
En `/tmp/claude-0/tenis-render/final/`:
- `hard-s-390x844-peloteo.png`: vertical, pista dura, individual, calidad alta;
- `tierra-hierba.png`: tierra (individual) y hierba (dobles), en vertical;
- `hard-d-844x390-peloteo.png`: horizontal, pista dura, dobles;
- `saque-hoja.png`: el saque de frente, de la bola en la mano al final (lanzamiento, trofeo, caída de la raqueta, contacto);
- `reves-dos-manos.png` y `cortado.png`: el revés a dos manos y el cortado, de cerca, con el contacto.

## Archivos
- **Borrados:** `src/render/cage.ts`, `src/render/floorlight.ts` y `assets/light/floor.webp`.
- **Nuevo asset:** `assets/anims/backhand_mocap.json`, del pickleball.
- **Cambiados (`src/render/`):** `venue.ts`, `textures.ts`, `stadium.ts`, `gear.ts`, `chars.ts`, `keyposes.ts`, `view.ts`, `director.ts`, `crowd.ts`, `led.ts` y `blender-props.ts` (comentario).
- **Herramientas en `tools/render/`:**
  - `frame-search.ts`: busca la cámara;
  - `clip-probe.ts` y `clip-probe2.ts`: miden los clips;
  - `twohand-probe.ts`: mide la mano izquierda del revés;
  - `racket-check.ts`: comprueba la geometría de la raqueta;
  - `floor-png.ts`: saca la pintura de las superficies;
  - `stage-lib.ts`, `stage-tenis.ts` y `hstage.py`: golpes escenificados;
  - `poses-tenis.ts`: poses en partido;
  - `harness.ts`, `hshots.py` y `cost.py`: banco de pruebas, capturas y coste;
  - `build-shim.mjs` y `run-shim.mjs`: compilan y ejecutan con la simulación a medio cambiar.

## Comprobado con la simulación de tenis (13 oct)

`match.ts` ya es el de tenis, así que el banco de pruebas y la simulación de pega dejan de hacer falta (`tools/render/harness.ts`, `build-shim.mjs` y `run-shim.mjs` se quedan solo como referencia). Lo que estaba pendiente:

- **Saque:** lanzamiento, trofeo y contacto con el `windup` real, en vertical y en horizontal (`tools/tenis/play.py`). En partido, el punto dulce queda a 7 cm de la bola.
- **Individual con dos jugadores:** se ve bien en dura, tierra y hierba. El rival lejano que resta muy atrás debe quedarse a unos 2 m de la línea para no salirse por arriba en vertical: Medvédiev pasó de 2,5 m a 1,3 m más atrás.
- **Raqueta en partido** (`tools/render/poses-tenis.ts`, ya con la simulación real y los pies a 0,72 m de la bola en los golpes de fondo): derecha a 0,2 cm de mediana (4,4 cm en el p90), remate a 0,2 cm. En los cortados, uno de siete se queda lejos (1,25 m); hay que mirarlo con más partidos.
- **`Plan.kind`:** la CPU ya marca el cortado al salir a por la bola.
