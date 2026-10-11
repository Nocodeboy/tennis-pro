# 0.9 · Interfaz con aspecto profesional (notas de G2)

Germán, tras ver la 0.8: «Dale una estética más pro, no Pickleball El Pinar, hazlo realista». El escenario pasa a ser la pista central de un torneo profesional de noche (eso es de G1). Esta parte es la interfaz: menús, HUD, grafismo de televisión y textos. Antes era de juego arcade (Bungee y Baloo, lima neón, coral, pastillas redondeadas, emojis); ahora quiere parecer un juego de deporte profesional y una retransmisión de televisión.

No cambia nada del juego: ni reglas, ni física, ni IA, ni lo que significa cada color de los indicadores (lima, dorado, rojo, gris, cian, violeta, naranja), ni el tamaño de los aros, el joystick o la etiqueta del golpe.

## Marca provisional (la pone el cliente)

- **Todo es provisional** hasta que el cliente diga nombre y marca. Se ha quitado todo lo del Pinar de la interfaz y de los textos: «Club del Pinar», «Pinar Open», la escalera del club, «Jugador local · Club del Pinar».
- **Título en pantalla:** «PICKLEBALL» con el subtítulo «PRO TOUR». Debajo sigue la versión (`title.sub`, que pone el coordinador).
- **Torneo:** un circuito profesional neutro e inventado: «PRO TOUR FINALS», en la «Center Court». Sin logos ni nombres de ligas ni marcas reales.
- **Todo sale de un sitio:** `src/tour.ts` (constantes `TOUR`, `EVENT`, `COURT`, y los apellidos, rankings y cabezas de serie). Cambiar la marca es cambiar ese archivo y el texto `BOARD_FOOTER` (que ya lee `EVENT`).
- El videomarcador 3D (`boardFooter` en `src/render/view.ts`) dice «PRO TOUR FINALS» en vez de «PINAR OPEN 2026».
- La pestaña del navegador se llama «Pickleball Pro Tour».

## La escalera pasa a ser un torneo

Los rivales conservan su nombre de pila, su id y su forma de jugar. Solo ganan un apellido inventado, un ranking y, los mejores, una cabeza de serie, para que parezcan profesionales. Tú entras con una **wild card** (invitación).

| Ronda (individual, cuadro de 32) | Rival | Ranking | Cabeza de serie | Lema |
|---|---|---|---|---|
| Primera ronda | Paco Ortega | 58 | — | Juega desde el fondo. Constante, nunca tiene prisa. |
| Octavos de final | Lola Medina | 23 | — | Especialista en la dejada. Paciencia infinita. |
| Cuartos de final | Bruno Vidal | 9 | 6 | Pegador. Drives y ataques muy rápidos. |
| Semifinal | Nuria Castell | 4 | 3 | Vive en la línea de cocina. Lo volea todo. |
| Final | Reina Salgado | 1 | 1 | Número 1 del circuito y campeona defensora. |

| Ronda (dobles, cuadro de 16) | Pareja | Cabeza de serie |
|---|---|---|
| Octavos de final | Ortega / Medina | — |
| Cuartos de final | Medina / Vidal | 4 |
| Semifinal | Vidal / Castell | 2 |
| Final | Castell / Salgado | 1 |

Tu pareja es **Marta Ruiz**. En el marcador las parejas salen por apellidos («TÚ / RUIZ» contra «MEDINA / VIDAL»), como en la tele; el árbitro también canta el apellido («Saca Vidal»).

## Qué ve el jugador

### Sistema
- **Tipografía** (Google Fonts, lo único externo que se carga):
  - **Barlow Condensed** (600, 700, 800 y cursiva 700/800) para titulares, nombres, números y todo el grafismo de televisión. La cursiva gruesa solo en los titulares grandes (PICKLEBALL, VICTORIA, PAUSA, la ronda).
  - **Barlow** (500, 600, 700) para el texto que se lee.
  - Se dejan de cargar Bungee y Baloo 2.
- **Paleta sobria:** negros azulados profundos (#06080c a #1a222d), blanco (#f2f4f7) y **un solo acento, el amarillo de la bola** (#d9f23f), que se usa solo para la acción principal (Jugar, Empezar, Seguir), lo tuyo (tu saque, «Siguiente» en el cuadro) y detalles. El dorado (#f2c443) queda para estrellas, consejos y la bola de partido; el rojo (#f0524a), para el punto perdido.
- **Paneles** sólidos casi opacos, esquinas pequeñas (6 px; 3–4 px en el grafismo de TV), líneas finas de separación y cabecera fija con flecha de volver, el torneo encima y el título.
- **Iconos SVG sencillos** (`src/icons.ts`): flecha, check, candado, pausa, play, cuadro, diana, ayuda, ajustes, info, toque, repetición, trofeo, jugador y estrella. Fuera los emojis (👆, 💡) y los glifos ↺ y ★.
- **Dificultad** como cinco barras que crecen (tipo cobertura), en vez de estrellas.
- **Transiciones cortas:** las pantallas entran con un fundido de 0,2 s y un leve desplazamiento; los botones responden en 0,12 s. Con «reducir movimiento» solo hay fundidos.

### Pantallas
- **Menú principal:** el logotipo arriba, la pista del partido de exhibición libre en medio y el menú abajo, al alcance del pulgar: el cambio Individual / Dobles, un botón grande «JUGAR» que dice qué partido toca («Cuartos de final · Bruno Vidal») y una lista con icono y flecha: Cuadro del torneo, Entrenamiento, Cómo se juega, Ajustes. En horizontal, logotipo a la izquierda y menú a la derecha.
- **Cuadro del torneo** (antes «Rivales» / «Parejas»): una fila por ronda con la ronda, la cabeza de serie, el nombre, el lema, el nivel y el estado (Ganado con un check, Siguiente en amarillo o un candado con «Gana a … para avanzar»).
- **Ficha del partido** (antes la pantalla «VS»): torneo y pista, la ronda en grande, los dos lados (tú con wild card; el rival con cabeza de serie y ranking), el lema, el nivel y dos botones: «Empezar partido» y «Volver» (antes no se podía volver). Tocar en cualquier otro sitio también empieza, como antes.
- **Ajustes** agrupados: Partido, Control, Pantalla, Sonido y vibración, General. Al cambiar algo ya no vuelve arriba ni parpadea.
- **Cómo se juega:** el esquema de la pista con la paleta nueva y los siete apartados numerados, cada uno con su título.
- **Entrenamiento:** la lista con número, nombre, descripción, estrellas y récord; la ficha de cada reto con los dos pasos numerados; el resultado con las estrellas, los puntos y los datos.
- **Pausa:** la ronda, el marcador del momento («TÚ 2 – 0 VIDAL»; en un reto, su nombre y sus puntos), Seguir, Abandonar y el consejo con su icono.
- **Final del partido:** la ronda, VICTORIA o DERROTA, el marcador final como en la tele (la fila ganadora en blanco con un check), las estadísticas en tabla y los botones («Siguiente ronda · Semifinal», Revancha, Menú principal). Si ganas el torneo: «Ganas el Pro Tour Finals» con un trofeo. En horizontal va en dos columnas.

### HUD en partido (sigue siendo mínimo)
- **Marcador** de retransmisión: dos filas con el color del equipo, el apellido, la bola de saque (punto amarillo) y el tanteo en una celda. En dobles, quien saca va en amarillo. Al puntuar, el número gira y un brillo recorre la fila, como antes. Mide casi lo mismo: 128 × 50 px con la sombra en un móvil de 390 px (antes 126 × 47).
- **Llamada del árbitro:** una tira bajo el marcador («0 | 0 SACAS TÚ»); en bola de partido, un bloque dorado «BOLA DE PARTIDO» delante.
- **Cartel del punto:** una etiqueta con barra de color a la izquierda (amarilla si lo ganas, roja si lo pierdes) y el texto en mayúsculas condensadas, sin signos de exclamación.
- **Ayudas del tutorial:** la misma línea abajo (arriba en horizontal), con un icono de toque que late en vez de la mano 👆; los consejos, con un icono de información dorado en vez de la bombilla 💡.
- **Palabras al golpear:** PERFECTO en cursiva dorada, Pronto / Tarde en mayúsculas.
- Pausa, «Toca para seguir», el aviso de cinta y la etiqueta del golpe con la misma tipografía y esquinas pequeñas.

### Grafismo de televisión
- **Cartela de presentación:** «PRO TOUR FINALS» en una placa oscura con filo amarillo y debajo una tira blanca con «CUARTOS DE FINAL · CENTER COURT». Se abre desde el centro.
- **Rótulos de jugador** (tercio inferior): un bloque con el color del equipo y su cabeza de serie (o «WC» para ti), el nombre completo en grande y debajo «Cabeza de serie 6 · Ranking 9» o «Wild card del torneo». Entran con una cortinilla de izquierda a derecha.
- **Rótulo de victoria:** «GANA EL PARTIDO» y el nombre con el resultado.
- **Repetición:** etiqueta «REPETICIÓN» con un bloque amarillo y el icono de repetir; la cortinilla es ahora una banda oscura con filo amarillo y blanco y la marca «● PRO TOUR» en el centro (antes, una bola de dibujo animado girando).

### Textos
- Tono de juego profesional en es y en: sin exclamaciones ni infantilismos («¡Ganador!» → «Ganador», «¡Victoria!» → «Victoria», «¡ATÁCALA!» → «ATACA», «Calentando a los jugadores…» → «Preparando la pista central…»).
- Lemas de los rivales y las parejas reescritos («Juega los domingos. Nunca tiene prisa» → «Juega desde el fondo. Constante, nunca tiene prisa»).
- Siguiente rival → Siguiente ronda; Superado → Ganado; Menú → Menú principal; «¡Has ganado a todo el club!» → «Ganas el Pro Tour Finals».

## Cómo se ha comprobado

- `npx tsc --noEmit -p .` y `node build.mjs` sin errores.
- **Recorrido funcional** automático (Playwright, 390 × 844): menú, cada opción de Ajustes (y que se guarda), idioma, cómo se juega, cuadro (ronda ganada abre su ficha, una bloqueada no hace nada), ficha y volver, partido individual (marcador, pausa, seguir, abandonar), final ganado (guarda el progreso y «Siguiente ronda» lleva a la ficha del siguiente), dobles (cuadro de 4, marcador con los cuatro apellidos, abandonar), entrenamiento (lista, ficha, volver, reto, pausa, abandonar, resultado, volver). **Todo bien y la consola limpia** (sin errores ni avisos).
- Las herramientas de siempre siguen encontrando lo que buscan (`.menu-col`, `[data-a=…]`, `button.drill-row`, `.screen`, `#banner .why`, `.tv-strap .nm` con «TÚ», `#pauseBtn`, `.tvbug`, `.tv-call`…).
- **En horizontal (844 × 390)** la 0.8 cortaba el menú principal (el logotipo y la mitad de los botones se salían de la pantalla) y el final del partido; ahora todo cabe en dos columnas.

### El HUD sigue igual de ligero
Medido con `tools/hud.py` (390 × 760, individual, indicadores mínimos; la misma partida antes y después). «Pantalla» es el porcentaje de píxeles que cambian los indicadores.

| Momento | Pantalla antes → después | Sobre los jugadores | Sobre la bola |
|---|---|---|---|
| Saque | 6,84 → 7,13 % | 0 → 0 % | 0 → 0 px |
| Apuntar el saque | 9,96 → 10,25 % | 10,55 → 10,55 % | igual |
| La bola viene | 6,09 → 6,22 % | 2,51 → 2,53 % | 0 → 0 px |
| El golpe | 2,38 → 2,35 % | 0 → 0 % | 0 → 0 px |
| El punto | 2,68 → 2,67 % | 0 → 0 % | 0 → 0 px |
| Siguiente saque | 3,03 → 3,22 % | 0 → 0 % | 0 → 0 px |

Por piezas: marcador de 126 × 47 a 128 × 50 px, pausa igual (44 × 44, más discreta), llamada del árbitro de 122 × 33 a 118 × 36, cartel del punto de 88 × 33 a 66 × 38, ayuda de 344 × 34 a 340 × 36. Lo que tapa a los jugadores y a la bola son los aros y marcas 3D, que no cambian.

### Capturas (`/tmp/pb-09-interfaz/`)
- `antes/<tamaño>/` y `despues/<tamaño>/` con 25 momentos cada una en 390 × 844, 360 × 640 y 844 × 390: menú, menú de dobles, cuadro individual, cuadro de dobles, ajustes, cómo se juega, entrenamiento, ficha de un reto, ficha del partido (individual y dobles), cartela de TV, rótulo del rival, rótulo tuyo, saque con la llamada del árbitro, apuntar el saque, peloteo con indicadores completos, cartel del punto, repetición, pausa, victoria, final, dobles (saque y punto), reto en juego (marcador y bola puntuada) y resultado del reto.
- `despues-en/390x844/`: las principales en inglés.
- `montaje.png`: el comparativo con las seis más representativas (menú, cuadro, ficha del partido, HUD en el saque, rótulo de TV y final), en vertical. `montaje-horizontal.png`: menú, ficha, cartela y final en horizontal.
- `hud-antes/` y `hud-despues/`: las capturas y `metrics.json` de `tools/hud.py`.
- Se sacan con un script propio (`caps.py`, en el scratchpad de la sesión: reloj del partido fijo, azar fijo, nivel bajo, render por software).

## Archivos

- Nuevos: `src/tour.ts` (marca y torneo), `src/icons.ts` (iconos SVG, estrellas y barras de nivel).
- `src/main.ts`: solo el marcado de las pantallas (menú, cuadro, ficha, ajustes, cómo se juega, pausa, final), la línea de ayuda, los datos que se pasan a la tele y los apellidos en la llamada del árbitro. La lógica del juego no se toca.
- `src/broadcast.ts`: marcador, cartela, rótulos (nueva forma de `TeamInfo`: `full`, `badge`, `info` en vez de `stars` y `tag`), repetición y cortinilla.
- `src/training.ts`: marcado de la lista, la ficha, el marcador del reto y el resultado.
- `src/style.css`: reescrito entero.
- `src/i18n.ts`: textos es y en.
- `build.mjs`: las fuentes, el título de la página, la descripción y el color del tema.
- `src/render/view.ts`: solo el texto por defecto de `boardFooter`.

## Riesgos al fusionar

- **Fuentes en las texturas 3D (G1).** `src/render/venue.ts` y `src/render/textures.ts` dibujan las pancartas y el videomarcador con «Bungee» y «Baloo 2», que ya no se cargan: hasta que G1 los cambie, salen con Arial Black / Arial. Se le avisó (a G1 y a G3) de que use «Barlow Condensed» y «Barlow». Si G1 también toca la línea de fuentes de `build.mjs`, hay que quedarse con una sola carga que incluya lo que usen los dos.
- `src/render/view.ts`: solo cambia la línea de `boardFooter`; si G1 la cambia también, quedarse con «PRO TOUR FINALS» (o leer `EVENT` de `src/tour.ts`).
- `src/kits.ts` (G3): la interfaz usa `css` de cada equipación como color de equipo (barras del marcador, de los rótulos y de las fichas). Si G3 cambia esos colores, la interfaz los recoge sola.
- `build.mjs`: el coordinador cambia `VERSION`; mis cambios son otras líneas.

## Pendientes

- Que el cliente decida nombre, marca y logotipo; hoy todo es provisional y está en `src/tour.ts`.
- Retratos de los rivales en vez de iniciales (si se hacen, van en `avatar()` de `main.ts`).
- Probar en un móvil real la lectura del marcador y las tiras al sol, y el coste de las transiciones con recorte (`clip-path`) en móviles flojos.
- Las claves que ya no se usan (`menu.next`, `vs.tap`, `tv.round`) siguen en `i18n.ts` por si hiciera falta volver; se pueden borrar.
