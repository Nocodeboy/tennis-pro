# Prueba Rocketbox (12 oct): Arturo con un cuerpo propio

Notas del agente de personajes y render. Una prueba: **un rival (Arturo, `reina`, el campeón) con un cuerpo de la biblioteca Rocketbox de Microsoft**, montado igual que la jugadora del pickleball 0.13, para decidir si se rehacen todos los jugadores así y se gana variedad. La simulación no cambia: solo cambian la vista y los recursos.

## Qué es

- **Rocketbox** ([github.com/microsoft/Microsoft-Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox)): 115 personas realistas con esqueleto Biped (80 huesos, con dedos y cara) y **licencia MIT**. Se pueden usar, cambiar y vender con el aviso de copyright: `assets/chars/ROCKETBOX-LICENSE.txt` (dice qué avatar es cada archivo) y el campo `license` de cada `rb_*.json`. `build.mjs` copia `assets/` entero, así que el aviso sale en `dist/`.
- **El elegido: `Male_Adult_01`**: polo de rayas, pantalón corto caqui y zapatillas, lo más parecido a una equipación de pádel de los 21 hombres. Pelo castaño abundante, cara joven y redonda.

## Cómo se monta (`art/blender/persona.py`)

Es `jugadora.py` del pickleball generalizado (cualquier persona de Rocketbox, hombre o mujer) y pasado al mango del pádel. La persona usa **el esqueleto del jugador tal cual** (los mismos 24 huesos, giros de reposo y matrices de enlace de `hero.json`); solo cambia la malla. Así le sirven todos los clips, las complexiones (`Build`), la pala y el código de los golpes.

1. Se importa el FBX y se escala a 1,70 m (en el juego se escala a la altura de cada uno, como el jugador).
2. Pose de reposo del jugador:
   - la cadera, de delante atrás, donde la suya; rodillas y tobillos **por la forma del cuerpo** (centro de cada sección), no por los huesos; el pie plano;
   - el hombro donde gira el brazo del jugador;
   - **nuevo: el brazo y el antebrazo, del largo de los del jugador** (`estirar`). Los de Rocketbox son un 11 % y un 8 % más largos que los del modelo de Meshy (la mano quedaba 7 cm más allá de la muñeca del jugador, y la pala va en la mano del jugador). Se acortan a lo largo de su hueso, sin adelgazar;
   - las manos con la palma al frente y el pulgar arriba.
3. **Los dedos se cierran con sus propios huesos** alrededor del **mango del pádel**: elíptico (13,1 × 16,3 mm de radio con el cubregrip, `gear.ts`), de 5 cm bajo el agarre a 7 cm sobre él, a la escala de 1,83 m (`ALTURA_JUEGO`). Primero la mano se mueve hasta que la palma toca el mango (2 cm hacia atrás y 2,8 cm de lado), luego cada dedo busca los ángulos que lo rodean, y al final **la piel que aún queda dentro se empuja a la superficie** y el empuje se reparte por la de alrededor (como `shapeHands`). La mano libre, medio cerrada. A él no se le aplica `shapeHands`.
4. Se hornea la pose y se pesan los vértices a los huesos del jugador (dedos a la mano, cara a la cabeza).
5. **Atlas y máscara** (1024): cuerpo, cabeza y pelo en cuadrantes. La máscara lleva la clase de cada texel en el rojo (×40: piel 0, camiseta 1, pantalón 2, calzado 3, pelo 4, otro 5) y el recorte del pelo en el verde.
   - **Clasificación nueva, general:** por triángulo, con 10 muestras del atlas dentro de él. Si la mayoría parece piel (tono anaranjado y saturado **en HSV**: en HLS el blanco roto de la camiseta salía «piel»), es piel; si no, los pies son calzado, arriba camiseta, abajo pantalón, y la cintura se decide por el color más parecido. En la textura del cuerpo de Rocketbox no hay cuello ni cara (van en la de la cabeza), así que lo que no es brazo por encima de 1,3 m es camiseta. El pelo pintado en la cabeza, por texel (oscuro, en el cuero cabelludo).
   - **La camiseta, lisa:** un cierre en gris (máximo y mínimo de 15 texels) borra las rayas del polo y deja los pliegues, para pintar encima la equipación.
6. **`zones`**: dónde acaba su ropa en la pose de reposo (mangas |x| 0,349; bajo de la camiseta 0,71 m; del pantalón 0,418 m; zapatilla 0,106 m), para que el pintor ponga los puños y el bajo donde acaban los suyos.

```bash
# la carpeta del avatar, con Export/ y Textures/ (del repositorio de Rocketbox; clon parcial, sin Git LFS)
python3 art/blender/persona.py <Rocketbox>/Assets/Avatars/Adults/Male_Adult_01            # -> assets/chars/rb_male01.json (≈10 s)
python3 art/blender/ver_modelo.py assets/chars/rb_male01.json /tmp/ver.png                 # frente, lado, cara y manos, junto al jugador
python3 art/blender/ver_modelo.py assets/chars/rb_male01.json /tmp/manos.png --manos       # las manos con el mango
```

El script deja también `/tmp/pb-<nombre>-atlas.jpg` y `/tmp/pb-<nombre>-mask.png` (la máscara en colores: piel, camiseta azul, pantalón amarillo, calzado gris, pelo marrón) para revisar la clasificación.

## En el juego

- **`chars.ts`**: `Kit.model` (el nombre del cuerpo propio), `Person` y `loadPerson`. Sin cuerpo cargado, el jugador usa el de siempre. `CharacterView` elige el cuerpo, su pintor y su material; `person` dice si lo lleva.
- **`outfit.ts`**: el pintor con máscara (`uMask`):
  - la camiseta con el corte de la equipación (paneles, canesú/franja/banda, estampado, logo), el cuello del polo en el color del ribete y los puños donde acaban sus mangas (`uCuff`);
  - el pantalón donde está el suyo, con su franja, cintura y marca, hasta su propio bajo (`uShortsHem`);
  - calcetines pintados sobre la piel hasta 0,228 m (como el jugador) y las zapatillas sobre las suyas, con su dibujo, la suela y una franja del color de acento;
  - la cara y el pelo, como son (se probó a teñir el pelo del color de la equipación, `hair`: las tarjetas del pelo parecían de plástico, con rayas);
  - material: el de los jugadores con el recorte del pelo (`alphaMap` a 512, `alphaTest`, dos caras).
- **`view.ts`**: carga los cuerpos de `PEOPLE` (`kits.ts`) en paralelo con el jugador; si uno falla, aviso en la consola y sus jugadores con el cuerpo de siempre.
- **`kits.ts`**: `PEOPLE = ['rb_male01']` y `model: 'rb_male01'` en la equipación de Arturo (`reina`). Su complexión es la de antes (1,83 m, hombros 1,03…): se aplica igual sobre su malla.
- **En la dirección:** `?rb=off`, todos con el cuerpo de siempre (para comparar; no se descarga); `?rb=all`, todos con él (para verlo jugar desde todos los lados).

## Medidas

| | Cuerpo de siempre (`hero.json`) | Rocketbox (`rb_male01.json`) |
|---|---|---|
| Archivo | 1.101 KB (lo comparten todos) | **575 KB más** (textura 60 KB, máscara 77 KB) |
| Vértices / triángulos | 12.452 | 4.803 / 7.440 |
| Carga (Node, JSON + glTF) | — | 20–100 ms, en paralelo con el jugador |
| Descarga real (página, local) | 1.128 KB en 33–150 ms | 589 KB en 85–97 ms, a la vez |
| Memoria de textura | — | ≈ 11 MB fijos (atlas 1024 con mipmaps 5,6; máscara del pintor 4; recorte 512 con mipmaps 1,4) + 5,9 MB por equipación pintada (como cualquier jugador) |

- **Pala a la bola** (`KIT=reina RB=1 npx tsx tools/poses.ts 150`, partidos de CPU y dobles, todos con la equipación y el cuerpo de Arturo, frente a `KIT=reina` sin `RB`): **idéntica en todos los golpes**, decimal a decimal (derecha p50 0,5 cm, volea 0,2, revés 0,1, remate 0,0, bajada 0,0, bandeja 13,9, víbora 10,8). Es lo esperado: el esqueleto, los clips y la pala son los mismos; solo cambia la malla.
- **Agarre** (la misma herramienta, sobre la malla deformada en 535 contactos): de la piel de la mano, p50 **4 vértices** a más de 1 mm dentro del mango (lo más hondo 5,4 mm p50, 10,5 mm máx., en la muñeca doblada), y la piel más cercana a **1,7 mm** de su superficie. En la pose de reposo (Blender): 3 vértices dentro, 4,8 mm lo más hondo.
- **Consola limpia** sin nada, con `?rb=off` y con `?rb=all` (partido de la pareja 3, Agustín–Arturo): sin avisos ni errores. Lleva su cuerpo solo Arturo (jugador 3); con `?rb=all`, los cuatro; con `?rb=off`, ninguno y no se descarga. `tsc` y `node build.mjs` limpios.
- **Capturas** (`tools/closeups.py`, semilla 7, pareja 3, `CLOSE=3`; `CAMS` admite ahora `face`, un primer plano de televisión de la cabeza): espera del saque, derecha, revés y bandeja de Arturo, de frente, de lado, manos y cara, con y sin `?rb=off`; bajada y remate con `?rb=all` (los juega Martín, `CLOSE=1`).

## Veredicto

**Funciona, pero con este avatar no queda mejor que el cuerpo de siempre: queda distinto.**

- **Mejor:** la cara. Es una persona de verdad, con ojos creíbles, y se distingue a la primera de los demás (todos, y el público, son el mismo modelo de Meshy). Las manos tienen dedos de verdad cerrados en el mango, bien ajustados. Ningún clip se rompe: espera, derecha, revés, bandeja con salto, bajada y remate se deforman bien; sin costuras, sin problemas de transparencia en el pelo y el cuello del polo queda como un polo de pádel con el ribete.
- **Peor:**
  - **el cuerpo es menos atlético:** brazos y piernas finos frente a las piernas musculadas del jugador;
  - **el pantalón llega a la rodilla** (es una bermuda cargo): parece de baloncesto, y al doblar mucho la rodilla (salto de la bandeja) el bajo se ve quebrado;
  - **las zapatillas son planas**, de pocos polígonos: aun pintadas con su suela y su ribete de acento parecen zapatillas de casa;
  - **menos polígonos** (4.803 vértices frente a 12.452): la silueta es más angulosa de cerca.
- En el plano de juego (vertical, 390×844) apenas se nota: se ve un jugador más con pantalón más largo.

## Pendiente

- **Pantalón a medio muslo:** en `persona.py`, ceñir a la pierna (y recortar) la pernera por debajo de unos 0,55 m, y pintar piel debajo; con los vaqueros de los candidatos hace falta lo mismo.
- **Zapatillas:** cambiar las suyas por las del modelo del jugador (la malla de los pies, pesada a los mismos huesos) o modelar unas en Blender.
- **Complexión:** más contorno de brazos y piernas en su `Build` (p. ej. `arms` 1,12, `legs` 1,1) para que parezca deportista; se aplica igual sobre su malla.
- **Pelo:** con el suyo queda bien; si se quiere el color de la equipación, hay que teñir sin las rayas de las tarjetas.
- **Muñeca:** al doblarla, hasta 1 cm de piel entra en el mango (5 mm de mediana); se ve poco porque la tapa el cubregrip.
- **Medir en un Android flojo** la carga (589 KB más por cuerpo) y la memoria (11 MB más).

## Pendiente

PENDIENTE

## Para los demás rivales

1. Bajar cada avatar al clon de Rocketbox (añadir su carpeta a `.git/info/sparse-checkout` y `git checkout -q HEAD`).
2. `python3 art/blender/persona.py <carpeta>` → `assets/chars/rb_maleNN.json`, y revisar la máscara (`/tmp/pb-rb_maleNN-mask.png`) y las manos (`ver_modelo.py --manos`).
3. Añadirlo a `PEOPLE` y poner `model` en la equipación del rival; una línea en `ROCKETBOX-LICENSE.txt`.

Candidatos (`rb-hombres.png`): **09, 11, 16 y 20**, con camiseta de manga corta y vaqueros (el pantalón largo habría que pintarlo como corto y las piernas debajo, como hizo la jugadora con sus vaqueros; aquí aún no está: `uShortsHem` corta el pantalón, pero la pernera de vaquero es más ancha que una pierna). Cada uno, unos 575 KB más de descarga y 10 MB de textura si juega.
