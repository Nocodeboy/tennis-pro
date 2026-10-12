# Jugadores hechos con IA en MimicPC (12 oct): cuatro cuerpos propios con TRELLIS 2

Germán: «¿podríamos usar alguna herramienta de MimicPC para mejorar los modelos y las animaciones de los jugadores?… No me quedan créditos de Magnific». Esta nota cubre los modelos. Las animaciones de vídeo están en «Pendiente».

## Qué hay

Cuatro jugadores con cuerpo, cara y pelo propios, montados en el esqueleto del jugador (los mismos 24 huesos de `hero.json`). Así les sirven todos los clips, las complexiones, la pala y el código de los golpes sin tocar nada.

| Cuerpo | Quién lo lleva | Cómo es |
|---|---|---|
| `ia_jugador_a` | Tú (`HERO`) | moreno, pelo corto oscuro, afeitado |
| `ia_jugador_b` | Martín Di Neno (tu pareja) | pelo castaño claro ondulado, barba corta |
| `ia_jugador_c` | Alejandro Galván (`bruno`) | piel morena, pelo rapado, barba de tres días |
| `ia_jugador_d` | Arturo Coeyo (`reina`) | rubio, pelo muy corto, afeitado |

- **Sustituyen a Rocketbox en Arturo.** `rb_male01` sigue en `assets/` pero ya no se carga: ver `docs/notas-04-rocketbox.md`.
- **Los demás rivales** siguen con el cuerpo de siempre.
- **La piel, la cara y el pelo son los suyos:**
  - el `skin` de sus equipaciones queda en 1, salvo el tuyo, un 5–12 % más claro: de espaldas a los focos las piernas se veían casi negras;
  - el `hair` de la equipación no se aplica.
- **Peso:** de 1,24 a 1,46 MB por cuerpo (unas 19.000 caras, textura y máscara de 1024). Se descargan en paralelo con el jugador.
- **Memoria de vídeo:** el pintor de equipaciones suelta la textura y la máscara de cada cuerpo en cuanto pinta (unos 10 MB por cuerpo); three.js las vuelve a subir de las imágenes si hace falta otra equipación.
- **Sin cuerpo cargado,** ese jugador usa el de siempre, con un aviso en la consola.
- **`?rb=off` / `#rb-off`** los quita todos, para comparar.

## Cómo se hacen

### 1. La imagen (MimicPC, Qwen-Image 2512)

La app «Image to 3D Model (Trellis 2)» de MimicPC es un ComfyUI con Qwen-Image y TRELLIS 2 instalados. Se le mandan los trabajos por su API (`/prompt`, `/upload/image`, `/history`, `/view`), sin tocar la interfaz. Los scripts quedaron en la sesión. El grafo de la imagen es el de la app: Qwen-Image 2512 fp8, 40 pasos, CFG 4 y 1328 × 1328.

**El texto:**
- Foto de estudio de cuerpo entero para un escaneo 3D.
- **La pose del jugador en reposo:** brazos en cruz unos 10° hacia abajo, codos rectos, **los puños cerrados con el pulgar encima** y el interior del puño hacia la cámara; piernas rectas con los pies algo separados; de frente.
- **La ropa:** camiseta blanca lisa ajustada, pantalón corto azul marino a medio muslo, calcetines blancos tobilleros y zapatillas de pádel blancas. Sin pala, sin muñequeras y sin logos.
- **Fondo** gris liso y luz de estudio pareja.

**Por qué así:**
- **Puños, no manos abiertas:** TRELLIS hace los dedos sueltos como láminas (se probó; ver abajo). Un puño sale sólido y en el juego la pala pasa por dentro, como agarrada.
- **Ropa blanca y marina:** el color dice qué es cada cosa (máscara) y el pintor de equipaciones pinta encima la del jugador con los pliegues de la tela.

### 2. La malla (TRELLIS 2, licencia MIT)

El grafo de la app: quitar el fondo (rembg), TRELLIS 2 a 1024, y exportar el GLB con **`decimation_target` 20.000 y textura de 2048**.

**Que TRELLIS reduzca la malla él mismo es clave:** así hornea la textura sobre la malla ya reducida. Con 300.000 caras reducidas luego en Blender, la textura se rompía en las costuras y el sombreado salía facetado.

### 3. El montaje (`art/blender/trellis_persona.py`)

```bash
python3 art/blender/trellis_persona.py <modelo.glb> assets/chars/ia_jugador_x.json --imagen <imagen de partida.png> --fuente "texto de la licencia"
python3 art/blender/ver_modelo.py assets/chars/ia_jugador_x.json /tmp/ver.png     # junto al jugador de siempre
```

1. **Se importa** el GLB, se pone de pie, mirando al frente, con 1,70 m y el sombreado suave.
2. **La pose del jugador:**
   - la cadera, de delante atrás, donde la suya;
   - cada muslo y cada pierna se giran hasta que el centro de la rodilla y el del tobillo caen en los del jugador (medidos por la forma, como `persona.py`);
   - en los brazos, el hombro, el codo y la muñeca se miden por el eje de las secciones del brazo; el brazo y el antebrazo se llevan a la dirección y al largo de los del jugador.
   - **Resultado:** rodillas y tobillos a 0,0 cm; la muñeca, donde la del jugador.
3. **Los pesos** se copian del jugador por la superficie más cercana (Data Transfer de Blender). Con las dos mallas en la misma pose, cada vértice se mueve con los mismos huesos que el jugador en ese sitio.
4. **La cara de la imagen, proyectada de frente.** La de TRELLIS sale borrosa (ojos y boca manchados), así que:
   - se renderiza la cabeza del modelo de frente;
   - MediaPipe Face Landmarker busca los 478 puntos de la cara en ese render y en la imagen;
   - la semejanza que lleva unos a otros da dónde cae cada punto del modelo en la imagen (error mediano de 1 a 3 px);
   - cada texel de la cabeza que mira de frente (la cara y el pelo, hasta 0,20 m del centro) toma su píxel, mezclado con el de TRELLIS según lo de frente que mire;
   - **también el cuello y el escote, hasta 1,33 m** (y 0,12 m del centro): el borde del cuello de TRELLIS dejaba una franja clara entre la piel y la equipación.
   - Con la misma correspondencia, la máscara usa el color de la imagen en el cuello: lo que en TRELLIS es blanco y en la imagen es pelo (más cerca del color de su pelo que del de su cara), a los lados del cuello, es pelo (los brillos de una melena), no camiseta.
   - **El pelo** que no se ve de frente (coronilla, nuca y lados) toma el color del pelo de la imagen, medido sobre la frente sin el fondo.
   - **El tono:** el resto de la piel de TRELLIS (brazos, piernas, cuello y orejas) se corrige al tono de la cara de la imagen (medido solo en la cabeza) y se aclara hasta igualar su brillo.
   - **Antes de esto:** con el ajuste solo por la silueta, la cara salía doble y desplazada.
5. **La máscara** (la de `persona.py`: piel, camiseta, pantalón, calzado y pelo), por triángulo:
   - **por el color de unas muestras:** blanco, marino, piel u oscuro (la piel morena en sombra es cálida; el pantalón, azulado);
   - **por la altura:** el blanco es camiseta por encima de 0,8 m y hasta el codo, calcetín por debajo y zapatilla bajo 0,125 m; en la cabeza, el pelo oscuro es pelo;
   - **luego, dos pasadas por vecinos:** un triángulo cambia a la clase del 70 % de los que tocan. Quita las manchas sueltas de la camiseta. El pelo no se contagia así (bajaba por la nuca hasta la camiseta).
   - **el borde de la camiseta:** los texels blancos marcados como piel junto a ella pasan a camiseta (el cuello y las mangas, sin línea blanca).
   - **el relleno:** una franja de 8 texels alrededor de cada isla de la textura toma la clase y el color del texel de la isla más cercano. El pintor lee la máscara a 1024 y la textura filtrada: en los bordes caía en el relleno blanco de TRELLIS y salían motas y líneas blancas en las costuras de la camiseta.
   - **`zones`:** manga a 0,29–0,31 m del centro, bajo de la camiseta a 0,86–0,89 m, del pantalón a 0,56–0,62 m y zapatilla hasta 0,13 m.
   - **La camiseta, lisa:** sin rayas ni motas y con los pliegues a un tercio de contraste y suavizados, para pintar encima la equipación (las arrugas oscuras de TRELLIS parecían manchas).

## Arreglos del 12 oct (tarde)

Tras verlos en el juego: el pelo de Martín (castaño también detrás y a los lados), las motas y líneas blancas de la camiseta en las costuras, la franja clara del escote, las piernas oscuras de espaldas a los focos (tu piel, un 5–12 % más clara) y el pelo que bajaba por la nuca de Arturo. Comparado con `tools/closeups.py` en los mismos momentos (semilla 7, dobles contra la pareja 3).

## Comprobado

- **Capturas en la página** (`tools/closeups.py`, semillas 7 y 11, dobles contra las parejas 2 y 3, cámaras de juego, de frente y de cara):
  - espera del saque, saque, derecha, bajada, bandeja, carrera y lamento;
  - los cuatro cuerpos se deforman bien en todos los clips;
  - las caras son personas distintas y reconocibles, también de cerca.
- **Consola limpia** salvo cuando falta un cuerpo (aviso y cuerpo de siempre).
- **`tsc` y `node build.mjs` limpios.**
- **El juego no cambia:** esqueleto, clips y pala son los mismos, así que pala a la bola es idéntico (como con Rocketbox, `notas-04-rocketbox.md`).

## Lo que no salió y por qué

- **Manos abiertas:** dedos en láminas sueltas y rosadas. Por eso se piden puños.
- **Reducir la malla en Blender** (de 300.000 a 16.000 caras): sombreado facetado y la textura rota en las costuras.
- **Pelo afro rizado (la primera versión de C):** TRELLIS lo hace como un casco con bultos y la cara no se encajaba (escala 549 px/m frente a 729). Se rehízo con el pelo rapado.

## Coste

- **Créditos de Magnific:** 0.
- **MimicPC:** unas 2 h de máquina, a 1,49–1,99 $/h, del saldo de 7,87 $ del mes.
- **Cada jugador nuevo:** unos 2 minutos de imagen y 1 de TRELLIS.

## Pendiente

- **Animaciones desde vídeo:**
  - **Fuente:** clips de pádel con licencia Creative Commons BY, un jugador de cuerpo entero con la cámara quieta y el fondo liso (canal KNSU de YouTube): saque, cortado, remate liftado, derecha, volea, remate, globo, bandeja y bajada.
  - **Problema:** YouTube bloquea la descarga desde el servidor de la sesión, así que se bajan con `yt-dlp` en el portátil de Germán.
  - **Conversor:** traído del pickleball 0.13 (`tools/video_pose.py`, `art/blender/video_fuente.py` y el modo `video` de `padel_clip.py`).
- **Atribución:** al publicar, citar los vídeos de KNSU (CC BY) en los créditos.
- **Más rivales con cuerpo propio** (Paco, Lola y Nuria). Si se quieren mujeres, el mismo método sirve.
- **La melena de Martín, de lado:** ya tiene el color de su pelo, pero los mechones que miran de lado conservan algo del dibujo de TRELLIS (brillos más claros). Solo se nota en primer plano.
- **El escote** sigue el borde de los triángulos: a un lado del cuello se ve un pequeño escalón de cerca.
- **Las sombras** del brazo y la pala sobre la camiseta salen con bordes duros (es el mapa de sombras del juego, no la textura).
- **Medir en un Android flojo** la carga: 4 cuerpos de unos 1,3 MB cada uno, más el de siempre.
