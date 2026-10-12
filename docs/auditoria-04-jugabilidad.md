# Auditoría 04 · experiencia de juego (12 oct 2026, HEAD `c7055a6`)

Revisión independiente de la jugabilidad. Jugué con toques reales por CDP (`Input.dispatchTouchEvent`, dos dedos con marcas de tiempo exactas) en un móvil vertical de 390×844 con pantalla táctil y en horizontal a 844×390. El reloj del partido se avanzó a mano (`__pb.advance` con los temporizadores virtuales de `tools/hud.py`).

Sesiones:
- **Primera vez:** menú → tarjeta → intro de TV → 6 puntos contra la 1.ª pareja.
- **Jugador activo:** 8 puntos contra los campeones.
- **Jugador pasivo:** solo saca; 8 puntos contra la 1.ª pareja.
- **Partido entero con piloto automático y TV** contra los campeones.
- **Batería de gestos** del pulgar derecho.

No toqué el código del juego. Los scripts están en `/tmp/padel-audit-ux/scripts/` (`gest.py`, `play.py`, `auto.py`, `land.py`, `mt.py`) y las capturas y registros, en `/tmp/padel-audit-ux/`.

**Límites:** WebGL por software y sin móvil real. La oclusión por el pulgar se deduce de la geometría. El audio se comprobó por las llamadas a `audio.*`, sin escucharlo.

---

## ALTA

### A1 · Los latigazos cortos y nítidos no se reconocen, y el por 3 pide un latigazo enorme
- **Qué pasa** (`scripts/gest.py`; dedo quieto 120 ms, latigazo hacia arriba y el dedo se levanta 12 ms después del último movimiento):

  | Latigazo real | Lectura del juego |
  |---|---|
  | 40 px en 40 ms (1.000 px/s) | soltar normal (potencia 0,54) |
  | 50 px en 50 ms | soltar normal (0,57) |
  | 60 px en 60 ms | ataque justo en el umbral (0,61) |
  | 80 px en 50 ms (1.600 px/s) | ataque con 0,70 |
  | 130 px en 80 ms | ataque con 0,94, ya en zona de por 3 |

  El por 3 necesita potencia ≥ 0,9 tras el tope de la ficha, unos 106 px recorridos en los últimos 80 ms. El propio comentario de `FLICK` dice que un latigazo de pulgar recorre 40–120 px en 60–120 ms, y la mitad baja de ese rango no cuenta.
- **Por qué importa:** el ataque es la decisión principal del jugador. Si un latigazo claro sale como golpe medio, parece que el juego «no hace caso». El jugador acaba rematando con barridos largos.
- **Causa:** `src/input.ts`, `gestureAt`. La velocidad es la media de `FLICK.window` (80 ms) hasta el instante del `pointerup`, así que entran el tramo quieto anterior y la muestra del levantado, que no tiene desplazamiento. Encima, `travel ≥ 24 px` también se mide en esa ventana.
- **Arreglo:** medir la **velocidad máxima** de los 2–3 últimos tramos que tienen movimiento (sin contar la muestra del `pointerup` si repite posición) o terminar la ventana en la última muestra en movimiento. Bajar `travel` a unos 18 px. Recalibrar `FLICK.full` y `por3Power` en un móvil real, porque el por 3 debería salir con unos 70–90 px rápidos.

### A2 · El ataque con el dedo apunta adonde termina el latigazo, no adonde se apuntó antes
- **Qué pasa** (`gest.py`):
  - «Apunto a (40, −45), paro 100 ms y hago un latigazo de 60 px hacia arriba» da `ax=40, ay=−105`: el final del latigazo, no el apuntado.
  - «Latigazo desde parado» da `ax=0, ay=−60`. Como `hypot` es 60 px y supera `ATTACK.aimed` (20 px), cuenta como **apuntado**: nunca se usa el destino por defecto «al cuerpo del rival».
  - Con `pxPerM` = 33 y `AIM_Z` = 0,7, cada 60 px de latigazo empujan el destino unos 2,6 m más al fondo.
- **Por qué importa:** la volea o el remate «a los pies» no sale como dicen la ayuda y `input.ts`, y el ataque apuntado se va largo, hacia el cristal.
- **Causa:** `strokeStart()` en `src/input.ts`. El `pointerup` añade una muestra en la misma posición, con velocidad 0. El bucle se para en el acto y devuelve la última muestra, el final del trazo.
- **Arreglo:** buscar el comienzo del trazo ignorando las muestras de velocidad cero del final, o guardar `ax/ay` en el último instante en que el dedo iba despacio antes de acelerar. Añadir una prueba unitaria con una secuencia de toques que incluya el `pointerup`.

### A3 · El pulgar derecho tapa tu jugador, el aro dorado y el círculo
- **Qué pasa:** juegas en el lado del drive (derecha). En vertical, tu jugador, el aro de tiempo y el círculo blanco salen abajo a la derecha, en x ≈ 330–375 e y ≈ 600–680. Es justo donde reposa el pulgar derecho. Para una chiquita hay que arrastrar **hacia abajo**, encima de ellos. Ejemplos:
  - `activo3-apuntando-chiquita-1.png`: aro en (370, 648) y pulgar de (288, 607) a (243, 677).
  - `activo3-pista-03.png`: círculo en (362, 643).
  - `fte-aviso-bajada.png`.
- **Por qué importa:** el aro dorado decide el PERFECTO y es lo que hay que mirar al soltar. Si lo tapa el dedo, se juega a ciegas. Es una deducción geométrica: confirmarlo en un móvil real.
- **Causa:** cámara centrada (`view.ts`, `cam.p*`) más el lado del humano. El aro se dibuja sobre la bola (`main.ts`, `overlays`).
- **Arreglo:**
  - repetir un aro pequeño de tiempo junto a la etiqueta del destino (arriba, donde se mira) o encima del punto de apoyo del pulgar;
  - desplazar la cámara para que tu jugador quede hacia el centro;
  - que la chiquita se apunte también con un arrastre corto hacia arriba-atrás, no solo hacia abajo.

## MEDIA

### M1 · La pista de movimiento se pisa a los 0,1 s
- **Qué pasa:** primera partida, sesión `fte`. «Pulgar izquierdo: ve al círculo de la pista» aparece en t = 3,1 s y en t = 3,2 s la sustituye «Golpeas solo · apunta y suelta en dorado» (`fte-pista-02.png`, todavía entrando con fundido, y `fte-pista-03.png`). En otra semilla duró 7,5 s; depende de cuándo sale el aro.
- **Causa:** en `main.ts`, `overlays()`, la condición de `tut.hit` acepta `hintKey.startsWith('tut.move')` y la reemplaza.
- **Arreglo:** cola de pistas con un mínimo en pantalla (unos 2,5 s), o no pisar `tut.move` hasta que `input.moved`.

### M2 · Con el dedo no se sabe qué golpe por encima saldrá ni cuál salió
- **Qué pasa:**
  - Al arrastrar sobre una bola alta, la etiqueta muestra el golpe sin latigazo (BANDEJA o VOLEA). Remate, víbora, por 3 y por 4 se deciden al levantar el dedo, sin vista previa.
  - Con los indicadores mínimos (lo que viene por defecto), un golpe bien sincronizado no lleva etiqueta: no se sabe si salió víbora o remate. Solo hay etiqueta con PERFECTO o en por 3/por 4.
  - Umbrales:
    - víbora con un trazo de **24° a 55°** respecto a la vertical (`viboraBend` 0,7 m entre `ATTACK.bend` 1,6);
    - a 20° salió remate y a 30° víbora (`gest.py`); el arco natural del pulgar derecho (15–30°) cae justo en la frontera;
    - por encima de 55° no es ataque y sale una bandeja fuerte sin aviso.
  - La potencia no se ve mientras se arrastra (ya está en «Pendiente de la 0.3»).
- **Arreglo:**
  - etiquetar siempre los golpes por encima del humano (BANDEJA / VÍBORA / REMATE) también en modo mínimo;
  - frontera de la víbora hacia 30–35° y cono de ataque de 65° para las bolas por encima;
  - mientras el dedo esté apoyado sobre una bola alta, un abanico tenue con las tres direcciones.

### M3 · El aviso de BLOQUEO cambia a BAJADA a 0,12 s del contacto
- **Qué pasa** (`fte-log.txt`, t = 114,8–115,5; `fte-aviso-block.png`):
  - remate del rival y aviso «Te atacan · toca en el dorado» con el contacto previsto a 0,93 s y 2,0 m de altura;
  - en t = 115,4 la bola va al cristal y el aviso pasa a BAJADA con 0,12 s por delante;
  - el toque ya hecho se gastó en una bajada floja (potencia 0,3).
- **Causa:** `ballCue` (en `brain.ts` y `main.ts`) lee el plan del momento, que se recalcula tras el bote.
- **Arreglo:** decidir bloqueo o bajada con la trayectoria prevista (`Match.path`) en el golpe rival y no mostrar BLOQUEO si el contacto previsto es después de la pared. Si el aviso cambia con menos de unos 0,4 s, no dar por gastado el toque.

### M4 · Encuadre vertical: se cortan los jugadores cercanos y el círculo
- **Qué pasa:**
  - Martín queda medio fuera por el borde: `fte-aviso-bajada.png`, x ≈ 385; `fte-pista-02.png`, x ≈ 20.
  - El círculo para ir pega al borde derecho (`activo3-pista-03.png`).
  - Las esquinas cercanas de la pista no entran en el cuadro, así que la bola que sale por el cristal lateral cercano se pierde.
  - La malla del fondo cercano cruza a tu jugador con líneas oscuras (`fte-pista-01.png`).
- **Causa:** `view.ts`, `cam = { pd: 23, ph: 13, pf: 46 }`, más el desplazamiento lateral `camX = me.x·0,35` (y la bola).
- **Arreglo:** limitar `camX` para que los dos jugadores cercanos y las esquinas cercanas queden dentro, o abrir 2–3° el `pf` en vertical. Desvanecer más la malla cercana sobre tu jugador.

### M5 · En horizontal la pista ocupa menos de la mitad de la pantalla
- **Qué pasa:** con 844×390 la pista ocupa en torno al 45 % del ancho, los rivales miden unos 15 px y la bola unos 4 px. Todo lo demás es grada (`land-04-apuntando.png`, `land-05-punto.png`). La tarjeta, la pausa y el HUD sí se colocan bien (`land-02-tarjeta.png`, `land-06-pausa.png`).
- **Arreglo:** cámara de horizontal más cerca o más picada (`ld` unos 18, `lf` unos 30–32) para que el cristal de fondo lejano toque casi el borde superior.

### M6 · Poca autoría de los puntos: casi todos acaban en errores de la CPU y los peloteos son muy largos
- **Qué pasa:**
  - **Primera vez:** 5 de 6 puntos ganados, todos por errores de marco del rival (red, cristal o fuera) y ningún ganador propio. Peloteos de 10, 12, 28, 14, 27 y 12 golpes.
  - **Activo contra los campeones:** 26, 29, 8, 8, 17, 26, 38 y 27 golpes (unos 22 de media frente a los 12–13,5 de la ficha). Mis 5 puntos ganados llegaron por errores suyos.
  - **Pasivo** (solo saca, nunca toca el joystick ni apunta): gana **3 de 8** a la 1.ª pareja, los tres por «Paquito, de marco: directa al cristal». Su jugador da 21 golpes automáticos.
  - **Piloto automático contra los campeones:** 23 puntos; terminaron en ganador 4 + 2 y en «miss» 2 + 2.
- **Por qué importa:**
  - el jugador sincroniza bien, coloca y no gana por lo que hace, sino porque el rival falla;
  - los peloteos de más de 25 golpes con la mitad de las bolas para Martín (26 de 47 en la primera partida) dejan mucho tiempo esperando.
- **Causa probable:** CPU con muchos errores de marco frente a una bola constante; un PERFECTO colocado (q ≈ 0,88) no crea presión suficiente. La red del humano casi no ataca: en 14 puntos jugados solo salieron 2 avisos de ATACA, frente a 14 de BAJADA y 8 de BLOQUEO.
- **Arreglo:**
  - que la colocación PERFECTA a los pies o al cristal lateral genere más «miss» y ganadores;
  - bajar los errores de marco de las parejas altas;
  - que un buen globo deje más bolas altas atacables en la red, para que el remate y el por 3 aparezcan.

## BAJA

- **B1 · El cartel de punto no dice de quién es:** «A LA RED» solo distingue por color, verde o rojo (`fte-punto-1.png`). Arreglo: «Paquito · a la red» o «Punto vuestro · a la red».
- **B2 · La pista de saque menciona algo que no se ve:** «suelta con el aro pequeño», pero con los indicadores mínimos el aro solo aparece al apoyar el dedo (`fte-pista-01.png`). Arreglo: en la primera partida, el aro tenue del saque también sin apoyar el dedo, como el aro de enseñanza del peloteo.
- **B3 · El joystick tapa a tu pareja:** se dibuja encima de Martín (`activo3-pista-03.png`). Arreglo: más transparencia o solo el contorno.
- **B4 · Un toque con temblor deja de ser bloqueo:** con 16 px de temblor sale un golpe colocado al centro de 0,39 (`gest.py`). Los 14 px de `TAP.px` valen, pero falta una señal de «bloqueo» al soltar para aprender la diferencia.

---

## Lo que está bien
- **Llegada al juego:** dos toques (JUGAR y EMPEZAR PARTIDO), una intro de TV de 5,5 s que se puede saltar y el primer saque a los unos 7 s del toque. La primera bola propia del peloteo llega a los 4,7 s de empezar el punto.
- **Ritmo entre puntos:**
  - unos 1,5 s de pausa más 1,9 s de espera del saque por punto;
  - «Toca para seguir» a los 0,6 s;
  - 2 repeticiones en 23 puntos (6,4 s en total);
  - un set a 3 juegos dura unos 6,5 min.
- **Colocado, normal y toque se distinguen bien:**

  | Gesto | Lectura |
  |---|---|
  | Arrastre y quieto | colocado, 0,3 |
  | Soltar en marcha | 0,44–0,52 |
  | Toque de 90 ms | bloqueo |
  | Arrastre largo y quieto | 0,3 |

  Dos dedos a la vez (joystick y apuntar) funcionan en cualquier orden (`mt.py`).
- **Avisos y vista previa:**
  - el aviso BAJADA rosa y el anillo en los pies se leen muy bien (`fte-aviso-bajada.png`);
  - la vista previa al apuntar (etiqueta DEJADA, GLOBO o VOLEA y arco punteado) es clara (`activo3-apuntando-chiquita-1.png`);
  - el aro de bloqueo sobre la bola del rival se entiende (`fte-aviso-block.png`).
- **Explicaciones de los puntos:** concretas y con números («No te moviste: la bola tardó 1,5 s y estabas a 1,7 m»).
- **Sin errores ni avisos de consola** en las 6 sesiones con registro (primera vez, globo, activo, pasivo, automático y horizontal).
- **Audio:** saltan todos los sonidos: golpe por tipo (saque, drive, globo, bajada, víbora, remate, dink…), pared, bote, chirrido, red, punto, punto perdido, whoosh y clic.
- **Pantallas:**
  - la tarjeta del partido, con las fichas, se lee bien en vertical y en horizontal;
  - la pantalla final (`auto3-final.png`) es limpia, con estadísticas útiles, incluido «Por 3 y por 4».
- **El juego espera tu saque:** no hay saque automático, y es lo correcto.

## Cómo reproducir
- **Compilar y servir:** `node build.mjs`; los scripts levantan su propio servidor sobre `dist/`.
- **Batería de gestos:** `python3 scripts/gest.py 390 844 0.012`. El tercer argumento es el retraso del levantado.
- **Primera vez:** `python3 scripts/play.py --menu --points 6 --tag fte --shots 22`.
- **Jugador activo:** `python3 scripts/play.py --pair 3 --points 8 --tag activo3 --snapaim 2`.
- **Jugador pasivo:** `python3 scripts/play.py --pair 0 --points 8 --tag pasivo0 --passive`.
- **Ritmo y pantalla final:** `python3 scripts/auto.py 3 8931 auto3`.
- **Horizontal:** `python3 scripts/land.py`.
- **Semillas:** `Math.random` sembrado (`--seed 1234` por defecto; `auto.py` usa 77 + pareja).
