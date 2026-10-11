# Gráficos 0.8 (10 oct): subir la calidad general

Germán, sobre la 0.7: «los gráficos se siguen viendo un poco raros». Preguntado qué, respondió: «la calidad general debería ser más alta». Los jugadores ya le gustan. Referencias: *Pickleball Stars*, *Premier Pádel*, una retransmisión de pickleball profesional y *Top Spin 2K25*.

Esta parte toca solo el render: la imagen, la pista, el público, las gradas y el fondo. No toca los personajes (`chars.ts`), el HUD, el control ni la simulación.

## Qué se veía «barato» o «raro» en la 0.7

Lo miré en móvil vertical (390 × 844), móvil horizontal (844 × 390) y ordenador (1280 × 720), con los tres niveles de calidad y con los planos de televisión. De más a menos impacto:

1. **El público eran maniquíes.** Figuras de cajas y cilindros, con los antebrazos como palitos claros, todos en la misma postura y en filas regulares. Un 30 % de asientos vacíos salteados. En horizontal y en ordenador la grada ocupa el 35–40 % de la pantalla, así que era lo primero que se veía.
2. **Gradas desnudas.** Escalones de hormigón gris claro con un banco azul corrido, sin asientos, sin respaldo ni cierre por detrás. Parecían una escalera de prueba.
3. **Fondo de maqueta.** Árboles en forma de «brócoli» todos iguales, un césped de rayas muy saturado y un cielo casi blanco en el horizonte. En los planos de televisión (reacciones, repeticiones, presentación) el fondo es medio cuadro.
4. **Pista «de plástico».** Un azul uniforme sin desgaste ni textura que se leyera, y un verde de fondo enorme y plano.
5. **Luz plana y poco contraste.** La luz del cielo entraba como un relleno gris, así que todo tenía el mismo brillo y la imagen no tenía profundidad.
6. **Arriba del móvil vertical, hormigón y césped vacíos** detrás del fondo de la pista (el 15 % de la pantalla).
7. **En calidad alta, la sombra de una torre de focos cruzaba la pista** en diagonal. En el móvil se leía como un fallo.
8. **En calidad baja, los jugadores flotaban:** sin mapa de sombras, solo había una mancha tenue bajo los pies.
9. **Dientes de sierra en calidad media:** no había MSAA, sino FXAA aplicado después del grano.

Lo que ya estaba bien y no he tocado: la bola, la red calculada por píxel, las líneas con antialias propio y los jugadores.

## Qué cambia

### La imagen (nuevo `src/render/look.ts`)
- **Curva de tono AgX con un aspecto «punchy»** y el etalonaje de televisión metido dentro: contraste, saturación, altas luces cálidas, sombras frías y un tramado de medio paso contra las bandas del cielo. Es el mismo en los tres niveles. Antes el etalonaje era una pasada aparte que el nivel bajo no tenía.
- **Medio y bajo dibujan directamente en pantalla** con el MSAA del propio lienzo. Desaparecen el objetivo de render HDR, la pasada de salida, la del etalonaje y el FXAA: tres pasadas de pantalla completa menos en móvil, y bordes más limpios.
  - Medio sube la resolución de 1,5 a 1,75 veces la del CSS. El ahorro de las pasadas lo paga.
  - Alto sigue con MSAA ×4 en HDR y un bloom suave.
- **Viñeta por CSS** sobre el lienzo, por debajo del HUD: no gasta GPU. Se quita el grano.
- **Entorno nuevo.** El cielo, ahora más azul y con algunas nubes, se hornea sin el disco del sol, con un anillo de arbolado oscuro y el césped debajo. Pesa 0,32 (antes 0,2) y la luz hemisférica baja de 0,35 a 0,05. El relleno de sombra sale del cielo de verdad y los reflejos ven árboles, no un horizonte blanco.

### La pista
- **Fondo, pista y cocina son ahora una sola superficie** (antes, tres) con su propia pintura en una textura de unos 3 cm por texel:
  - zonas gastadas, más pálidas y algo más lisas, detrás de las líneas de fondo y a lo largo de las líneas de cocina;
  - marcas de goma de zapatillas;
  - las pasadas del rodillo;
  - polvo junto a las vallas.

  Encima va un grano de arena en mosaico (color, rugosidad y relieve).
- **Las líneas tienen otra rugosidad** que la resina (pintura más lisa).
- **Colores algo más profundos:** pista `#285592`, cocina `#3466a4` y fondo `#33683f`. La curva AgX tiraba el verde hacia el turquesa.
- **El césped** pierde saturación, sus rayas son más suaves y tiene zonas secas de octubre en manchas de decenas de metros. Las manchas se calculan por posición, así que no se nota el mosaico.

### El público (`src/render/crowd.ts`, reescrito)
- **Son personas de verdad: impostores del propio modelo del jugador.** Al cargar, el modelo se coloca en cinco poses y se renderiza desde 5 u 8 azimuts y 2 alturas a un atlas de 896 × 1232: sentado, sentado con la cabeza girada (a la izquierda es la misma imagen en espejo), echado hacia delante, de pie con los brazos arriba y de pie aplaudiendo. Una textura guarda el detalle de sombreado y las normales; otra, qué parte del cuerpo es cada píxel (camiseta, pantalón, piel o pelo).
- **Cada espectador es un cuadrado de dos triángulos** que elige el fotograma según el ángulo desde el que se le ve y funde los dos más cercanos. Se recolorea con su ropa, su piel y su pelo. La luz, las sombras y la niebla son las de la escena.
- **Siguen igual** las reacciones (levantarse, saltar, brazos, aplaudir, «ooh», echarse hacia delante), la cabeza que sigue la bola (ahora con la pose de cabeza girada) y el balanceo en el asiento.
- **La API no cambia:** `react`, `tension`, `watch` y `update`.
- **Más lleno:** un 14 % de asientos vacíos (antes, un 30 %). Hay menos pelo canoso y menos gorras blancas.
- **Coste:** todo el público es una llamada de dibujo y unos 600 triángulos (antes, 53.000). El horneado se hace una vez, durante la pantalla de carga. Si el juego baja a calidad baja, se rehace a media resolución, que ocupa la cuarta parte de memoria.

### Gradas y recinto
- **Asientos individuales** de plástico azul marino (asiento y respaldo) en lugar del banco corrido. El escalón es algo más oscuro.
- **Un muro trasero en cada grada** con las pancartas del torneo, que la cierra.
- **Una pantalla cortavientos al fondo**, como en los torneos del circuito: tela oscura de 2,7 m con dos pancartas y una barandilla de acero. Cierra la parte de arriba del móvil vertical, donde antes se veían el paseo y el césped vacíos. El videomarcador sigue sin salir en la cámara de juego.
- Las pancartas y la pantalla van en la misma malla y el mismo atlas que las vallas: **ninguna llamada de dibujo nueva.**
- **Las torres de focos ya no dan sombra en ningún nivel.** Sus cabezas tienen ahora una cara de 18 lámparas redondas.

### El fondo (nuevo `src/render/backdrop.ts`, imágenes de Magnific)
- **El pinar de El Tiemblo:** cinco pinos hechos con IA (pinos piñoneros con su copa de sombrilla, pinos resineros y uno joven) en un atlas de 1024 × 512 (`assets/env/trees.webp`, 121 KB). Hay unos 140 árboles: cartas que giran sobre el tronco hacia la cámara, todos en **una llamada de dibujo**. Antes eran 90 bultos de 22.000 triángulos.
  - Una fila de pinos tras la valla del fondo asoma por encima de la pantalla cortavientos en el móvil vertical.
- **La Sierra de Gredos** al fondo, sobre una línea de bosque: un panorama hecho con IA y recortado contra el cielo (`assets/env/pano.webp`, 44 KB), en un cilindro de 190 m alrededor de todo. La segunda mitad va en espejo para que cierre sin costura, y le afecta la niebla, así que se ve lejano.
- **Se cargan a la vez que los jugadores** y el juego no los espera. Si fallan, el parque queda sin árboles, pero no hay error.

### Calidad baja
- **Sombra alargada de cada jugador** en la dirección contraria al sol, en el mismo cuadrado que la mancha de contacto: no añade ninguna llamada de dibujo. Los jugadores ya no flotan.

## Coste

`renderer.info` en el mismo fotograma de un peloteo, con `tools/look.py`, la semilla 424242 y la pasada de sombras y el posprocesado incluidos:

| Nivel y pantalla | Llamadas de dibujo antes → después | Triángulos antes → después | Texturas |
|---|---|---|---|
| Medio, 390 × 844 | 61 → 56 | 156.000 → 90.000 | 37 → 34 |
| Medio, 844 × 390 | 59 → 54 | 156.000 → 90.000 | 36 → 34 |
| Medio, 1280 × 720 | 59 → 54 | 156.000 → 90.000 | 36 → 34 |
| Alto, 390 × 844 | 75 → 70 | 209.000 → 90.000 | 48 → 47 |
| Alto, 844 × 390 y 1280 × 720 | 73 → 68 | 209.000 → 90.000 | 47 → 47 |
| Bajo, 390 × 844 | 43 → 41 | 117.000 → 50.000 | 33 → 34 |
| Bajo, 844 × 390 y 1280 × 720 | 41 → 39 | 117.000 → 50.000 | 32 → 34 |
| Medio, dobles, 390 × 844 | 79 → 74 | 230.000 → 163.000 | 41 → 38 |

Además, en medio ya no hay pasadas de pantalla completa (antes había tres: salida, etalonaje y FXAA).

**Memoria de GPU estimada** con un script de verificación (no versionado): móvil de 390 × 844 con densidad 2, contando texturas, atlas, entorno, sombras, el búfer del lienzo con MSAA y el posprocesado:

| Nivel | Antes | Después | Por qué |
|---|---|---|---|
| Alto | 185 MB | 201 MB | +11 del atlas del público, +5 de texturas (pinos, panorama, pintura de la pista) |
| Medio | 80 MB | 91 MB | +11 del atlas, +9 del lienzo a 1,75× y −14 del objetivo de render que ya no existe |
| Bajo | 48 MB | 55 MB | +2,8 del atlas a media resolución y +5 de texturas |

**Tamaño:** `dist/index.html` pasa de 923 KB (944.881 bytes) a 933 KB (955.536 bytes), +10 KB. Aparte van `assets/env/trees.webp` y `assets/env/pano.webp` (165 KB), que se cargan junto a los 1,9 MB de los jugadores.

**Comprobado:**
- Al bajar de nivel en caliente (alto → medio → bajo) no hay ningún error ni aviso de consola.
- `npx tsc` pasa.
- Las capturas salen de un renderizado por software: sirven para juzgar el aspecto, no los fps.

**Créditos de Magnific:** dos imágenes con GPT 2.5 en calidad baja y fondo transparente. El atlas de cinco pinos (2048 × 1024) costó 30; el panorama de montañas (3072 × 512) se presupuestó en 60 y la API dijo 30. El saldo bajó de 1.612 a 1.522 (90), pero la cuenta es compartida.

## Archivos

- **Nuevos:**
  - `src/render/look.ts`: la curva y la viñeta.
  - `src/render/backdrop.ts`: el pinar y el panorama.
  - `assets/env/trees.webp` y `assets/env/pano.webp`.
- **Cambiados:**
  - `src/render/view.ts`: niveles, entorno, sombras de los pies, carga.
  - `src/render/venue.ts`: pista, gradas, pantalla cortavientos, focos, césped.
  - `src/render/textures.ts`: pintura de la pista, grano, césped, sombra alargada.
  - `src/render/crowd.ts`: el público, reescrito.
- **Sin tocar:** `chars.ts`, `director.ts`, `broadcast.ts` y `main.ts`.

## Pendiente

- **Medir en un móvil de verdad** los fps de medio a 1,75× con MSAA y el horneado del público al cargar. Mi estimación es de 50 a 150 ms dentro de la pantalla de carga.
- **Los pinos son fotos con la luz horneada desde la izquierda.** En los contraplanos de televisión la luz no cuadra del todo, aunque en los árboles casi no se nota.
- **La pantalla cortavientos es tela lisa.** Si se quiere, se le puede poner trama de malla.
- **Las gorras** del público son el pelo recoloreado (solo una de cada diez y en tonos oscuros). Una gorra de verdad necesitaría otra pose horneada.
- **Rivales con modelo propio:** el horneado vale igual para cualquier modelo con el mismo esqueleto (se podría mezclar público de varios modelos).
- **Las capturas de televisión no son exactamente los mismos fotogramas:** `tools/tv.py` no siembra el azar, así que el partido sale distinto antes y después.
