# Golpes de pádel desde vídeo (12 oct)

Germán: «Es importante que hagamos lo de los vídeos». Los clips de pádel de YouTube con licencia CC BY se bajan en su portátil, se convierten en movimiento con el conversor del pickleball 0.13 y se ponen en el jugador.

## De dónde salen

**Fuente:** el canal KNSU de YouTube, con licencia CC BY: un jugador por clip, de cuerpo entero, con la cámara quieta de lado, en un pabellón con la pared lisa. Cada clip es un solo golpe, de 2 a 7 s, a 720p.

**Descarga:** el servidor de la sesión no puede bajarlos, porque YouTube le pide iniciar sesión, y eso no se salta. Se bajan en el portátil con `Vídeos\padel-clips\descargar_clips_padel.bat`:
- un doble clic baja yt-dlp y Deno de sus páginas oficiales de GitHub (no hace falta Node);
- luego, cada vídeo con su audio aparte en `.m4a`;
- deja un registro en `descarga.log`.

Se bajaron 10 de 11 a la primera. La víbora daba un 403 de YouTube al reanudarla; `reintentar_vibora.bat` la baja desde cero y por trozos de 10 MB, y así llegó. Pero **no sirve**: es un reportaje del World Padel Tour (Sebastián Nerone hablando a cámara, una presentadora y planos lejanos de partidos), sin ningún golpe de cuerpo entero con la cámara quieta, y con su marca y sus patrocinadores. Se descarta.

| Archivo | Título en YouTube | Qué es de verdad | Contacto (vídeo) |
|---|---|---|---|
| `saque_hw3AeXSWblI` | saque | saque: bote, pala atrás y arriba, golpe bajo la cintura | f62, 2,48 s (25 fps) |
| `remate_pTGTSzR8K30` | remate | remate plano: pose de trofeo de perfil, sin salto | f43, 1,43 s |
| `remate_liftado_ib_9FiYuSfs` | remate liftado | remate liftado (el «por 4») | f58, 1,94 s |
| `bajada_0B17bkGJ0B8` | bajada | bajada de pared: pala arriba detrás de la cabeza, golpe a la altura de la cabeza | f48, 1,60 s |
| `derecha_ct4qEtYR4uk` y `volea_Vbak4BUCTsw` | derecha / volea | **el mismo vídeo**, y es un **revés** a una mano a la altura del pecho | f33–34, 1,12 s |
| `bandeja_51Xns6-r31c` | bandeja | una **derecha a la altura del hombro**, con la pala atrás a un lado (no hay pose de remate) | f39, 1,30 s |
| `cortado_VBc_tZnlbbA` | cortado | derecha cortada a la altura de la cadera | f51, 1,70 s |
| `globo_1CHJvA8ixS8` | globo | globo de abajo arriba (el clip trae antes otro movimiento) | f187, 6,24 s |
| `salida_de_pared__RS6hrCD5SQ` | salida de pared (Padel Star) | 250 s de repeticiones en pista, con el jugador pequeño dentro de un marco con gráficos | — |

Los contactos se midieron a ojo en los fotogramas: la bola sale de la pala. La velocidad de la muñeca que da MediaPipe tiene demasiado ruido para esto, y además a veces confunde la mano izquierda con la derecha.

## Conversión

```bash
python3 tools/video_pose.py <vídeo.mp4> /tmp/<golpe>.puntos.json
RED=derecha VERTICAL=1 python3 art/blender/padel_clip.py dist video /tmp/<golpe>.puntos.json assets/anims/<clip>.json <nombre> <desde> <hasta>
python3 art/blender/padel_clip.py dist ver assets/anims/<clip>.json /tmp/ver.png 0.1 <contacto>
npx tsx tools/swing-path.ts <golpe>
```

- **`VERTICAL=1`:** la cámara de KNSU está inclinada entre 7° y 22°. Sin esa corrección, el jugador sale echado hacia delante desde los tobillos.
- **`RED=` (nuevo):** dice dónde está la red en la imagen: `derecha`, `izquierda`, `camara` o `fondo`. El clip se gira para que esa dirección sea el frente del jugador (`retarget(..., giro_z)`).
  - Los vídeos están grabados de lado. Con `frente`, que toma hacia dónde mira el actor en un fotograma, el saque salía con el hombro equivocado hacia la red.
  - Los golpes de derecha y los remates van hacia la derecha de la imagen; el revés, hacia la izquierda.
- **Los tramos** van desde poco antes de la preparación hasta el final del golpe.
  - **Saque:** del fotograma 40 al 90, para que el contacto caiga a 0,88 s, como espera la simulación (`SERVE_WINDUP` = 0,87).
  - **Revés:** del 10 al 54. **Bajada:** del 10 al 80. **Remate:** del 0 al 67.

## En el juego (`src/render/chars.ts`, tabla `VIDEO`)

`?video=off` vuelve a los clips de antes para comparar.

| Golpe | Antes | Ahora | La pala en el contacto (`swing-path.ts`) |
|---|---|---|---|
| Saque | Meshy, generado con IA | `serve_video` | 0,83 m de alto, 35 cm a la derecha y 16 cm delante, a 5,3 m/s (antes 0,68 m y 8,1 m/s) |
| Revés | Meshy, generado con IA | `backhand_video`: a una mano, el hombro derecho hacia la red | 1,29 m de alto, 43 cm a la izquierda y 23 cm delante; 7,3 m/s, lo más rápido del golpe |
| Bajada | el cuerpo del remate de tenis de Rokoko y el recorrido de `BAJADA` | `bajada_video`, con su propio recorrido (`own`) | 1,41 m de alto, 61 cm a la derecha y 18 cm delante, a 7 m/s |
| Remate, bandeja, víbora, por 3 y por 4 | el remate de tenis de Rokoko | `smash_video`: trofeo de perfil y abierto, sin salto (el salto lo pone el juego) | contacto a 1,47 s, la pala a 2,09 m, casi encima de la cabeza |

- **Saque:** `keyposes.ts` sigue poniendo encima la mano libre, que suelta la bola, y la postura de espera del principio.
- **Saque:** la cara de la pala se gira hacia la red en el contacto (`FACE.serve` en `keyposes.ts`, solo con el saque de vídeo). La mano del clip la dejaba casi de canto: 82° de la dirección de la bola, frente a 63° con el de Meshy. Ahora, 65°.
- **Bajada:**
  - es el cuerpo de una bajada de verdad: de perfil, los brazos abiertos y un paso hacia la bola; la mitad de las piernas es del clip (`legs` 0,5);
  - la pala sigue su propio recorrido, movido para que pase por la bola (`SwingDef.own`), en vez del de `BAJADA`;
  - con el cuerpo nuevo y el recorrido viejo, la pala se quedaba a 9 cm de la bola.
- **Remates:** la posición del jugador respecto a la bola se fija a mano (`SwingDef.reach`: 0,30 m).
  - El remate de vídeo golpea casi encima de la cabeza. Con su propio alcance, el jugador se ponía justo debajo de la bola, arqueado y con la cabeza bajo la pala; la bandeja era donde peor se veía.
  - El contacto se tomó un fotograma más tarde del medido (1,47 s), con la pala ya algo por delante: en el vídeo, la bola está en la pala entre esos dos fotogramas.

### Comprobado en la página (`tools/closeups.py`, semilla 7, dobles contra la pareja 3)

Comparado con `?video=off`:
- **Saque:**
  - antes: la pala apenas iba atrás;
  - ahora: sube por detrás por encima de la cabeza, y en el golpe le da a la bola a la altura de la rodilla, con un paso adelante;
  - el final queda alto.
- **Bajada:** de perfil y abierto; antes, el cuerpo erguido del remate de tenis. La pala llega a la bola igual que antes.
- **Revés:** (ver abajo, «Revés en la página»).
- `tsc` y `node build.mjs` limpios.

### Medido (`FORCE=1 npx tsx tools/poses.ts 90`: 8 partidos de 90 s, mismas semillas)

Antes es `?video=off`.

| Medida | Antes | Ahora |
|---|---|---|
| **Remate:** pala a la bola, mediana / p90 / máx. | 0 / 0 / 0 cm | 2,0 / 4,6 / 5,2 cm |
| **Remate:** golpe delante de la cadera | 11 cm | **27 cm** |
| **Bandeja:** pala a la bola | 0 / 15,3 / 21,0 cm | 2,1 / 11,2 / 22,8 cm |
| **Bandeja:** golpe delante | 15 cm | **23 cm** |
| **Víbora:** pala a la bola | 13,5 / 20,6 cm | 11,1 / 17,8 cm |
| **Víbora:** golpe delante | 10 cm | 17 cm |
| **Remates:** cara de la pala contra la dirección de la bola | 73° | **35°** |
| **Bajada:** pala a la bola | 0 / 0,5 cm | 1,6 / 2,1 cm |
| **Bajada:** cara de la pala | 54° | 75° (peor) |
| **Bajada:** golpe delante | 56 cm | 44 cm |
| **Saque:** pala a la bola | 0 cm | 0,4 / 6,8 cm |
| **Saque:** cara de la pala | 63° | 65° |
| **Revés:** pala a la bola | 0,1 / 6,0 cm | 0,2 / 9,9 cm |
| **Revés:** golpe delante | 61 cm | 40 cm |

- **Bajada:** la cara de la pala no mejoró con ninguna inclinación de `FACE.bajada` (−0,65, −0,3 y 0,05 dan 75°). Es lo único que quedó peor que antes. En las capturas no se nota: la pala está en la bola, de frente.
- **El resto** (cuello, tronco, deslizamiento de los pies y cambios de golpe) queda casi igual. Las excepciones:
  - la cabeza en el contacto va 3° más girada respecto a la bola (mediana de 37° a 40°);
  - en el revés, el pie apoyado resbala algo más (p90 de 0,6 a 0,9 m/s).

### Comprobado en la página (semilla 5, dobles contra la pareja 3; remates, bandejas y víboras)

Comparado con `?video=off`:
- **Remate:** en vez del trofeo recogido del tenista, el abierto de un jugador de pádel: la pala atrás y arriba y la mano libre apuntando a la bola. Golpea arriba y termina cruzando hacia la cadera.
- **Bandeja:** ya no se queda debajo de la bola. La pala arriba a la derecha, la bola en la pala, el cuerpo más erguido y el final cruzado.
- **Víbora:** igual de bien. Al final, la cabeza se inclina algo hacia el hombro: es el tronco de la captura.

## Sonido

Lo que se quería del audio, golpes y cristal de verdad, **no sale de estos vídeos**:
- **KNSU:** los 9 clips están en silencio digital (−91 dB). El canal los subió mudos.
- **Padel Star:** lleva una voz explicando encima, y el audio solo llega a unos 6 kHz. Los golpes no se pueden separar limpios.

La vía que queda para tener golpes, cristal, malla y bote reales de pádel es **grabarlos con el móvil en una pista**, como la guía del pickleball (`docs/pickleball/notas-*` y `grabacion.md` en el proyecto). Bastan unos minutos de peloteo con el móvil quieto cerca de la red.

## Licencias y créditos

- **KNSU (YouTube):** CC BY. Al publicar hay que citarlos en los créditos: el nombre del canal y el enlace a cada vídeo usado, que son `hw3AeXSWblI` (saque), `ct4qEtYR4uk` (revés), `0B17bkGJ0B8` (bajada) y `pTGTSzR8K30` (remate).
- **Ajustes → Créditos** (nuevo, en español e inglés):
  - KNSU, con el título original de cada vídeo y su enlace, el canal y la licencia (CC BY 3.0, la de YouTube); el revés se cita como «Padel: Drive (4)», que es como se titula aunque el gesto sea un revés;
  - la cita que pide CMU;
  - Rokoko (la derecha);
  - la IA de los cuerpos (Qwen-Image; TRELLIS 2, MIT);
  - el sonido y la música.
- **Rokoko:** la licencia del pack sigue sin confirmar para una tienda (`concepto.md`, 0.2).

## Pendiente

- **Bajada:** la cara de la pala (75°, antes 54°).
- **Otros clips convertidos y sin poner:**
  - globo, para la derecha de abajo arriba;
  - cortado, que podría ser la derecha del jugador de fondo;
  - remate liftado, para el por 4;
  - la «bandeja», una derecha alta, para la volea alta de derecha.
- **Probar en el móvil:** cuatro clips más (unos 210 KB en total).
