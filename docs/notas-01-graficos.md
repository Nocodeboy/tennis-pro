# Gráficos del pádel 0.1 (11–12 oct): pista, jaula de cristal, pala, bola y cámara

Notas del agente de render. Parte del render del pickleball 0.10 (docs/pickleball/notas-08-graficos.md, notas-09-estadio.md, notas-10-*) y lo convierte en una pista central de pádel: la misma noche de torneo bajo focos, con aspecto de retransmisión, pero con césped azul, jaula de cristal y malla, red de 10 m, pala perforada y bola de fieltro. Todo es procedural: 0 créditos de Magnific, ningún asset nuevo.

Las medidas salen de `src/sim/court.ts` (W = 10, L = 20, SERVICE = 6,95, red 0,88/0,92, paredes en `WALL`), así que si la simulación cambia una medida, la pista la sigue.

## Qué se ve

### La pista (`venue.ts`, `textures.ts`)
- **Césped artificial azul** de torneo (`#2361aa`), mate. La textura fina (`turfDetail`) son puntas de fibra, arena entre ellas y algún grano de arena encima, con su mapa de normales. Un poco de brillo rasante: la mitad lejana recoge los focos.
- **El color de la pista** (`courtPaint`, un lienzo de unos 4 cm por texel): los rollos de césped de 2 m a lo largo, en tonos apenas distintos, las pasadas del cepillo y zonas más pálidas y aplastadas donde más se pisa: atrás, en la línea de saque, en la red, en el punto de saque y al pie del cristal, donde se acumula la arena.
- **Fuera de la jaula**, el suelo es azul marino casi negro (`#161e2b`).
- **Líneas blancas de 5 cm:** las dos líneas de saque (en ±6,95, la línea cuenta como dentro) y la línea central desde la red hasta 20 cm pasada cada línea de saque, como en el reglamento. No hay cocina ni línea de fondo: los fondos son las paredes. El borde se dibuja con la huella del píxel, sin dientes ni con MSAA ni sin él.
- **«PRO TOUR FINALS / CENTER COURT»** en el suelo, detrás de cada pared de fondo. Los dos se leen derechos desde la cámara de juego: el cercano abajo del encuadre, el lejano a través del cristal.

### La jaula (nuevo `cage.ts`)
Sigue `court.ts` al centímetro:
- **Fondos:** cinco paños de cristal de 2 m hasta 3 m de alto y malla de 3 a 4 m.
- **Laterales**, desde cada fondo: 2 m de cristal hasta 3 m con malla hasta 4 m; 2 m de escalón (cristal hasta 2 m, malla hasta 3 m); y los 12 m alrededor de la red, de malla hasta 3 m con **dos puertas por lado** (marco, travesaño, tirador y pestillo; cerradas con malla).

Son tres mallas y tres llamadas de dibujo:
- **El cristal:** 18 quads y un material. Casi transparente, con un leve tinte verde, más reflejo en ángulo rasante (Fresnel con el mapa de entorno del estadio), el canto pulido y la junta de 1 cm entre paños. Lleva unas vetas diagonales suaves: el brillo de los focos que en la tele distingue el cristal del aire. Usa alfa premultiplicado, así que el reflejo no se apaga en el cristal claro.
- **La malla:** electrosoldada de 5 cm con alambre de 3 mm, calculada por píxel sin textura (la misma técnica que la red). Nítida de cerca; de lejos es un velo oscuro, sin moiré. Son unos pocos quads de 0,5 m para poder doblarlos.
- **La perfilería:** postes negros cada 2 m, travesaños a 3 y 4 m, los del escalón, los herrajes del cristal (placa y tornillo en cada junta) y las puertas. Es una sola malla opaca.

**La pared que tapa la cámara se desvanece sola.** Cada vértice sabe hacia dónde mira su pared. Si la cámara queda por fuera de ese plano, la pared se desvanece:
- el cristal y la malla quedan al 20 % y al 18 %;
- la perfilería queda tramada a un fantasma de más o menos un píxel de cada cuatro.

Desde la cámara de juego se desvanece la pared del fondo cercano; desde un ángulo de la tele en la grada, la pared lateral que tiene delante. Nada tapa a los jugadores cercanos. No hace falta ninguna lógica en la vista: lo decide el shader con `cameraPosition`.

**Golpes en la pared** (`View.wallFx`, que `cage.impact` dibuja):
- **Cristal:** un destello, un anillo que se abre y una marca que se apaga en 1,6 s. Caben 4 a la vez, en un array de uniforms. Si el golpe es fuerte, unos granos de arena salen hacia la pista (4 partículas).
- **Malla:** un temblor amortiguado alrededor del punto del golpe, en el vertex shader.
- **Cómo se detectan:** con la bola tal como se dibuja. Si está junto a una pared y su velocidad hacia ella se invierte, es un golpe, y la superficie sale de `sideSurface` / `backSurface`.
  - Así funciona igual en directo, con la bola muerta y en las repeticiones, que van a cámara lenta y usan el reloj de la repetición.
  - No depende del evento `'wall'` de main.ts, que es de UI: ese evento sigue sonando como siempre. Si UI prefiere llamar a `view.wallFx(e.x, e.y, e.z, e.surface, e.speed)` desde el evento, también funciona.
- **Comprobado** en un partido de la IA: 13 golpes, 9 en cristal y 4 en malla, todos donde la simulación dice.

### Red y postes
- **Red de 10 m** que sigue `netHeight` (0,88 en el centro, 0,92 en los postes), con su cinta blanca, la tira central y el cordón de abajo.
- **Postes redondos negros** pegados a la malla lateral, cada uno con su tensor.
- **Sigue moviéndose** cuando la bola da en la red.

### La bola (`gear.ts`)
- **Fieltro amarillo:** mate, con el grano de las fibras en relieve y la costura blanca con la curva de una bola de tenis, que deja ver el giro.
- **Brillo en el borde:** un término de «pelusa» la hace más clara contra la luz.
- **Conserva un poco de emisión** para leerse en la sombra.
- **Radio** el de `court.ts` (3,35 cm). Se dibuja a 1,6× (antes 1,45×, porque la pista es más larga) y crece hasta 1,7× más al fondo, para que nunca baje de 6,5 px.

### La pala (`gear.ts`)
- **Medidas:** 45,5 cm de largo, 26 cm de ancho y 3,8 cm de grosor.
- **Tres formas de cabeza**, con los mismos nombres de `PaddleLook` que usa kits.ts:
  - diamante (`elongated`, el balance alto);
  - redonda (`standard`);
  - lágrima (`hybrid`).
- **Cara perforada** con 50–60 agujeros de 13 mm al tresbolillo, que atraviesan la pala, y el **corazón abierto** del puente.
- **Marco** del color del canto, mango con overgrip, tapón y **cordón a la muñeca**.
- **La cara** conserva el gráfico, la marca inventada, el tejido de carbono o fibra y la banda del marco. Por los agujeros se ve la goma EVA gris.
- **Coste:** unos 1.900 triángulos, la geometría compartida por forma y 3 llamadas por pala, como antes.
- **El centro de la cara sigue a 0,255 m** de la empuñadura. Así no cambian ni la IK ni los contactos medidos.

### Cámara de juego (`view.ts`, `cam`)
Va por encima del público del fondo cercano, detrás de la pared y más arriba que ella. Lo elegí con un script que proyecta la pista y prueba combinaciones de altura, distancia, punto de mira y campo de visión. El objetivo era que los jugadores lejanos salieran lo más grandes posible sin perder nada de la pista:

| | Distancia | Altura | Mira a | Campo de visión |
|---|---|---|---|---|
| Vertical | 23 m | 13 m | 0,25 m | 46° |
| Horizontal | 22,75 m | 11 m | 0 | 34° |

- **En vertical (390 × 844)** se ve la pista entera:
  - la malla del fondo lejano queda debajo del marcador;
  - un jugador cercano pegado a la pared lateral queda dentro del borde.
  - Un jugador lejano mide un 12 % de la altura de la pantalla y uno cercano, un 18 %.
- **En horizontal (844 × 390)** se ve la jaula entera, con las gradas a los lados.
- **La órbita del menú** es una elipse algo mayor, dentro del cuenco.
- **El mapa de sombras** cubre la jaula y las vallas (±7,4 × ±12,6 m).

### El estadio (`stadium.ts`, `venue.ts`)
- **El cuenco crece** de 8,4 × 12,8 m a 9,9 × 14,8 m de semilado. Así cabe la jaula de 20 × 10 m con sus vallas y su mobiliario. Todo lo demás sale de ese contorno: grada, palcos, cubierta, anillo de focos, videomarcadores, cintas LED y público.
- **Vallas LED:** tres detrás del fondo lejano y cuatro por lado, a 1,75 m de la pared lateral. No hay ninguna en el fondo cercano, porque la cámara mira por encima.
- **Junto a las puertas:** la silla del árbitro en la red y los banquillos.
- **Cámaras de tele:** detrás del fondo lejano, en las esquinas cercanas y una lateral frente al árbitro.
- **Fotógrafos:** detrás del fondo lejano y en las esquinas cercanas.
- **Sombras horneadas** al pie del cristal y de la malla, por dentro y por fuera.

### Videomarcador y marcador LED (`led.ts`, `view.ts`)
- **Lee** `m.games`, `m.pointText(0|1)` y `m.serverTeam`; `m.score` ya no existe.
- **Videomarcador:** nombre de la pareja, juegos en blanco y, en su propia casilla, los puntos del juego en amarillo bola: 0, 15, 30, 40, AD o la cuenta del tie-break.
- **Mensaje LED:** «TÚ 3  40 – 15  2 RIVAL».

### Marcadores en la pista (`view.ts`)
- **Fuera la cocina:** `kitchenWarn`, `lineCue` y el rojo de cocina.
  - El aro rojo a los pies queda para la única falta que se ve venir: devolver el saque de volea (`plan.oops`).
- **Recuadro de saque:** el cuadro diagonal del receptor, de la red a la línea de saque y de la línea central a la pared.
- **Colores de apuntado según el golpe:**

| Golpes | Color |
|---|---|
| Chiquita y dejada (`dink`, `drop`) | Cian |
| Drive, resto, volea y automático (`drive`, `return`, `speedup`, `auto`) | Amarillo |
| Globo (`lob`) | Violeta |
| Remate, bandeja y víbora (`smash`, `bandeja`, `vibora`) | Naranja |
| Bola que se va fuera | Gris |

### Personajes (`chars.ts`, `keyposes.ts`)
- **Fuera la cocina:**
  - la chiquita y la volea se eligen con `AT_NET` (estar en la red), no con la línea de cocina;
  - el balanceo sobre las puntas y la postura más baja dependen de lo cerca de la red que esté el jugador.
- **Saque de pádel por abajo, tras bote:**
  - durante `SERVE_WINDUP` (0,87 s) la mano libre suelta la bola 0,8 s antes del contacto (`SERVE_DROP` en keyposes.ts; `BALL_DROP` lo reexporta);
  - la bola cae, bota una vez con gravedad real y sube hasta el contacto, a `SERVE_HEIGHT`;
  - el bote suena con `onDeadBounce`.
  - Comprobado fotograma a fotograma (captura 05).
- **Bandeja y víbora:** comparten el clip del remate, igual que en la realidad la preparación no delata el golpe. A partir del contacto, el tipo de golpe (`lastHit.kind`) decide cómo sigue (tabla `OVER`):
  - **remate:** el seguimiento del clip hacia abajo, con salto;
  - **bandeja:** de perfil (el hombro izquierdo hacia la red), la pala hacia delante y cruzada a la izquierda a la altura del hombro, cara abierta; un salto menor;
  - **víbora:** igual, más cruzada y más baja.
  - Antes del contacto, un remate a más de 4,5 m de la red se prepara como bandeja.
  - Comprobado en un partido de la IA: 23 bandejas, 9 víboras y 11 remates, cada uno con su estilo.
- **Remates altos:** los globos de pádel se pegan a 2,7–2,9 m.
  - Antes la pala se quedaba a 40 cm de la bola en el contacto (60 cm con la bandeja sin salto).
  - Ahora el salto llega a 0,55 m en el remate y a 0,5 m en la bandeja y la víbora.
  - `tools/poses.ts` (modo CPU, 90 s): `paddle_smash` baja de 0,40 m a **0,20 m** de mediana. El resto de golpes sigue en 2–3 mm.

### Tele (`director.ts`)
- **Vuelo de presentación:** baja por encima de la pared lateral y entra en la jaula hacia la pareja lejana, cruza la red por dentro y sale por encima de la pared cercana hasta la cámara de juego.
  - Antes atravesaba el cristal y llenaba la pantalla de perfilería a 10 cm del objetivo.
- **La cámara de la red** va dentro de la jaula, pegada a la malla lateral.
- **`clearOfCage`:** ninguna cámara de la tele se queda a menos de 60 cm de una pared y por debajo de su borde; si cae ahí, la mete en la pista.
- **Comprobado** con una copia de `tools/tv.py` adaptada a juegos y puntos (`tools/tv.py` ya está actualizado):
  - presentación con **0 desajustes** de rótulos;
  - llamada del árbitro, plano del sacador, reacción, repetición en tres momentos, vuelta al saque y victoria.
  - Sin errores de consola.

## Coste

**Llamadas de dibujo y triángulos:** `renderer.info` en un peloteo de dobles (semilla 424242, `tools/look.py … doubles`). Incluye la pasada de sombras y el posprocesado.

| Nivel, 390 × 844 | Llamadas | Triángulos | Texturas |
|---|---|---|---|
| Alto | 73 | 201.600 | 51 |
| Medio | 60–62 | 201.900 | 39 |
| Bajo | 41 | 120.100 | 38 |

- Con 844 × 390 da lo mismo.
- **Referencia del pickleball 0.10** en medio y dobles: 58 llamadas y 186.400 triángulos. La jaula añade 3 llamadas y 2.300 triángulos, y no tiene ninguna en la pasada de sombras: la perfilería no proyecta sombra, porque sus rayas largas sobre la pista se leían como líneas.
- **El resto de triángulos** sale de las cuatro palas perforadas (unos 1.900 cada una, antes unos 700) y de un cuenco algo más grande.

**Personajes:** `tools/charcost.ts`, ya pasado a dos partidos de dobles. En la misma máquina, el chars.ts de antes da p50 71 µs y p90 145; el de ahora, p50 66 µs y p90 133 por jugador y fotograma. La bandeja y la víbora no cuestan nada medible.

**Texturas nuevas:**
- césped 512² (256² en bajo);
- color de la pista 320 × 448 (192 en bajo);
- bola 256 × 128 + 128 × 64 (antes 512 × 256 + 256 × 128);
- el cristal y la malla no usan textura.

**Tamaño:** `dist/index.html` ocupa 1.108.735 bytes, con todo el trabajo de los tres agentes.

**Coste en GPU** (cuidado en un móvil real):
- **el cristal:** un paño a pantalla completa en el fondo lejano, con alfa y el mapa de entorno;
- **la malla:** otro paño transparente.

En SwiftShader no se puede medir. Habría que pasarlo por un móvil medio y, si hace falta, poner el cristal en `MeshBasicMaterial` en el nivel bajo.

## Pendiente
- **Probar en un móvil de verdad**, sobre todo la sobreimpresión del cristal y la malla.
- **Repeticiones:** los golpes en la pared salen en ellas porque se leen de la bola, pero no tienen sonido, porque `onReplayEvent` solo sabe de golpes, botes y red (broadcast.ts es de UI). Si UI quiere sonido de pared en la repetición, `View.wallFx` es el sitio.
- **Bandeja y víbora con clips propios:** ahora son variantes del remate hechas con IK. Unos clips propios darían el corte de verdad.
- **Saque:** la mano libre suelta la bola en el momento que marca `keyposes.ts`. Si la simulación cambia `SERVE_WINDUP` o `SERVE_HEIGHT`, la bola los sigue, pero la mano y el clip no.
- **Salto del remate:** con globos de más de 2,9 m de altura de contacto, la pala aún se queda a unos 25 cm de la bola. El tirón de la pala lo tapa (`paddlePull`).
- **Lo que no he tocado** porque no es mío:
  - `tools/screens.py` y `tools/hud.py` siguen leyendo `m.score` y `lineHold`;
  - las herramientas que empiezan con `__pb.start(i)` funcionan porque main.ts ya lo convierte en dobles.

## Capturas de referencia
Las dejé en `/tmp/padel-render-shots/`:
- 01: vertical, peloteo;
- 02: horizontal, peloteo;
- 03: palas y bola;
- 04: impacto en el cristal;
- 05: saque con bote;
- 06: la tele, de la presentación a la victoria;
- 07: vertical, esquina.

## Archivos
- **Nuevo:** `src/render/cage.ts`.
- **Cambiados:**
  - en `src/render/`: `venue.ts`, `textures.ts`, `stadium.ts`, `gear.ts`, `led.ts`, `view.ts`, `chars.ts`, `keyposes.ts` y `director.ts`;
  - herramientas: `tools/charcost.ts` y `tools/poses.ts` (dobles y reglas nuevas); `tools/rally.py`, `seq.py`, `seqscan.py`, `shots.py`, `tv.py` y `tvserve.py` (juegos y puntos).
