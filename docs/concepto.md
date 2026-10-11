# Pickleball (encargo) · ficha de concepto y estado

*Nombre provisional:* **Pickleball · Pro Tour** (hasta la 0.8, *Pickleball del Pinar*; Germán lo descartó el 10 oct). El nombre y la marca finales los pone el cliente: están en `src/tour.ts`.
*Estado (11 oct 2026):* **prototipo 0.10 jugable en web**. Sobre la 0.9: postura de espera de pickleball, brazo libre recogido, golpes más compactos, manos que agarran la pala, cuerpos con altura y complexión propias, público variado y desenfocado en los planos de TV, y ropa mate. Lo vigente está en las secciones del final; «Controles» y «Plan» de arriba son de la 0.1.

## El encargo

Un juego de pickleball. Decisiones de Germán (7 oct):

- **Plataforma:** web primero.
- **Modos:** los tres, por fases: 1 contra 1 contra la máquina, dobles 2 contra 2 y online contra personas.
- **Gráficos:** low-poly ahora y acabado premium después (jugadores 3D hechos con IA), más cerca de las referencias.
- **Primera entrega:** prototipo jugable.

Referentes enviados: *Pickleball Stars* (Zudo Labs) y *Premier Pádel*. Se toma su bucle (partido rápido, cámara detrás del jugador, escalera de rivales), no su estética ni sus marcas.

**Falta por saber del cliente:** quién es, marca y nombre, plazo, tiendas finales (Play, App Store o solo web), si quiere anuncios o compras, e idiomas.

## Fantasía y bucle

- **Fantasía:** ganar al campeón del club con dejadas finas y ataques en el momento justo.
- **Bucle de 30 s:** un punto de 6 a 15 golpes. Cada golpe es mantener, apuntar y soltar a tiempo.
- **Sesión:** un partido a 11 (de 2 a 7 minutos según el rival). Al ganar, se desbloquea el siguiente rival.
- **Meta (después de la 0.1):** temporada de torneos, equipación y palas, reto diario y dobles.

## Controles: un solo gesto

1. **Mantén** el dedo en cualquier sitio y **arrastra** para apuntar. Un aro y un arco discontinuo enseñan dónde caerá la bola.
2. **Dónde apuntas decide el golpe:**
   - En la cocina sale una **dejada** suave (cian).
   - En el resto del campo sale un **drive** (amarillo).
   - Más allá del fondo sale un **globo** (violeta).
   - El **ataque** y el **remate** salen solos con bolas altas en la red.
3. **Suelta** cuando el aro se cierre sobre la bola. Si está dorado, el golpe es *perfecto*. Si sueltas pronto, la bola se abre y puede ir a la red o fuera. Si no tocas, tu jugador devuelve una bola alta y fácil para el rival.
4. **El saque:** apunta al cuadro iluminado y suelta cuando el aro que late esté pequeño.

En ordenador también se juega con ratón, o con Espacio y las flechas.

El jugador **se mueve solo**: atrás mientras manda la regla del doble bote y luego a la línea de la cocina. Así el bucle cabe en un pulgar. Si la prueba dice que falta control, la 0.2 puede añadir un toque para «subir o quedarse».

## Reglas reales implementadas

- Pista reglamentaria de 20 × 44 pies, con cocina de 7 pies y red de 34 pulgadas en el centro y 36 en los postes.
- Bola de plástico perforado con mucha resistencia del aire, que bota poco.
- Saque por abajo al cuadro en diagonal. Si toca la línea de la cocina es falta; las demás líneas son buenas.
- Regla del doble bote: el resto y el tercer golpe tienen que botar.
- No se puede volear con los pies en la cocina. El rival más flojo comete a veces esta falta, y así se enseña la regla.
- Las bolas que van fuera se dejan pasar. Los rivales flojos a veces las juegan.
- Puntuación en Ajustes:
  - **Rally a 11** (por defecto): puntúa quien gana el punto.
  - **Clásica:** solo puntúa quien saca, con cambio de saque.
- El servidor saca desde la derecha cuando su tanteo es par.

## Rivales (escalera del Club del Pinar)

| # | Rival | Estilo |
|---|---|---|
| 1 | Paco | Juega de fondo, comete errores y alguna falta de cocina |
| 2 | Lola | Dejadas, paciencia |
| 3 | Bruno | Pega fuerte y ataca las bolas altas |
| 4 | Nuria | Sube a la red y juega a dejadas |
| 5 | Reina | Campeona: lo hace todo bien |

### Dificultad medida con el bot (24 partidos por pareja, rally a 11)

Cada celda es el porcentaje de partidos que gana el humano.

| Humano simulado | Paco | Lola | Bruno | Nuria | Reina |
|---|---|---|---|---|---|
| Novato | 100 % | 54 % | 54 % | 4 % | 0 % |
| Medio | 100 % | 100 % | 92 % | 63 % | 13 % |
| Bueno | 100 % | 100 % | 100 % | 100 % | 50 % |

- **Golpes por punto:** unos 8 contra Paco y entre 19 y 27 contra Reina.
- **Duración de un partido:** de 2 a 7 minutos (hasta 9,5 entre los mejores).
- Ningún partido se atascó.

El bot es una aproximación: tu prueba manda.

## Stack

Es el motor del estudio: **Three.js + TypeScript + esbuild**, todo en una página.

- **Reutilizado:** el patrón de build, el audio sintetizado y las partículas (de Wild Putt), y las piezas low-poly y el estilo de los personajes (de Tray Runner).
- **Nuevo:**
  - **Física de la bola en forma cerrada** (gravedad y resistencia lineal). Es exacta y determinista, así que el juego, el bot, la IA y un futuro servidor online calculan lo mismo.
  - **Planificador de contacto:** decide cuándo y dónde se golpea, respeta el doble bote y la cocina y deja pasar las bolas que van fuera.
  - **IA con 5 perfiles.**
  - **Jugadores con rig animado por código.**

**Preparado para dobles y online:** la simulación trabaja con equipos de 1 o 2 jugadores y una semilla, y los golpes son órdenes (objetivo, altura sobre la red y calidad). Para el online, el servidor (Colyseus en el VPS) ejecutaría la misma simulación.

## Plan

1. **0.1 (hecho):** 1 contra 1 contra la máquina, 5 rivales, tutorial jugando, español e inglés, ajustes y bot.
2. **Prueba de 5 minutos de Germán.** Después, 5 personas que jueguen más de 3 minutos sin ayuda. Decidir seguir, iterar o parar.
3. **0.2:**
   - **Dobles 2 contra 2:** rotación de saque con servidor 1 y 2 y regla de la primera mano, compañero con IA y llamada del tanteo de tres números.
   - **Feedback de la prueba.**
4. **0.3:**
   - **Online:** salas de 2 o 4 jugadores, Colyseus en el VPS y emparejamiento simple.
   - **Analítica:** fila `pickleball` en la tabla `games` del Supabase del estudio.
5. **Acabado premium:** jugadores 3D con IA (rig y animaciones), pistas temáticas, música, ficha y vídeo de tienda (regla del estudio).

## Riesgos

- **Movimiento automático:** puede sentirse pasivo. La prueba lo dirá. La alternativa es un toque para subir o bajar.
- **Ventana de tiempo de golpe (±0,1 s alrededor de 0,12 s antes del contacto):** hay que ajustarla en un móvil real.
- **Online en tiempo real:** con la simulación determinista basta con enviar los golpes. La latencia se esconde con la reacción del rival.

## Archivos

Código en GitHub desde el 11 oct: [Nocodeboy/Pickleball](https://github.com/Nocodeboy/Pickleball) (privado, rama `main`; cómo compilar y la estructura, en el `README.md`). Falta clonarlo en el portátil, en `Documentos\Nocodeboy Games\pickleball`.

- `npm run bot` mide la dificultad.
- `python3 tools/shots.py` y `python3 tools/screens.py` sacan las capturas.

## 0.2 (7 oct): control manual y aspecto de simulador

Germán probó la idea de la 0.1 y pidió dos cambios: el movimiento automático no le convence, y quiere gráficos más de simulador, no tan low-poly.

### Control
- **Dos pulgares.** El joystick izquierdo aparece donde tocas y mueve al jugador. El pulgar derecho golpea: mantener, arrastrar para apuntar y soltar. En ordenador se juega con WASD o las flechas y el ratón.
- **Alcance.** Solo golpeas lo que alcanzas, con unos 0,8 m de estirada. El aro de tus pies se pone amarillo cuando la bola va a llegar. Si no golpeas, la bola pasa: así dejas ir las que van fuera.
- **Cocina a tu cargo.** Si estás dentro y te viene una volea, la cocina se ilumina en rojo. Si golpeas, es falta.
- **Soltar a destiempo.** Si sueltas más de 0,75 s antes del contacto, no cuenta y hay que volver a pulsar. Mantener el dedo hasta el contacto da un golpe tardío.
- **Bot.** Simula un jugador con joystick (ahora juega a mano) y la escalera se ha reajustado. Un jugador medio gana a Paco el 100 %, a Lola el 69 % y a Bruno el 94 %, y no gana a Nuria ni a Reina. Un jugador bueno gana a Nuria el 69 % y a Reina el 6 %.

### Arte (receta del T-Rex, ahora con personas)
- **Jugador.** Imagen de referencia (Seedream) → Tripo H3.1, que detecta una persona y entrega 56.000 triángulos con textura de 2K → esqueleto estándar de Meshy (24 huesos, el de la biblioteca) → `tools/prep-character.mjs`, que lo deja en 18.000 triángulos, con textura WebP de 1024 px y el glTF en `.json` (los artefactos no sirven `.glb`).
- **Animaciones.** Meshy genera desde texto el preparado, el desplazamiento lateral y el drive de derecha. De la biblioteca se reutilizan reposo, andar y celebración. `tools/prep-clip.mjs` las convierte a `.json` sin desplazar la cadera.
  - El golpe arranca antes de tiempo para que el fotograma de contacto, que se mide solo con la mayor velocidad de la mano, caiga en el contacto real.
  - El desplazamiento lateral hacia la izquierda es el mismo clip reproducido al revés.
- **Recinto.**
  - Pista con resina acrílica procedural (color, rugosidad y normales), líneas pintadas y red con malla real, cinta y postes metálicos.
  - Vallas publicitarias del club, sin marcas, y gradas con público instanciado.
  - Marcador gigante con el tanteo en directo, torres de focos y árboles.
  - Cielo físico que ilumina todo (mapa de entorno), sombras y post-procesado: bloom suave, etalonaje, viñeta y grano. Tres niveles de calidad, y baja de nivel si va lento.
- **Rivales.** De momento usan el cuerpo del jugador con la equipación repintada en la textura (`src/kits.ts`). Cada uno tendrá su modelo si se aprueba el aspecto.
- **Coste.** 2.665 créditos de Magnific: imágenes 150, modelo 775, esqueleto 120, 3 clips 1.260 y aplicarlos 360. Quedan 27.702.

### Pendiente si se aprueba el aspecto
- **Rivales propios.** Cinco, cada uno con su modelo: unos 1.000 créditos cada uno.
- **Siete animaciones más,** unos 540 créditos cada una:
  - revés
  - remate
  - saque por abajo
  - dejada
  - carrera hacia delante y hacia atrás
  - estirada
  - reacción al perder el punto
- **Público.** Espectadores mejores que las cápsulas actuales, por ejemplo con impostores renderizados de un modelo.
- **Rendimiento.** Medirlo en un móvil real. Las capturas salen de un renderizado por software y no sirven para medir fps.

## 0.3 (7 oct): control y física

Germán probó la 0.2: los gráficos van mejor, pero el control y la física necesitan mejoras. No dijo qué fallaba en concreto, así que se atacó lo que más suele fallar con este esquema: llegar a la bola, el momento de soltar, cómo vuela y bota la bola, y que la pala la toque de verdad.

### Control
- **Golpe asistido (por defecto).** Si la bola llega a tu alcance, tu jugador golpea solo. El pulgar derecho solo apunta: mantener y arrastrar. Si sueltas mientras el aro está dorado, el golpe es *perfecto* (más limpio y más fuerte). Si no tocas nada, sale un golpe automático sensato. Las bolas que van fuera y las voleas desde la cocina se dejan pasar solas; manteniendo el dedo se juegan igual.
- **Golpe manual** en Ajustes, el de la 0.2: solo golpeas si sueltas a tiempo.
- **Círculo en la pista.** En cuanto el rival golpea, un círculo marca dónde ponerte para jugar la bola. Se pone verde cuando estás a tu alcance. El punto se recalcula 20 veces por segundo y no salta mientras siga valiendo.
- **Ayuda al moverte** (Ajustes: alta, media o sin ayuda; por defecto, media). Si sueltas el joystick cerca del círculo, el jugador da los últimos pasos solo: hasta 1,2 m con la media y 2,4 m con la alta. Si empujas más o menos hacia el círculo, se engancha y frena justo encima, sin pasarse.
- **Pies más ágiles.** Arranca más rápido y frena todavía más rápido. El alcance con estirada sube de 0,8 a 1 m.
- **Errores que se entienden.** Soltar pronto manda la bola cruzada y soltar tarde la abre. Un contacto malo levanta las dejadas, que caen largas y se pueden atacar. Un drive malo desde abajo se va largo. La red queda sobre todo para quien ataca fuerte desde debajo de la cinta.

### Física de la bola
- **Resistencia del aire según la velocidad.** Se aproxima la resistencia cuadrática real de una bola perforada: un drive pierde fuerza y «muere», y las dejadas y los globos hacen arcos limpios. Sigue siendo una solución exacta, así que el juego, la IA y el futuro servidor online calculan lo mismo.
- **Efecto.**
  - **Liftado** en drives, restos, globos y ataques: la bola cae antes y sale del bote rasa y rápida.
  - **Cortado** en dejadas y bloqueos: la bola flota un poco y se frena al botar.
  - El aro de puntería ya dibuja la curva con el efecto.
- **Cinta.** La bola que roza la cinta pierde velocidad, sube y cae al otro lado, y el punto sigue (sin *let*, como en el reglamento actual). Pasa en un 1,5 % de los golpes.
- **Velocidades** medidas en partidos de la IA: dejadas a unos 6 m/s, media de 12,6 m/s, drives fuertes a 19 m/s y máximo de 21,5 m/s.
- **La bola gira como debe:** hacia delante con liftado y hacia atrás con cortado. Antes de sacar, está en la mano libre del que saca.

### La pala toca la bola
- **IK en el brazo.** Cerca del contacto, el brazo se ajusta para que la pala llegue a la bola. Si la bola está baja o lejos, el jugador se dobla desde la cintura y da una estirada.
- **Precisión medida:** en los derechos, el centro de la pala queda a 0–12 cm de la bola.
- **Revés hecho por código** (no hay clip de revés): hombros de perfil, pala desde la cadera izquierda, a través de la bola y arriba a la derecha. En reveses bajos y estirados aún se queda a unos 20 cm. Durante una décima de segundo, la bola dibujada se pega a la pala; la simulación no cambia.
- **Arreglo de verdad para el revés:** un clip propio con Meshy, unos 540 créditos. Está en la lista de animaciones pendientes de aprobar.

### IA y equilibrio
- **Nuevo comportamiento de los rivales:**
  - Estiran el brazo como el humano (de 0,45 a 0,85 m según el rival).
  - Los mejores aguantan mejor la presión.
  - Atacan a veces bolas que no están altas, lo que es arriesgado.
  - La presión sube a partir del sexto golpe para que los peloteos acaben.
- **Bot nuevo** (`npx tsx tools/bot.ts [partidos] [ayuda 0|1|2]`). Simula a una persona con dos pulgares: reacción, error al dirigirse al círculo, error al apuntar y porcentaje de golpes perfectos. Además informa de cómo se pierden los puntos.

**Resultado con ayuda media** (24 partidos por pareja; % de partidos que gana el humano):

| Humano simulado | Paco | Lola | Bruno | Nuria | Reina |
|---|---|---|---|---|---|
| Novato | 75 % | 25 % | 13 % | 0 % | 0 % |
| Medio | 100 % | 100 % | 100 % | 46 % | 8 % |
| Bueno | 100 % | 100 % | 100 % | 100 % | 63 % |

Con la ayuda alta, un jugador medio gana a Nuria el 81 % y a Reina el 75 %, y un novato gana a Bruno el 56 %. Los peloteos van de 6 a 24 golpes por punto, y los partidos duran de 2 a 8 minutos.

### Herramientas
- `tools/swing.py`: primeros planos de golpes para comprobar el contacto pala-bola.
- `tools/rally.py`: capturas de un peloteo en vertical de móvil. Las dos avanzan el partido a mano, porque el renderizado por software es lento.

### Animaciones
Ocho clips nuevos de Meshy (revés, remate, saque, dejada, estirada, carrera, carrera hacia atrás y lamento) ya están en el juego. El 9 de octubre se cambiaron el lateral y la dejada, se añadió la estirada de revés (ver «Clips nuevos (9 oct)» más abajo) y, por la tarde, el drive sustituyó a la derecha, la volea pasó a tener gesto propio y la estirada de revés se rehízo (ver «Drive, volea y estirada de revés (9 oct, tarde)»). El 10 de octubre la carrera pasó a `run_v2`, los bucles de desplazamiento van al paso y se reproducen por el suelo que pisan, y se ve el paso de espera (ver «Carrera nueva y paso de espera (10 oct)»). Cada golpe usa su clip, elegido con el plan de contacto, porque el tipo de golpe solo se sabe al golpear:

| Clip | Cuándo | Contacto dentro del clip |
|---|---|---|
| Drive (`drive`) | por defecto, bola a la derecha (sustituye a la derecha de arriba abajo) | 0,46 s (pala delante de la cadera derecha, a toda velocidad) |
| Volea (`drive`, corta) | bola de aire a menos de 1,4 m de la línea de cocina, sin estirarse | 0,46 s |
| Revés | bola a la izquierda por debajo de 1,75 m | 0,95 s (a ojo: brazo delante, antes del final alto) |
| Remate | bola por encima de 1,75 m | 0,92 s (pala en lo más alto) |
| Dejada (`dink_v2`) | bola baja (menos de 0,72 m) en la línea de cocina y sin tener que estirarse | 1,58 s (la pala acaba de pasar por abajo y sube hacia delante) |
| Estirada | la bola queda a más de 0,4 m del alcance normal, contando dónde estarán los pies al golpear | 1,13 s (pala lo más lejos) |
| Estirada de revés (`lunge_left_v2`) | lo mismo, en el lado del revés y por debajo de 0,95 m | 1,27 s (pala baja delante de la rodilla izquierda, barriendo hacia la derecha; el clip arranca como pronto a 0,8 s) |
| Saque | el saque | 0,87 s (a ojo: pala recién pasada por abajo, delante del cuerpo) |

- **A tiempo.** El clip arranca para que su fotograma de contacto caiga en el contacto. Si hay menos tiempo, empieza a mitad. Encima siguen el IK del brazo, la flexión de cintura (ahora repartida por la columna) y el imán de la pala. Si el plan cambia (de derecha a estirada, por ejemplo), cambia de clip hasta 0,22 s antes del golpe. El revés por código de la 0.3 queda solo de reserva por si falta el clip.
- **Saque con preparación.** La simulación espera 0,87 s entre soltar el dedo (o la decisión de la IA) y el golpe, y avisa con el evento `serveStart`. El acierto del humano se sigue midiendo al soltar. La bola sale de la mano libre 0,35 s antes y cae hasta la pala. El contacto del saque sube de 0,55 a 0,7 m (sigue por debajo de la cintura), porque el brazo no llegaba tan abajo.
- **Remate alto:** por encima de 2,15 m el jugador da un saltito (hasta 0,42 m).
- **Desplazamiento.** Se mezclan reposo, lateral, andar, correr (desde 2–3 m/s hacia delante) y hacia atrás, según la velocidad y la dirección respecto al cuerpo. Desde el 10 oct todos los bucles van al paso (una fase común: el pie izquierdo pisa a la vez en todos) y cada uno se reproduce por el suelo que cubren sus pies apoyados, medido al cargar: lateral 1,31 m/s, andar 1,71, correr 3,63 y atrás 1,44 (antes 1,4, 1,8, 4,0 y 1,7, a reloj). Correr, hacia atrás y lateral repiten solo el tramo en plena zancada; el del lateral y el de la carrera funden su final con su principio para que el bucle no salte. Hacia la izquierda, el lateral lleva sus piernas espejadas (antes iba al revés).
- **Reacciones.** Quien pierde el punto por un error suyo (6 de cada 10 veces) o tras un peloteo de 8 golpes o más (7 de cada 10) se lamenta. El ganador celebra un golpe ganador tras 3 golpes o más, o un peloteo largo. Al final del partido, siempre. Nunca encima de un golpe, y se cortan al preparar el saque. También en el partido de fondo del menú.
- **Si falta un clip,** la carga no falla: se usa el drive para cualquier golpe, el revés por código y andar en vez de correr. Sin `lunge_left_v2`, las estiradas de revés son reveses, como antes; sin el lateral espejado, el lateral va al revés hacia la izquierda.
- **Clips compuestos.** Un papel puede tomar unos huesos de otro archivo, también espejados (`MIXED` en `chars.ts`): el lateral lleva el brazo libre de la postura de espera, y el lateral hacia la izquierda, además, las piernas de `shuffle_v2` espejadas. Qué archivo usa cada papel está en `CLIP_FILES` (la volea usa el del drive).

**Precisión medida** (distancia del centro de la pala a la bola en el contacto, unos 9 minutos de partido CPU contra CPU):

| Golpe | Golpes | Mediana | Peor |
|---|---|---|---|
| Derecha | 87 | 0,3 cm | 7 cm |
| Revés | 13 | 0,3 cm | 14 cm |
| Dejada | 58 | 0,3 cm | 4 cm |
| Estirada | 12 | 0,3 cm | 6 cm |
| Saque | 14 | 4 cm | 4 cm |
| Remate | 3 | 9 cm | 9 cm (bolas a 2,7 m) |

Los peores son reveses a unos 0,4 m del suelo y remates a 2,7 m, y el imán de la pala tapa la diferencia. Para llegar a las bolas bajas, la cintura se dobla hasta unos 70°. Las bolas pegadas al cuerpo se juegan con el codo recogido.

**Cómo ha salido cada clip:**
- **Derecha: sustituida el 9 oct (tarde)** por el drive (abajo). Subía la pala a 1,7 m, por encima de la cabeza, y bajaba picando, como un hachazo, a bolas que se juegan a 0,6 m.
- **Revés: bueno.** Se lee como revés a una mano. El final queda muy alto, por encima de la cabeza.
- **Remate: utilizable.** La preparación y el golpe por arriba están bien, pero después el cuerpo gira casi media vuelta. Se corta 0,2 s después del contacto.
- **Saque: bueno.** Preparación, golpe por abajo y final alto. La mano libre apenas se mueve: la caída de la bola la pone el juego.
- **Dejada: sustituida el 9 oct** por `dink_v2` (abajo). La vieja era una sentadilla muy abierta, con la pala delante, que casi no se movía.
- **Estirada: buena.** Zancada lateral larga a la derecha con la pala baja y lejos. Hacia la izquierda, desde el 9 oct, la estirada de revés (abajo).
- **Lateral: sustituido el 9 oct** por `shuffle_v2` (abajo). El viejo (de la 0.2) flotaba y no tenía un apoyo limpio: los pies se deslizaban en los dos sentidos.
- **Carrera: sustituida el 10 oct** por `run_v2` (abajo). Era una salida de sprint (empezaba agachado y frenaba al final) y corría torcida 23° hacia la izquierda; se usaba un tramo de 0,5 s con el modelo girado.
- **Hacia atrás: bueno.**
- **Lamento: bueno.** Manos en las rodillas, mira al cielo y se pone la mano en la cadera. Al final se da la vuelta, así que se corta a los 2 s.

**Lo que aún se veía raro en la 0.4** (la revisión del 9 oct, justo debajo, y los clips nuevos del mismo día arreglan o mejoran casi todo):
- La dejada no tiene gesto propio.
- El lateral (de la 0.2) arrastra los pies: el clip no tiene un apoyo limpio.
- Con bolas muy abiertas, el cuerpo se va de lado hacia la bola sin dar el paso.
- No hay estirada de revés ni salto de verdad para los remates muy altos.
- El paso de andar a correr mezcla dos ciclos que no van acompasados.

#### Revisión de naturalidad (9 oct)

Germán probó la 0.4: «los personajes aún no parecen naturales; algunas posturas no lo son». Antes de tocar nada se midió qué fallaba, con dos herramientas nuevas, y luego se arregló en `src/render/chars.ts`. Las animaciones de Meshy no cambian.

**Qué fallaba** (medido en 8 partidos de 2 minutos: CPU contra CPU, humano simulado y dobles):
- **La muñeca.** Para apuntar la pala a la bola, el IK doblaba la mano hasta 169° y la retorcía hasta 178°. En el 10 % de los fotogramas pasaba de 71°. Además, la mano se quedaba así después del golpe: el mezclador de three.js solo reescribe un hueso si su valor cambia, y como los clips no mueven la mano, guardaba la última corrección del IK. Por eso había jugadores corriendo con la muñeca doblada 90°.
- **Pies que patinan y flotan.** El pie de apoyo deslizaba a 0,72 m/s de mediana, y a 1,6–3 m/s durante los golpes: el golpe se quedaba también con las piernas aunque el jugador siguiera corriendo. Casi todos los clips flotan sobre la pista: 7 cm de mediana (preparado 6 cm, dejada 12 cm).
- **Saltos de postura.** Había giros de casi 180° en un solo fotograma en todo el cuerpo. El remate seguía avanzando mientras se desvanecía (gira media vuelta tras el golpe) y la mezcla de rotaciones saltaba. Además, 34 golpes volvían a empezar a mitad cuando la IA afinaba el plan.
- **La cabeza** no seguía la bola: en el contacto miraba a 43° de ella (mediana).
- **Correr de lado:** por encima de 2,2 m/s, el cuerpo iba a 82° de la dirección de la carrera, como un cangrejo.
- **El cuerpo se deslizaba** hacia las bolas lejanas sin dar el paso (hasta 10,7 m/s).
- **Brazo y torso:** el codo se doblaba al revés en algunos fotogramas, el torso llegaba a 105° de la vertical y la pala se sujetaba perpendicular al antebrazo, como un martillo.

**Qué cambia:**
- **Dos capas por clip, tronco y piernas.** El golpe se queda con el tronco enseguida, pero con las piernas solo cuando el jugador frena: mientras corre, las piernas siguen corriendo. Los pesos se suavizan, con fundidos de una décima de segundo, también entre los ciclos de desplazamiento.
- **Pies en el suelo.** El cuerpo baja hasta que el pie más bajo toca la pista. Un pie apoyado se queda donde se puso, con IK de pierna y la rodilla hacia donde la apunta el clip, hasta que la animación lo levanta, el cuerpo se aleja 26 cm o gira 45°. Entonces da un paso en arco hasta donde lo pone la animación, y nunca los dos pies a la vez. Por encima de 2,4 m/s mandan los pasos del propio ciclo, que ya va a la velocidad del suelo.
- **El codo es una bisagra.** Solo se dobla en su eje natural, que se midió en los clips, y nunca al revés ni del todo cerrado. Cerca del contacto apunta abajo y afuera en los drives y las dejadas, delante en el revés y arriba en el remate.
- **La muñeca tiene límites:** hasta 60° de flexión y 20° de giro. El antebrazo se encarga de la pronación, hasta 57° más que el clip. La pala ya no apunta a la bola: conserva la dirección del clip y solo se alinea con el brazo cuando hace falta para llegar.
- **Agarre nuevo.** Con la muñeca recta, la pala sale a unos 50° del antebrazo, como en un agarre continental, y no a 90°. Se ve más natural y llega más lejos sin forzar la muñeca.
- **El golpe pasa por la bola.** El recorrido de la pala del clip se desplaza para que pase justo por el punto de contacto. La pala no se para en la bola: sigue con su velocidad. El reloj del clip se ajusta entre 0,5× y 2× para llegar a tiempo. Si la IA afina el plan, el golpe se reajusta en vez de empezar de nuevo, y un cambio de golpe (derecha → estirada) es un fundido.
- **El cuerpo se orienta a la bola** en el último medio segundo antes del contacto: gira hasta 57° para que el golpe del clip quede de cara a la bola, delante en la derecha y al lado en la estirada. Así el brazo solo remata el movimiento.
- **Las caderas bajan antes de doblar la espalda.** En las bolas bajas, las caderas bajan hasta 20 cm (las rodillas se doblan y los pies no se mueven). El torso nunca pasa de 60° de la vertical, ni de 69° en la dejada, que ya es una sentadilla.
- **Bolas pegadas al cuerpo:** el jugador se aparta un paso, de hasta 30 cm, para dejar sitio a la pala. Las bolas lejanas se alcanzan con el cuerpo, como antes, pero los pies dan el paso.
- **La cabeza sigue la bola**, o el punto de contacto durante el golpe. Gira hasta 46° más que el clip, no levanta la vista más de 34° y no gira más rápido de unos 800°/s.
- **En las carreras largas de lado** el cuerpo gira hacia donde corre (hasta 77°) y vuelve a ponerse de cara antes del golpe.
- **Remate alto:** un salto de hasta 30 cm, con flexión antes de despegar, piernas recogidas en el aire y amortiguación al caer.
- **Rebote de espera:** cuando golpea el rival, el jugador que espera quieto flexiona un poco las rodillas. *Sustituido el 10 oct por el paso de espera (abajo).*
- **Sin saltos de postura.** Un golpe o una reacción que se desvanece frena su clip (el remate ya no se da la vuelta). El peso del IK sube y baja suave, y si el brazo tuviera que girar más de 46° en un fotograma, el giro se reparte entre varios.
- **El imán de la bola** solo actúa entre 0,08 s antes del contacto y 0,03 s después. Después, la bola se separa de la pala.
- **La sombra** va debajo del cuerpo dibujado, no del punto de la simulación (`view.ts`).
- **Coste:** las matrices se leen ya calculadas y no se recorre el esqueleto en cada consulta. En un ordenador cuesta unos 40 µs por jugador y fotograma de mediana (15 µs antes) y 150–330 µs en los fotogramas del golpe (100 µs antes). Con cuatro jugadores en un móvil debería quedar en 1–2 ms; falta medirlo en uno real.

**Resultado** (mismos partidos y semillas, antes → después; mediana / p90 / máximo):

| Medida | Antes | Después |
|---|---|---|
| Muñeca doblada | 1° / 71° / 169° | 1° / 23° / 60° |
| Muñeca retorcida | 0° / 61° / 178° | 0° / 10° / 20° |
| Pie de apoyo deslizando | 0,72 / 4,1 / 52 m/s | 0,08 / 3,6 / 13 m/s |
| … quieto | 0,06 / 0,78 / 36 m/s | 0,004 / 0,09 / 9 m/s |
| … de lado | 1,5 / 4,6 / 29 m/s | 0,17 / 3,4 / 13 m/s |
| Pie más bajo sobre la pista | 7 / 10,5 / 17 cm | 0 / 3,5 / 18 cm (saltos) |
| Giro máximo de un hueso en un fotograma | casi 180° (cualquier hueso) | 85–125° (brazo de la pala en pleno golpe), 22° (cadera) |
| Peor salto de postura (aceleración del giro) | 8.960°/s | 3.480°/s |
| Torso desde la vertical | 26° / 63° / 105° | 25° / 58° / 85° |
| Cabeza fuera de la bola en el contacto | 43° / 70° | 28° / 59° |
| Cuerpo frente a la carrera (> 2,2 m/s) | 82° / 147° | 52° / 139° |
| Fotogramas con el codo al revés | 6 | 0 |
| Golpes que vuelven a empezar | 34 | 0 |
| Pala–bola en el contacto | 0,3 / 3,2 / 37 cm | 0 / 0,3 / 81 cm |

En la pala, el 99 % de los contactos quedan a menos de 26 cm (antes a menos de 11). Los peores son bolas pegadas al cuerpo y por detrás del hombro, y remates a 2,7 m, fuera de alcance con un salto de 30 cm. El imán lo tapa hasta 30 cm: se ha preferido una muñeca natural a una pala que llegue siempre a costa de doblarla 150°.

**Herramientas:**
- `npx tsx tools/poses.ts [segundos] [salida.json]` ejecuta el `CharacterView` del juego en Node, sin navegador, durante 8 partidos con semillas fijas, y mide fotograma a fotograma: codo, muñeca, columna, torso, rodillas, pie de apoyo, suelo, saltos de postura, cabeza y pala–bola. Con `CHARS=otra/version/chars.ts` mide otra versión en los mismos partidos, para comparar antes y después. Las medidas están en `tools/posemetrics.js`, que también funciona dentro de la página.
- `python3 tools/poses.py [carpeta] [dist] [semilla] [puerto] [nivel] [rival] [momentos.json]` saca hojas de capturas en la página real: cada golpe alrededor del contacto, de frente y de lado; el desplazamiento en cada dirección; carrera → frenada → golpe; las reacciones; la cámara de televisión, y los peores fotogramas que encuentran las medidas. `Math.random` lleva semilla y la simulación no lo usa, así que con el `momentos.json` de otra pasada saca los mismos instantes con otra versión.

**Lo que queda:**
- **Clips que convendría rehacer con Meshy** (el lateral, la dejada y la estirada de revés se hicieron el 9 oct: ver «Clips nuevos (9 oct)»):
  - **Carrera** (opcional): es una salida de sprint torcida. Prompt: *"A pickleball player runs forward in a straight line at a steady fast pace, upright athletic posture, paddle in the right hand at waist height, natural opposite arm swing, constant speed throughout with no start or stop, feet landing under the hips. Three full stride cycles."* *Hecho el 10 oct: `run_v2`.*
- **Correr rápido:** a más de 2,4 m/s los pies siguen el ciclo y aún patinan algo (unos 2,5 m/s de mediana), porque la simulación pasa de parado a 4,6 m/s en 0,2 s y ningún paso real hace eso. *Arreglado el 10 oct (abajo).*
- **84 cambios de golpe en 950** (derecha ↔ estirada, dejada o revés) cuando la IA cambia de plan. Son fundidos, pero se ven.
- **Bolas por detrás del cuerpo:** el brazo no siempre llega y el imán tapa la diferencia. Un rediseño del punto de contacto en la IA (tomar la bola más delante) lo arreglaría de raíz.
- Medir el coste en un móvil real.

#### Clips nuevos (9 oct): lateral, dejada y estirada de revés

Tres clips de Meshy hechos con los prompts de arriba (texto a movimiento, preparados con `tools/prep-clip.mjs`, en el sitio). Antes de usarlos se revisaron fotograma a fotograma: esqueletos de frente, de lado y desde arriba cada 0,1 s, la altura de cada pie, el deslizamiento del pie apoyado, la velocidad y el recorrido de la pala, y dónde cae el contacto. Después se metieron en el juego y se compararon con lo que había en los mismos partidos (`tools/poses.ts`) y en los mismos instantes de la página (`tools/poses.py`).

**Lateral (`shuffle_v2`): adoptado, con dos arreglos.**
- **Lo bueno:** cada pie se apoya en plano y se queda quieto casi todo el paso. En el clip, el pie apoyado va hacia atrás a 1,33 m/s, siempre a la misma velocidad (1,27–1,48); en el viejo iba de −3 a +3 m/s, nunca apoyado de verdad. Moviendo un jugador a velocidad fija (sin bloquear los pies), el pie apoyado desliza 0,11 / 0,21 / 0,35 / 0,45 m/s a 0,8 / 1,5 / 2,5 / 3,5 m/s; el viejo, 0,60 / 0,72 / 1,19 / 1,69. En la página, a 1,5 m/s cada pie se queda clavado 0,4–0,7 s y luego da el paso; antes resbalaba unos centímetros en cada fotograma.
- **Lo malo, y cómo se arregla:** arranca parado (0–0,5 s) y frena al final; se usa un ciclo, de 0,53 a 1,57 s, con el final fundido sobre el principio (las dos puntas están a 9 cm). En ese ciclo el pie de atrás pasa por detrás del otro (las piernas se cruzan 0,15–0,2 s), y el prompt pedía que no. Ahora un pie en el aire no puede pasar al otro lado: se posa a 14 cm del otro como mínimo, como en un desplazamiento lateral de verdad. Además, la mano libre iba apoyada en la cadera, con el codo hacia fuera; ahora el brazo libre es el de la postura de espera.
- **Velocidad 1,4 m/s** (antes 3,0), la que menos desliza en la prueba a velocidad fija, en los dos sentidos. Hacia la izquierda se reproduce al revés y sale paso, juntar y paso; en esa prueba desliza casi igual que hacia la derecha, pero en los partidos solo mejora hacia la derecha (mediana 0,52 → 0,32 m/s; hacia la izquierda 0,33 → 0,34, y el p90 sube de 4,4 a 5,0).

**Dejada (`dink_v2`): adoptada.**
- En el clip los pies no se mueven nada y apenas flota (8 cm, antes 12). El gesto es corto: la pala baja 36 cm, toca fondo a 1,53 s y sube hacia delante; el contacto está a 1,58 s, cuando ya sube (antes, solo subía en vertical). El problema es la altura: Meshy la hizo de pie, con la pala a la altura del pecho (1,0–1,45 m).
- En el juego no importa: las caderas bajan, la espalda se dobla y el brazo lleva la pala a la bola. Queda una postura compacta, rodillas dobladas (81–92°), torso a 35–40°, pala baja delante y brazo libre suelto; antes era una sentadilla abierta con el torso a 67–74° y el brazo libre estirado. La pala sigue tocando la bola (0 cm en las 205 dejadas). Lo que empeora: la muñeca llega al contacto más doblada (unos 40°, antes 13°), dentro de su límite de 60°.
- Ya no hace falta que la dejada pueda inclinar más el torso que los demás golpes: ese límite se ha quitado.

**Estirada de revés (`lunge_left`): solo las piernas** (sustituida la tarde del 9 oct por `lunge_left_v2`, abajo).
- Las piernas están bien: zancada larga a la izquierda, rodilla sobre el pie, pierna derecha estirada. Pero quien va a por la bola es la mano izquierda, la libre (baja hasta 33 cm del suelo), mientras la de la pala se queda junto a la cadera derecha, a la altura de la cintura. Probado tal cual en el juego, el brazo de la pala tiene que cruzar el cuerpo: el codo se cierra hasta 138–146°, la pala pasa por delante de la cara y la muñeca va a sus dos límites.
- Por eso la estirada de revés son el tronco y los brazos del revés sobre las piernas de `lunge_left`. El revés llega a la bola en lo más hondo de la zancada (0,95 s): la pala queda a 0,89 m del cuerpo y a 0,59 m del suelo, cuando el revés solo llega a 0,67 m y a 1,52 m de altura. Se elige como la estirada de derecha: bola de revés por debajo de 1,3 m y a más de 0,42 m del alcance normal. Antes, esas bolas se jugaban de pie, corriendo, con el cuerpo resbalando hacia la bola.
- **Prompt para rehacerlo** (364 caracteres): *"A right-handed pickleball player lunges far to his left for a low ball: long step with the left foot, left knee bent over it, right leg extended. The paddle stays in his RIGHT hand: he swings it across his body for a one-handed backhand, right arm reaching low and out past the left knee. The empty left hand goes back for balance. Then he pushes back up to ready."*

**Resultado** (8 partidos de 2 minutos, mismas semillas, antes → después; mediana / p90 / máximo):

| Medida | Antes | Después |
|---|---|---|
| Pie apoyado deslizando | 0,05 / 3,4 / 13,5 m/s | 0,03 / 3,3 / 12,1 m/s |
| … de lado | 0,39 / 4,7 / 12,9 m/s | 0,33 / 4,6 / 9,4 m/s |
| … en la dejada | 0,15 / 4,1 / 12,9 m/s | 0,06 / 3,4 / 9,0 m/s |
| … quieto | 0,003 / 0,11 / 11,8 m/s | 0,003 / 0,07 / 7,3 m/s |
| Torso desde la vertical | 22° / 61° / 86° | 25° / 45° / 74° |
| Columna doblada | 18° / 49° / 79° | 21° / 37° / 62° |
| Cintura doblada con las piernas rectas | −6° / 19° / 62° | −5° / 12° / 60° |
| Muñeca doblada | 1° / 22° / 60° | 1° / 25° / 60° |
| Muñeca retorcida (en el golpe) | 0° / 14° / 20° | 0° / 17° / 20° |
| Codo | 47° / 83° / 146° | 47° / 87° / 146° |
| Saltos de postura (aceleración del giro, °/s) | p90 158, máx. 4.228 | p90 176, máx. 4.615 |
| Cuerpo deslizando respecto a la simulación | p90 0,14 m/s | p90 0,27 m/s |
| Pala–bola en el contacto | 0 / 0,3 / 56 cm | 0 / 0,2 / 56 cm |
| Cambios de golpe | 84 | 100 |

En la página (CPU contra CPU, semilla 7, 18.266 fotogramas): torso 29° / 67° / 85° → 30° / 48° / 73°, columna p90 68° → 38°, pie apoyado 0,14 / 3,9 / 16,6 → 0,10 / 4,0 / 9,5 m/s, peor salto de postura 5.567 → 3.803 °/s (p90 187 → 212), pala igual.

**Lo que queda:**
- **Saltos de postura algo más rápidos** (p90 +11 %): son pasos de verdad (un pie que se levanta y se posa) donde antes había deslizamiento. El peor sigue siendo el mismo golpe de derecha de antes.
- **16 cambios de golpe más:** la estirada de revés pasa a revés cuando la IA afina el plan y la bola queda más cerca (15 veces), como ya pasaba con la de derecha (19). Son fundidos.
- **La dejada nueva coge la bola más cerca del cuerpo** (0,45 m, antes 0,76): para las bolas algo más lejanas, el cuerpo se acerca más y los pies dan el paso detrás. Por eso sube el deslizamiento del cuerpo respecto a la simulación.
- **Hacia atrás en diagonal:** el lateral nuevo tiene otro ritmo que la carrera hacia atrás y, mezclados, los pies resbalan algo más (p90 de 4,9 a 5,5 m/s). *Mejorado la tarde del 9 oct: los pies apoyados ya no resbalan aunque los ciclos no vayan acompasados (abajo).*
- **Hacia la izquierda el lateral va al revés** y no espejado: se ve bien, pero el impulso de cada paso va al revés y en los partidos no desliza menos que el viejo. Espejar solo las piernas daría el paso exacto. *Hecho la tarde del 9 oct (abajo).*
- `assets/anims/idle.json` no lo usa nadie desde la 0.2. *Borrado el 9 oct (tarde), con `forehand.json`, `lunge_left.json` y `volley.json`.*

**Herramientas:** `tools/poses.py` saca también la estirada de revés y el lateral en cada sentido a la velocidad del lateral (1,2–2,6 m/s; por encima de 2,2 m/s el cuerpo ya gira para correr). `tools/posemetrics.js` separa el deslizamiento de lado por sentidos (`slide_sideR`, `slide_sideL`).

#### Drive, volea y estirada de revés (9 oct, tarde)

La revisión independiente de la 0.5 señaló tres fallos de los personajes: la derecha es un hachazo de arriba abajo (el 52 % de los contactos), se golpea a la carrera y se sale corriendo (la estirada no enseña la zancada) y los pies patinan en golpes y carreras. Se hicieron tres clips nuevos con Meshy y se cambió `src/render/chars.ts`.

**Cómo han salido los clips** (revisados fotograma a fotograma: esqueletos de frente, de lado y desde arriba, pies, recorrido y velocidad de la pala):
- **Drive (`drive`): adoptado, con arreglos.** Es compacto: la pala no pasa por detrás de la cabeza (lo más alto, 1,54 m junto al hombro; la derecha vieja subía a 1,70 m por detrás). Pero no es lo que se pidió: golpea plano a la altura del pecho (contacto a 1,40 m), termina cruzado a 1,0–1,2 m y el pie derecho resbala 14 cm hacia fuera. Sirve para todas las derechas: las bolas altas son justo su golpe, y para las bajas el juego lo convierte en un golpe de abajo arriba (abajo). La derecha vieja se borra: con el drive solo quedaban para ella 2 contactos de 797.
- **Volea (`volley`): no sirve.** Gira el cuerpo 80° a la derecha despacio (0,3–1,0 s) y su único movimiento rápido lleva la pala hacia atrás, lejos de la red (de 0,5 m delante a 0,8 m detrás en una décima); después vuelve despacio. La volea del juego es el drive, corto (abajo). Prompt para rehacerla (337 caracteres): *"A right-handed pickleball player stands at the kitchen line in a ready stance, paddle up in front of the chest. A ball comes at chest height: he punches the paddle forward to meet it in front of the body, very short backswing, firm wrist, almost no body turn, then the paddle comes back to ready in front of the chest. Feet stay planted."*
- **Estirada de revés (`lunge_left_v2`): adoptada desde 0,8 s.** Por fin va a por la bola la mano de la pala: lleva la pala atrás por la izquierda y barre hacia la derecha por delante de la rodilla izquierda (contacto a 1,27 s, pala a 0,54 m), con la mano libre atrás. Dos pegas: antes (0,5–0,7 s) barre la pala de derecha a izquierda por delante, como una derecha, así que el golpe arranca como pronto a 0,8 s; y la zancada (0,2–0,5 s) queda antes. Se probó a poner las piernas 0,5 s más tarde que los brazos, pero las caderas giran con las piernas y el brazo pasaba muy por debajo de la bola; la zancada la dan los pies del juego (abajo). Es muy honda (caderas a unos 0,56 m del suelo): se usa con bolas por debajo de 0,95 m (las más altas son reveses con el cuerpo yendo hacia la bola), y con una bola por encima de su contacto las caderas suben hasta 20 cm (también en la estirada de derecha). Sustituye a la estirada compuesta (brazos del revés sobre las piernas de `lunge_left`).

**Qué cambia:**
- **Golpe de abajo arriba.** Con una bola por debajo de donde el clip la golpea, la pala sigue el recorrido del clip a lo ancho, pero en altura va atrás a la altura de la bola (6 cm por debajo) y después del contacto sube hasta donde termina el clip. El IK coge la pala desde 0,42 s antes (antes 0,23 s), así que la preparación ya es baja. Las rodillas empiezan a doblarse 0,45 s antes y se doblan contando desde una bola a 1,0 m (no desde el contacto del clip, a 1,47 m, que pedía doblar mucho la cintura). La pala gira con el antebrazo, con la muñeca como la tiene el clip, en vez de conservar su dirección en el mundo; solo pegada a la bola se orienta como en los demás golpes. Lo mismo en la volea y en la dejada. Al revés, con una bola por encima del contacto del clip, una preparación que viene de más arriba se aplana: no baja sobre la bola desde encima de la cabeza.
- **Volea:** el drive con medio recorrido, el tronco al 65 % del clip y el IK desde 0,22 s antes hasta 0,12 s después; termina 0,16 s después del contacto. Se elige con una bola de aire a menos de 1,4 m de la línea de cocina (por debajo de 0,72 m sigue siendo dejada).
- **El seguimiento va con el cuerpo:** después del contacto, el recorrido de la pala se mueve con el jugador. Antes se quedaba anclado donde estaba la bola y, con el jugador frenando o la estirada volviendo, el brazo acababa en el suelo.
- **Golpe en movimiento.** Desde 0,3 s antes hasta 0,2 s después del contacto, el golpe se queda con las piernas aunque el jugador vaya rápido (antes, solo al pararse): los pies se plantan y, si el cuerpo sigue, dan pasos cortos de frenada. La estirada se queda con las piernas desde 0,8 s antes, así que se ve la zancada. Después del contacto no hay sprint ni giro hacia donde se corre hasta pasados 0,22–0,45 s: primero, un paso de empuje. La simulación va a limitar la velocidad cerca de los contactos (otro trabajo en paralelo); esto hace que se vea bien a cualquier velocidad.
- **Pies:**
  - Los pies apoyados se quedan clavados también corriendo (antes, por encima de 2,4 m/s, seguían al clip y patinaban).
  - El suelo del clip es el pie más bajo de los últimos instantes (sube despacio): la fase de vuelo de la carrera queda en el aire. Antes el cuerpo bajaba para posar en el suelo el pie de delante, que barría la pista.
  - Un pie que el clip aún mueve rápido va 1–3 cm por encima del suelo hasta que se posa. Los pasos levantan el pie antes de moverlo y lo bajan al final, el pie va más rápido cuanto más corre el cuerpo y, en marcha, se clava más tarde y se suelta antes (el apoyo de los clips es corto y bajo).
  - La rodilla tiene un límite suave al estirarse del todo: el pie se queda un poco corto en vez de que la pierna dé un tirón (los saltos de postura de las piernas bajan a la mitad).
  - Velocidades de los ciclos medidas en el pie que pisa: andar 1,8, correr 4,0 y atrás 1,7 m/s.
  - El lateral hacia la izquierda lleva las piernas espejadas (los pies espejados caen a menos de 7 mm de donde deben).

**Resultado** (8 partidos de 2 minutos, mismas semillas, antes → después; mediana / p90; el pie apoyado es el que está a menos de 3 cm del suelo, en m/s):

| Medida | Antes | Después |
|---|---|---|
| Lo más alto de la pala en el medio segundo antes de una derecha por debajo de 1 m | 1,65 / 1,77 m | 0,99 / 1,11 m |
| … por encima de la bola (todas las de ese lado, también dejadas y voleas) | 0,86 / 1,16 m | 0,43 / 0,75 m |
| Pie apoyado, en total | 0,02 / 2,13 | 0,015 / 0,34 |
| … a ±0,2 s del contacto | 0,11 / 2,69 | 0,03 / 0,38 |
| … ídem, moviéndose a más de 1,5 m/s | 0,76 / 5,16 | 0,03 / 0,68 |
| … en la derecha → drive | 0,41 / 4,77 | 0,09 / 0,96 |
| … en la volea | (era la derecha) | 0,09 / 0,56 |
| … en la estirada | 1,94 / 5,88 | 0,03 / 2,28 |
| … en la estirada de revés | 0,15 / 3,98 | 0,62 / 2,70 |
| … corriendo | 2,22 / 7,06 | 0,27 / 3,07 |
| … andando | 0,36 / 3,53 | 0,25 / 1,48 |
| … hacia atrás / en diagonal hacia atrás | 0,86 / 4,89 · 0,39 / 4,28 | 0,28 / 1,68 · 0,18 / 1,19 |
| … lateral, derecha / izquierda | 0,14 / 2,99 · 0,13 / 2,82 | 0,11 / 1,11 · 0,11 / 1,01 |
| … quieto | 0,003 / 0,05 | 0,004 / 0,07 |
| Saltos de postura (°/s, p90 / p99 / máx.) | 176 / 1.084 / 4.615 | 178 / 736 / 4.047 |
| Muñeca doblada en los golpes | 1° / 40° | 7° / 28° |
| Torso desde la vertical (y máx.) | 25° / 45° / 74° | 19° / 39° / 66° |
| Cintura doblada con las piernas rectas (p99 / máx.) | 32° / 60° | 26° / 52° |
| Cabeza fuera de la bola en el contacto | 28° / 58° | 24° / 55° |
| Pala–bola en el contacto (p50 / p90 / p99 / máx.) | 0 / 0,2 / 24 / 56 cm | 0,2 / 0,4 / 24 / 27 cm |
| Cambios de golpe al afinar el plan | 100 | 82 |

En la página (`tools/poses.py`, semilla 7, CPU contra CPU, 14.893 fotogramas, mismos instantes antes y después): pie apoyado 0,06 / 3,11 → 0,03 / 0,53 m/s; a ±0,2 s del contacto 0,15 / 2,90 → 0,03 / 0,43; ídem a más de 1,5 m/s 0,72 / 4,59 → 0,03 / 0,83; corriendo 2,48 / 6,98 → 0,28 / 3,31; lo más alto de la pala antes de una derecha baja 1,61 / 1,75 → 1,13 / 1,35 m; saltos de postura p90 / p99 / máx. 214 / 1.230 / 3.495 → 201 / 786 / 4.340 °/s (el peor, una pierna en un saque); torso 30° / 48° → 24° / 40°; pala igual (p99 25–26 cm, remates). Las repeticiones se ven bien (sondeo de la revisión, 32 capturas).

Pala–bola por golpe: drive 0,2 cm de mediana y 4 cm el peor (231 golpes), volea 4,5 cm el peor (185); los peores siguen siendo remates a 2,7 m. A velocidad fija (`tools/poses-loco.ts`, 8 direcciones × 5 velocidades), el pie apoyado pasa de 1,10 / 5,23 a 0,13 / 1,14 m/s (hacia delante a 3,5 m/s, de 0,60 / 7,31 a 0,18 / 0,32), y los saltos de postura de esa prueba suben (p90 131 → 276 °/s): donde antes el pie resbalaba, ahora da un paso.

**Herramientas:**
- `tools/poses-loco.ts` (nuevo): un jugador a velocidad fija en 8 direcciones y 5 velocidades, más arranques y frenadas, sin partido; pie apoyado y saltos de postura por casilla. `CHARS=…` mide otra versión y `SPEEDS='{"backpedal":1.6}'` prueba otras velocidades de los ciclos.
- `tools/posemetrics.js`: el pie apoyado solo cuenta si está en el suelo (`slideG`, por acción, por sentido del lateral, en diagonal hacia atrás y alrededor del contacto, también a velocidad), lo más alto de la pala antes de cada derecha baja (`backswingTop`), y saltos de postura por acción y por hueso y muñeca por golpe (con `JERK=1` en `tools/poses.ts`).
- `tools/poses.py`: las hojas de la cámara de televisión ya no salen en blanco (vuelve a la cámara del juego después de cada «peor fotograma»); saca drive y volea (`KINDS=…` elige golpes), los golpes desde 0,42 s antes, y una hoja de golpe en movimiento (`golpe-en-movimiento`) además de la de carrera, frenada y golpe, ahora hasta 0,45 s después.

**Lo que queda:**
- **La estirada de revés resbala más en mediana** (0,15 → 0,62 m/s; el p90 mejora): llega corriendo a 4–4,6 m/s y la postura de estirada no anda. Con la velocidad limitada cerca del contacto debería bajar.
- **Corriendo, p90 de 3 m/s:** el clip de carrera (una salida de sprint) posa el pie aún barriendo hacia delante. Hacia atrás a más de 3,5 m/s, una persona se giraría y correría. *Arreglado el 10 oct (abajo): p90 de 0,8 m/s, y en diagonal hacia atrás a velocidad el cuerpo se gira y corre.*
- **El pie más bajo flota algo más** (p90 3,5 → 5 cm): es la fase de vuelo de la carrera, que antes se aplastaba contra el suelo.
- **El drive se rehace en código** para las bolas bajas; un drive de abajo arriba hecho de verdad se vería mejor de cerca. Y la volea de Meshy está por rehacer (prompt arriba).
- En algunas voleas bajas la muñeca llega a su límite de 60°.

#### Carrera nueva y paso de espera (10 oct)

Tres cosas: la carrera seguía patinando a velocidad (el pie apoyado, p90 de unos 3 m/s), el clip de carrera era una salida de sprint, y la simulación ya decía cuándo hay paso de espera, freno y final del golpe (`match.stance`), pero los personajes no lo usaban. Todo en `src/render/chars.ts`; la simulación no cambia.

**`run_v2` (Meshy, «steady fast running cycle, two full strides, seamless loop»): adoptado.** Revisado con `tools/clip-feet.ts` (apoyos de cada pie, velocidad del pie apoyado, rumbo, ventanas de bucle, saltos):
- **Lo bueno:** carrera de verdad, erguida, a ritmo constante, con braceo y la pala abajo; zancada de 0,55 s; tiembla como el viejo (cambio de la velocidad de giro entre fotogramas, mediana 55 °/s; el viejo, 63).
- **Lo malo:** las dos zancadas no son iguales (la primera va 12–16° a la derecha, la segunda 4–10°, y al final frena y se levanta), así que no hace bucle entero: sus extremos están a 50° y 55 cm. Se usa una zancada, de 0,867 a 1,417 s, con los últimos 0,2 s fundidos sobre el principio (los extremos de esa ventana estaban a 19° y 10 cm; fundidos, iguales). En esa zancada los pasos van 9° a la derecha.
- **Y el pie apoyado no va a ritmo constante:** se posa aún yendo hacia delante (unos 4 m/s respecto al cuerpo en el primer fotograma) y se va a 5 m/s hacia atrás. Con el reloj, ninguna velocidad lo deja quieto (el viejo hacía lo mismo). Se arregla abajo.
- `run.json` se borra: ya no lo usa nadie.

**Qué cambia:**
- **Los bucles se reproducen por el suelo que pisan.** Al cargar, se mide en cada bucle (andar, correr, atrás, lateral a cada lado) cuánto retrocede el pie apoyado en cada instante (`gaitOf`). El clip avanza por esa distancia y no por el reloj: el pie apoyado retrocede justo a la velocidad del jugador y el cuerpo pasa por encima de él. Los instantes en que el pie se posa aún yendo hacia delante van al ritmo medio (eso no lo arregla ningún reloj; lo hace el aterrizaje, abajo). Velocidades medidas así (modelo de 1,7 m): andar 1,71 m/s, correr 3,63, atrás 1,44 y lateral 1,31.
- **Al paso.** Todos los bucles comparten una fase: el pie izquierdo pisa a la vez en andar, correr, atrás y lateral (en el lateral a la izquierda, el espejado, también). Al pasar de andar a correr, o en una mezcla, los dos clips llevan el mismo pie en el suelo. La fase avanza al ritmo de cada bucle, pesado por lo que se ve de cada uno.
- **Pasos rectos.** Correr va 9° a la derecha y andar 14° a la izquierda (medido en el pie apoyado). Mientras suenan, las piernas se giran eso bajo el pecho, que queda como lo tiene el clip. El viejo giraba el modelo entero 23°.
- **El pie se posa ya frenado.** A más de 1,2 m/s, un pie que baja no se clava hasta que el clip lo frena por debajo de 1,2 m/s (o tras 0,07 s abajo). Antes se clavaba al tocar el suelo, aún a 5–8 m/s: patinaba al entrar o se quedaba atrás y estiraba la pierna. Además, un pie que va rápido no roza el suelo: cuanto más rápido, más alto, hasta 4 cm.
- **El pie apoyado rueda sobre la punta.** Cuando el talón se levanta, la punta se queda donde está (antes el tobillo quedaba fijo y la punta resbalaba hacia atrás al despegar).
- **En diagonal y a velocidad, corre.** A más de 2,2 m/s el cuerpo se gira hacia donde va también en diagonal (antes solo de lado): a 45° y 4,5 m/s no mezcla lateral y carrera, corre. Hacia atrás en diagonal se gira hasta 135° y corre; recto hacia atrás sigue con la carrera hacia atrás. Medio segundo antes del golpe se vuelve a poner de cara, como antes.
- **El paso de espera se ve.** Cuando el rival va a golpear (su plan o su saque), un jugador parado o a menos de 1,5 m/s da un saltito de 2,5 cm sobre las puntas, que empieza 0,1 s antes del golpe. Cae a los 0,04 s con los pies a la anchura de la postura de espera más 5 cm por lado, y las rodillas recogen 4,5 cm. A los 0,35 s está asentado. Si iba corriendo o el golpe llegó sin verlo venir, solo recoge las rodillas (2,7 cm). Se apaga suave si su propio golpe está a menos de 0,35 s. Lo dispara `match.stance(id) === 'split'` (el humano y la CPU, individual y dobles) y sustituye al rebote de espera.
- **Plantar y terminar el golpe, de la simulación.** Las piernas del golpe entran en 0,08 s cuando la simulación frena hacia el golpe (`'plant'`) y salen en 0,12 s cuando termina el golpe (`'follow'`). La carrera y el giro hacia donde corre no vuelven hasta que acaba `'follow'` (antes, por tiempo: de 0,32 s antes a 0,34 s después del contacto). En un intercambio rápido, con el golpe propio a menos de 0,3 s, el paso de espera ya cuenta como pies plantados (la CPU no entra en `'plant'` hasta que acaba su reacción). Las estiradas siguen dando la zancada desde 0,8 s antes. Sin `match.stance` (un banco de pruebas), todo va por tiempo, como antes.
- **Repeticiones:** guardan la postura dibujada, así que llevan el paso de espera, las piernas giradas y los pies tal cual. El modelo ya no se gira (`model.rotation.y` queda en 0).

**Resultado** (`tools/poses.ts 240`, 8 partidos de 4 minutos, mismas semillas, antes → después; mediana / p90 / p99; pie apoyado en m/s):

| Medida | Antes | Después |
|---|---|---|
| Pie apoyado, en total | 0,018 / 0,35 / 2,9 | 0,004 / 0,20 / 1,1 |
| … corriendo | 0,27 / 2,88 / 7,0 | 0 / 0,83 / 1,5 |
| … andando | 0,24 / 1,54 / 6,5 | 0,04 / 0,48 / 1,3 |
| … lateral | 0,11 / 0,94 / 4,2 | 0,02 / 0,53 / 1,5 |
| … hacia atrás / en diagonal hacia atrás | 0,28 / 1,74 · 0,20 / 1,39 | 0,09 / 0,70 · 0,05 / 0,60 |
| … a ±0,2 s del contacto (y a más de 1,5 m/s) | 0,026 / 0,34 (0,04 / 1,34) | 0 / 0,19 (0,01 / 0,46) |
| … en el drive / la estirada / la estirada de revés | 0,09 / 0,69 · 0,02 / 1,47 · 0,24 / 1,37 | 0 / 0,39 · 0,02 / 0,66 · 0 / 0,68 |
| … frenando hacia el golpe (`plant`) / terminándolo (`follow`) | 0,02 / 0,53 · 0,03 / 0,35 | 0 / 0,23 · 0 / 0,06 |
| … en el paso de espera (`split`) | 0,03 / 0,31 / 2,5 | 0,005 / 0,48 / 1,3 |
| … quieto | 0,004 / 0,08 / 0,9 | 0,003 / 0,10 / 0,8 |
| Pie más alto que el suelo (p90 / p99) | 5,0 / 10,1 cm | 4,5 / 9,0 cm |
| Saltos de postura (°/s, p90 / p99 / máx.) | 177 / 729 / 3.871 | 189 / 730 / 3.400 |
| … corriendo (p90 / p99) | 205 / 680 | 195 / 592 |
| Cuerpo frente a la carrera (> 2,2 m/s) | 51° / 139° | 46° / 124° |
| Giro de la columna (p90 / máx.) | 15° / 40° | 17° / 40° |
| Pala–bola en el contacto (p50 / p90 / p99 / máx.) | 0,2 / 0,3 / 24 / 28,5 cm | igual |
| Pasos de espera (1.209): saltito / pies más abiertos / caderas abajo (medianas) | 0 / 0 / 2,4 cm | 2,5 / 9 / 4,8 cm |

A velocidad fija (`tools/poses-loco.ts`, 8 direcciones × 5 velocidades): pie apoyado 0,13 / 1,14 → 0,02 / 0,46 m/s; saltos de postura p90 / p99 276 / 873 → 235 / 836. Hacia delante a 3,5 m/s 0,18 / 0,32 → 0,00 / 0,04; en diagonal hacia delante a 4,5 m/s 0,32–0,47 / 2,9–4,9 → 0 / 0,7; arranques y frenadas hacia delante, máximo 7,4 → 1,4 m/s (hacia atrás 3,6 → 4,0).

En la página (`tools/poses.py` con `SHEETS=split,loco,stops`, semilla 7, mismos instantes antes y después): la hoja `paso-de-espera` muestra el saltito y la caída equilibrada (antes, el jugador seguía en una zancada lateral abierta); `loco-adelante`, una carrera erguida con braceo (antes, la salida de sprint con la pala delante); `transicion-carrera-golpe` y `golpe-en-movimiento`, sin cambios visibles en el golpe.

**Herramientas:**
- `tools/clip-feet.ts` (nuevo): los pies de un clip (`run_v2`) o de un bucle tal como lo toca el juego (`role:run`): altura de cada pie, apoyos, velocidad y rumbo del pie apoyado, ventanas de bucle y saltos.
- `tools/posemetrics.js`: pie apoyado según el momento de la simulación (`slideG_st_split`, `_plant`, `_follow`) y, por cada paso de espera, saltito, cuánto se abren los pies y cuánto bajan las caderas (`splitHop`, `splitWiden`, `splitDip`; `tools/poses.ts` los imprime).
- `tools/poses.py`: hoja del paso de espera (`paso-de-espera-0/1`, de frente y de lado, de 0,2 s antes del golpe del rival a 0,35 s después) y `SHEETS=…` para sacar solo algunas hojas.

**Lo que queda:**
- **Saltos de postura algo más altos parado** (p90 de 30 a 68 °/s quieto; 177 → 189 en total): son los pasos de espera, en que los dos pies se levantan y se posan. La medida del pie apoyado cuenta los pies del saltito como apoyados (descuenta la altura del cuerpo), por eso sube el p90 en `split`.
- **Recto hacia atrás a 2,5–3,5 m/s** la carrera hacia atrás va muy acelerada (saltos de postura p90 de 600 °/s a velocidad fija). Una persona se giraría y correría; en los partidos casi no pasa.
- **El pie de la carrera toca el suelo algo más tarde que en el clip** (unos 0,05 s): el clip lo posa aún barriendo hacia delante. Un clip con el pie quieto al posarse lo arreglaría de raíz.
- **La columna gira algo más** (p90 de 15° a 17°): las piernas se giran bajo el pecho para que los pasos vayan rectos.
- **Andando muy despacio** (0,8 m/s) los pies dan pasos donde antes resbalaban (saltos de postura p90 de 161 a 347 °/s a velocidad fija).

### Pendiente
- **Que Germán pruebe la 0.3** y diga qué sigue sin gustarle del control o de la física. Lo más útil es un ejemplo concreto.
- **Si aprueba el aspecto:** los rivales propios (la dejada y la estirada de revés nuevas ya están: 9 oct).

## Dobles (7 oct)

Segundo modo del encargo: **2 contra 2**. Tú controlas a tu jugador y Marta, tu compañera, la lleva la máquina. Al otro lado juega una pareja del club. El modo individual no cambia: su bot da exactamente los mismos números que antes.

### Reglas implementadas

Se siguen las reglas de USA Pickleball para dobles, en las dos puntuaciones que ya ofrecía Ajustes.

**Puntuación clásica (solo puntúa quien saca):**
- Cada equipo tiene dos sacadores (servidor 1 y servidor 2) antes de perder el saque.
- **Primera mano:** el equipo que empieza solo tiene un sacador. Por eso el partido se canta «0-0-2».
- Si el equipo que saca gana el punto, el mismo sacador cambia de lado con su compañero y vuelve a sacar.
- Si pierde el servidor 1, saca su compañero (servidor 2) desde donde esté. Si pierde el servidor 2, cambia el saque.
- **El primer saque tras un cambio de saque se hace siempre desde el lado derecho.** Lo hace quien esté en ese lado.
- El equipo que resta nunca cambia de lado.
- Las posiciones salen del tanteo: el primer sacador del equipo está a la derecha cuando el tanteo de su equipo es par y a la izquierda cuando es impar.
- El tanteo se canta con tres números: equipo que saca, equipo que resta y sacador. Por ejemplo, «4-2-1».

*Matiz sobre la regla «saca desde la derecha con tanteo par»:* en dobles no se aplica a quien saca, sino al **primer sacador del equipo**. El servidor 2 a menudo saca desde la derecha con tanteo impar, y eso es correcto.

**Puntuación rally** (regla provisional de USA Pickleball para dobles, 4.G.1 y 12.B.1):
- Cada peloteo da un punto, saque quien saque.
- No hay servidor 2: un solo sacador por turno, y el partido empieza 0-0.
- Si gana el equipo que saca, punto y su sacador cambia de lado y repite.
- Si gana el que resta, cambia el saque y ese equipo se lleva el punto. Sus jugadores cambian de lado y saca quien queda a la derecha. Así las posiciones siguen al tanteo, como en la clásica.
- **El partido solo se gana sacando.** Si el equipo que resta está a un punto de ganar y gana el peloteo, hay cambio de saque pero no punto. En pantalla sale «Sin punto: el partido se gana sacando».
- El tanteo se canta con dos números: equipo que saca y equipo que resta.
- En individual se mantiene la regla de la 0.3: cada peloteo puntúa siempre, también en bola de partido. La regla provisional de individual de USA Pickleball también exige ganar sacando. Aplicarla allí cambiaría el equilibrio medido, así que **queda pendiente de que lo decida Germán**.

**Saque y resto:**
- El que resta es el jugador en diagonal al que saca, y solo él puede jugar el saque.
- El compañero del que saca espera en el fondo, porque el resto tiene que botar.
- El compañero del que resta espera en la línea de la cocina, que es la estrategia habitual.
- Todos se colocan en la mitad que les da el tanteo.

**Fuentes:**
- USA Pickleball, [resumen de reglas](https://usapickleball.org/what-is-pickleball/official-rules/rules-summary/): primer saque desde la derecha, cambio de lado al puntuar, primera mano y posiciones según el tanteo.
- USA Pickleball, [Scoring & Positioning](https://usapickleball.org/?p=17818): rally en dobles. No hay servidor 2, saca quien corresponde al nuevo tanteo desde la derecha y el partido se gana sacando.
- Reglamento 2025, sección 4 ([resumen](https://www.playpickleball.com/2025-usa-pickleball-rules-section-4-the-serve-service-sequence-and-scoring-rules/)), reglas 4.B.6 y 4.J: el 0-0-2 y la llamada de tres números.
- [Cambios de 2025](https://www.selkirk.com/blogs/pickleball-education/approved-2025-usa-pickleball-rule-changes): rally provisional en dobles, en el que el punto que gana el partido solo lo gana quien saca.

`npx tsx tools/doubles-check.ts` comprueba estas secuencias a mano en las dos puntuaciones: tanteo cantado, quién saca, desde qué lado, quién resta y dónde está cada uno.

### Quién juega cada bola
- **El equipo que recibe acuerda quién la juega, y solo ese jugador va a por ella.** Así nadie choca con su compañero y no queda una bola buena sin jugar.
- **Cómo se decide.** Para cada jugador se suma:
  - el coste del golpe en sí;
  - lo que la bola se mete en la mitad del compañero (la línea entre los dos divide la pista);
  - un poco si le queda de revés, así que la bola del centro es para la derecha de quien la tenga;
  - un poco si va justo de tiempo, así que el globo sobre el que está en la red lo coge quien llega holgado.
- **Tus bolas son tuyas.** El círculo de la pista solo sale en tus bolas, y Marta no te las quita (tienes una pequeña preferencia).
- **Las de Marta.** No tienes círculo ni golpe automático. Si mantienes el dedo apuntando, la juegas igual si llegas. En golpe manual vale pulsar o soltar a tiempo.
- **Si uno no llega, la juega el otro.** Si dejas de poder llegar a tu bola, Marta va a por ella. Si un jugador de la máquina se queda corto, va su compañero. Pasa una vez por bola.

### Colocación
- **En paralelo.** Cada uno se queda en su mitad, a unos 2,5 m del compañero, y la pareja se desplaza hacia el lado por el que va la bola.
- **Fondo y red según la regla del doble bote:**
  - El equipo que saca espera en el fondo hasta su tercer golpe.
  - El que resta espera atrás hasta restar.
  - Su compañero ya está en la cocina.
  - Después, una pareja de la máquina sube y baja junta, y Marta sube y baja contigo.
  - Medido con el bot: compañeros a 2,5 m de media y casi nunca uno arriba y otro abajo (0–1 % del tiempo).
- **Cambio de lado.** Si uno cruza claramente al lado del compañero (por un globo o una volea en el centro), se cambian las mitades.
- **Paso de espera.** Mientras lee la bola, el jugador de la máquina frena en vez de seguir yendo a su sitio, y el cálculo de si llega lo tiene en cuenta. Sin esto fallaban un 9,5 % de las bolas a su alcance. Ahora fallan un 2 %, frente al 7 % de individual.

### La IA con dos rivales
- Elige **a quién tirar**:
  - al que se ha quedado atrás si la pareja está partida (le toca levantarla);
  - si no, casi siempre al más lento.
- El «lado libre» pasa a ser **el hueco más ancho**: normalmente el centro entre los dos, o la banda si uno está descolocado.
- **Globos** por encima del que está en la red y **dejadas cruzadas**.
- «Están en la red» significa que están los dos.

### En el juego
- **Menú.** Selector Individual / Dobles. El partido de fondo también pasa a dobles.
- **Escalera de parejas** con su propio progreso:

  | # | Pareja |
  |---|---|
  | 1 | Paco y Lola |
  | 2 | Lola y Bruno |
  | 3 | Bruno y Nuria |
  | 4 | Nuria y Reina |

- **Marta,** tu compañera:
  - Jugadora de club constante (entre Bruno y Nuria) y algo más lenta que tú.
  - Por ser la más lenta, los rivales la buscan.
  - Equipación azul real con pantalón blanco; tú sigues con la tuya.
- **Saque.** Empiezas a la derecha y sacas tú.
- **Marcador:**
  - Los dos nombres de cada equipo, con quien saca resaltado.
  - Una tercera casilla con el tanteo cantado.
  - El videomarcador lo lleva en el pie.
- **Avisos:** al sacar, «Saca Lola · 4-2-1». Tras cada punto, el tanteo nuevo y si hay cambio de saque o segundo sacador.
- **Final del partido.** Tus golpes perfectos, los puntos ganadores del equipo, tus errores y los de Marta.
- **Cómo se juega** tiene un párrafo de dobles.
- `view.ts` no ha cambiado: ya creaba un personaje por jugador y tenía cuatro sombras.

### Bot de dobles

`npx tsx tools/bot-doubles.ts [partidos] [ayuda] [rally|sideout]` simula al humano de dos pulgares con Marta contra cada pareja.

**Rally a 11, ayuda media** (24 partidos por pareja; % de partidos que gana el humano con Marta):

| Humano simulado | Paco y Lola | Lola y Bruno | Bruno y Nuria | Nuria y Reina |
|---|---|---|---|---|
| Novato | 100 % | 88 % | 58 % | 8 % |
| Medio | 100 % | 96 % | 92 % | 42 % |
| Bueno | 100 % | 100 % | 100 % | 71 % |

- **Golpes por punto:** de 12 a 25. Es más que en individual, porque con dos defensores llegan más bolas.
- **Duración:** de 3 a 8 minutos por partido.
- **Puntuación clásica:** casi los mismos porcentajes. Los partidos duran de 4 a 17 minutos, porque hay dos sacadores por turno.
- **El humano juega el 41–47 % de las bolas de su equipo,** y Marta el resto.
- **Nadie va a por una bola buena:** 0 %.
- **Los dos van a por la misma bola:** 0 %.
- **Bolas que pasan al compañero a mitad de vuelo:** de 0 a 2 por partido.
- **Ningún partido se atasca** en ninguna puntuación ni nivel de ayuda (0, 1 o 2), tampoco en los de la máquina contra la máquina del fondo del menú.
- **Cómo se pierden los puntos contra las parejas fuertes:** sobre todo errores a la red de Marta (unos 20 %), porque es a quien buscan los rivales y juega más de la mitad de las bolas. Por bola falla más o menos lo mismo que un jugador de la máquina. Ya se subió un poco su nivel para que no fuera el punto débil.

El modo individual da los mismos números exactos antes y después (`npx tsx tools/bot.ts 12 1`).

### Decisiones y pendientes
- **Compañera fija (Marta).** Más adelante se podría elegir pareja entre los rivales que ya has ganado.
- **Tu lado.** Siempre empiezas en el lado derecho. Falta poder elegirlo y hacer *stacking* (que la pareja se coloque para que cada uno juegue en su lado preferido).
- **Lo que no se simula:**
  - choques entre compañeros;
  - un saque que toca al compañero del que resta (que en el reglamento es punto para quien saca);
  - avisos de voz tipo «¡mía!» o «¡tuya!».
- **Peloteos largos.** Los dobles salen largos (de 12 a 25 golpes). Si en la prueba se hacen pesados, se puede subir la presión a partir del sexto golpe solo en dobles.
- **Ganar sacando en individual.** Pendiente de decidir si la regla del rally de USA Pickleball se aplica también en individual.
- **Pendiente: que Germán juegue dobles.** Sobre todo para ver si se entiende qué bolas son suyas (el círculo) y si echa de menos poder decir «tuya» a Marta.

## Equilibrio 0.4 (7 oct)

Respuesta a la revisión independiente de la 0.3 (puntos B1–B4 y B7): el golpe automático rendía casi como apuntar, un drive perfecto al cuerpo ganaba casi siempre, la presión mandaba la bola de la campeona a la red, la IA lo leía todo y el globo no servía. Además, el bot de la escalera no se parecía a una persona. Todo se ha vuelto a medir con un bot nuevo.

### Qué cambia

- **Golpe automático (B1).** Si no apuntas, sale un *reset* seguro que nunca ataca:
  - con los dos en la red, una dejada al centro de la cocina;
  - desde atrás contra un rival en la red, una dejada;
  - en el resto de casos, una bola alta y profunda al centro.

  Calidad de contacto: automático 0,78, apuntado sin perfecto 0,84 y perfecto 0,90 (antes 0,76, 0,84 y 1). Apuntar compensa siempre, y el perfecto, más:

  | % de puntos que gana el bot «bueno» | Paco | Lola | Bruno | Nuria | Reina |
  |---|---|---|---|---|---|
  | Sin apuntar | 77 | 36 | 27 | 9 | 10 |
  | Apunta sin perfecto | 96 | 86 | 77 | 63 | 43 |
  | Apunta con perfecto | 98 | 90 | 83 | 66 | 55 |

  El cartel «¡PERFECTO!» solo sale si el golpe queda al menos tan limpio como uno apuntado normal.
- **El patrón que siempre ganaba (B2).**
  - **Bloqueo.** Ante una bola rápida al cuerpo o a los pies, la IA suele bloquear suave a la cocina en vez de jugársela.
  - **Adaptación.** Si repites el mismo tipo de bola (por ejemplo, fuerte, al cuerpo y baja), la IA la lee antes, se equivoca menos al leerla, la juega con más calma y la presión le pesa menos.
  - **Drive cerca de la red.** Pegar fuerte desde abajo de la cinta junto a la red es arriesgado. Si sale mal, la bola se queda alta. El perfecto en esos drives tiene tope.
  - **Desde la transición, la IA ya no globea** (era un remate regalado) y contraataca las bolas que le llegan altas.
- **Presión del peloteo (B3).**
  - **Sube desde el sexto golpe:** 0,04 por golpe en individual y 0,045 en dobles.
  - **Levanta la bola, no la tira a la red.** Solo una cuarta parte va a la calidad del contacto. El resto es la probabilidad de que la bola se levante: una dejada sale alta y larga, pasada la cocina, y un drive sale empujado. El otro la ataca.
  - **Los ataques no se ablandan con la presión.** El speed-up sale plano, a través del cuerpo.
  - **Bloqueos.** Un bloqueo malo de una bola fuerte devuelve su ritmo: sale alto y largo, o fuera (error forzado).
- **Lectura y físico (B4).**
  - **Error de lectura.** La IA lee las bolas rápidas o con efecto con un error de unos centímetros a 3 dm (Reina, 8 cm de desviación; Paco, 32 cm). Lo corrige entre 0,22 y 0,31 s antes del golpe. Si corrige tarde, golpea con prisa o estirándose. Gancho: `Controller.read` y `Match.misread`.
  - **La prisa pesa a todos.** La dificultad por falta de tiempo (bola rápida, bola que viene de arriba, poco tiempo, correr hacia atrás tras un globo) se separa de la incomodidad, y la templanza de los buenos la reduce menos.
  - **Físico:**

    | | Humano | Paco | Lola | Bruno | Nuria | Reina |
    |---|---|---|---|---|---|---|
    | Velocidad (m/s) | 4,6 | 3,5 | 4,1 | 4,3 | 4,6 | 4,7 |
    | Reacción (s) | pulgar | 0,36 | 0,27 | 0,25 | 0,20 | 0,18 |
    | Alcance (m) | 1,0 | 0,65 | 0,85 | 0,9 | 1,0 | 1,05 |
- **Globo (B7).**
  - **El arrastre gradúa el globo.** Cuanto más pasas la franja del fondo, más profundo (de HL − 1,6 a HL − 0,4) y más tenso (de 3,0 a 2,2 m sobre la cinta).
  - **La longitud tiene error,** así que el profundo sale fuera un 7–9 % de las veces.
  - **Quien corre hacia atrás no remata.** Tras un globo profundo casi nunca hay remate, el golpe sale con prisa y la respuesta es defensiva. Al corto se le remata.
  - **Medido contra un rival en la red** (`tools/review/lob.ts`, 200 globos con suelta perfecta):

    | | Remate del rival | Calidad de su respuesta | En 3 golpes: ganas / pierdes |
    |---|---|---|---|
    | Lola, corto | 35 % | 0,62 | 29 % / 13 % |
    | Lola, profundo | 27 % | 0,54 | 33 % / 15 % |
    | Reina, corto | 57 % | 0,78 | 15 % / 23 % |
    | Reina, profundo | 40 % | 0,72 | 15 % / 25 % (9 % fuera) |
    | Reina, antes (cualquier globo) | 78 % | 0,87 | 11 % / 29 % |
- **Bot realista** (`tools/thumb.ts`). Usa el `HumanController` y el `Input` del juego, con dos pulgares virtuales a 60 Hz:
  - **Pulgar izquierdo.** Reacciona tarde y empuja el stick hacia el círculo con un error de ángulo que va corrigiendo. A veces lo suelta cerca y a veces lo mantiene hasta llegar; el aparcado lo resuelve.
  - **Pulgar derecho.** Apunta con el mismo arrastre que una persona, con una regla de jugador y no con la elección de la IA. Suelta alrededor del aro dorado con error.
  - **Golpe automático.** Muchas bolas no las apunta, y las que vienen demasiado rápidas tampoco le da tiempo.

  | Nivel | Reacción del stick | Apunta | Error de suelta | Error de arrastre |
  |---|---|---|---|---|
  | Novato | 0,42 s | 55 % (30–41 % de los golpes, al final) | ±110 ms | 22 px |
  | Medio | 0,33 s | 80 % (56–67 %) | ±85 ms | 14 px |
  | Bueno | 0,26 s | 93 % (77–88 %) | ±60 ms | 9 px |

  El antiguo `ManualBotController` desaparece.

### Escalera individual (ayuda media, 24 partidos por pareja, rally a 11)

% de partidos que gana el humano. Entre corchetes, el objetivo. «Antes» es el código de la 0.3 medido con el bot nuevo.

| Humano | Paco | Lola | Bruno | Nuria | Reina |
|---|---|---|---|---|---|
| Novato | 88 [90] | 54 [55] | 8 [30] | 0 [10] | 0 [0] |
| Medio | 100 [100] | 100 [90] | 92 [75] | 38 [45] | 13 [15] |
| Bueno | 100 [100] | 100 [100] | 100 [95] | 100 [80] | 50 [50] |
| *Antes: novato* | 100 | 88 | 44 | 6 | 0 |
| *Antes: medio* | 100 | 100 | 100 | 81 | 31 |
| *Antes: bueno* | 100 | 100 | 100 | 100 | 94 |

- **Golpes por punto:** de 6 a 10 contra Paco, de 13 a 17 contra Lola y Bruno, y de 18 a 22 contra Nuria y Reina.
- **Duración:** de 2 a 8 minutos por partido.
- Ningún partido atascado.
- **Ayuda alta:** novato 100 / 80 / 60 / 0 / 0, medio 100 / 100 / 100 / 50 / 0, bueno 100 / 100 / 100 / 100 / 80.
- **Sin ayuda:** novato 90 / 50 / 0 / 0 / 0, medio 100 / 100 / 80 / 30 / 0, bueno 100 / 100 / 100 / 90 / 60.
- Estas dos últimas filas son de 10 partidos por pareja: dan la tendencia, no el número fino.

### Escalera de dobles (con Marta, ayuda media, 16 partidos por pareja)

| Humano | Paco y Lola | Lola y Bruno | Bruno y Nuria | Nuria y Reina |
|---|---|---|---|---|
| Novato | 100 | 100 | 44 | 6 |
| Medio | 100 | 100 | 69 | 38 |
| Bueno | 100 | 100 | 94 | 44 |
| *Antes: novato* | 100 | 100 | 83 | 50 |
| *Antes: medio* | 100 | 100 | 92 | 42 |
| *Antes: bueno* | 100 | 100 | 100 | 83 |

- **Golpes por punto:** de 12 a 24. **Duración:** de 3 a 8 minutos.
- Ningún partido atascado con ninguna ayuda (0, 1 o 2).
- **Marta** baja un poco (calidad 0,80): con una compañera mejor que Lola y Bruno, la segunda pareja no tenía nada que hacer.
- **Cómo se pierden los puntos contra las parejas fuertes:** sobre todo con bloqueos de Marta que salen fuera tras un remate o un speed-up. Son errores forzados, porque los rivales la buscan por ser la más lenta.

### Las estrategias fijas de la revisión, contra Reina

% de puntos ganados (`tools/review/exploit.ts`, 400 puntos):

| Estrategia | Pulgar realista (±90 ms, ±12 px) | Jugador bueno (±60 ms, ±9 px) | Suelta siempre perfecta | Antes, pulgar realista | Antes, perfecta |
|---|---|---|---|---|---|
| Sin apuntar | 6 | 6 | 6 | 33 | 33 |
| Drive al medio | 28 | 30 | 27 | 32 | 35 |
| Esquina | 19 | 23 | 34 | 11 | 31 |
| Al cuerpo | 43 | 54 | 73 | 60 | 93 |
| Globo siempre | 5 | 5 | 5 | 5 | 4 |
| Dejada cruzada | 17 | 19 | 24 | 51 | 73 |
| A los pies | 41 | 52 | 73 | 59 | 92 |

**Reina contra Reina** (`tools/review/errors.ts`):
- Puntos de 20,5 golpes (antes, 24,1).
- Acaban así: 45 % golpe ganador, 33 % fuera y 22 % red. Antes, la red se llevaba el 69 %.
- Las bolas a la red que quedan son sobre todo bloqueos de un ataque.

### Herramientas

- **`tools/bot.ts`, `tools/bot-doubles.ts`.** Admiten `LEVELS=…`, `RIVALS=…` o `PAIRS=…` y `TUNE='{"2":{"q":0.8}}'` para medir parte de la tabla o probar otros valores.
- **`tools/review/`.**
  - Los scripts de la revisión, adaptados.
  - `trace.ts` y `dtrace.ts`: golpe a golpe, errores y bolas a las que no se llega.
  - `attacks.ts`: qué pasa tras un ataque.
  - `aimvalue.ts`: lo que vale apuntar.
  - `lob.ts`.
  - `sweep.ts`: variantes de un rival o de un nivel en un solo proceso.

### Desviaciones y pendientes

- **El novato se queda corto contra Bruno y Nuria** (8 % y 0 %, frente a 30 % y 10 %). Pierde sobre todo bolas abiertas a 1–3 m del círculo, porque su pulgar tarda 0,42 s. Para subirlo habría que hacer a Bruno peor contra todos, y el medio ya le gana el 92 %.
- **El medio gana a Lola y a Bruno algo más de lo previsto** (100 % y 92 %). Bruno es el que más separa niveles: castiga las bolas flotantes del novato y sufre contra quien ataca.
- **El bueno gana a Nuria el 100 %** (objetivo, 80 %). Contra Reina está en el 50 % justo.
- **Dobles:** la segunda pareja sigue siendo fácil para todos. La ayuda alta casi no cambia el resultado, porque Marta juega la mitad de las bolas.
- **Un pulgar sobrehumano** que suelta siempre en el centro del dorado y tira siempre al cuerpo aún gana el 73 % a Reina. Con un pulgar de persona buena se queda en el 52–54 %.
- **Lo que se ve en pantalla:**
  - la IA a veces sale hacia un sitio un poco equivocado y corrige;
  - hay más bolas que «se levantan» en los peloteos largos;
  - el cartel de perfecto sale menos (novato 10 %, medio 30 %, bueno 55 % de sus golpes).

  Conviene que Germán lo pruebe en el móvil.

## Presentación (7 oct)

El partido se ve como una retransmisión de televisión. La cámara de juego sigue siendo la de siempre, detrás de ti: la realización solo entra en los tiempos muertos y devuelve la cámara antes de que tengas que jugar una bola. Nada de esto toca las reglas, la física ni la IA.

### Cámara de televisión
- **Presentación del partido** (unos 5 s; el partido espera). Plano general alto con el rótulo «PINAR OPEN 2026 · Ronda 2 de 5» (1 s). La cámara vuela junto al rival, con su rótulo (nombre, estrellas y lema), cruza la red y baja junto a ti («Jugador local · Club del Pinar», o «Tú · Marta» en dobles) hasta la cámara de juego.
  - **Los rótulos siguen a la cámara, no al reloj** (10 oct): el de cada equipo sale cuando ese equipo está en el centro del cuadro y cerca (a menos de 11,5 m), y se quita en cuanto sale del cuadro o la cámara se aleja. Así vale en vertical, en horizontal y en dobles. Con «reducir movimiento» la cámara no se mueve y los rótulos van uno detrás de otro por tiempo.
  - El vuelo se queda un poco más en cada equipo y cruza la red deprisa en medio. Al bajar a la cámara de juego sigue mirando a tu jugador hasta el final (antes se le salía del cuadro por la derecha en vertical).
- **Antes de cada saque:**
  - Si saca un rival al fondo, un teleobjetivo sobre él, con un zoom lento.
  - Si sacas tú o Marta, un acercamiento suave.
  - Vuelve a la cámara de juego al empezar el saque (en 0,7 s, antes del golpe) o en cuanto tocas la pantalla.
- **Bola de partido.** El encuadre se cierra más, el tanteo sale en dorado y el público se calla.
- **Tras el punto, plano de reacción** de quien celebra (o, si nadie celebra, de quien se lamenta; tu equipo primero). Si está en tu lado, la cámara gira a su alrededor hasta ponerse a su lado, a la altura del pecho y con la grada detrás. Si está al fondo, teleobjetivo.
  - **Solo en puntos con algo** (10 oct): un ganador tras un peloteo largo (14 golpes en individual, 20 en dobles), un peloteo épico (24 / 30), la bola de partido, el final o un punto que va a tener repetición. Y como mucho uno de cada tres puntos, salvo esos grandes momentos. El resto se queda en la cámara de juego con el ruido del público (los jugadores siguen celebrando o lamentándose en el plano general).
- **Final del partido.** Órbita lenta alrededor de los ganadores con el rótulo «Gana el partido · TÚ 11–4». Luego sale la pantalla final y la órbita sigue detrás.
- **Se salta** todo con un toque (o con Espacio o Intro). El botón de pausa sigue funcionando.
- **Con «reducir movimiento»** del sistema no hay vuelos, giros ni zooms: los planos son cortes a encuadres fijos, la presentación son solo los rótulos sobre la cámara de juego y la repetición se ve desde un plano general fijo.

### Repeticiones
- **Qué se graba:** los últimos 8 s tal como se dibujan (la bola, la pose de cada hueso de cada jugador y la red), unas 60 veces por segundo, más los golpes, botes y toques de red. Ocupa menos de 1 MB por partido. Así los jugadores se ven exactamente igual que en directo, con el IK incluido.
- **Cuándo** (10 oct): solo en puntos de verdad buenos, que se ganan con un golpe. Cada punto suma una nota y hace falta 3,5:
  - ganador: 0,5;
  - remate ganador: +2,5; ataque o golpe de más de 15 m/s: +1,5; cinta: +2,5; golpe perfecto: +0,5; peloteo de 5 golpes o más: +0,5; tu propio golpe: +0,3;
  - peloteo largo (desde 14 golpes en individual, 20 en dobles): +1, y +0,08 por golpe más, hasta +2.

  Ejemplos: un remate ganador tras un peloteo, un ataque que gana un peloteo largo, un ataque perfecto tuyo o el ganador de un peloteo de 27 golpes. Un punto que acaba en error solo si el peloteo es épico (32 golpes en individual, 40 en dobles).
  - **Límites:** como mucho una de cada tres (a menos de tres puntos de la anterior hace falta una nota de 6, un punto excepcional), nunca dos puntos seguidos y como mucho una por cada seis puntos jugados (más una). El punto que gana el partido la tiene siempre que llegue a 3,5.
  - Antes (la revisión de la 0.5): un peloteo largo bastaba, así que contra rivales pacientes casi cada punto tenía repetición (9 de 12 contra Lola). Se pueden quitar en Ajustes → Repeticiones.
- **Cómo:**
  - Una cortinilla (banda azul con borde lima y la bola) tapa el corte.
  - Se ven los últimos 1,5–3 s del punto a cámara lenta: 0,85× en general y 0,3× alrededor del golpe decisivo y de la cinta.
  - **Acaba limpia** (10 oct): con un ganador, 0,4 s después de que la bola bote dentro (y nunca antes de 0,8 s tras el golpe); con un error, justo después de cantarse el punto. Ya no hay cámara lenta al final ni se sigue a la bola muerta hasta la valla. La cámara no mira más cerca de 2 m del fondo en el contraplano y se queda un poco del lado de los jugadores, así que no acaba en una esquina vacía.
  - Al volver, la cortinilla corta directamente al siguiente saque: la pausa tras el punto ya ha sido la repetición (antes quedaba otro segundo de cámara de juego).
  - Sale el rótulo REPETICIÓN, con bandas suaves arriba y abajo, y el videomarcador también pone REPETICIÓN.
  - La bola se ve a su tamaño real (en juego va 1,45 veces más grande para que se lea en el móvil).
- **Ángulos:**
  - lateral, desde la grada (en horizontal);
  - contraplano alto desde el fondo (en vertical y en los remates);
  - a ras de red junto al poste (en las cintas).
- **El partido espera:** el tiempo muerto se alarga solo lo que dura la repetición (unos 4–5 s en pantalla, antes 6). Se salta con un toque. Si el último punto merece repetición, después se corta directamente a los ganadores.

**Medido** (10 oct) con 11 partidos sembrados en la página real (bot de pulgares, TV encendida; individual y dobles, de novato a bueno, ES y EN, 360 × 640 y 390 × 760; `scratchpad/pres05/scripts/tvstats.py`):

| | Antes | Ahora |
|---|---|---|
| Repeticiones | 82 en 183 puntos (45 %) | 30 en 183 (16 %, una de cada seis) |
| Tiempo en pantalla de repeticiones | 12,1 % | 3,8 % |
| Duración media | 6,1 s | 4,8 s |
| Planos de reacción | 173 (95 % de los puntos) | 55 (30 %) |
| Novato contra Lola (360 × 640, semilla 303) | 11 de 16 puntos, 16,7 % de la pantalla, 15 reacciones | 3 de 16, 4,2 %, 6 reacciones |

### Público
- **Reacciones:**
  - Con un ganador o un peloteo largo, se levanta, salta y agita los brazos.
  - Con un buen punto, aplaude.
  - Con una cinta o una bola que entra por poco, se inclina con un «ooh».
  - Cuanto más largo es el peloteo, más se echa hacia delante.
- **Coste:** mueve los espectadores instanciados que ya había (cuerpos y cabezas) y añade unos brazos instanciados que solo se dibujan cuando hay brazos en alto. Se actualiza como mucho 30 veces por segundo, y solo mientras dura una reacción.

### Sonido (sintetizado, sin archivos)
- **Pala:** un «pock» distinto según el golpe y su velocidad: dejada suave, drive seco, remate con chasquido y golpe grave. Suena en estéreo según dónde pasa en pantalla, y más apagado al fondo.
- **Botes** en la pista, y los botes de la bola muerta tras el punto.
- **Zapatillas:** chirrían cuando un jugador frena en seco o cambia de sentido. Se lee la deceleración de los pies: sale más o menos uno cada 3 o 4 golpes.
- **Cinta:** un «tic» seco con el golpe de la cinta, y un «ooh» del público.
- **Público:** murmullo de fondo (también, más bajo, detrás de los menús) que sube con la tensión del peloteo, rugido, aplausos y «ooh». Silencio en la bola de partido.
- **Árbitro:** campanilla antes de cantar el tanteo.
- Todo respeta el ajuste de sonido.

### Marcador de televisión
- **Arriba a la izquierda,** dos filas: color del equipo, nombres, bola de saque y tanteo.
  - En dobles, el nombre de quien saca va en lima y, en la puntuación clásica, también el número de sacador (1 o 2).
  - Al puntuar, el número gira y un destello recorre la fila.
  - Mide 128 × 50 px en un móvil de 390 px (antes, 165 × 70) y crece un poco en pantallas grandes. Respeta el notch.
- **El árbitro canta el tanteo** antes de cada saque, en una línea bajo el marcador («4 | 2 | 1 · SACA LOLA») y con una campanilla. En bola de partido sale «BOLA DE PARTIDO» en dorado. Sustituye al aviso que salía antes.
- **El videomarcador de la escena** (10 oct) está ahora alto, sobre dos patas galvanizadas, al fondo del club junto a la valla (centro a 7,6 m de altura y 22 m de la red, 10,4 m de ancho). La cámara de juego no lo tiene nunca en el cuadro, ni en vertical ni en horizontal. Antes, en vertical, el marcador del HUD tapaba la mitad del videomarcador: el tanteo salía dos veces y se leían letras sueltas («TU», «PACO», «YOU + MARTA») detrás del marcador y bajo la línea del árbitro. Arriba del móvil ahora solo hay césped y el paseo, y de las patas apenas se ven dos postes claros. Se sigue viendo, con los nombres y el tanteo, detrás de los menús (la órbita del partido de exhibición); en los planos de televisión del partido casi no sale.

### Pantalla en móvil (9 oct)
Germán jugó en el móvil y los indicadores ocupaban demasiado. Se han rehecho para que manden la pista y los jugadores. Ningún cambio toca las reglas, la ventana del perfecto ni lo que significa cada color.

**Un solo lenguaje visual:** aros finos con borde oscuro (se leen al sol), palabras en pastillas oscuras pequeñas y un color para cada cosa:
- lima: tú, o que llegas a la bola;
- dorado: el perfecto (solo el tiempo);
- rojo: la cocina;
- gris: fuera.

Para la puntería, el color va según el golpe: dejada en cian, drive y saque en blanco (antes el drive era dorado), globo en violeta, ataque y remate en naranja (antes coral, casi el rojo de error). Apuntar fuera sale gris con «FUERA».

**Ajustes → Indicadores: Mínimos (por defecto) o Completos.**
- **Mínimos**, solo lo imprescindible: el círculo de la pista, el aro de los pies, la puntería al apuntar, el aro de tiempo solo mientras apuntas (con el golpe manual, siempre; en el primer partido, también tenue sin apuntar, hasta el primer perfecto), el cuadro de saque solo al apuntar el saque, la cocina en rojo, la línea de cocina cuando te frena, el cartel del punto y el marcador.
- **Completos** añade la marca del bote, el aro de tiempo siempre, el nombre del golpe al pegar y el aviso de cinta.

**Qué cambia** (tamaños en un móvil de 390 × 760):
- **Aro de tiempo:** de 34–224 px a 20–64 px, escalado con la pantalla. Aparece poco a poco y el dorado ya no lleva un halo grande.
- **Marcas en la pista:**
  - El círculo de destino es más pequeño (radio de 0,36 a 0,235 m) y se va cuando ya llegas: entonces lo dice el aro de los pies. Nunca hay dos aros uno dentro de otro.
  - El aro de los pies solo sale cuando dice algo: lima, rojo o gris.
  - La marca del bote mide 11 cm y no late.
  - El aro de puntería es de 0,19 m y el arco, más tenue.
  - Con «reducir movimiento» no late nada.
- **Etiqueta del golpe:** de 20 px de alto, con un punto del color del golpe. Va al lado de la marca de puntería, nunca encima, y del lado contrario al rival.
- **Joystick:** un aro fino de 76 px con un botón de 24 px (antes, 120 y 54 px, opaco).
- **Palabras al golpear:** junto a la cabeza, del lado contrario a la pala, de 13–16 px (antes 22–28) y durante 0,75 s.
  - «¡PERFECTO!» sale siempre.
  - «Pronto» y «Tarde», con el golpe manual.
  - El nombre del golpe, solo en completos.
  - El destello del perfecto es más suave y no sale con «reducir movimiento».
- **Cartel del punto:** una etiqueta bajo el marcador, que se va antes del siguiente saque. Antes eran letras de 54 px en medio de la pista, encima del rival. El tanteo ya lo dice el marcador: la etiqueta solo añade el cambio de saque o el segundo sacador.
- **Árbitro:** 127 × 34 px (antes 136 × 95; con una ayuda en pantalla bajaba encima del rival).
- **Ayudas del tutorial:** una línea corta abajo, debajo de la pista y entre los pulgares (en horizontal, arriba). Antes era un recuadro de tres líneas arriba: el 13 % de la pantalla.
- **Avisos:** ya no sale «¡Por los pelos!» (lo dice el «ooh» del público). La cinta solo avisa en completos.
- **Pausa:** botón de 44 px.

**Cobertura medida** con `tools/hud.py`, partida idéntica antes y después, en indicadores mínimos. «Pantalla» es el porcentaje de píxeles que cambian los indicadores; «jugadores», el porcentaje de las cajas de los jugadores que tapan.

| Momento (390 × 760) | Antes: pantalla / jugadores | Después: pantalla / jugadores |
|---|---|---|
| Saque | 22,9 % / 32 % | 7,7 % / 0 % |
| Apuntar el saque | 23,3 % / 32 % | 10,8 % / 10 % |
| La bola viene | 17,5 % / 10 % | 6,6 % / 2 % |
| Apuntar con el joystick | 20,5 % / 7 % | 7,6 % / 2 % |
| El golpe | 7,1 % / 8 % | 2,8 % / 0 % |
| El punto | 5,1 % / 12 % | 3,4 % / 0 % |
| Siguiente saque | 7,5 % / 0 % | 3,8 % / 0 % |

- **En 360 × 640** los momentos más cargados bajan del 23–27 % al 8–12 %.
- **En 1280 × 720**, del 6–8 % al 3–5 %.
- **En dobles**, del 18–24 % al 7–11 %.
- **Con indicadores completos** queda casi igual que con mínimos (como mucho un 3 % más), porque cada pieza ya es pequeña.
- **El aro de tiempo**, en su peor momento, tenía una huella de 194 × 193 px (el 10 % de la pantalla, alrededor de la bola junto al rival). Ahora mide como mucho 64 px.
- **La cocina en rojo** es lo único que sigue tapando a un jugador, porque se pinta bajo sus pies a propósito. Ahora parpadea menos: de 0,08–0,28 de opacidad a 0,14–0,26.

**Herramienta:** `python3 tools/hud.py [dist] [carpeta] [ancho] [alto] [singles|doubles] [puerto] [reduce] [min|full]`.
- Captura los momentos típicos y mide cada indicador: lo oculta, vuelve a dibujar el mismo fotograma y cuenta lo que cambia.
- La partida es siempre la misma: se fija el azar, y los temporizadores y animaciones de la página siguen el reloj del partido.

**Arreglo de paso:** el primer fotograma podía dar un paso de tiempo negativo, y entonces la sacudida de cámara crecía en vez de apagarse. En las capturas temblaba la cámara durante segundos. Ahora el paso nunca es negativo.

**Tras la revisión de la 0.5 (10 oct).** Lo que encontró el revisor externo arriba de la pantalla, en la cocina, en el aro y en la pista:
- **Arriba del móvil:** el videomarcador de la escena ya no queda medio tapado por el marcador del HUD (ver «Marcador de televisión»): no hay tanteo duplicado ni letras fantasma. Medido con `tools/hud.py`, el marcador sigue siendo de 126 × 49 px; su «pantalla» sube 0,5 puntos porque ahora se dibuja sobre el césped claro y no sobre el videomarcador oscuro.
- **La línea de cocina se ve cuando te frena.** Mientras `match.lineHold` frena al jugador, el tramo de línea delante de él (1,8 m) se ilumina en lima con un brillo suave en el suelo de su lado, y se apaga en 0,3 s al dejar de empujar. No parpadea (tampoco con «reducir movimiento»). Antes solo vibraba, y en iPhone no había ninguna señal. Tapa el 5 % de la caja del jugador, porque está bajo sus pies. Para «aparcado» (`match.parked`) no se añade nada: ya lo dicen el círculo y el aro de los pies, que se ponen lima al llegar.
- **«Toca para seguir».** Tras el punto, desde 0,6 s y mientras un toque aún puede acortar la pausa (`match.hurryable()`, un gancho de solo lectura), sale una pastilla pequeña a la derecha, por encima del pulgar: «Toca para seguir» (con teclado, «Espacio para seguir»). Sale hasta que la usas dos veces, y solo en los tres primeros partidos.
- **El aro de tiempo sobre tu jugador.** Justo antes de soltar, la bola baja por la pantalla a través del jugador cercano. Cuando el aro toca a un jugador de tu equipo, se dibuja solo el aro fino y transparente (55 %; el dorado, al 85 %), sin el aro interior ni su relleno. El tamaño y el dorado (`IDEAL_RELEASE`, `PERFECT_WINDOW`) no cambian. Sobre los jugadores, al soltar: del 5,4 al 3,3 % de su caja en 390 × 760, del 7,2 al 4,8 % en 360 × 640 y del 3,0 al 2,0 % en dobles.
- **Con el golpe asistido, pasado el dorado el aro se pone gris** (antes rojo, «tarde»): el golpe sale normal, no es un error. Con el manual sigue rojo.
- **Aprender el aro con indicadores mínimos.** En el primer partido el aro sale también sin apuntar, al 40 %, en las bolas a tu alcance, hasta tu primer perfecto. En la pausa sale un consejo distinto cada vez: el aro dorado, la línea de cocina, tocar para seguir y dejada o globo.
- **La sombra de una torre de focos** ya no cruza la mitad cercana de la pista en calidad media (la de los móviles) ni en baja: los postes de las torres van en su propia malla y solo proyectan sombra en alta.
- **«Cómo se juega»** decía «círculo verde»: ahora dice que es blanco y se pone verde al llegar.

`tools/hud.py` mide además el momento de soltar (`04b-release`), la pastilla de «Toca para seguir» (`06b-tap`) y la línea de cocina frenando (`07a-line`, en individual). Con todo, los momentos más cargados (apuntar el saque) quedan en el 11 % de la pantalla en 390 × 760 y en el 12 % en 360 × 640, como antes.

### Archivos y herramientas
- `src/broadcast.ts`: rótulos, marcador y el orden de los momentos de televisión.
- `src/render/director.ts`: los planos.
- `src/render/replay.ts`: la grabación.
- `src/render/crowd.ts`: el público.
- `CharacterView` tiene dos funciones nuevas, `capturePose` y `applyPose`, para leer y volver a poner la pose dibujada. No cambia nada más.
- `python3 tools/tv.py [carpeta] [nivel] [ancho] [alto] [singles|doubles] [puerto] [reduce]`: capturas de la presentación, la repetición, la vuelta al saque y la victoria. Antes comprueba la presentación cada 0,1 s: qué rótulo está puesto y si su equipo está en el cuadro (da 0 desajustes en 390 × 760, 844 × 390 en dobles y con «reducir movimiento»).
- Desde las herramientas, `__pb.start(i)` sigue dando la cámara de juego de siempre. `__pb.start(i, true)` activa la realización.

### Rendimiento
- No hay pasadas de pantalla completa nuevas: los rótulos son HTML encima del lienzo, y la cámara, el público y la repetición mueven lo que ya había.
- La repetición dibuja la misma escena que el juego.
- Pendiente: medirlo en un móvil real.

### Pendiente
- Voz del árbitro o de un comentarista (hoy son texto y campanilla).
- Un público mejor que las cápsulas (los impostores de la 0.2 siguen pendientes).
- Al final del partido, un resumen con los mejores puntos.
- (10 oct) Probar en un móvil de verdad la pastilla «Toca para seguir» (a la derecha, a un cuarto de la altura desde abajo) y si el aro fino sobre el jugador se lee al sol; si no, la alternativa es desplazar el aro por encima de la bola mientras cruza al jugador.
- (10 oct) El videomarcador casi no sale ya en los planos del partido. Si se echa de menos, se puede encender su tanteo en un plano propio entre puntos.

## 0.4 (7 oct): cómo se hizo y qué arregló la revisión

Germán aprobó seguir («creo que tiene potencial») y pidió animaciones de revés, remate, llegar tarde, etc., el modo dobles y lanzar varios agentes.

- **Animaciones (Magnific, 4.320 créditos; quedan unos 23.400):** revés, remate, saque por abajo, dejada, estirada, carrera, carrera hacia atrás y reacción al perder, generadas sobre el mismo esqueleto del jugador. Detalle en «Animaciones».
- **Cuatro agentes en paralelo**, cada uno en su copia del código, fusionados al final:
  - modo dobles (sección «Dobles»);
  - sistema de animaciones de golpe;
  - revisión independiente de control y física (`scratchpad/review/revision-0.3.md`, no versionado);
  - IA y equilibrio (sección «Equilibrio 0.4»);
  - presentación de televisión (sección «Presentación»).
- **Arreglos de control tras la revisión:**
  - **El fallo gordo:** si mantenías el stick o la tecla, el jugador llegaba al círculo y seguía de largo 4 m. Ahora se queda aparcado en el círculo mientras empujes hacia allí, y solo se suelta si giras el stick más de 90°. Con «sin ayuda» al menos no se pasa. Manteniendo el stick hasta el golpe se ganaban el 7 % de los puntos contra Lola; ahora, el 69 %.
  - **La cinta reinicia los círculos.** Antes se golpeaban bolas «fantasma» (57 de 51.000, ahora 8) y había faltas de cocina imposibles (9, ahora 0).
  - **El círculo solo cambia si el nuevo está a menos de 25 cm**, o si el viejo ya no vale, y nunca si ya estás a tu alcance. Salta en el 3 % de las bolas (antes el 10 %) y nunca se aleja de ti.
  - **Carteles con el motivo:** «¡Ganador!», «Golpe ganador», «No llegas» y «La dejaste pasar».
  - **«¡PERFECTO!» ya no sale en golpes que acaban mal.** El perfecto aguanta la calidad salvo al pegar fuerte desde debajo de la cinta.
  - **El aro de tiempo se cierra suave** y en los últimos 0,3 s es exacto.
  - **Otros:** la vista previa del arco usa la velocidad real del golpe; el aro de los pies se pone gris con bolas que van fuera y que se dejan; el bote sube a la medida del reglamento (0,66); la valla frena al jugador.

## Gráficos y simulación 0.5 (9 oct)

Germán jugó la 0.4: a los gráficos y a la simulación les faltaba pulido. Esta parte toca el recinto, la luz, la bola, la física y cómo se mueven los jugadores de la máquina. Los personajes, el HUD del móvil y el control los han llevado otros agentes en paralelo.

### Gráficos

- **Luz de retransmisión.** El sol pasa a estar a la izquierda de la cámara y algo detrás, a 42° de altura. Así se ven los dos jugadores por su lado iluminado (antes se veían a contraluz), las sombras son cortas y caen hacia la derecha, y el cielo del plano es el azul oscuro del lado contrario al sol.
- **Sombras.** El mapa de sombras se ajusta a la zona que importa (pista, vallas y gradas) vista desde el sol, así que cada texel cae en la pista. El borde es suave, como en un día de sol. En calidad baja no hay sombras ni etalonaje, y la exposición baja un poco para que no quede lavado.
- **La red, calculada por píxel.** Antes era una textura con recorte que desaparecía a la distancia de la cámara y de cerca se rompía en puntos. Ahora la malla se dibuja en el sombreador: cuerdas de 3,5 mm cada 44 mm, filtradas según lo que cubre cada píxel. De cerca se ven las cuerdas nítidas; de lejos, un velo oscuro, sin moiré. El material es mate, para que no salga un brillo gris del cielo.
- **Líneas con antialias propio.** Las ocho líneas son una sola malla y el borde lo calcula cada píxel, así que una línea de 5 cm se ve limpia en el fondo de la pista con o sin MSAA.
- **Pista y entorno:**
  - la resina tiene rozaduras de zapatillas, más lisas y algo más claras;
  - el hormigón tiene losas con juntas;
  - detrás de cada fondo va pintado «PINAR OPEN · CLUB DEL PINAR · 2026», derecho para la cámara de ese lado;
  - las vallas de publicidad se dibujan con la fuente del juego cuando carga (antes se quedaban con la de reserva).
- **Oclusión horneada.** Una sola malla de calcomanías oscurece el pie de las vallas, los escalones de la grada, los postes, la línea bajo la red, las patas del videomarcador y las torres de focos.
- **Público.**
  - Personas sentadas con camiseta, pantalón, piel y pelo; tres de cada diez llevan gorra. Hay complexiones distintas, también niños.
  - Siguen la bola con la cabeza: los más entusiastas, rápido y justo; el resto, con un poco de retraso; y algunos miran a otro lado o hablan con el de al lado.
  - Se balancean un poco en el asiento. Eso lo hace el sombreador, sin gasto de CPU.
  - Todo el público es una sola llamada de dibujo. Las reacciones de la 0.4 (levantarse, saltar, aplaudir, «ooh») siguen igual.
- **Árboles.** Cada copa son tres bultos con la luz del cielo horneada (más oscuros por dentro y por abajo) y normales suaves: se leen como follaje y no como facetas. Ahora también hay árboles y valla detrás de la cámara de juego, que es lo que se ve en los contraplanos de la televisión (repeticiones desde el fondo, reacciones).
- **Bola:**
  - los agujeros son más claros y la bola tiene un poco de brillo propio, así que se lee amarilla neón también en sombra;
  - nunca se dibuja con menos de 6,5 px: al fondo de la pista crece hasta 1,7 veces;
  - una bola rápida deja una estela de movimiento, como la de una cámara con obturador de 1/40 s. En las repeticiones es más corta, porque van a cámara lenta;
  - los puntos del rastro de la 0.4 solo salen por encima de 11 m/s.
- **Rendimiento.** Todo lo que no se mueve va fusionado por material: vallas, grada, asientos, metal, focos y calcomanías. `renderer.info` en el mismo fotograma de un peloteo, contando la pasada de sombras y el posprocesado:

  | Nivel (captura) | Draw calls antes → ahora | Triángulos antes → ahora |
  |---|---|---|
  | Media, móvil vertical 390×760 | 246 → 60 | 286.000 → 157.000 |
  | Alta, 960×540 | 258 → 73 | 286.000 → 210.000 |
  | Baja, 390×760 | 141 → 43 | 153.000 → 117.000 |
  | Media, dobles | 264 → 78 | 359.000 → 230.000 |

  El público pasa de 94.000 a 53.000 triángulos (237 espectadores). Los árboles suben de 16.000 a 22.000. No hay pasadas de pantalla completa nuevas. Las capturas salen de un renderizado por software: valen para ver el aspecto, no los fps.

### Física de la bola

Sigue siendo una solución exacta y determinista. `posAt`, `velAt`, `groundTime`, `netTime` y `shotByClearance` no cambian de forma; todo pasa por `seg()` y `bounce()`, así que el juego, la IA, la vista previa del arco y un futuro servidor siguen calculando lo mismo.

- **Arrastre según el ángulo de salida.** La resistencia lineal equivalente sale ahora de la velocidad de salida y de la parte horizontal de esa velocidad. Está ajustada contra un vuelo numérico con arrastre cuadrático real. Un globo pasa su vuelo lento cerca del ápice, así que lleva menos arrastre que un drive igual de rápido. Desvío máximo frente al vuelo cuadrático con la misma salida (`tools/ballphys.ts`):

  | | Dejada | Tercer golpe | Drive | Resto | Saque | Globo corto | Globo profundo | Ataque | Bloqueo | Remate |
  |---|---|---|---|---|---|---|---|---|---|---|
  | 0.4 (cm) | 2 | 7 | 6 | 6 | 7 | 55 | 36 | 5 | 1 | 8 |
  | 0.5 (cm) | 3 | 8 | 6 | 7 | 7 | 21 | 14 | 5 | 3 | 9 |

- **Efecto Magnus.** Se queda como una gravedad algo mayor o menor. Medido contra una fuerza de Magnus que baja con la velocidad, en vuelos de menos de un segundo da el mismo error (4 cm).
- **Bote con rozamiento.** La altura sale del coeficiente de restitución, un poco menor en un impacto fuerte. El ritmo depende del rozamiento en el punto de contacto:
  - una bola cortada o plana agarra, sale rodando y pierde ritmo: la dejada se frena y se queda;
  - el liftado conserva el ritmo;
  - una bola plana y muy rápida resbala.

  | Ritmo que conserva al botar (2º bote a) | Dejada | Tercer golpe | Bloqueo | Drive | Resto | Saque | Globo | Ataque | Remate |
  |---|---|---|---|---|---|---|---|---|---|
  | 0.4 | 73 % (1,6 m) | 66 % (2,5 m) | 69 % (1,7 m) | 83 % (5,5 m) | 79 % (4,9 m) | 79 % (4,5 m) | 80 % | 81 % | 80 % (9,5 m) |
  | 0.5 | 54 % (1,2 m) | 43 % (1,6 m) | 45 % (1,1 m) | 77 % (5,2 m) | 69 % (4,2 m) | 69 % (4,0 m) | 77–80 % | 75 % | 68 % (8,1 m) |

  La altura del bote casi no cambia. La prueba de norma de USA Pickleball (soltar desde 78 pulgadas) da 0,86 m (norma: 0,76–0,86).
- **Cinta.** No cambia: rozan la cinta las dejadas que pasan entre +1 y −3 cm del borde, y salen a 2,4–3,3 m/s.
- **Solo física, sin el movimiento nuevo:** la escalera no se mueve (±3 puntos en todas las casillas, 48 partidos por pareja).

### Pies de la CPU

Antes iban como un cursor: arrancaban a tope en una décima, iban en línea recta a velocidad máxima, frenaban con una cola larga que les hacía ir arrastrándose los últimos centímetros y no paraban de hacer correcciones mínimas. Ahora (`FEET` en `match.ts`):

- **Paso de espera** cuando golpea el otro lado: frenan y caen equilibrados durante la reacción, y luego salen. Antes solo lo hacían en dobles; ahora también en individual, y el planificador lo tiene en cuenta.
- **Primer paso explosivo**, que se suaviza hasta la velocidad punta: cuanto más rápido van, menos pueden acelerar.
- **Frenada plantada:** frenan con un perfil constante y se paran en el sitio.
- **Giro con agarre:** corriendo, la dirección cambia a un ritmo limitado. Las trayectorias se curvan, y cambiar de sentido es plantar el pie y empujar hacia atrás.
- **El ritmo que pide la bola:**
  - con tiempo de sobra trotan o se desplazan de lado (nunca a menos de 2,2 m/s) para llegar con un tercio de segundo de margen;
  - esprintan solo cuando hace falta;
  - si sobra tiempo, rodean un poco la bola por detrás y entran hacia ella al final.
- **Recuperación:** vuelven al sitio con brío si está a metros, dan un paso si está a palmos y no se mueven por centímetros (no se recolocan a menos de 22 cm).
- **El planificador usa el mismo modelo** (`runTime`), que coincide con la simulación de los pies a unas tres centésimas de segundo entre 0,2 y 8 m. Además se fían un poco de más de sus piernas (0,03 s): de vez en cuando van a por una bola y se quedan a una estirada, como las personas. Sin esto no fallaban nunca una bola a la que iban, y la escalera se endurecía.

Medido con `tools/feet.ts`, máquina contra máquina, 6 partidos (individual: Reina contra Nuria; dobles: Marta y Lola contra Nuria y Reina):

| | Individual antes | Individual ahora | Dobles antes | Dobles ahora |
|---|---|---|---|---|
| Velocidad punta (p95) | 4,60 m/s | 4,45 m/s | 4,30 m/s | 3,81 m/s |
| Aceleración p95 / máxima | 26 / 26 m/s² (siempre al tope) | 30 / 34 m/s² (solo al arrancar) | 26 / 26 | 30 / 34 |
| Titubeo (cambios de sentido a paso lento por segundo) | 0,53 | 0,06 | 0,28 | 0,06 |
| Paso de espera tras el golpe del rival | 96 % | 100 % | 96 % | 100 % |
| Llegan tarde a una bola que creían alcanzable | 2,0 % | 1,0 % | 1,5 % | 1,0 % |
| Tiempo quietos en su sitio | 12 % | 40 % | 27 % | 53 % |

Dobles sigue coordinado: nadie va a por una bola buena 0 % y los dos a la vez 0 %. Los traspasos a mitad de vuelo bajan, porque cada uno llega más a la suya.

### Escalera

**Individual** (`npx tsx tools/bot.ts 48 1`; puntos ganados por el humano y, entre paréntesis, partidos):

| Humano | Paco | Lola | Bruno | Nuria | Reina |
|---|---|---|---|---|---|
| Novato, antes | 67 % (94) | 53 % (60) | 39 % (6) | 25 % (0) | 17 % (0) |
| Novato, ahora | 68 % (96) | 57 % (77) | 37 % (6) | 25 % (0) | 18 % (0) |
| Medio, antes | 88 % (100) | 78 % (100) | 66 % (96) | 49 % (44) | 35 % (6) |
| Medio, ahora | 89 % (100) | 77 % (100) | 70 % (100) | 50 % (44) | 33 % (4) |
| Bueno, antes | 96 % (100) | 91 % (100) | 82 % (100) | 70 % (98) | 50 % (48) |
| Bueno, ahora | 97 % (100) | 91 % (100) | 84 % (100) | 68 % (96) | 51 % (48) |

- Con 16 partidos por pareja (la tabla de Equilibrio 0.4) queda así: novato 100 / 81 / 6 / 0 / 0, medio 100 / 100 / 100 / 44 / 6 y bueno 100 / 100 / 100 / 94 / 50.
- **Desviaciones:**
  - **El novato gana más a Lola:** +4 puntos (de ganar el 60 % de los partidos al 77 %).
  - **El medio gana más a Bruno:** +4 puntos.
  - El resto de casillas se queda a ±2 puntos.
  - Se probó que el exceso de confianza fuera solo con bolas rápidas, para no tocar a Lola, y empeoraba otras casillas.
- **Golpes por punto y duración:** igual que antes. Ningún partido atascado.

**Dobles** (`npx tsx tools/bot-doubles.ts 12 1`, % de partidos):

| Humano | Paco y Lola | Lola y Bruno | Bruno y Nuria | Nuria y Reina |
|---|---|---|---|---|
| Novato, antes / ahora | 100 / 100 | 100 / 92 | 25 / 17 | 8 / 0 |
| Medio, antes / ahora | 100 / 100 | 100 / 100 | 75 / 75 | 33 / 25 |
| Bueno, antes / ahora | 100 / 100 | 100 / 100 | 92 / 100 | 33 / 33 |

- Con 32 partidos contra las dos parejas fuertes, el cambio va en los dos sentidos: novato 53 → 34 y 3 → 6, medio 66 → 88 y 22 → 19, bueno 97 → 100 y 44 → 38. Es ruido, no una tendencia.
- Suben un poco los fallos fuera de Marta, que sigue siendo a quien buscan.

### Herramientas

- `python3 tools/look.py <dist> <carpeta> <nivel> <ancho> <alto> <puerto>` saca siempre los mismos fotogramas (azar sembrado, partido avanzado a mano) e imprime `renderer.info`. Los fotogramas son: saque, peloteo, red, grada, plano abierto y desde detrás del fondo.
- `npx tsx tools/feet.ts` mide los pies de la CPU.
- `npx tsx tools/ballphys.ts` saca la tabla de física de la bola.

### Lo que queda

- **Medir en un móvil de verdad.** El presupuesto es más holgado (cuatro veces menos llamadas de dibujo), pero los fps hay que verlos en el teléfono.
- **Detalles de cerca:**
  - en los planos cercanos de la grada, los antebrazos del público se ven como palitos claros;
  - mirando hacia el sol (contraplanos), el cielo sale muy claro;
  - la sombra de una torre de focos cruza la pista en calidad alta. Es realista, pero si molesta para leer la bola se puede quitar. (10 oct: también salía en media; ahora solo en alta, ver «Pantalla en móvil».)
- **El paso de espera no se ve.** La simulación frena al jugador, pero no hay salto en la animación. Si el agente de personajes lo quiere, puede leerlo del momento del golpe del rival.
- **Desviaciones de la escalera** (novato contra Lola, medio contra Bruno). Si la prueba de Germán dice que Lola se ha quedado blanda, se puede subir un poco su calidad de golpe.

## Control 0.5 (9 oct)

Germán jugó la 0.4: «ya es jugable, pero al control y a la jugabilidad les falta mucho pulido». No dijo qué, así que se buscaron los fallos con pruebas: el bot realista (`tools/thumb.ts`, que usa el `Input` y el `HumanController` del juego), sondas nuevas en `tools/review/` y la página real en Chromium con toques de verdad (CDP) y teclado.

### Qué fallaba (con pruebas)

- **La ayuda peleaba con el pulgar** (`tools/review/lock.ts`). Aparcado en el círculo, girar el stick entre 30° y 80° no movía al jugador (0,00 m en 0,35 s). Yendo al círculo con el stick girado 80°, el jugador avanzaba 1,18 m hacia el círculo y solo 0,21 m hacia donde decía el pulgar. Solo se soltaba pasando de 90°.
- **La cocina era una trampa** (`tools/review/feel.ts`, `WAIT=net`). Quien sube empujando hasta «estar en la red» se queda dentro de la cocina: el jugador medio contra Bruno recibía 352 de 727 bolas dentro, perdía 94 puntos con «La dejaste pasar» y ganaba el 22 % de los puntos, frente al 64 % de quien espera en la línea.
- **Entre golpes no pasa nada.** Quien no se recoloca después de golpear gana el 28 % de los puntos (medio contra Bruno) y el 16 % (novato).
- **El aro dorado mentía en el móvil.** Entre la pantalla y el toque pasan unos 45 ms. Soltar viendo el aro dorado solo contaba como perfecto en el 78 % del tiempo dorado (los últimos 45 ms llegaban tarde), y había 45 ms de «perfecto» con el aro ya sin dorar.
- **Teclado (B8 de la revisión):** Espacio solo daba un drive al centro.
- **Un segundo dedo** que caía en la mitad izquierda con el stick cogido no hacía nada.
- **Ritmo:** 3,5 s de mediana entre el final del punto y la preparación del siguiente saque (más 0,87 s de preparación), sin forma de acortarlo. El saque decía su resultado («¡PERFECTO!») 0,87 s después de soltar.
- **«La dejaste pasar»** no explicaba que era por estar en la cocina.

### Qué cambia

- **El pulgar manda.** El enganche al círculo se suelta al girar el stick más de 65° respecto al camino al círculo (antes, 90°), o más de 60° si ya está aparcado, o con un empujón nuevo a más de 35°. Con el stick mantenido en la dirección de llegada sigue aparcado (el arreglo de la 0.4 no se pierde). Medido: aparcado y girando 50°, se mueve 0,85 m; 80°, 1,17 m. Yendo al círculo con 80°, va hacia el pulgar (1,09 m).
- **La línea de cocina frena** (con ayuda media o alta). Al subir, los pies se paran justo detrás de la línea (a 20 cm). Solo se entra a por una bola que bota dentro, y entonces la ayuda te lleva. Andar por la línea o hacia atrás no cambia. Con la misma subida a ciegas: 28 bolas dentro de la cocina (antes 352), 11 puntos por volear dentro (antes 94) y el 42 % de los puntos (antes 22 %). El novato pasa del 16 % al 23 %.
- **Ajuste nuevo «Volver a tu sitio entre golpes»** (apagado por defecto: es movimiento que no pides). Con el pulgar fuera del stick mientras tu bola va al otro lado, el jugador trota (al 72 % de su velocidad) a un buen sitio:
  - si sacas, al fondo hasta el tercer golpe;
  - tras el resto, una dejada o una bola suave, a la línea de cocina;
  - tras un drive, un paso más adelante;
  - tras un globo, se queda.

  Quien no se recoloca solo pasa del 25 al 61 % de los puntos (medio contra Bruno) y del 15 al 37 % (novato). En dobles funciona igual y no cambia nada más.
- **La suelta se juzga como la vio el jugador.** Cada suelta se fecha 40 ms antes (25 ms con ratón o teclado), y la ventana del perfecto pasa a 0,14 ± 0,1 s antes del contacto (antes, 0,12 ± 0,1). Así, el aro dorado que se ve cuenta el 97 % del tiempo (antes, el 78 %). El bot ahora tiene 45 ms de latencia de móvil, así que mide lo mismo que una persona con el teléfono.
- **Teclado:** mantén Espacio y toca las flechas para mover el objetivo por zonas: ↓ dejada al centro de la cocina (↓↓, corta), ↑ largo, ↑↑ globo, ↑↑↑ globo profundo, y ← → a los lados (1,35 m por toque). En el saque, 0,8 m de lado y 1 m de fondo por toque. Mientras mantienes Espacio, las flechas apuntan y WASD sigue moviendo.
- **Stick:** la base flotante sigue al pulgar desde 1,1 veces el radio (antes 1,4), así que cambiar de sentido pide un recorrido más corto. Un segundo dedo apunta caiga donde caiga.
- **Ritmo:** un toque para apuntar durante la pausa tras el punto adelanta el siguiente saque, sin bajar de 0,6 s (el cartel con el motivo se lee). En la página real, la pausa baja de 1,6 a 0,7 s. Un pulgar apoyado en el stick no la salta.
- **Sensaciones:**
  - **Parón de golpe:** 60 ms casi congelado en un perfecto tuyo (30 ms si es una dejada) y 45 ms en cualquier remate. Medido en la página: tras un perfecto, el partido avanza 0–8 ms en los 50 ms siguientes.
  - **Vibración por patrones** (nuevo ajuste «Vibración», encendido por defecto):
    - doble pulso en el perfecto;
    - toque corto al golpear;
    - un «tic» cuando llegas a una bola a la que has tenido que correr (ya puedes soltar el stick);
    - otro cuando la línea de cocina te frena;
    - al ganar o perder el punto.
  - **El saque dice su resultado al soltar,** no al golpear.
  - **El saque perfecto sale más plano:** cruza la red 0,5 m por encima en vez de 0,7, así que va 1 m/s más rápido y llega 0,08 s antes.
- **Motivo:** «La dejaste pasar» pasa a ser «En la cocina no se volea». Las ayudas de teclado y de la cocina, en «Cómo se juega» y en el tutorial.

### Números

**Escalera individual** (`npx tsx tools/bot.ts 40 1`, 40 partidos por pareja; % de partidos ganados y, entre paréntesis, de puntos; antes → ahora):

| Humano | Lola | Bruno | Nuria | Reina |
|---|---|---|---|---|
| Novato | 60 (53) → 60 (52) | 8 (38) → 5 (37) | 0 (25) → 0 (26) | 0 (18) → 0 (17) |
| Medio | 100 (79) → 100 (79) | 95 (66) → 98 (65) | 40 (48) → 40 (49) | 8 (35) → 5 (34) |
| Bueno | 100 (90) → 100 (90) | 100 (82) → 100 (81) | 98 (69) → 98 (70) | 50 (50) → 57 (51) |

- Con 16 partidos (`tools/bot.ts 16 1`), contra Paco: novato 94 → 94 %, y medio y bueno, 100 %.
- Los perfectos no cambian: novato 11–13 %, medio 28–31 % y bueno 52–54 % de sus golpes.
- Lo que vale apuntar (`tools/review/aimvalue.ts`, bueno, % de puntos contra Paco, Bruno y Reina):
  - sin apuntar: 78 / 27 / 9 (antes 77 / 27 / 10);
  - apunta sin perfecto: 97 / 79 / 45 (antes 96 / 77 / 43);
  - con perfecto: 98 / 86 / 52 (antes 98 / 83 / 55).

**Dobles** (`tools/bot-doubles.ts`, 32 partidos contra las dos parejas fuertes; antes → ahora):
- medio: 66 → 78 % contra Bruno y Nuria, y 22 → 16 % contra Nuria y Reina;
- bueno: 97 → 97 % y 44 → 47 %.

Con 12 partidos por pareja las diferencias están dentro del ruido. Nadie deja una bola buena (0 %) y nadie va a por la misma bola a la vez (0 %).

**Sin atascos:** ningún partido atascado con ayuda 0, 1 o 2, en rally y en clásica, en individual y en dobles. `tools/review/fuzz.ts` (pulgares al azar, 40 partidos y 496 puntos) no da errores, ni NaN, ni jugadores fuera, ni partidos atascados.

### Herramientas nuevas

- `tools/review/feel.ts`: llegar a la bola, dónde espera, bolas recibidas dentro de la cocina, largo de los arrastres y ritmo entre puntos. Admite `WAIT=lazy|net` y `RECOVER=1`.
- `tools/review/lock.ts`: si la ayuda pelea con el pulgar.
- `tools/review/serve.ts`: la velocidad del saque según su altura sobre la red.
- `tools/review/fuzz.ts`: pulgares al azar.
- `RECOVER=1` también en `tools/bot.ts` y `tools/bot-doubles.ts`.

### Para el HUD

- `match.parked(id)`: el jugador está aparcado en el círculo y el pulgar puede soltar.
- `match.lineHold(id)`: la línea de cocina le está frenando (iluminar la línea).
- `match.recoverSpot(p)`: adónde vuelve con el ajuste de recolocarse.
- El aro de tiempo usa `IDEAL_RELEASE` y `PERFECT_WINDOW` (0,14 ± 0,1 s): si se rediseña, que no vuelva a poner 0,12 a mano.
- Durante la pausa tras el punto, a partir de 0,6 s, se puede mostrar «Toca para seguir».

### Pendiente

- **Probarlo en un móvil de verdad,** sobre todo los 40 ms de latencia (puede que un Android lento pida más) y la vibración, que no existe en iPhone.
- **Recolocarse** está apagado por defecto. Si Germán ve que los novatos se quedan atrás, se puede encender con la ayuda alta.
- **Arrastres largos:** la dejada pide unos 88 px hacia abajo y el globo 106–128 px hacia arriba (`feel.ts`). Hacerlos más cortos cambia la precisión y, con ella, la escalera, así que se ha dejado igual. Si el dedo derecho cae muy cerca del borde derecho, no llega a la banda derecha.
- **La aceleración del jugador** sigue siendo muy viva (de 0 a 4,6 m/s en 0,13 s y parada en 0,1 s). Si se ve robótica, se puede suavizar el arranque, pero cambia cuántas bolas se alcanzan.
- **«No llegas»** sigue siendo lo que más pierde el novato (17–28 % de los puntos). Pedir al círculo un margen de reacción solo cambia el cartel por «Golpe ganador» y quita bolas alcanzables, así que no se ha hecho.

## Control y simulación 0.6 (10 oct)

Respuesta a la revisión independiente de la 0.5 (puntos 2, 6 y 8, y los peloteos automáticos de B7). Todo medido con el bot de pulgares y las sondas de `tools/review/`; «antes» es el código de la 0.5 con las mismas semillas.

### Qué cambia

- **Pies humanos para el jugador** (`HUMAN_FEET` en `match.ts`, el mismo `footStep` que la CPU con límites algo más vivos):
  - **Primer paso explosivo** (38 m/s² desde parado, lo mismo que antes en los primeros centímetros) que se suaviza hacia la velocidad punta.
  - **Frenada plantada** a unos 3 g (antes 5 g). Soltando el pulgar a tope, para en 0,15 s y 35 cm.
  - **Giro con agarre** a velocidad; andando apenas cuesta.
  - **Aparcado:** la ayuda le lleva al círculo con un perfil de frenada que los pies pueden seguir, y queda a menos de 1 cm.
  - **Paso de espera** cuando golpea el rival: 0,1 s en que puede frenar pero solo arrancar suave. Compensa: durante el medio segundo siguiente, el primer paso es más rápido.
- **Golpes plantados y final del golpe** (CPU y humano):
  - **Entrar frenando:** al llegar a la bola, la velocidad baja en rampa hasta 1 m/s (CPU) o 1,4 m/s (humano, solo si va a golpear). El planificador de la CPU cuenta ese tiempo (`plantTime`): si no llega plantado, la bola es una estirada.
  - **Terminar el golpe antes de correr:** 0,2 s (0,1 s tras una dejada, una bola corta o un bloqueo) sin pasar de 1–1,3 m/s. Lo que pide el pulgar se aplica en cuanto acaba.
- **Golpe automático** (`AUTO` en `human.ts`, `AUTO_PUNISH` y `autoShot` en `brain.ts`):
  - **Bloqueo reflejo:** contra una bola fuerte, el automático sale algo peor (hasta −0,05 de calidad contra un remate). Apuntar no cambia.
  - **La CPU lo lee:** desde el tercer automático seguido, cada uno se levanta un poco más (+0,1 de presión por cada uno) y la CPU lo ataca a veces hacia el lado libre (del 23 % con Paco al 43 % con Reina). Lo ataca aunque venga bajo, así que a veces falla ella.
  - **Bola por encima de la cabeza en la red:** el automático la remata al centro y sin mucha fuerza. Antes la devolvía alta y profunda, y eso era un remate regalado.

### Números

**Pies del humano** (`tools/review/move.ts`, 12 partidos):

| | Antes | Ahora |
|---|---|---|
| De parado a 4 m/s | 0,12 s | 0,17 s (0,15–0,20) |
| Aceleración p95 | 36 m/s² (siempre) | 31 m/s² (49 justo tras el paso de espera) |
| Frenada p95 | 47 m/s² | 30 m/s² |
| De 3,5 m/s a parado | 0,08 s | 0,13 s |
| Aparcado: distancia al círculo en el contacto (p50 / p90) | 2,7 / 4,3 cm | 0,3 / 1,0 cm, sin pasarse |

**La ayuda sigue obedeciendo al pulgar** (`lock.ts`):
- yendo al círculo con el stick girado 65°, va 1,05 m hacia el pulgar (antes 1,15);
- con 80°, 1,09 m (antes 1,18);
- aparcado y girando 65°, 1,13 m (antes 1,21).

La diferencia es lo que cuesta girar corriendo.

**Pies en el contacto** (12 partidos, CPU y bot):

| | En el contacto (p50 / p90) | A más de 2 m/s | 0,15 s después (p50 / p90) |
|---|---|---|---|
| CPU antes | 0,28 / 2,75 m/s | 15 % | 2,97 / 3,56 m/s |
| CPU ahora | 0,28 / 1,07 m/s | 0 % | 1,00 / 2,23 m/s |
| Humano antes | 0,00 / 0,96 m/s | 4 % | 3,99 / 4,60 m/s |
| Humano ahora | 0,00 / 1,30 m/s | 1 % | 1,30 / 2,70 m/s |

La CPU hace menos cambios bruscos de sentido: de 3,1 a 0,7 por minuto en individual (`tools/feet.ts`). Las bolas que creía alcanzables y no alcanza siguen en el 1,0 % (dobles: 1,5 %).

**Peloteos automáticos** (`tools/review/rallies.ts`, novato contra Lola, 48 partidos):

| | Golpes por punto (media / p90 / máx.) | Puntos de 25 o más | Puntos con 3+ dejadas automáticas seguidas |
|---|---|---|---|
| Antes | 15,7 / 32 / 94 | 21 % | 29 % |
| Ahora | 13,8 / 28 / 56 | 16 % | 24 % |

El medio contra Lola baja de 15,4 a 14,3 golpes por punto.

**Lo que vale apuntar** (`aimvalue.ts`, bueno; contra Paco / Bruno / Reina):
- **Sin apuntar:** 74 / 28 / 13 % de los puntos (antes 73 / 23 / 8). Los puntos bajan de 25–28 a 18–20 golpes.
- **Apuntando:** 96 / 83 / 48 % (antes 96 / 83 / 46).
- **Con perfecto:** 98 / 89 / 59 % (antes 98 / 87 / 55).

El automático sigue muy por debajo de apuntar.

**Escalera individual** (`bot.ts 24 1`, % de puntos, antes → ahora):

| Humano | Paco | Lola | Bruno | Nuria | Reina |
|---|---|---|---|---|---|
| Novato | 70 → 66 | 56 → 54 | 41 → 38 | 27 → 26 | 17 → 17 |
| Medio | 87 → 93 | 73 → 80 | 68 → 66 | 49 → 47 | 34 → 35 |
| Bueno | 98 → 98 | 89 → 88 | 84 → 84 | 64 → 69 | 52 → 50 |

- **Partidos ganados:** novato 96 / 71 / 13 / 0 / 0, medio 100 / 100 / 96 / 38 / 4, bueno 100 / 100 / 100 / 100 / 42. Con 48 partidos, el novato saca el 41–42 % de los puntos (antes el 41 %).
- **Ayuda 0 y 2:** todas las casillas dentro de ±5 puntos, salvo novato contra Paco con ayuda alta (78 → 84).
- **Dobles** (`bot-doubles.ts 12 1`, % de partidos contra las cuatro parejas):
  - novato: 100 / 100 / 42 / 8 → 100 / 75 / 42 / 0;
  - medio: 100 / 100 / 75 / 42 → 100 / 100 / 67 / 50;
  - bueno: 100 / 100 / 100 / 33 → 100 / 100 / 100 / 58.

  Con 12 partidos por pareja, todo es ruido.
- Ningún partido atascado con ninguna ayuda. `fuzz.ts`: 40 partidos y 499 puntos sin fallos.

### Herramientas

- `tools/review/move.ts`: los pies del humano (arranque, frenada, aparcado) y la velocidad en el contacto y 0,15 s después, de la CPU y del humano.
- `tools/review/rallies.ts`: largo de los puntos y rachas de golpes automáticos. Admite `AUTO='{…}'` y `PUNISH='{…}'`.
- `FEET='{…}'` y `HFEET='{…}'` en `bot.ts` y `bot-doubles.ts`, para probar otros pies sin tocar el código.

### Para el HUD y los personajes

Todo es barato: se lee un campo o se hace una cuenta pequeña.

- `match.lineHold(id)`: la línea de cocina le está frenando (iluminar la línea).
- `match.parked(id)`: aparcado en el círculo, el pulgar puede soltar (ahora a menos de 1 cm).
- `match.canHurry()`: en la pausa tras el punto, un toque adelanta el saque. Ya han pasado los 0,6 s mínimos y queda pausa. Es cuando sale «Toca para seguir».
- `match.sincePoint()`: segundos desde que acabó el punto.
- `match.stance(id)`: momento de los pies, para las piernas del personaje:
  - `'split'`: paso de espera;
  - `'plant'`: entra frenando al golpe;
  - `'follow'`: termina el golpe;
  - `null`: corre o espera.

### Pendiente

- **«No llegas» sube algo en el novato:** de perder así el 12–22 % de los puntos a perder el 17–27 % (`bot.ts`). Las bolas a 2–3 m del círculo que no alcanza pasan del 8 al 11 %.
  - Los puntos que gana no bajan, porque la CPU también llega peor.
  - Se probaron un final de golpe más corto, más arranque, más agarre y un planificador exacto del círculo, y ninguno lo mueve fuera del ruido.
  - Es el precio de que no salga disparado tras golpear.
- **El automático y la ayuda devuelven casi todos los remates.** La ayuda mueve al jugador en el mismo instante en que golpea el rival, sin tiempo de reacción.
  - La CPU devuelve el 30 % de los remates del humano y el humano el 90 % de los suyos.
  - Limitar el alcance del golpe automático según el tiempo acortaba los peloteos, pero bajaba al novato 2–3 puntos en todas las casillas, así que no entra.
  - Es la siguiente palanca si los peloteos siguen pareciendo largos.
- **Los dobles siguen largos** (de 12 a 25 golpes, máximo 93).
- **0,15 s después del golpe la CPU va siempre a 1,0 m/s,** el tope del final del golpe. Si en pantalla se ve demasiado igual, se puede variar por jugador.

## Control y simulación 0.7 (10 oct)

Tres problemas abiertos de la 0.6: el novato perdía demasiados puntos con «No llegas», los dobles eran muy largos y el golpe automático alimentaba peloteos largos. Todo se ha medido con el bot de pulgares y las sondas de `tools/review/`. «Antes» es el código de la 0.6 con las mismas semillas: las palancas nuevas se pueden apagar por entorno y, apagadas, dan exactamente los números de la 0.6.

### Por qué el novato no llegaba (con pruebas)

`tools/review/miss.ts` sigue cada bola que va al humano desde el golpe del rival. Novato contra los cinco rivales (8 partidos por rival, 655 puntos): «No llegas» se llevaba el 23 % de los puntos (el 39 % de los perdidos).

- **Las bolas:** sobre todo drives (83 %) y aceleraciones (13 %) a unos 15,6 m/s.
- **El círculo no salía tarde:** aparecía 0,02 s después del golpe rival, a 2,3 m del jugador y con 0,62 s por delante.
- **El círculo pedía reaccionar en el acto.** El planificador elegía el contacto «más bonito» (derecha, a la altura de la cintura, pronto) entre los alcanzables saliendo en el mismo instante del golpe rival, sin contar que una persona tarda en ver la bola y mover el pulgar:
  - con la reacción del novato (0,47 s en esas bolas), el primer círculo era alcanzable en el 3 % de los fallos (en el 89 % de las bolas a las que sí llegó);
  - en el 45 % de los fallos había otro contacto legal alcanzable con esa misma reacción (dejarla botar, otro momento o la otra mano);
  - en el 36 % de los fallos, el sitio con la otra mano estaba al menos 0,5 m más cerca.
- **Después, el círculo desaparecía bajo sus pies.** Cuando dejaba de poder llegar «con holgura», el círculo solo buscaba sitios a 0,3 m o menos, nunca a una estirada. Así, en el 89 % de los fallos el círculo se iba antes del contacto, con el jugador a 2,4 m y 0,25 s por delante, y el jugador se paraba. Sin embargo, en el 55 % de esos casos aún había un contacto posible.
- **Lo que no era:**
  - el final del golpe: ningún fallo empezó con el jugador terminando su golpe;
  - el círculo tardío: salía a los 0,02 s.
  - El imán de la ayuda sí cuenta: con ayuda 1 solo actúa a menos de 1,2 m, y el círculo de los fallos estaba a 2,3 m. Con ayuda 2 (2,4 m) los fallos ya eran del 4–12 %.
- **Por qué empeoró en la 0.6** (lo más probable; no se ha medido aparte): los pies humanos arrancan más despacio (de 0 a 4 m/s en 0,17 s, antes 0,12 s) y hacen el paso de espera. El círculo seguía calculado como si el jugador saliera disparado en el acto.

### Qué cambia

- **El círculo se planifica para una persona** (`SUGGEST` en `match.ts`):
  - **Margen para reaccionar.** Un sitio que no deja 0,35 s para ver la bola y mover el pulgar cuesta más: 4 por cada segundo que falta para llegar. De dos contactos posibles, gana el que una persona alcanza.
  - **Una vez mostrado, el círculo se queda** (o pasa a otro contacto) mientras el jugador pueda llegar a 0,85 m de él con una estirada. Solo desaparece cuando ya no llega ni estirándose.
  - **El primer círculo sigue pidiendo poder llegar al sitio.** Una bola que solo un reflejo alcanza no lo muestra y cuenta como golpe ganador del rival.
- **La ayuda reacciona como una persona** (`ASSIST`). Con el pulgar quieto, la ayuda no mueve al jugador hasta 0,18 s después del golpe rival (antes lo movía en el mismo instante). Medido: no perjudica al novato y no cambia cuántos remates devuelve. Queda porque es más real: el jugador no sale antes de que nadie pudiera ver la bola.
- **El alcance cuesta tiempo, a los dos lados.** Por qué se devolvían tantos remates: el humano devolvía el 85–88 % de los de Lola, con una mediana de 0,23 s desde el remate (el 82 % en menos de 0,3 s), estirándose y siempre con el golpe automático, con calidad 0,20. Tenía todo su alcance desde el primer instante, y la CPU, en cambio, no puede planear ningún contacto antes de su reacción.
  - **Reflejo del humano** (`REFLEX`). Justo tras el golpe rival solo llega cerca del cuerpo: la mitad de la estirada hasta 0,12 s, y la estirada completa a los 0,36 s.
  - **Estirada de la CPU** (`CPU_LUNGE`). Su estirada (`lunge`) se completa 0,25 s después de su reacción. Una bola rápida por el medio en dobles pasa entre los dos, como en el juego real.
  - El reflejo del humano solo, sin lo demás, hundía la escalera: en una versión más fuerte (0,3 de la estirada hasta 0,42 s), el medio contra Reina bajaba del 36 al 25 % de los puntos. Con los dos y el golpe de marco, la escalera se queda (ver «Números»).
- **Golpe de marco** (`SHANK` en `brain.ts`). La calidad de contacto tiene un suelo: 0,15 la CPU y 0,20 el humano. Antes, un remate a los pies sin tiempo daba lo mismo que una bola algo incómoda: un bloqueo de 0,15 que seguía en juego, y la presión del peloteo lo levantaba para otro remate. Ahora lo que sobra por debajo del suelo es la probabilidad de que la bola salga de marco (a la red o larga): 1 por unidad en individual y 2 en dobles, con un máximo del 70 %. Un golpe perfecto nunca sale de marco. El evento `hit` lo marca con `shank`.
- **Dobles más resolutivos** (`DOUBLES` en `brain.ts` y `POACH` en `match.ts`):
  - **Ataque a la bola alta en la red:** al ataque de cada uno se suman 0,35, por lo alta que viene la bola. Es igual para todos, así que no favorece a las parejas que más atacan.
  - **Aceleraciones por cansancio de dejadas:** 1,3 veces más frecuentes.
  - **La presión crece más rápido:** 0,055 por golpe desde el sexto (antes 0,045).
  - **Robos en la red:** si la bola le llega alta a un jugador de la máquina y su compañero, también de la máquina y en la red, puede volearla, se la queda para rematarla. Lo hace con probabilidad 0,5 por lo alta que viene: nada a la altura de la cinta y del todo medio metro por encima. Nunca con una bola del humano ni de Marta: su círculo es suyo.
- **Marta sube a 0,82 de calidad** (antes 0,80). Con puntos más cortos, la pareja del humano perdía unos puntos. Con 0,80 se queda de 3 a 7 puntos por debajo contra la pareja más fácil; con 0,82, a ±4 en todas.
- **Columna «nadie» del bot de dobles:** ahora solo cuenta las bolas que alguien del equipo podía alcanzar. Lo calcula el planificador al golpear, devolviendo los dados para que el partido no cambie. Con el alcance nuevo hay ataques que no alcanza nadie, y antes salían como fallos de coordinación.

### Números

**«No llegas» del novato** (`miss.ts`, los cinco rivales): del 23 % al 15 % de los puntos (del 39 % al 27 % de los perdidos). De los fallos que quedan:

- solo el 10 % se alcanzaba con su reacción (antes, el 45 %);
- el 80 % se alcanzaba reaccionando en 0,25 s, pero no con su reacción (de mediana, la reacción más lenta que aún llegaba era de 0,35 s);
- el círculo ya no desaparece cuando aún había contacto posible (5 %, antes 55 %).

**Escalera individual** (`bot.ts 24 1`, % de puntos y, entre paréntesis, de partidos; antes → ahora):

| Humano | Paco | Lola | Bruno | Nuria | Reina |
|---|---|---|---|---|---|
| Novato | 66 (96) → 72 (100) | 54 (71) → 53 (71) | 38 (13) → 43 (21) | 26 (0) → 26 (0) | 17 (0) → 16 (0) |
| Medio | 93 (100) → 90 (100) | 80 (100) → 76 (100) | 66 (96) → 67 (100) | 47 (38) → 50 (58) | 35 (4) → 38 (4) |
| Bueno | 98 (100) → 99 (100) | 88 (100) → 87 (100) | 84 (100) → 87 (100) | 69 (100) → 66 (100) | 50 (42) → 55 (67) |

- **Con 48 partidos contra Nuria y Reina:** medio 49 → 49 y 35 → 40; bueno 66 → 66 y 52 → 53 (partidos ganados a Reina: 54 → 63 %).
- **«No llegas»** (% de los puntos):
  - novato: 23 / 17 / 27 / 22 / 19 → 17 / 13 / 19 / 13 / 14;
  - medio: 5 / 7 / 13 / 7 / 9 → 5 / 8 / 7 / 7 / 6;
  - bueno: 1–4 → 0–2.
- **Golpes por punto:**
  - novato: 8,6 / 13,6 / 13,4 / 18,7 / 16,1 → 7,7 / 12,7 / 12,3 / 15,5 / 14,3;
  - medio: 7,3 / 14,3 / 14,0 / 20,1 / 18,6 → 6,9 / 12,6 / 12,3 / 16,4 / 16,5;
  - bueno: 6,3 / 13,2 / 12,9 / 20,8 / 20,3 → 6,4 / 12,3 / 11,3 / 17,0 / 16,3.
- **Ayuda 0** (% de puntos):
  - novato: 67 / 48 / 39 / 20 / 16 → 67 / 53 / 39 / 26 / 18;
  - medio: 90 / 78 / 63 / 42 / 35 → 91 / 76 / 67 / 43 / 32;
  - bueno: 98 / 89 / 81 / 65 / 52 → 98 / 86 / 85 / 71 / 50.
- **Ayuda 2:**
  - novato: 84 / 57 / 47 / 29 / 22 → 84 / 61 / 48 / 29 / 20;
  - medio y bueno: ±2.
- **Golpes de marco del humano:** salen sobre todo contra Nuria y Reina (perder por «error-net» pasa del 0–1 % al 2–6 %).

**Peloteos y golpe automático** (`rallies.ts`, 48 partidos contra Lola):

| | Golpes por punto (media / p90 / máx.) | Puntos de 25 o más | Remates de Lola que devuelve |
|---|---|---|---|
| Novato antes | 13,8 / 28 / 56 | 16 % | 85 % |
| Novato ahora | 13,1 / 27 / 53 | 12 % | 77 % |
| Medio antes | 13,8 / 28 / 55 | 14 % | 89 % |
| Medio ahora | 12,8 / 24 / 45 | 9 % | 79 % |

- Los puntos del novato con 3 o más dejadas automáticas seguidas bajan del 24 al 21 %.
- **El retardo de la ayuda, por separado** (con el círculo nuevo):
  - novato con ayuda 1: 73 / 56 / 42 / 28 / 16 sin retardo y 73 / 58 / 40 / 30 / 20 con él;
  - con ayuda 2: 82 / 62 / 47 / 33 / 21 y 84 / 64 / 48 / 31 / 23;
  - remates devueltos: 88 % en los dos casos;
  - es inocuo, pero no es lo que alargaba los peloteos.
- **Lo que vale apuntar** (`aimvalue.ts`, bueno; contra Paco / Bruno / Reina):
  - sin apuntar: 77 / 19 / 6 % (0.6: 74 / 28 / 13);
  - apuntando: 98 / 83 / 51 % (96 / 83 / 48);
  - con perfecto: 99 / 85 / 63 % (98 / 89 / 59).

  El automático vale ahora menos contra quien ataca.

**Dobles** (`bot-doubles.ts 24 1`, % de puntos y de partidos; antes → ahora):

| Humano | Paco y Lola | Lola y Bruno | Bruno y Nuria | Nuria y Reina |
|---|---|---|---|---|
| Novato | 80 (100) → 80 (100) | 65 (88) → 63 (92) | 49 (46) → 53 (63) | 35 (4) → 35 (4) |
| Medio | 87 (100) → 83 (100) | 72 (100) → 72 (100) | 55 (71) → 61 (96) | 45 (33) → 45 (33) |
| Bueno | 93 (100) → 89 (100) | 78 (100) → 78 (100) | 65 (96) → 68 (100) | 51 (54) → 51 (46) |

- **Golpes por punto:**
  - novato: 11,7 / 17,5 / 21,2 / 23,3 → 10,5 / 12,4 / 14,4 / 15,9;
  - medio: 11,8 / 17,6 / 21,1 / 22,4 → 10,3 / 13,4 / 14,9 / 16,8;
  - bueno: 12,1 / 16,6 / 21,1 / 23,6 → 10,0 / 13,1 / 15,2 / 16,7;
  - peloteo más largo: 93 → 60.
- Con `bot-doubles.ts 16 1`, de 12–25 a 10–17 golpes por punto.
- **Cómo se juega** (`drallies.ts`, medio y Marta contra Nuria y Reina, 16 partidos):

  | | Antes | Ahora |
  |---|---|---|
  | Golpes por punto (media / p90 / máx.) | 23,5 / 42 / 65 | 17,1 / 30 / 60 |
  | Puntos de 25 golpes o más | 43 % | 19 % |
  | Dejadas por punto | 10,3 | 6,7 |
  | Bolas por encima de 1 m en la red que se atacan | 55 % | 71 % |
  | Remates devueltos | 98 % | 83 % |
  | Aceleraciones devueltas | 94 % | 86 % |
  | El punto acaba en los 3 golpes siguientes a un ataque | 21 % | 35 % |
  | Voleas en la red sobre la mitad del compañero (robos) | 6 % | 11 % |

  - **Máquina contra máquina** (Lola y Marta contra Nuria y Reina): de 19,0 a 12,3 golpes por punto (máximo, de 49 a 31). Se devuelven el 52 % de los remates (antes el 81 %), el 57 % de los ataques acaban el punto en 3 golpes (antes el 33 %) y los robos pasan del 7 al 17 % de las voleas en la red.
- **Coordinación:** nadie deja una bola alcanzable (0 %) y nadie va a por la misma bola a la vez (0 %).

**Sin atascos:**
- Ningún partido atascado en individual ni en dobles, con ayuda 0, 1 o 2, en rally y en clásica.
- `fuzz.ts`: 40 partidos y 512 puntos sin fallos.
- Los pies (`move.ts`, `feet.ts`) y el enganche de la ayuda (`lock.ts`) no cambian:
  - aparcado a 0,3 cm del círculo;
  - la CPU no llega al 0,7 % de los planes que creía alcanzables en individual y al 0,4 % en dobles (`feet.ts`).

### Herramientas

- **`tools/review/miss.ts`:** por qué no llega el humano. Para cada bola mide:
  - el primer círculo (cuándo sale, a qué distancia y con cuánto tiempo);
  - la reacción del pulgar;
  - el final de su golpe;
  - si se podía llegar con sus pies (al círculo o a cualquier contacto legal), con reacción 0, 0,25 s y la suya;
  - qué pasa cuando el círculo desaparece.

  `TRACE=n` saca fotograma a fotograma los primeros fallos.
- **`tools/review/drallies.ts`:** cómo se juegan y acaban los puntos de dobles: dejadas, bolas altas atacadas, robos (los decide la CPU al golpear el rival), ataques devueltos y si acaban el punto, y errores por golpe y calidad (`ERRQ=1`). `TRACE=n` saca puntos largos golpe a golpe. El nivel `cpu` pone a Lola en lugar del humano.
- **`rallies.ts`:** ahora saca también los remates y las aceleraciones que devuelve el humano: tiempo, estirada, automáticos y si la CPU gana después.
- **`bot-doubles.ts`:** columna de puntos ganados.
- **Variables de entorno:** las palancas nuevas se pueden cambiar sin tocar el código, con `'{…}'`:
  - `SUGGEST`, `ASSIST`, `REFLEX`, `CPU_LUNGE` y `SHANK`, en `bot.ts`, `bot-doubles.ts`, `rallies.ts`, `drallies.ts` y `miss.ts`;
  - `DOUBLES` y `POACH`, en `bot-doubles.ts` y `drallies.ts`.

  Con estos valores se reproduce la 0.6 exacta: `SUGGEST='{"tight":0,"stretch":0.3}' ASSIST='{"see":0}' REFLEX='{"min":1}' CPU_LUNGE='{"time":0}' SHANK='{"k":0}' DOUBLES='{"add":0,"tired":1,"pressure":0.045}' POACH='{"chance":0}'` y, en dobles, `TUNE='{"marta":{"q":0.8}}'`.

### Para el HUD y los personajes

Solo lectura y barato:

- **`match.targetInfo(id)`** devuelve `{ slack, reach }` del círculo:
  - `slack`: segundos de sobra para llegar a él. Si es menor que 0, solo llega estirándose (se puede pintar el círculo en ámbar).
  - `reach`: a qué distancia del círculo aún puede golpear en su momento. Es menor justo tras el golpe rival.
  - **Arreglo pendiente en la vista:** `view.ts` (el color «cerca» del círculo) y `main.ts` (el aviso de vibración «ya llegas») comparan con `LUNGE`; deberían usar `reach`. Si no, con una bola muy rápida el círculo se pone verde antes de que el jugador pueda llegar.
- **`match.reachAt(t)`:** el alcance del humano para un contacto en el instante `t`.
- **Evento `hit` con `shank: true`:** la bola sale de marco. Sirve para un sonido de marco o el rótulo «¡De marco!».
- **Estiradas:** el humano llega más a menudo estirado (`plan.stretch` alto), porque el círculo se queda mientras llega una estirada. La CPU se estira menos ante bolas muy rápidas.

### Pendiente

- **Dobles, la pareja más fácil** (Paco y Lola) queda 4 puntos por debajo para el medio y el bueno, aunque siguen ganando todos los partidos. Las demás, a ±4.
- **El medio gana algo más a Reina** (del 35 al 40 % de los puntos con 48 partidos) y el bueno le gana más partidos (del 54 al 63 %) con casi los mismos puntos. La causa: la CPU se defiende peor de los ataques rápidos (`CPU_LUNGE`), y quien más ataca es quien más lo nota.
- **El humano aún devuelve más remates que la CPU** (77–79 % de los de Lola, frente a una CPU que devuelve el 51 % en dobles). Su reflejo es más generoso a propósito, para que el juego no se vuelva injusto. Si los peloteos siguen pareciendo largos, la palanca es `REFLEX` (por ejemplo `min` 0,4), pero cuesta puntos contra los rivales que atacan.
- **Los «No llegas» que quedan son bolas rápidas** que piden reaccionar en 0,35 s o menos. El novato del bot tarda 0,42 s de media. Si en el móvil se ve que una persona sí llega, la palanca es `SUGGEST.see` o el imán de la ayuda 1, que sigue en 1,2 m.
- **Hay que verlo en el móvil:**
  - el círculo que se queda mientras llega una estirada (puede necesitar el color ámbar para que se entienda);
  - los golpes de marco.

## 0.8 (10 oct): ataque, individual, entrenamiento, movimiento y gráficos

Germán probó la 0.7. Sobre la jugabilidad eligió de la lista: el ataque como decisión, un individual más variado, explicar por qué se pierde el punto y un modo entrenamiento (no eligió medir en su móvil ni los golpes especiales). Sobre los gráficos: «los jugadores han mejorado, pero muchos movimientos aún no parecen naturales» (correr y frenar, los golpes y la espera entre golpes) y «la calidad general debería ser más alta». Se hizo con cinco agentes en paralelo y luego se integró. El detalle, con todas las tablas, está en `docs/notas-08-*.md` (también en el Proyecto como `pickleball/notas-08-*.md`).

### Qué cambia para el jugador
- **Ataque como decisión** (`notas-08-ataque.md`):
  - Cuando te llega una bola atacable (10 cm o más sobre la cinta, a menos de 3 m de la red), el círculo y el aro de los pies se ponen naranjas, sale «¡ATÁCALA!» un segundo y vibra con un doble tic.
  - **Latigazo** hacia arriba con el pulgar derecho para acelerar; por defecto va al cuerpo. Arrastrar despacio coloca como antes; el ataque escondido de la 0.7 (apuntar al fondo con una bola alta) ya no existe.
  - **Toque sin arrastrar** para bloquear cuando te atacan, con el aro de tiempo: en dorado, bloqueo limpio a la cocina.
  - En el teclado, F o el botón derecho atacan y un toque corto de Espacio bloquea.
  - El golpe automático ya no acelera: resetea. El remate por encima de la cabeza sigue saliendo solo.
  - Acelerar por debajo de la cinta tiene el triple de riesgo.
- **La CPU juega individual como individual** (`notas-08-individual.md`):
  - resta profundo y sube; saca y se queda atrás;
  - tira passings, globos de ataque y bolas al cuerpo contra quien sube;
  - hace golpes de aproximación ante bolas cortas y volea al hueco;
  - espera en la bisectriz de los ángulos.
  - Cada rival tiene su estilo en individual: Paco de fondo, Lola paciente, Bruno pegador que sube poco, Nuria sube a todo y Reina busca el hueco.
  - Los dobles no cambian.
- **Por qué ganaste o perdiste el punto** (`notas-08-entreno.md`):
  - Debajo del cartel del punto sale una línea con un dato del propio punto: «Tu dejada pasó 1,4 m sobre la red y Reina atacó», «Saliste tarde: la bola tardó 0,9 s y estabas a 2,3 m», «Tu ataque al cuerpo: Lola no pudo bloquear». En dobles dice quién fue.
  - Si un error se repite, sale un consejo entre puntos, como mucho uno cada 5 puntos (Ajustes → «Consejos entre puntos»).
  - Con explicación, la pausa tras el punto pasa de 1,6 a 2,2 s (un toque la salta).
- **Modo entrenamiento:** una máquina lanzapelotas y cinco retos de 35–55 s con 1–3 estrellas y récord:
  1. dejadas a la diana;
  2. tercer golpe a la cocina;
  3. ataca la bola alta (usa el aviso naranja y el latigazo);
  4. defiende (usa el bloqueo);
  5. saques a zonas.
- **Movimiento** (`notas-08-movimiento.md`, sin clips nuevos):
  - **Correr y frenar:**
    - el cuerpo se inclina al arrancar, al frenar (con la cadera más baja) y en los giros;
    - la CPU carga antes de salir;
    - en desplazamientos largos gira a correr antes;
    - la pala ya no se agita por encima de la cabeza al correr.
  - **Golpes:**
    - un golpe empezado ya casi no cambia a mitad;
    - el tronco no se congela al correr hacia la bola;
    - el drive se prepara a tiempo y con una postura menos abierta.
  - **Espera:** pasan el peso de un pie a otro, respiran, rebotan sobre las puntas, recolocan los pies y llevan la pala arriba; entre puntos la bajan.
- **Gráficos** (`notas-08-graficos.md`):
  - público hecho con el propio modelo del jugador (cinco poses, ropa y pelo variados, una sola llamada de dibujo);
  - gradas con asientos y pancartas, y pantalla cortavientos;
  - de fondo, pinar de El Tiemblo y la Sierra de Gredos (dos imágenes hechas con IA);
  - pista con desgaste y marcas;
  - imagen: curva de tono AgX con etalonaje de TV, MSAA en el nivel medio a 1,75× sin pasadas extra, sin grano y con un cielo más azul;
  - las torres de focos ya no proyectan sombra sobre la pista;
  - en el nivel bajo, una sombra alargada bajo cada jugador.

### Números
- **Escalera individual tras integrar todo** (`bot.ts 24 1`, % de partidos; Paco / Lola / Bruno / Nuria / Reina):

  | Humano | 0.7 | 0.8 |
  |---|---|---|
  | Novato | 100 / 71 / 21 / 0 / 0 | 100 / 75 / 29 / 8 / 0 |
  | Medio | 100 / 100 / 100 / 58 / 4 | 100 / 100 / 100 / 71 / 13 |
  | Bueno | 100 / 100 / 100 / 100 / 67 | 100 / 100 / 100 / 96 / 42 |

  El medio gana algo más a Nuria y Reina, y el bueno algo menos a Reina. Ningún partido se atasca.
- **Puntos de individual** (bot, ayuda media, 12 partidos por rival):
  - mediana de golpes por punto de 11–17 a 7–12 (p90 de 23–31 a 17–24);
  - las dejadas bajan del 29–46 % al 18–36 % de los golpes.
  - Partidos de 2,2 a 5,4 minutos de media.
- **Ataque:**
  - el medio ataca (latigazo o remate) el 10–13 % de sus golpes y el novato el 3–5 %;
  - las bolas avisadas que se atacan ganan el punto en los dos golpes siguientes el 63–68 % de las veces;
  - el bueno bloquea el 84 % de los ataques que devuelve.
- **Dobles** (`bot-doubles.ts 12 1`): sin cambios de comportamiento; el peloteo más largo, 46 golpes.
- **Fuzz:** 528 puntos con 60 ataques y 42 bloqueos, sin fallos.
- **Explicaciones:** todos los puntos tienen la suya (970 medidos antes de integrar y unos 570 después). Tras integrar, la comprobación automática encontró un solo aviso, que era un falso positivo del propio comprobador, ya corregido.
- **Retos** (`tools/review/drills.ts 24 1`): todos se acaban; el novato saca 1–2 estrellas y el bueno 3 en el 75–100 % de los intentos. Las estrellas de «Defiende» se recalibraron con el bloqueo (16 / 30 / 41 de 60).
- **Movimiento** (mismos partidos):
  - golpes que cambian a mitad: de 167 de 1.587 a 54 de 1.474;
  - fotogramas de espera congelados: del 23,5 % al 2,2 %;
  - coste por jugador y fotograma: de ~54 a ~64 µs en ordenador.
- **Gráficos:**
  - llamadas de dibujo: nivel medio de 61 a 56, alto de 75 a 70, bajo de 43 a 41;
  - triángulos: de 156.000 a 90.000 en el nivel medio;
  - página: de 923 a 1.010 KB, más 165 KB de imágenes de fondo.
  - Con render por software, 0.7 y 0.8 dibujan igual en el nivel bajo (2,1 frente a 2,05 fotogramas por segundo) y la 0.8 más rápido en el medio (1,4 frente a 1,8). En un móvil, el medio dibuja a 1,75× en vez de 1,5×: hay que medirlo.
- **Créditos de Magnific:** 90 (las dos imágenes de fondo). Quedan 1.522 en la cuenta, que comparten todos los juegos del estudio.

### Pendiente
- **Probar en un móvil real:**
  - el umbral del latigazo;
  - los fps del nivel medio a 1,75×;
  - lo que tarda en cargar el público (se calculan 50–150 ms);
  - si la línea del porqué se lee en 2,2 s;
  - si los consejos agobian.
- **El novato vuelve a perder muchos puntos por «No llegas» en individual** (13–36 % de los puntos), porque ahora la CPU juega al hueco. Sí gana más puntos que en la 0.7 (75 / 57 / 45 / 34 / 18 %). Palancas: el sentido de pista de Lola y Bruno, o recomendar la ayuda alta, que en individual le sirve mucho más.
- **Movimiento:**
  - quedan 54 cambios de golpe, que piden que la IA decida antes el punto de contacto;
  - el drive sigue siendo el clip plano de Meshy. Si hay créditos, es el clip que más se notaría rehacer (unos 540 créditos; el prompt está en las notas).
- **Gráficos:** los pinos son fotos con la luz desde la izquierda, la pantalla cortavientos es tela lisa y las gorras del público son el pelo recoloreado.
- **Rivales con cuerpo propio** (unos 5.000 créditos): con el saldo actual no se pueden hacer.

## 0.9 (10 oct): estética profesional y realista

Germán, tras ver la 0.8: «Lo de que cada punto explique no tiene mucho sentido» y «dale una estética más pro, no Pickleball El Pinar, hazlo realista». Preguntado dónde se juega, dejó la decisión abierta («hazlo realista como tú creas»): se eligió la pista central de un torneo profesional de noche, con el aspecto de una retransmisión de TV. Se hizo con tres agentes en paralelo. El detalle está en `docs/notas-09-*.md` (en el Proyecto, `pickleball/notas-09-*.md`).

### Qué cambia
- **Partidos sin la explicación de cada punto ni consejos entre puntos.** Vuelve el cartel corto, y la opción de Ajustes desaparece. El explicador sigue funcionando por dentro, porque el entrenamiento lo usa para puntuar cada bola.
- **Estadio** (`notas-09-estadio.md`):
  - gradas en cuenco en los cuatro lados, palcos con cristalera y gradas altas bajo cubierta;
  - 5.291 espectadores en penumbra, más iluminados cerca de la pista, con flashes de fotos;
  - anillo de 33 focos con halo y dos videomarcadores colgados;
  - árbitro en su silla, jueces de línea, cámaras de TV y fotógrafos;
  - pista azul de torneo con un entorno gris pizarra y el brillo de los focos, y red de competición;
  - vallas y cintas LED con la marca provisional y patrocinadores inventados;
  - entorno de luz horneado del propio estadio y etalonaje de tele nocturna;
  - fuera el pinar, Gredos y las dos imágenes de fondo, y el sonido de ambiente pasa a ser de estadio, sin pájaros.
- **Interfaz** (`notas-09-interfaz.md`):
  - tipografía Barlow Condensed y Barlow, paleta de negros y blanco con el amarillo de la bola como acento, iconos SVG y paneles sobrios;
  - marcador y rótulos de retransmisión;
  - la escalera es un cuadro de torneo: primera ronda, octavos, cuartos, semifinal y final;
  - los rivales llevan apellidos inventados, ranking y cabeza de serie (Paco Ortega, Lola Medina, Bruno Vidal [6], Nuria Castell [3], Reina Salgado [1], Marta Ruiz); el jugador entra con wild card;
  - en horizontal, a dos columnas;
  - la marca provisional está toda en `src/tour.ts`.
- **Jugadores, pala y bola** (`notas-09-jugadores.md`):
  - equipaciones técnicas pintadas en la GPU, con paneles, ribetes, canalé y una marca inventada; colores sobrios por jugador;
  - materiales distintos para piel, tela, pelo y zapatillas;
  - pala con forma real, borde, cara de carbono o fibra de vidrio y overgrip;
  - bola de exterior con 40 agujeros.
  - Se arregla una fuga de memoria de unos 11 MB por partido (22 MB en dobles).

### Números
- **Llamadas de dibujo** (mismo fotograma): medio de 56 a 40, alto de 70 a 54, bajo de 41 a 29, dobles en medio de 74 a 58.
- **Triángulos:** unos 23.000 más (el cuenco y el público).
- **Página:** de 1.010 a 1.059 KB. Los assets bajan 165 KB, al quitar las dos imágenes del fondo.
- **Render por software** (390×844, 20 s de partido): bajo de 2,2 a 2,45 fotogramas por segundo, medio de 1,55 a 1,6. No es más caro que la 0.8.
- **La simulación no cambia.** Se comprobó con la escalera (12 partidos por pareja), dobles y fuzz, sin partidos atascados.
- **Recorrido completo de la interfaz en la página real** (menús, ajustes, cuadro, partido individual y de dobles, pausa, final, entrenamiento): todo bien y la consola limpia.
- **Créditos de Magnific:** 0. Quedan 1.522.

### Pendiente
- **Medir en un móvil real** los fps, la carga (el horneado del público y del entorno) y si la noche se ve bien con el brillo del móvil o al sol.
- **Todos los jugadores usan el mismo cuerpo de hombre,** también Lola, Nuria, Reina y Marta. Con la estética realista es lo que más chirría. Los rivales con cuerpo propio cuestan unos 5.000 créditos y no caben con el saldo actual.
- **La mano no se cierra del todo sobre el mango** (animación).
- **El público** siempre está sentado en la misma postura.
- **El entrenamiento** se juega con la grada llena (¿mejor vacía?).
- **Retratos de los rivales** en vez de iniciales.

## 0.10 (11 oct): posturas, manos y cuerpos con código

Germán, tras jugar la 0.9: «el juego está divertido», pero «algunos movimientos, poses y formas de los jugadores siguen pareciendo extrañas y poco naturales». Se le explicó la causa de fondo: el cuerpo está hecho con IA, con un esqueleto de 24 huesos sin dedos; los 14 clips de Meshy son genéricos, de texto a movimiento, y buena parte de la postura la calcula el código. El salto de verdad pide cuerpos con dedos y movimiento capturado de personas reales (Mixamo, un paquete de tenis grabado o vídeo propio convertido en movimiento). Germán no puede grabar ahora ni tiene cuenta de Mixamo, así que eligió «mejorar con código todo lo posible» y dejar eso para la siguiente fase. También propuso generar vídeos con IA y convertirlos en movimiento: hay que probarlo con un solo golpe antes de gastar.

### Qué cambia
- **Poses clave hechas por código** (`src/render/keyposes.ts`, `notas-10-posturas.md`), horneadas en los clips al cargar, así que en juego no cuestan nada:
  - **Espera de pickleball:** rodillas dobladas (más en la cocina que en el fondo), cadera atrás, tronco adelantado, la pala delante del pecho con la cabeza arriba y la mano libre en el cuello de la pala.
  - **Entre puntos:** la pala floja y de canto.
  - **El que saca** sostiene la bola delante del cuerpo con la pala abajo.
  - **El brazo libre** ya no se va hacia fuera en ningún golpe.
  - **Golpes:** la derecha termina alta, sobre el hombro contrario; la volea es un empuje corto; la cara de la pala mira más a donde va la bola.
  - **Desplazándose,** la pala va delante.
- **Formas** (`src/render/body.ts`, `notas-10-formas.md`):
  - los dedos se cierran en la propia malla al cargar: la mano de la pala agarra el mango y la libre queda relajada;
  - cada jugador tiene su altura (1,74–1,87 m) y su complexión;
  - en el público, un 46 % son mujeres con media melena y hay más posturas; en los planos de TV, la grada sale desenfocada.
- **La variante de mujer para Lola, Nuria, Reina y Marta se probó y se descartó:** con el cuerpo de hombre seguían pareciendo hombres disfrazados. Hace falta un modelo propio. El código se queda, apagado.
- **Ropa mate.** Las equipaciones oscuras brillaban como látex. La rugosidad que se leía por texel de la textura auxiliar salía mucho más baja de la prevista, así que ahora la rugosidad (0,88) y el especular (0,18) son fijos, y los brillos horneados de la textura de la IA se comprimen.

### Números
- **Espera** (8 partidos, mismas semillas, 0.9 → 0.10):
  - pala plana: del 24,6 % al 5 % del tiempo (entre puntos, del 90,8 % al 4,8 %);
  - mano libre al cuello de la pala: de 35 a 9,5 cm;
  - rodillas: de 43° a 61° en la cocina y 53° en el fondo;
  - codo: de 6 cm detrás a 5 cm delante del pecho.
- **Golpes:** brazo libre hacia fuera del 24,3 % al 0 %; la derecha termina 23 cm por encima del pecho (antes, 11 cm por debajo).
- **Sin cambios:** el contacto pala–bola (p90 0,3 cm), los pies, la simulación (el bot da lo mismo) y el recorrido de la interfaz (consola limpia).
- **Coste:**
  - por jugador y fotograma baja algo (66–68 → 61–62 µs);
  - la carga sube: unos 150–270 ms las poses, 20 ms las manos y 30 ms el cuerpo de mujer del público, medidos aquí; en un móvil, de 2 a 3 veces más;
  - el atlas del público pasa de 11,2 a 17,8 MB (de 2,8 a 4,5 MB en calidad baja);
  - la página pasa de 1.059 a 1.097 KB.
- **Créditos de Magnific:** 0 en la 0.10. En la cuenta quedan 387 (11 oct): otra sesión gastó 1.135 rehaciendo la pala y la bola, según `estudio/estado.md`.

### Nombres de los rivales (11 oct)
Germán: «aún veo nombres españoles; lo ideal sería usar nombres parecidos a los de los profesionales del pickleball, como hacía Konami en el Pro Evolution Soccer cuando no tenía licencia».

| id | Antes | Ahora | Suena a |
|---|---|---|---|
| paco | Paco Ortega | Riley Numan | Riley Newman |
| lola | Lola Medina | Andrei Daesku | Andrei Daescu |
| bruno | Bruno Vidal [6] | Hayden Patrikin [6] | Hayden Patriquin |
| nuria | Nuria Castell [3] | Cristian Alzon [3] | Christian Alshon |
| reina | Reina Salgado [1] | Ben Jhons [1] | Ben Johns |
| marta (pareja) | Marta Ruiz | Gabe Tardeo | Gabe Tardio |

- Son todos jugadores: así cuadran con el único cuerpo, que es de hombre.
- Los ids, los estilos y la forma de jugar no cambian.
- Los nombres están en `src/tour.ts` (apellidos) y en `src/sim/brain.ts` (nombres de pila).
- **Riesgo legal:** un nombre que evoca claramente a un deportista real puede chocar con su derecho de imagen, sobre todo en EE. UU., donde juegan estos profesionales. Para la versión que se publique, lo tiene que decidir el cliente; pasar a nombres inventados es cambiar esos dos archivos.

### Pendiente
- **Siguiente fase:** cuerpos con dedos y movimiento capturado de personas reales (Mixamo, que pide cuenta de Adobe; un paquete de tenis grabado, si el vendedor confirma la licencia; o vídeo propio o generado con IA, convertido en movimiento).
- **Un modelo de mujer** para las jugadoras.
- **Medir en un móvil real** la carga y la memoria.
- **El pulgar de la mano libre** queda como venía.
- **Quedan 64 cambios de golpe a mitad.**

