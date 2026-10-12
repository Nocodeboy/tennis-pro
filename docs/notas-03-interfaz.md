# 0.3 · Interfaz: fichas de jugador, golpes nuevos y avisos

*12 oct 2026.* La parte de interfaz y flujo de la 0.3: fichas con atributos 0–99 para los cinco rivales, Martín y tú; los textos de los controles nuevos (fuerza del gesto, remates por 3 y por 4, bajada de pared); carteles, explicaciones, público y sonido de esos golpes. La simulación (qué hace cada atributo, la bajada, el por 3 y el por 4) está en `notas-03-simulacion.md`.

## Fichas de jugador

Como en un juego de deportes: la **media** grande, el nombre, una línea de estilo y los **siete atributos** con su número y su barra (`src/sim/attributes.ts`): potencia, control, velocidad, reflejos, remate, pared y toque. La franja de arriba lleva el color de la equipación.

- **Colores por bandas**, el mismo para el número y la barra:
  - 85 o más: lima (el acento del Pro Tour);
  - de 75 a 84: verde;
  - de 65 a 74: oro;
  - menos de 65: naranja.
- **Dónde salen:**
  - **Presentación del partido** (`versusPair`): las dos parejas con su media y las fichas compactas de los cuatro jugadores. En vertical va cada pareja en una columna, con sus dos fichas una encima de otra. En horizontal salen las cuatro fichas en fila. Al tocar una ficha se abre entera encima (`cardModal`), y se cierra tocando en cualquier sitio. Fuera de las fichas, un toque sigue empezando el partido, como antes. Se quitó la fila de «Nivel»: las medias dicen lo mismo con más precisión.
  - **Cuadro del torneo:** la media de cada pareja sustituye a las barritas de nivel.
  - **«Tu pareja»** (entrada nueva del menú): tu ficha y la de Martín, enteras, con la media de la pareja.
- **La ficha entera** añade el nombre completo de cada atributo, el ranking (tú: «Sin ranking») y la frase de siempre del jugador (`rival.*`, `partner.marta`; la tuya es `card.youTag`).
- **Medias de hoy** (las pone la simulación en `brain.ts`):

| Jugador | Media | Pareja | Media |
|---|---|---|---|
| Tú | 73 | Tú / Di Neno | 74 |
| Martín Di Neno | 75 | Navarra / Chingoto | 65 |
| Paquito Navarra | 58 | Chingoto / Galván | 76 |
| Fede Chingoto | 71 | Galván / Tapira | 82 |
| Alejandro Galván | 80 | Tapira / Coeyo | 87 |
| Agustín Tapira | 84 | | |
| Arturo Coeyo | 89 | | |

- **Estilos** (una línea corta, `style.*`):
  - tú, «Lado de drive»;
  - Paquito, «Defensor de fondo»;
  - Fede, «Rey de la pared»;
  - Alejandro, «Pegador»;
  - Agustín, «Toque y magia»;
  - Arturo, «Completo · número 1»;
  - Martín, «Revés constante».

  Las frases largas no caben en la ficha compacta (unos 165 px de ancho en un móvil de 390).

## Controles nuevos: textos

El esquema es el que dejó la simulación en `src/input.ts`.

- **Fuerza del gesto:** soltar quieto coloca la bola, soltar normal es un golpe medio y, cuanto más rápido el latigazo, más fuerte y más arriesgado.
  - En ordenador, F ataca: al pulsarla vale 0,7 y llega a 1 a los 0,6 s de mantenerla.
  - Mayús+F (o Mayús + botón derecho) es el latigazo hacia abajo.
- **Por encima de la cabeza:**
  - solo apuntar: bandeja;
  - latigazo torcido: víbora;
  - latigazo recto: remate;
  - recto y a tope, con una bola alta cerca de la red: remate por 3;
  - hacia abajo, hacia ti: remate liftado por 4.
- **Bajada:** cuando la bola sale alta del cristal de fondo, el círculo y el aro de los pies se ponen rosas (`view.cue = 'bajada'`, del render). A su lado sale «BAJADA» un momento (`cue.bajada`), como el «ATACA». Apuntar da una bajada controlada; un latigazo, una fuerte.
- **«Cómo se juega»** queda en nueve apartados:
  1. Dos pulgares.
  2. Arrastra para colocarla.
  3. La fuerza está en el gesto (nuevo).
  4. Ataca y defiende (solo volea y bloqueo).
  5. Por encima de la cabeza (nuevo: bandeja, víbora, remate, por 3 y por 4, y sus teclas).
  6. Las paredes juegan (con la bajada).
  7. Reglas reales.
  8. Puntuación.
  9. Dobles.
- **Pistas de primera vez:** se ven una sola vez en la vida, se guardan en `save.seen` y salen en cualquier partido, así que quien ya jugó la 0.2 también las ve.
  - `tut.power`: tras unos golpes apuntados.
  - `tut.bajada`: con el primer aviso de bajada.
  - `tut.por3`: con la primera bola de ataque por encima de la cabeza que admite el por 3. Usa `specialOk('por3', plan)` de `brain.ts`, la misma prueba del golpe.
  - Cada pista tiene su versión para teclado (`…Keys`).
- **Consejos de la pausa:** se añaden la fuerza, la bajada y el por 3 / por 4.
- **El nombre del golpe al apuntar** dice «POR 3» o «POR 4» cuando el gesto lo pide y la bola lo permite (`human.aim` con `{ power, down }`).
  - Con F o el botón derecho, una barra fina bajo el nombre se llena mientras mantienes (`input.powerNow()`).
  - Con el dedo no hay barra: la fuerza es la velocidad al levantarlo y solo se sabe al soltar.

## Carteles, explicaciones, público y sonido

- **Cartel del punto** (`Explainer.callout`):
  - si lo gana una bajada, una víbora o un remate, el cartel lo nombra: «¡Bajada!», «¡Víbora!», «¡Remate!» (en verde si es tuyo, en rojo si es de ellos);
  - «¡Por 3!» y «¡Por 4!» ya tenían su motivo;
  - un remate que buscaba el por 3 o el por 4 y acaba en error lleva el motivo y debajo «Buscaba el por 3».
- **Sobre tu jugador**, al intentar el por 3 o el por 4: «POR 3» o «POR 4» en dorado, siempre (también con los indicadores mínimos). Así sabes que el gesto se leyó. Va con una sacudida, un destello y la congelación del golpe.
- **Explicación** (`explain.ts`, `window.__pb.why`): «Tu remate buscando el por 4: a la red» (`x.special`). La bajada tiene nombre propio en las frases («tu bajada», «la bajada de Galván»).
- **Repetición:** la bajada puntúa como la víbora para merecer repetición, y la etiqueta dice el golpe: «REPETICIÓN · POR 3».
- **Público** (`broadcast.ts`):
  - ovación entera en un punto por 3 o por 4;
  - «¡uy!» cuando un remate que buscaba el por 3 o el por 4 acaba en error, o cuando el rival lo devuelve.
- **Estadísticas del final:** fila nueva «Por 3 y por 4» (los de tu pareja).
- **Sonido** (`audio.ts`):
  - el «pock» se escala con la fuerza del golpe (el `power` del evento): de 0,82 veces el volumen soltando quieto a 1,3 veces con el latigazo más rápido, con un chasquido seco por encima de 0,65;
  - la bajada suena como el remate;
  - el por 3 y el por 4 tienen su propio crack: un silbido de la pala, un chasquido muy brillante y un golpe grave del marco, y el por 4 añade el cepillado del liftado.

## Inglés

El inglés conserva los nombres españoles que usa el pádel en todo el mundo (chiquita, bandeja, víbora), y también **por 3 / por 4**: así lo dicen las retransmisiones en inglés («por tres») y los gráficos («x3»).

- El cartel de un punto por 3 sigue siendo «Por 3 · out of the court», y el de por 4, «Por 4 · back over the net».
- La bajada es **«Wall smash»** en el aviso, el cartel y la etiqueta, y «off-the-wall smash» dentro de una frase. «Off-the-wall smash» no cabe en el aviso, y «Wall smash» se entiende sin conocer el término español.

## Herramientas

- `tools/screens.py [salida] [dist] [es|en] [390x844|844x390] [puerto]`. Además de las capturas de siempre, ahora saca:
  - las fichas (presentación, una ficha abierta, la tuya y «Tu pareja»);
  - los apartados nuevos de «Cómo se juega»;
  - los avisos BAJADA y ATACA;
  - los carteles de bajada, por 3, por 4 fallado y víbora del rival.
- `window.__pb.forceCue = 'bajada'` fuerza un aviso para las capturas.
- `window.__pb.fakePoint(ganador, motivo, golpe, especial)` lanza un punto con su golpe decisivo: cartel, público, sonido y explicación, sin tocar el marcador.

## Comprobado

Capturas en vertical (390 × 844) y en horizontal (844 × 390), en español y en inglés, sin errores en la página:

- menú, cuadro, «Tu pareja», «Cómo se juega», ajustes;
- presentación con las fichas y una ficha abierta;
- saque, peloteo, avisos, carteles, marcador y final.

## Pendiente

- **Probarlo en un móvil real:** si las fichas compactas se leen bien a 12 px y si la barra de fuerza con teclado se entiende sin explicarla.
- **La barra de fuerza con el dedo:** hoy no hay ninguna indicación en vivo. Se podría enseñar la fuerza que se usó en el golpe (por ejemplo, el número sobre el jugador) si en las pruebas no se nota la diferencia.
- **Atributos del jugador:** son fijos (73 de media). Si el cliente quiere progresión (subir atributos al ganar rondas), la ficha ya está lista para enseñarlo.
- **La bajada en el anillo de los pies:** el render la pinta en rosa y la palabra la pone el HTML. Si se quiere la palabra dentro del anillo 3D, la clave es `cue.bajada`.
