# Estadio 0.9 (10 oct): pista central de un torneo profesional, de noche

Germán, tras ver la 0.8: «Dale una estética más pro, no Pickleball El Pinar, hazlo realista». Preguntado dónde, respondió: «hazlo realista como tú creas». Decisión: **la pista central de la final de un circuito profesional, de noche, bajo focos**, con aspecto de retransmisión de televisión.

Esta parte toca el escenario 3D y la luz: la pista, el estadio, el público, los focos, el cielo, el entorno, la imagen y el encuadre de apertura de la tele. No toca los personajes, la pala ni la bola (G3), ni la interfaz HTML, el grafismo de la tele, los textos ni las fuentes (G2).

**Marca provisional** (la pone el cliente al final): «PRO TOUR», «PRO TOUR FINALS» y «CENTER COURT». Los patrocinadores son inventados y genéricos, con nombres de pickleball: Baseline Bank, Volley Water, Third Shot Energy y Lob Air. No aparece ninguna liga, marca de palas ni marca de bolas reales.

## Qué delataba «club pequeño», «maqueta» o «videojuego barato» en la 0.8

Lo miré en el móvil vertical (390 × 844) y horizontal (844 × 390), en los niveles medio y bajo, y en los planos de televisión. De más a menos impacto:

1. **Era un club de día.** Arriba del móvil vertical se veían pinos, césped y un paseo de hormigón vacío. Al fondo, montañas.
2. **Gradas de club.** Solo había seis filas en los laterales, sin nada en los fondos ni en las esquinas, sin palcos ni cubierta.
3. **Vallas con letra de cartel de feria** (Bungee) y nombres locales («Club del Pinar», «El Tiemblo · Ávila»). Además, una pantalla cortavientos y un videomarcador sobre dos patas.
4. **Público de maqueta.** Toda la gente estaba igual de iluminada, con colores vivos y en filas regulares.
5. **Mucho verde plano** alrededor de la pista. Abajo del móvil, juntas de hormigón.
6. **Luz plana de mediodía.** No había focos, halos ni reflejo en la pista.
7. **Nada de pista central:** ni árbitro, ni banquillos, ni cámaras, ni LED.

## Qué cambia

### El estadio (nuevo `src/render/stadium.ts`)
- **Un cuenco de gradas en los cuatro lados**, rectangular con las esquinas redondeadas. Cada fila es un contorno desplazado de la de abajo.
  - **Grada baja:** 11 filas pegadas a la pista. Su muro frontal está a 2,8 m de las vallas en los laterales y a 2,6 m en los fondos.
  - **Pasillo y palcos:** detrás de la grada baja hay un pasillo, dos filas de asientos de club (granate) y la cristalera de los palcos, iluminada en cálido.
  - **Grada alta:** 10 filas más empinadas, debajo de una cubierta en voladizo.
  - **Pasillos de escalera:** diez, con medios peldaños.
  - **Asientos:** azul marino oscuro; cada uno tiene asiento y respaldo.
- **El anillo de focos** cuelga del borde de la cubierta: 33 proyectores apuntados a la pista, con nervios de acero y una pasarela. Cada cara tiene 6 × 3 lámparas redondas.
- **Dos videomarcadores** cuelgan de la cubierta, uno en cada fondo. Los dos usan la misma pantalla.
- **La cámara de juego** queda muy por encima de las filas del fondo cercano, que siempre caen por debajo del borde de su encuadre. En los contraplanos de la tele ese fondo se ve lleno.
- **Coste:** hormigón, asientos, cubierta, acero y suelo son **una sola malla con un solo material**. El color va por vértice, y la rugosidad, el metal y la caída de luz van en un atributo. Todo el cuenco es una llamada de dibujo.

### Todo lo que da luz, en una malla (nuevo `src/render/led.ts`)
- **Vallas LED a ras de pista:** tres en el fondo lejano y cuatro en cada lateral, dejando la red libre para el árbitro.
  - Cambian de mensaje cada 6 s con un barrido desde abajo, una tras otra con una décima de diferencia.
  - Los mensajes son la marca, los patrocinadores y **el marcador** («TÚ 7 – 4 NURIA»).
- **Dos cintas LED** en el frente de la grada baja y en el de la grada alta. Los mensajes corren hacia la izquierda y entre ellos pasa el marcador.
- **Puntos LED dibujados por píxel** (16 mm de paso). Se funden con su media donde un punto es más pequeño que un píxel, así que de lejos no hay moiré.
- **Caras de los focos, cristaleras de los palcos y videomarcadores**, en la misma malla y el mismo material.
  - Algunas habitaciones de los palcos están más apagadas y alguna, a oscuras.
  - Mientras se presenta el partido, el videomarcador muestra el enfrentamiento («TÚ VS LOLA») en lugar del 0–0.
- **Texto:** dos lienzos. Uno es el atlas fijo de mensajes (1024 × 1024; en calidad baja, 512 × 512). El otro es el dinámico: videomarcador y marcador LED, 1024 × 512, que solo se repinta al cambiar el marcador.
- **Fuentes:** «Barlow Condensed» con «Arial Narrow» de respaldo, como pidió G2. Los colores son los de su interfaz: fondo #0a0e14, blanco #f4f6f8 y el amarillo bola #e2f04a solo como acento.

### La pista (`src/render/venue.ts`)
- **Colores de torneo:** pista azul `#285592`, cocina `#30639f` y alrededor gris pizarra oscuro `#2a3746` en lugar del verde. Fuera de las vallas, el suelo es casi negro.
- **Acrílico satinado:** la rugosidad baja de 0,84 a 0,58. Con el contraluz, la mitad lejana de la pista coge el brillo suave de los focos, como en la tele.
- **En el suelo detrás de cada fondo:** «PRO TOUR FINALS / CENTER COURT».
- **Red de competición:** postes cuadrados de grafito sobre base con ruedas, cinta blanca y la misma malla negra calculada por píxel. La cinta y la tira central son ahora una sola malla.
- **Mobiliario de pista central:** una segunda malla que da sombra, con material compartido con el cuenco.
  - La silla del árbitro (con su escalera) junto a la red.
  - Dos banquillos, con toalla, botellas y nevera.
  - Seis cámaras de televisión con trípode: dos en las esquinas del fondo lejano, dos en las del cercano, dos delante del fondo cercano, y una cámara lateral en su plataforma frente al árbitro.
  - Cuatro sillas para los jueces de línea y taburetes para los fotógrafos.

### El público (`src/render/crowd.ts`)
- **5.291 personas** con los mismos impostores de la 0.8, en una llamada de dibujo.
- **Penumbra:** la luz de los focos llega a las primeras filas y cae con la altura, hasta la penumbra bajo la cubierta. La función de caída es la misma para la grada, los asientos y el público.
- **Más naturales:**
  - cada espectador está iluminado un poco distinto;
  - los colores están algo apagados;
  - la ropa es de noche de otoño (marinos, negros, grises, vaquero; pocos blancos);
  - en los palcos van más arreglados.
- **Personal de pista:** el árbitro, cuatro jueces de línea, los operadores de cámara y los fotógrafos son parte del mismo público, pero no se levantan ni celebran. Los oficiales siguen la bola con la cabeza sin distraerse; los operadores están de pie junto a sus cámaras.
- **Cabezas:** solo las filas bajas y los palcos (2.332 personas) siguen la bola. Más arriba no se nota y se ahorra CPU.
- **Flashes de fotos:** unos 2 por segundo en todo el estadio, y hasta unos 47 por segundo cuando el público se pone en pie. Es un punto emisivo de 6 cm, dentro del mismo shader.

### La luz y la imagen (`src/render/view.ts`, `src/render/look.ts`)
- **Luz principal:** de los focos de la esquina cercana izquierda; blanca fría (`#eef3ff`), intensidad 3,1, elevación 50°.
  - Su sombra es suave (radio PCF 2,4) y no del todo negra (intensidad 0,84), porque el resto del anillo la rellena.
  - El mapa de sombras cubre lo mismo que antes.
- **Contraluz desde el fondo lejano**, casi enfrente de la cámara de juego (elevación 27°, intensidad 1,15). Perfila a los jugadores y pone el brillo de los focos en la pista. No da sombra. En calidad baja está apagado (una luz menos en cada shader).
- **Sin luz hemisférica.** El relleno lo da el entorno.
- **Entorno horneado del propio estadio:** grada, público, focos, pista y cielo se renderizan con PMREM (128 px) desde 1,4 m sobre la pista.
  - Se hace al arrancar y otra vez cuando el público ya está horneado.
  - El mapa de sombras se dibuja una sola vez para las seis caras, no una por cara.
  - Ilumina los materiales PBR: relleno de la grada, rebote azul de la pista y reflejo en el acero. Pesa 0,62.
- **Sombras en X en los pies**, como bajo focos: la mancha de contacto y tres sombras tenues hacia las esquinas, en el mismo cuadrado de antes (ahora de 3,6 m), así que **no añaden ninguna llamada de dibujo**. En calidad baja también dibuja la de la luz principal, porque no hay mapa de sombras.
- **Halos de los focos:** un brillo suave y una raya horizontal tenue, como de objetivo de tele. Es un cuadrado instanciado por foco, con luz sumada, y una sola llamada de dibujo para todos. Solo brillan los focos que miran a la cámara. En alto se suaviza, porque el bloom añade el suyo.
- **Cielo nocturno:** cúpula con degradado de casi negro a una bruma tenue. No hay skyline, porque desde dentro del cuenco no se vería.
- **Niebla nocturna:** `#10161f`, de 45 a 230 m.
- **Etalonaje de retransmisión nocturna:** la misma curva AgX, con negros algo más profundos (lift de 0,012 a 0,008), sombras más frías y altas luces apenas cálidas. Exposición de 0,63 a 0,66.
- **Bloom solo en luces:** en alto, el umbral HDR 1,5 de antes solo lo pasan los focos y el texto blanco de los LED. En medio y bajo no hay posprocesado: los halos hacen ese papel.
- **Sin grano.**
- **Órbita del menú:** ahora es una elipse dentro del cuenco (12,5 × 16,5 m, a 7,2 m de altura). La de antes (radio 19) atravesaba la grada.

### La tele (`src/render/director.ts`, solo un encuadre)
- **Plano de apertura de la presentación:** parte de lo alto de la esquina cercana mirando al otro lado del estadio, a la grada lejana, los palcos y el anillo de focos, y baja hasta el equipo del fondo. Antes miraba la pista desde arriba.
  - Los tiempos y el resto del vuelo no cambian.
  - Comprobado: los rótulos de nombre siguen sin descuadrarse (0 desajustes con `tools/tv.py`, en vertical y en horizontal).
- **La cámara de juego no cambia.**

### Fuera
- **Se borran** `src/render/backdrop.ts`, `assets/env/trees.webp` y `assets/env/pano.webp` (165 KB): el pinar y Gredos.
- **De `textures.ts` salen** el césped, el atlas de pancartas y la sombra alargada de calidad baja.

## Coste

`renderer.info` en el mismo fotograma de un peloteo, con `tools/look.py` y la semilla 424242. Incluye la pasada de sombras y el posprocesado.

| Nivel y pantalla | Llamadas de dibujo antes → después | Triángulos antes → después | Texturas antes → después |
|---|---|---|---|
| Medio, 390 × 844 | 56 → 40 | 89.600 → 112.900 | 34 → 26 |
| Medio, 844 × 390 | 54 → 40 | 89.600 → 112.900 | 34 → 26 |
| Alto, 390 × 844 | 70 → 54 | 89.600 → 112.900 | 46 → 38 |
| Alto, 844 × 390 | 68 → 54 | 89.600 → 112.900 | 46 → 38 |
| Bajo, 390 × 844 | 41 → 29 | 50.100 → 73.200 | 34 → 26 |
| Bajo, 844 × 390 | 39 → 29 | 50.100 → 73.200 | 34 → 26 |
| Medio, dobles, 390 × 844 | 74 → 58 | 163.100 → 186.400 | 38 → 30 |

**De dónde salen los triángulos:**
- El cuenco son 21.000.
- Los asientos de la grada alta que tapa la gente no se construyen; solo los vacíos.
- El público son 10.600 (5.291 personas a dos triángulos cada una).
- El mobiliario de pista son 1.400.
- Todo lo que da luz son 400.
- Cada jugador sigue siendo de 18.000.

Son unos 23.000 triángulos más en todos los niveles, pero con 16 llamadas de dibujo menos en medio y 12 menos en bajo, y sin texturas grandes del fondo.

**Memoria de GPU estimada** con un script de verificación (no versionado). Móvil de 390 × 844 con densidad 2; cuenta texturas, atlas, entorno, sombras, el búfer del lienzo con MSAA y el posprocesado:

| Nivel | Antes | Después | Por qué |
|---|---|---|---|
| Alto | 196 MB | 180 MB | Fuera los pinos, el panorama y el atlas de pancartas; entorno de 128 en lugar de 256 (de 6,3 a 1,6 MB); entra el atlas LED (5,6) y el lienzo dinámico (2,8) |
| Medio | 95 MB | 80 MB | Lo mismo |
| Bajo | 58 MB | 38 MB | Lo mismo, y el atlas LED a media resolución |

**Tamaño:**
- `dist/index.html` pasa de 1.032.811 a 1.036.678 bytes (+3,9 KB).
- Los assets pasan de 2.064.887 a 1.900.057 bytes (−165 KB: los dos `.webp` del fondo).
- Ya no se carga ninguna imagen del escenario: todo sale de código.

**Al arrancar:**
- El cuenco se construye en la CPU (unos 5.000 asientos y sitios).
- El entorno se hornea dos veces: seis caras de 128 px y una sola pasada de sombras cada vez.
- Calculo unos 20–40 ms de CPU y menos de 10 ms de GPU en un móvil medio, dentro de la pantalla de carga. Hay que medirlo en un móvil de verdad.

**Comprobado:**
- `npx tsc` pasa.
- Al bajar de nivel en caliente (alto → medio → bajo) no hay ningún error ni aviso de consola, y el atlas LED pasa a media resolución.
- La presentación de la tele, en vertical y en horizontal, no tiene desajustes de rótulos.
- El entrenamiento (`tools/train.py`) no da errores de consola. La máquina naranja y las dianas lima se leen bien sobre la pista azul y el fondo oscuro.

**Créditos de Magnific:** 0. No hizo falta ninguna imagen generada: el skyline no se vería desde dentro del cuenco y todo lo demás sale de código.

## Archivos

- **Nuevos:**
  - `src/render/stadium.ts`: el cuenco, los focos y los videomarcadores.
  - `src/render/led.ts`: todo lo que da luz, el atlas de mensajes y el videomarcador.
- **Cambiados:**
  - `src/render/venue.ts`: la pista, la red, las vallas LED, el mobiliario, los halos y el cielo.
  - `src/render/view.ts`: la luz, el entorno, las sombras en X, el reloj LED, el videomarcador en la presentación y la órbita.
  - `src/render/crowd.ts`: caída de luz, personal, ropa, flashes y cabezas solo en las filas bajas.
  - `src/render/look.ts`: el etalonaje nocturno.
  - `src/render/director.ts`: el plano de apertura.
  - `src/render/textures.ts`: la sombra en X; fuera el césped, el atlas de pancartas y la sombra alargada.
- **Borrados:** `src/render/backdrop.ts` y `assets/env/*.webp`.
- **Sin tocar:** `chars.ts`, `models.ts`, `kits.ts`, `drill-props.ts`, `broadcast.ts`, `main.ts`, `i18n.ts`, `style.css` y `build.mjs`.

## Para G2 y G3

### G2 (interfaz)
Lo que aún dice «Pinar» es suyo:
- `BOARD_FOOTER` en `main.ts`: el pie del videomarcador y el rótulo de título de la presentación.
- La ficha «Jugador local · Club del Pinar».
- El `<title>` de `build.mjs`.

En mi rama, `View.boardFooter` vale por defecto «PRO TOUR FINALS», pero `main.ts` lo sobrescribe.

El rótulo de título de la presentación cae ahora sobre la grada lejana y los focos, con el videomarcador detrás mostrando «TÚ VS LOLA».

### G3 (jugadores, pala y bola)
La luz que les llega:
- **Principal:** `#eef3ff`, intensidad 3,1, desde el acimut 326° y a 50° de elevación, con sombra suave de intensidad 0,84.
- **Contraluz:** `#dbe5ff`, intensidad 1,15, desde el acimut 166° y a 27° de elevación. Sin sombra y apagado en calidad baja.
- **Entorno:** PMREM del estadio, con peso 0,62. No hay luz hemisférica.
- **Exposición:** 0,66 (×0,93 en bajo).

La bola conserva su brillo propio y se lee bien. La camiseta clara del rival destaca bien sobre la grada oscura.

### Riesgo de conflicto en `view.ts`
He cambiado:
- la cabecera y los imports (la línea de `textures`);
- las luces del constructor;
- el bloque de las sombras de los pies, justo después de la sombra de la bola;
- `setTier`, `load`, `frame` (una línea), `updateBoard` y la órbita.

Las líneas que crean la bola, su estela y su sombra no las he tocado; entre ellas y mi bloque queda una línea sin cambios. En `textures.ts`, `ballTexture` y `blobTexture` siguen igual.

## Pendiente

- **Medir en un móvil de verdad:**
  - los fps en medio, con 5.291 impostores y el acrílico satinado;
  - el tiempo de construir el cuenco y hornear el entorno al cargar.
- **El público** sigue sentado en la misma postura. Faltan más poses horneadas (cruzado de brazos, bebiendo, con abrigo) y algún hueco más en la grada alta.
- **La cubierta y los focos** solo salen en el plano de apertura y en los contraplanos bajos, porque la tele mira casi siempre hacia abajo. Si gustan, se puede hacer un plano de victoria desde abajo con los focos detrás.
- **El sonido ambiente** sigue siendo el de césped (`audio.loops('lawn')`, con pájaros). En un estadio de noche debería ser un murmullo de público. No es mío: queda para quien integre.
- **En el entrenamiento la grada está llena.** Quizá una pista central vacía o a medio llenar quedaría más creíble para practicar (bastaría con `crowd.mesh.geometry.instanceCount`).
- **Los nombres de los patrocinadores** son de relleno: el cliente pondrá los suyos en `MESSAGES` de `led.ts`.
