# Pádel · ficha de concepto y estado

*Nombre provisional:* **Pádel · Pro Tour**. Es un juego propio del estudio Nocodeboy Games (Germán, 12 oct: «el pádel también es propio»): el nombre, la marca, las tiendas y la publicación los decide el estudio con sus protocolos. La marca está en `src/tour.ts`.
*Estado (12 oct 2026):* **prototipo 0.2 jugable en web**, hecho a partir del pickleball 0.10 (`Nocodeboy/Pickleball@2f15030`). La 0.2 trae de la 0.12 del pickleball (`cc00ccb`) las animaciones de captura de movimiento y el trabajo de Blender: ver «0.2» al final.

## El origen

Germán (11 oct): clonar el juego de pickleball y usarlo de inspiración para uno de pádel. Decisiones:

- **Repositorio:** uno nuevo con una copia del motor; cada juego evoluciona por su lado. Es `Nocodeboy/padel-pro` (privado, rama `main`) desde el 12 oct.
- **Primera entrega:** prototipo jugable de dobles contra la CPU, con paredes, reglas de pádel y pista de cristal.
- **Proyecto:** al principio se trató como encargo del mismo cliente que el pickleball; desde el 12 oct los dos juegos son propios del estudio, así que el motor se reutiliza sin permisos de nadie.

## Qué se reutiliza y qué es nuevo

- **Igual que en el pickleball:** control de un gesto (mantener, apuntar y soltar en la ventana dorada; toque para bloquear, latigazo para atacar), pies con aceleración y frenada de persona, asistencia de colocación, estadio, público, cámaras de TV, repeticiones, audio sintetizado, personajes y poses, y los bots de medida.
- **Nuevo en pádel:**
  - Pista FIP de 20 × 10 m con cristal y malla (`src/sim/court.ts`, `src/render/cage.ts`).
  - Rebotes en las paredes con solución cerrada, deterministas también en la malla (`src/sim/ball.ts`).
  - Reglas: saque por abajo tras bote con dos oportunidades, let, malla tras el bote del saque, resto obligado a botar, pared directa, por 3 y por 4.
  - Puntuación 15-30-40 con punto de oro o ventajas, set corto con tie-break y saque rotando entre los cuatro.
  - Un planificador que juega la bola después de que vuelva del cristal (`Match.path`).
  - IA de pádel: globo para tomar la red, chiquita, bandeja, víbora, remate y voleas a los pies.
- **Quitado:** cocina, regla del doble bote, individual y modo entrenamiento.

Detalle: `notas-01-simulacion.md` (física, reglas, IA y números) y `notas-01-graficos.md` (pista, jaula, pala, cámara y rendimiento).

## Rivales (cuadro de parejas, nombres al estilo del PES sin licencia)

| Pareja | Suena a |
|---|---|
| Paquito Navarra + Fede Chingoto | Paquito Navarro, Fede Chingotto |
| Fede Chingoto + Alejandro Galván | Fede Chingotto, Ale Galán |
| Alejandro Galván + Agustín Tapira | Ale Galán, Agustín Tapia |
| Agustín Tapira + Arturo Coeyo | Agustín Tapia, Arturo Coello |

Tu pareja es **Martín Di Neno** (suena a Martín Di Nenno).

**Riesgo legal:** igual que en el pickleball, son nombres que evocan a deportistas reales. Para la versión que se publique lo decide el estudio; cambiarlos es tocar `src/sim/brain.ts` (nombres de pila) y `src/tour.ts` (apellidos).

## Dificultad medida con el bot (16 partidos por celda, set a 3 juegos, punto de oro)

| Humano simulado | 1.ª pareja | 2.ª | 3.ª | Campeones |
|---|---|---|---|---|
| Novato | 100 % | 94 % | 63 % | 13 % |
| Medio | 100 % | 100 % | 69 % | 13 % |
| Bueno | 100 % | 100 % | 88 % | 44 % |

- **Golpes por punto:** de 12,7 a 14,7.
- **Duración del partido:** de 3,8 a 7,2 minutos.
- **Cómo acaban los puntos:**
  - un 42 % en la red y un 35 % en pared directa;
  - un 19 % ganadores o bolas a las que no se llega;
  - alrededor de un 1 % por 3.
- **Fuzz:** 68 partidos con pulgares al azar, sin fallos ni atascos.

## Pendiente

- **Probarlo en un móvil real**, como en el pickleball: la ventana del golpe, el cristal transparente (coste de dibujo) y el umbral del latigazo para la víbora.
- **Pocos ganadores** (19 %, frente al 30–40 % del pádel real) y demasiados puntos que acaban en pared directa: hay que afinar la IA para que remate y defina más.
- **Por 4:** la IA nunca lo busca.
- **Remates muy altos:** con globos de 2,7–2,9 m la pala aún no llega del todo a la bola en la animación.
- **Martín** falla demasiado en la red contra las parejas fuertes.
- **Personajes:** siguen el cuerpo y los clips del pickleball (falta un modelo de mujer y movimiento capturado de personas reales).
- **Online:** el mismo plan que en el pickleball (Colyseus en el VPS sobre la simulación determinista).

## 0.2 (12 oct): captura de movimiento y Blender, desde el pickleball 0.12

Germán, tras probar la 0.1 («se siente bien»): aprovechar del pickleball «el modelado en Blender y los movimientos y animaciones».

- **Animaciones** (`notas-02-animacion.md`):
  - carrera, andar, celebración y lamento de captura real (CMU);
  - derecha y remate de un tenista (pack *Sports* de Rokoko). La derecha es más compacta que la de tenis;
  - el revés se queda a una mano, como en el pádel: el de captura es a dos manos;
  - bandeja y víbora se montan sobre el remate de captura, sin tijera, de lado y con el final cruzado;
  - de la 0.11: tu jugador prepara el golpe con el círculo mientras llega, y el globo tiene su final con la pala subiendo.
- **Blender** (`notas-02-blender.md`, `art/blender/`):
  - mobiliario modelado con la oclusión horneada: la silla del juez en la red, los banquillos fuera de la jaula, las cámaras de TV y los taburetes de fotógrafos;
  - postes de la red de pádel nuevos, a ras de la malla, con el tensor;
  - sin sillas de jueces de línea;
  - la luz de los focos horneada sobre la pista, con las sombras suaves de la jaula y la red;
  - el mobiliario va en `assets/props/props.bin` y la luz en `assets/light/floor.webp`, fuera de la página.
- **Números:**
  - pala–bola en el remate, de 15,8 a 2,7 cm de mediana;
  - remate, bandeja y víbora golpean delante del cuerpo y no 33 cm por detrás;
  - mismas llamadas de dibujo, unos 49.000 triángulos más en calidad alta y media.
- **Para comparar en la URL:** `?mocap=off` (clips de antes), `?props=box` (mobiliario de cajas) y `?light=off` (sin luz horneada).

### Pendiente de la 0.2
- **La bandeja salta demasiado:** la simulación la golpea a unos 2,85 m (lo real es 2,3–2,6 m). Hay que bajar ahí la altura del contacto de la bandeja.
- **Licencia del pack de Rokoko:** confirmarla antes de publicar en una tienda. CMU se puede usar en un juego comercial; la cita está en `notas-02-animacion.md`.
- **Probar en el móvil:** los triángulos de más del mobiliario, la derecha y el salto del remate a la velocidad del juego.
- **Golpes propios del pádel con captura:** volea, chiquita, bandeja de verdad y salida de pared. El método de Blender ya está en el repo (`art/blender/padel_clip.py`); falta una fuente de capturas de pádel.


## 0.3 (12 oct): potencia, remates por 3 y por 4, bajada de pared y atributos

Germán, tras la 0.2: diferenciar víboras, bandejas, remates, por 3 y por 4; añadir las bajadas de pared; ajustar mejor la potencia; jugadores con características y atributos distintos. Decidió: potencia por la velocidad del gesto, por 3 y por 4 por gesto, y atributos visibles para todos. El repo pasa a `Nocodeboy/padel-pro` (privado, rama `main`).

- **Gesto → golpe** (detalle en `notas-03-simulacion.md`):
  - dedo quieto al soltar: golpe colocado; soltar normal: medio; latigazo: fuerte, tanto más cuanto más rápido;
  - por encima de la cabeza: soltar = bandeja; latigazo torcido = víbora; latigazo recto = remate; recto a tope con la bola alta y cerca de la red = **por 3**; latigazo hacia abajo = **por 4**;
  - bola que vuelve alta del cristal de fondo: aviso rosa «BAJADA»; soltar = bajada controlada, latigazo = bajada fuerte;
  - teclado: F más tiempo = más fuerte; Mayús+F = por 4.
- **Por 3 y por 4 los decide la física:** un por 3 perfecto con la bola a 2,5 m y a 2,5 m de la red sale el 48 % de las veces (77 % a 2,7 m y 2 m); un por 4, el 31 %.
- **Atributos 0–99** (`src/sim/attributes.ts`, `skillFrom` en `brain.ts`): potencia, control, velocidad, reflejos, remate, pared y toque. Mueven el juego de cada uno. Medias: Paquito 58, Fede 71, Alejandro 80, Agustín 84, Arturo 89, Martín 75, tú 73. Fichas en la presentación del partido, la media de cada pareja en el cuadro y «Tu pareja» en el menú (`notas-03-interfaz.md`).
- **Animación** (`notas-03-animacion.md`): bajada de derecha y de revés, por 3 más violento, por 4 liftado, la bandeja salta menos (se golpea a 2,48 m de mediana), destello y estela según la potencia. La CPU decide la bajada al salir a por la bola, así que la vista prepara el golpe que llega.
- **Números** (bot, 12–16 partidos por casilla, 3 juegos, punto de oro):
  - el bueno gana a los campeones el 33–50 % (el medio, 17–19 %; el novato, 0–13 %);
  - los ganadores pasan del 19 % al 31–33 % de los puntos;
  - 12–13,5 golpes por punto;
  - fuzz de 48 + 24 partidos sin fallos ni atascos.

### Pendiente de la 0.3
- **Probar en el móvil la curva de la potencia,** el umbral del por 3 (unos 1.330 px/s) y el latigazo hacia abajo.
- **Con el dedo no hay indicación de potencia mientras arrastras:** solo se ve al soltar (en el teclado sí hay barra).
- **Por 4 desde muy alto y muy cerca:** a veces sale por encima de la pared y cuenta como por 3.
- **El humano que globea una bola de bajada** ve primero la preparación de la bajada.
- **El medio contra los campeones** baja al 17–19 %.

## Prueba Rocketbox (12 oct): Arturo con un cuerpo de persona real

Germán: el pádel también es propio del estudio; probar un modelo masculino de Rocketbox (Microsoft, licencia MIT, como la jugadora del pickleball 0.13) para recrear a los jugadores con más variedad. Luego, ver cómo sacar golpes de vídeos de pádel.

- **Montaje** (`art/blender/persona.py`, `notas-04-rocketbox.md`): Male_Adult_01 (polo, pantalón corto y zapatillas) sobre el esqueleto del jugador tal cual. Le sirven todos los clips y la pala, y tiene dedos de verdad alrededor del mango. Lo lleva solo Arturo.
- **Para verlo:** `?rb=all` en la web (en el artefacto, `#rb-all` al final del enlace) lo pone en los cuatro jugadores; `?rb=off` / `#rb-off` vuelve al cuerpo de siempre.
- **Veredicto:**
  - mejor la cara (una persona real, distinta de los demás) y las manos;
  - peor el cuerpo: brazos y piernas finos, pantalón cargo hasta la rodilla y zapatillas planas;
  - en la cámara de juego apenas se nota.
- **Coste:** 589 KB y unos 11 MB de textura por persona; 4.803 vértices frente a 12.452.
- **Siguiente paso propuesto:** probar un candidato con camiseta y vaqueros pintados como pantalón corto (09, 11, 16 o 20) y engordar algo brazos y piernas en `persona.py` antes de rehacer a todos.

## 0.4 (12 oct): auditoría de jugabilidad y simulación

Germán: «una pasada de audit al juego para mejorar su jugabilidad y experiencia de simulación» (los modelos y las animaciones los investiga aparte). Dos revisores independientes (`auditoria-04-simulacion.md`, `auditoria-04-jugabilidad.md`, sondas en `tools/audit/`) y dos rondas de arreglos (`notas-04-simulacion.md`, `notas-04-interfaz.md`).

| Medida | 0.3 | 0.4 |
|---|---|---|
| Latigazo de 40–60 px | soltar normal | ataque (0,71) |
| Latigazo para el por 3 | 106 px o más | unos 75–80 px en 50 ms |
| Ataque apuntado | adonde acaba el latigazo | adonde apuntabas antes |
| Atributo +20 (puntos ganados; 48 % sin cambios) | pot 48, vel 48, rem 47, par 51, tq 50 | pot 54, con 60, vel 54, ref 65, rem 59, par 52, tq 56 |
| Puntos que acaban en el cristal sin botar | 33,5 % | 10,7 % |
| Pico del globo | 3,8 m | 5,5–5,8 m |
| Globo bueno que obliga a bajar | 3 % | 40–42 % |
| Golpes con las dos parejas en la red | 19–22 % | 8,7 % |
| Restos de globo | 35 % | 15 % |
| Bola que atraviesa a un jugador | 0,61 por punto | 0,05 (y si llega al cuerpo, bloqueo de reflejo) |
| Bandeja a 1,5 m del cristal | 1,18 m de alto | 0,46 m |
| Bueno contra los campeones | 25 % | 33–38 % |
| Jugadores cortados en vertical | 24 % de los fotogramas | 1–3 % |

- **Cámara e interfaz:**
  - en vertical, la pista sube para que tu jugador y el aro queden por encima del pulgar, con una copia pequeña del aro junto a la etiqueta del golpe;
  - en horizontal, la cámara se acerca;
  - un abanico enseña los remates posibles con la bola alta y su nombre sale tras golpear;
  - las pistas van en cola, cada una al menos 2,5 s;
  - el cartel dice de quién es el punto, el joystick es discreto y hay punto nuevo «le dio en el cuerpo».
- **Pendiente:**
  - la pareja de la red gana el 60–63 % (en el pro, aproximadamente el 65–75 %);
  - con el bot humano, las dos parejas en la red siguen siendo el 15 % de los golpes;
  - algún desequilibrio entre atributos (reflejos pesa más);
  - probar en el móvil la curva de potencia y el hueco bajo la pista en vertical.

## 0.5 (12 oct): sonido

Germán: «el sonido y el audio debemos mejorarlo»; le sonaban mal los golpes y el bote, las paredes, el público, faltaba música o voz, y «suena como raro en esta versión». Eligió la mezcla: unos créditos de Magnific en los sonidos clave y el resto sintetizado. Detalle en `notas-05-sonido.md`.

- **Lo raro venía de la mezcla, no de la 0.4:**
  - la bola era lo que menos se oía (un drive a −36,7 LUFS, una chiquita a −44,5), por debajo del rugido del público (−27), de la melodía de punto y de la campana;
  - el público rugía en 12 de cada 16 puntos, con un siseo 10 dB por encima del peloteo;
  - el cristal y los remates eran casi todo graves que un móvil no reproduce;
  - un chirrido de zapatilla salía 27 veces por minuto.
- **Golpes, cristal y bote grabados con IA** (ElevenLabs en Magnific, 70 créditos; quedan 157):
  - 14 tomas, de las que se usan 9 (42 KB);
  - familias suave y dura que se mezclan según la potencia del gesto, sin repetir toma y con algo de variación;
  - el chasquido sintetizado, solo en el por 3 y el por 4. La malla sigue sintetizada, como traqueteo metálico.
- **Mezcla:** reverberación ligera de pabellón y limitador. El partido sube de −36 a −29 LUFS y nada pasa de −3 dBFS.
- **Público:**
  - murmullo de 26 voces y «uy» de 36;
  - aplauso en los ganadores; el rugido, solo para el por 3 y el por 4, los remates ganadores, los peloteos largos y el final;
  - la zapatilla roza la arena del césped en vez de chirriar, y solo en las frenadas fuertes.
- **Música:** el tema de menús del pickleball (del estudio, Google Lyria), solo en los menús. Ajustes → Música: Sí / No.
- **Pendiente:**
  - voz del juez (sin presupuesto: se queda la campana);
  - más tomas (unas 6 duras, 4 suaves, malla, cinta y público real);
  - las repeticiones no guardan la potencia ni los golpes en pared;
  - **escucharlo en el móvil y con cascos.**

## Golpes desde vídeo (12 oct, rama `modelos-ia`)

Germán: «Es importante que hagamos lo de los vídeos». Detalle en `notas-golpes-video.md`.

- **Fuente:** clips de pádel del canal KNSU de YouTube (CC BY): un jugador, de lado, un golpe por clip. Se bajan en el portátil con `Vídeos\padel-clips\descargar_clips_padel.bat` (yt-dlp y Deno oficiales; sin Node).
- **En el juego:**
  - el saque y el revés pasan a ser de una persona real (antes, Meshy);
  - la bajada toma el cuerpo de una bajada real.
  - `?video=off` vuelve a los de antes.
- **El remate de vídeo está preparado pero sin usar:** la bandeja y la víbora se construyen sobre el clip del remate y con él salían peor. Falta ajustarlas.
- **Sonido:** los clips de KNSU están mudos; de estos vídeos no salen golpes reales. Lo que queda es grabarlos con el móvil en pista.
- **Créditos:** citar a KNSU (CC BY) al publicar.

