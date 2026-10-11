# 0.8 · Por qué ganaste o perdiste el punto, y modo entrenamiento (10 oct)

Dos cosas nuevas para entender y practicar el juego: cada punto dice **por qué** se ganó o se perdió, con un dato del propio punto, y hay un menú de **Entrenamiento** con una máquina lanzapelotas y cinco retos. Nada de esto cambia las reglas, la física ni la IA de los partidos: el bot da exactamente los mismos resultados que en la 0.7.

## Qué ve el jugador

### El porqué de cada punto

El cartel del punto (bajo el marcador, arriba a la izquierda) tiene ahora una segunda línea, en la misma pastilla, con el motivo y un número. Ejemplos reales del bot:

- «Tu dejada pasó 1,4 m sobre la red y Reina atacó»
- «Apuntaste a 23 cm de la línea: 12 cm de largo»
- «Saliste tarde: la bola tardó 0,9 s y estabas a 2,3 m»
- «Muy lejos: la bola tardó 0,4 s y estabas a 1,5 m» (ni reaccionando a tiempo llegabas: no es culpa tuya)
- «Sin tiempo (0,3 s): 30 cm de largo»
- «Sin apuntar, la bola fue al centro y Lola atacó»
- «El ataque de Reina a 73 km/h: 0,3 s para reaccionar»
- «El drive de Bruno: estabas a 3,6 m y llegó en 0,6 s»
- «Tu saque se pasó 5 cm de largo» · «La dejada de Reina se quedó a 12 cm de pasar»
- En los que ganas: «Tu ataque al cuerpo: Lola no pudo bloquear», «Tu remate a 91 km/h: Lola no tuvo tiempo (0,3 s)», «Tu drive: Lola no llegó por 4 cm», «La dejada de Bruno pasó 1,2 m sobre la red y atacaste», «Tu ataque dejó a Bruno sin tiempo (0,3 s)», «Passing cruzado: Bruno estaba en el centro».
- En dobles dice quién: «La dejada de Marta pasó 1,1 m sobre la red y Bruno atacó», «El ataque de Marta a 73 km/h: Lola no tuvo tiempo (0,4 s)», «El drive de Reina pasó a 97 cm de Marta en 0,7 s».

**Tamaño:** de mediana 47 caracteres, como mucho 58 (los de Marta en dobles). Letra de 12,5 px: en un móvil de 390 px es una línea; en 360 px, una o dos. No tapa a los jugadores (capturas `05-porque-*.png` y `09-porque-360.png`). Sale también con los indicadores «Mínimos».

**La pausa tras el punto** dura al menos 2,2 s cuando hay explicación (antes 1,6 s), para que se pueda leer. Un toque la sigue saltando desde 0,6 s.

**Consejos cuando un error se repite.** Si el mismo patrón sale en 3 de los últimos 8 puntos (2 para saques fallados, voleas en la cocina, apuntar fuera y soltar a destiempo), sale una pista en la línea de abajo, con una bombilla y borde dorado, durante 4 s. Como mucho una cada 5 puntos, y la misma no vuelve antes de 14 puntos. Solo para tus errores, nunca para los de Marta. Ejemplos: «Suelta con el aro dorado: tus dejadas saldrán más bajas», «Apunta con el pulgar derecho: sin apuntar, la bola va al centro», «Mueve el pulgar izquierdo en cuanto golpee el rival: el círculo marca dónde ir», «Apuntar a la línea es arriesgado: deja medio metro», «Se te van largas: apunta un metro más dentro». Se quitan en **Ajustes → Consejos entre puntos**. Medido: 0,3 consejos por partido.

### Entrenamiento

Nueva entrada **Entrenamiento** en el menú, entre «Rivales» y «Cómo se juega». Lleva a la lista de los cinco retos, cada uno con su récord y sus estrellas. Al tocar uno salen sus instrucciones (dos frases, en español o inglés) y «Empezar». En pista:

- **La máquina** al otro lado: una caja naranja con ruedas, una tolva llena de bolas y un cañón oscuro con un aro lima en la boca. Se ha hecho un tercio más grande que una real para que se lea desde el fondo. Al lanzar, el cañón retrocede, sale un poco de humo y suena un «pock».
- **Las dianas** (aros blancos con el centro lima) o la cocina rival iluminada, según el reto. La diana acertada se pone dorada.
- **Un marcador pequeño del reto** en lugar del de televisión: nombre, «Bola 3/12», puntos y estrellas conseguidas. El botón de pausa es el de siempre (pausa → «Abandonar» vuelve a la lista).
- **Lo que vale cada bola**, en el mismo cartel del punto: «+4 · ¡Diana!» y debajo «En la cocina · 18 cm sobre la red». Un «+4» sube donde botó la bola. Si no puntúa, dice por qué con la misma explicación de los partidos («Saliste tarde: …», «Tu dejada se quedó a 8 cm de pasar»).
- Al empezar, la segunda instrucción sale abajo como consejo.
- **Resultado:** estrellas grandes, los puntos «de 60», «¡Nuevo récord!», una línea de números (p. ej. «Altas atacadas 6/6 · bajas aguantadas 6/6») y cuántos puntos faltan para la siguiente estrella. Botones «Repetir», «Siguiente reto» y «Entrenamiento».
- **Récords** en `localStorage` (clave `pickleball-train-v1`) con try/catch: si el iframe no deja guardar, viven durante la sesión.

El control es el del partido: stick, apuntar y soltar, golpe asistido o manual y la ayuda que tengas en Ajustes. Sin presentación de televisión, árbitro, repeticiones ni pistas del tutorial. El aro de enseñar sale como en el primer partido.

| Reto | Bolas | Dónde estás · la máquina | Cómo puntúa (por bola) | Máx. | ★ / ★★ / ★★★ |
|---|---|---|---|---|---|
| 1 · Dejadas a la diana | 12 | En la línea de cocina · en la suya | En su cocina 1, diana +2, a ≤ 22 cm sobre la red +2 (≤ 32 cm +1) | 60 | 14 / 28 / 40 |
| 2 · Tercer golpe | 10 | Al fondo · al fondo (resto largo; tiene que botar) | En su cocina 3, ≤ 32 cm sobre la red +1, subir a la red detrás +1; a menos de 1,2 m de la cocina y baja, 1 | 50 | 10 / 20 / 32 |
| 3 · Ataca la bola alta | 12 (6 altas, 6 bajas, barajadas) | En la línea · en la suya | Alta atacada y dentro 3 (+1 si es perfecta o a más de 54 km/h); baja aguantada en la cocina 2 (+1 si pasa a ≤ 22 cm). Alta jugada suave o baja atacada: 0 | 42 | 12 / 22 / 33 |
| 4 · Defiende | 12 (al cuerpo, a los pies y abierta, por turnos) | En la línea · en la suya | Devuelta 1, a ≤ 32 cm sobre la red +1, a su cocina +1 | 36 | 12 / 21 / 24 |
| 5 · Saques a zonas | 10 (cambiando de lado) | Saque de verdad · aparcada fuera | Dentro 1, profundo +1, diana +2, saque perfecto +1 | 50 | 14 / 26 / 38 |

«Alta» es una bola que te llega por encima de 1,06 m (la misma línea que usa el juego para que el golpe sea un ataque).

## Cómo está hecho

- **`src/explain.ts`** (sin DOM): lee los eventos del partido y, una vez por fotograma, dónde están los jugadores y el círculo sugerido. Al acabar el punto elige la explicación más útil:
  1. Faltas y bolas fuera o a la red: la causa más clara del golpe (de marco, soltaste pronto o tarde, apuntaste fuera o a menos de 30 cm de la línea, atacaste una bola baja, sin tiempo, bola muy rápida, brazo estirado, sin apuntar, presión de un peloteo largo) y cuánto (centímetros, desde el bote o desde la red). Si falla el rival, si tu golpe le obligó.
  2. Ganadores en contra: si tu golpe anterior se levantó y el rival atacó, eso primero; si fuiste a por la bola, por qué no llegaste (simula tu carrera desde el golpe rival, con tus pies y tu alcance de ese momento, saliendo a tu tiempo o a 0,35 s); si no, cómo era el golpe rival (globo por encima, dejada con tú al fondo, rápida y cerca, passing, o a qué distancia pasó).
  3. Ganadores tuyos: si su bola se levantó y atacaste, al cuerpo, rápida, globo, dejada con el rival al fondo, passing, o por cuánto no llegó el rival en su contacto.
- **Eventos:** el golpe añade `clear` (altura sobre la cinta), `tx`/`tz` (dónde se apuntó), `pop`, `stretch`, `avail` (tiempo desde el golpe rival) y `vin` (velocidad de la bola que llegaba). La falta de cocina añade `feet`. No cambian la semántica de nada ni los dados: el bot da lo mismo que en la 0.7 (comprobado con `bot.ts`).
- **`Match.linger(s)`:** alarga la pausa tras el punto (solo la llama la pantalla del humano).
- **`Match.feed(pid, desde, golpe, n)`:** pone una bola en juego como golpe número n de un peloteo, sin reglas de saque. **`Match.idle(s)`:** pausa sin bola. Los usa el entrenamiento.
- **`src/sim/drill.ts`** (sin DOM): cada reto es un `Match` normal con la máquina como jugador del fondo. La máquina tiene 99 s de reacción, así que nunca planea jugar una bola, y se queda clavada en su sitio. Lanza con `Match.feed` (golpe 4, todo vale; en el tercer golpe, golpe 2: la respuesta tiene que botar). Puntúa cada bola con sus eventos.
- **`src/training.ts`:** las pantallas, el marcador del reto, el cartel de cada bola y los récords. **`src/render/drill-props.ts`:** la máquina, las dianas y la zona, añadidas a la escena de la vista sin tocar `view.ts`. El cuerpo del «jugador máquina» se oculta desde `training.ts` (lee `view.chars` con un cast; ver «Riesgos»).

## Números

**Explicaciones** (`tools/review/explain.ts`, bot de pulgares con ayuda media; 4 partidos por rival contra Lola, Bruno y Reina, y 4 de dobles contra Lola y Bruno, y Nuria y Reina; 970 puntos):

| Nivel | Puntos | Las más frecuentes (% de los puntos) | Contradicciones |
|---|---|---|---|
| Novato | 194 | una causa concreta 26 (sin tiempo, apuntaste a la línea, de marco, apuntaste fuera…) · sin apuntar y te atacaron 22 · tu ataque rápido 7 · no llegó por X 7 · atacaste su bola alta 5 · muy lejos 5 · saliste tarde 5 | 0 |
| Medio | 181 | tu ataque rápido 17 · atacaste su bola alta 17 · sin apuntar y te atacaron 14 · una causa 10 · le dejaste sin tiempo 9 | 0 |
| Bueno | 174 | tu ataque rápido 28 · atacaste su bola alta 15 · le dejaste sin tiempo 10 · una causa 10 | 0 |
| Dobles (los tres) | 421 | una causa 25–33 · tu bola o la de Marta pasó alta y atacaron 12–15 · le dejasteis sin tiempo 11–16 · ataque rápido 11–12 | 0 |

- **Ningún punto sin explicación.**
- **Comprobación automática en todos los puntos:** que no diga «ganaste» en uno perdido ni al revés; que nombre a quien falla; que el «fuera por X» coincida con el bote, al centímetro; que «saliste tarde» tenga la salida después de 0,35 s, que reaccionando a 0,35 s se llegara y que el pulgar del bot de verdad reaccionara tarde (siempre ≥ 0,3 s); que «muy lejos» no se alcanzara ni así; que «pasó alta» supere los 30 cm; que «en el centro», «en la red», «al fondo» y «rápida» sean ciertos. Resultado: **0 contradicciones**.
- **Revisión a mano de 45 puntos trazados** golpe a golpe (individual y dobles), leyendo cada línea contra lo que pasó: ninguna contradice el punto. Salieron tres mejoras, ya hechas: la salida se medía con la inercia que traía el jugador; «0,6 s para reaccionar» con la bola a 3,4 m (ahora dice la distancia); y bolas largas apuntadas casi sobre la línea que culpaban a otra cosa (ahora «Apuntaste a 23 cm de la línea»).

**Retos** (`tools/review/drills.ts 24`, ayuda media; el bot lee las instrucciones: apunta a las dianas, ataca las altas, aguanta las bajas y vuelve a su sitio; cuánto apunta, su reacción y su suelta son los de su nivel):

| Reto | Novato: puntos · ★ | Medio | Bueno | Tiempo |
|---|---|---|---|---|
| Dejadas | 21 · 0★ 4 %, 1★ 92 %, 2★ 4 % | 32 · 2★ 79 % | 43 · 3★ 79 % | 40 s |
| Tercer golpe | 16 · 1★ 67 %, 2★ 29 % | 28 · 2★ 67 %, 3★ 29 % | 37 · 3★ 100 % | 47 s |
| Ataque | 20 · 0★ 8 %, 1★ 42 %, 2★ 50 % | 32 · 3★ 50 % | 36 · 3★ 83 % | 36 s |
| Defensa | 20 · 1★ 54 %, 2★ 46 % | 21 · 1★ 50 %, 3★ 21 % | 25 · 3★ 71 % | 38 s |
| Saques | 24 · 1★ 67 %, 2★ 33 % | 36 · 2★ 71 % | 46 · 3★ 100 % | 53 s |

- **Todos los intentos acaban** (360 intentos, 100 %). El novato nunca saca 3 estrellas y casi nunca 0; el bueno saca 3 en el 71–100 %.
- **`tools/review/drillfuzz.ts`** (pulgares al azar, los cinco retos, golpe asistido y manual, ayuda 0, 1 y 2): 60 intentos y 672 bolas sin fallos, sin atascos, sin NaN y con la máquina siempre en su sitio.
- **`tools/review/fuzz.ts`** (partidos): 24 partidos y 310 puntos sin fallos.
- **Página real** (`tools/train.py`, Chromium con swiftshader, 390 × 760, y una pasada a 360 × 640): menú, lista, instrucciones, los cinco retos jugados hasta el final, pausa y abandonar, un partido individual y uno de dobles con su explicación. **Sin errores ni avisos en la consola.** Nota: en este Chromium sin pantalla `requestAnimationFrame` no se dispara (tampoco en un partido normal), así que, como el resto de herramientas, avanza el bucle del juego a mano (`__pb.advance`), que es la misma función `tick()`.

**Capturas** en `/tmp/pb-08-entreno/` (vertical):
- `01-menu.png`, `02-lista.png`, `03-instrucciones.png`, `04-lista-records.png`;
- cada reto en juego: `1a-dejadas-juego.png`, `2a-tercer-golpe-juego.png`, `3a-ataque-juego.png`, `4a-defensa-juego.png`, `5a-saques-juego.png`;
- lo que puntúa una bola: `1b-…`, `2b-…`, `3b-…`, `4b-…`, `5b-saques-bola.png`;
- resultados: `1c-dejadas-resultado.png`, `3c-ataque-resultado.png`, `5c-saques-resultado.png`;
- el porqué del punto: `05-porque-0…2.png` y `05d-porque-dobles.png`;
- a 360 × 640: `06-menu-360.png`, `07-lista-360.png`, `08-defensa-360.png`, `09-porque-360.png`.

## Herramientas

- `npx tsx tools/review/explain.ts [partidos = 4] [trazas = 40]` · `LEVELS`, `RIVALS`, `PAIRS`, `LANG_UI`, `EXAMPLES=1`: distribución de explicaciones, comprobaciones y puntos trazados golpe a golpe.
- `npx tsx tools/review/drills.ts [intentos = 24] [ayuda = 1]` · `DRILLS`, `LEVELS`, `SHOW=1`: los retos jugados por el bot de pulgares, con estrellas y detalle (y la explicación de las bolas que no puntúan).
- `npx tsx tools/review/drillfuzz.ts [intentos = 12]`: pulgares al azar en los retos.
- `python3 tools/train.py [dist] [carpeta] [ancho] [alto] [puerto = 8832]`: capturas del entrenamiento y del porqué, y errores de consola (sale con código 1 si hay alguno).
- `tools/review/globals.ts`: lo mínimo de navegador para cargar `i18n.ts` en Node.
- Desde la página: `__pb.train(i, semilla)` empieza el reto i (0 dejadas … 4 saques); `__pb.training` da acceso al reto en curso.

## Para la fusión con el ataque del humano (agente A)

- **Reto 3 (ataque):** hoy «alta» es el contacto por encima de 1,06 m y «atacar» es que el golpe salga como ataque, remate o drive. Hay un `TODO(merge with A's attack)` en `src/sim/drill.ts` (`score1`, caso `attack`): cuando exista la «bola atacable» y el gesto de acelerar, tomar `high` de esa marca (lo que vio el jugador) y contar el gesto como ataque. Recalibrar sus estrellas con `tools/review/drills.ts`.
- **Reto 4 (defensa):** hoy el golpe asistido bloquea casi todas las bolas solo (todos los niveles devuelven el 100 %); lo que separa a un jugador es lo bajo y suave que bloquea. Hay un `TODO(merge with A's block)` en el mismo sitio: contar el bloqueo de A como respuesta suave. Es el reto peor calibrado (el bueno saca 3★ en el 71 %, el medio en el 21 %) y habrá que recalibrarlo.
- **Explicaciones:** si A añade un tipo de golpe nuevo (por ejemplo un bloqueo), hay que añadirlo a `SOFT` o `ATTACK` en `src/explain.ts`, a los nombres `xn.*` y artículos `xa.*` de `i18n.ts`, y a las listas de golpes suaves y de ataque de `drill.ts`. «Sin apuntar, la bola fue al centro» ya comprueba que la bola automática fue al centro (|x| < 1 m), así que no mentirá si A cambia `autoShot`.
- Los bots de los retos eligen el golpe con el mapeo de arrastre de siempre (`HumanController.aim`); si A cambia ese mapeo o añade el gesto, hay que enseñárselo a `tools/review/drills.ts`.

## Riesgos de conflicto al fusionar

- **`src/main.ts`:** campo `coach` en `Save` (también en la línea del valor por defecto), botón del menú, fila de Ajustes, `setHint` con un tercer parámetro, `showBanner` con un cuarto, `pointTip`, `beginDrill`/`leaveDrill`, guardas `drill` en `onEvent` (casos `serveSetup`, `hit`, `bounce`, `net` y `point`), dos líneas en `tick` y la condición del toque en `input.onPress`, salir de un reto en `pause`, y `__pb.train`. Si A toca el caso `hit` de `onEvent` o `overlays`, el conflicto es de pocas líneas.
- **`src/sim/types.ts`:** la línea del evento `hit` (campos nuevos al final) y la del evento `point`.
- **`src/sim/match.ts`:** `launch` recibe `stretch` y monta los campos nuevos al final; métodos nuevos `linger`, `feed` e `idle`; `endPoint` añade `feet`. Nada más.
- **`src/i18n.ts` y `src/style.css`:** bloques añadidos al final de cada idioma y al final de la hoja (más dos reglas junto a `#banner` y `#hint`). Si otros añaden al final, el conflicto es solo de posición.
- **`view.ts`:** no se toca. `training.ts` oculta el cuerpo del jugador máquina leyendo el campo privado `chars` con un cast. Si E lo renombra, la máquina tendría encima a un jugador. Mejor añadir en la fusión un `view.hidePlayer(id)` público.

## Pendiente

- **Probarlo en un móvil de verdad:** si la línea del porqué se lee en los 2,2 s, si la pausa más larga molesta (un toque la salta) y si los consejos están bien medidos (0,3 por partido) o agobian.
- **Recalibrar los retos 3 y 4** con el ataque y el bloqueo de A (ver arriba). Las estrellas de los otros tres no deberían moverse.
- **La salida tarde** se calcula con una carrera recta desde el golpe rival, sin el paso de espera, así que puede ser algo optimista en el límite entre «tarde» y «muy lejos». No se ha visto ninguna contradicción en las trazas.
- **En dobles** la línea puede ser de 58 caracteres (dos líneas en 360 px). Si molesta, acortar los textos de Marta.
- **La máquina** está hecha por código; si el cliente quiere el acabado premium, es una pieza más para generar.
- **Explicaciones en inglés:** revisadas en la tabla de textos, pero las trazas se han leído en español.
- Más retos posibles: volea de transición, globo y remate, resto profundo, y un «reto del día».
