# Golpes de pádel desde vídeo (12 oct)

Germán: «Es importante que hagamos lo de los vídeos». Los clips de pádel de YouTube con licencia CC BY se bajan en su portátil, se convierten en movimiento con el conversor del pickleball 0.13 y se ponen en el jugador.

## De dónde salen

**Fuente:** el canal KNSU de YouTube, con licencia CC BY: un jugador por clip, de cuerpo entero, con la cámara quieta de lado, en un pabellón con la pared lisa. Cada clip es un solo golpe, de 2 a 7 s, a 720p.

**Descarga:** el servidor de la sesión no puede bajarlos, porque YouTube le pide iniciar sesión, y eso no se salta. Se bajan en el portátil con `Vídeos\padel-clips\descargar_clips_padel.bat`:
- un doble clic baja yt-dlp y Deno de sus páginas oficiales de GitHub (no hace falta Node);
- luego, cada vídeo con su audio aparte en `.m4a`;
- deja un registro en `descarga.log`.

Se bajaron 10 de 11. La víbora se cortó a mitad con un 403 de YouTube; al volver a lanzar el `.bat`, retoma lo que falta.

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
| Bajada | el cuerpo del remate de tenis de Rokoko | `bajada_video` (solo el cuerpo) | sin cambio: el recorrido de la pala sigue siendo el de `BAJADA` |

- **Saque:** `keyposes.ts` sigue poniendo encima la mano libre, que suelta la bola, y la postura de espera del principio.
- **Bajada:** el cuerpo de una bajada de verdad: de perfil, los brazos abiertos y un paso hacia la bola. La mitad de las piernas es del clip (`legs` 0,5).

### Comprobado en la página (`tools/closeups.py`, semilla 7, dobles contra la pareja 3)

Comparado con `?video=off`:
- **Saque:**
  - antes: la pala apenas iba atrás;
  - ahora: sube por detrás por encima de la cabeza, y en el golpe le da a la bola a la altura de la rodilla, con un paso adelante;
  - el final queda alto.
- **Bajada:** de perfil y abierto; antes, el cuerpo erguido del remate de tenis. La pala llega a la bola igual que antes.
- **Revés:** (ver abajo, «Revés en la página»).
- `tsc` y `node build.mjs` limpios.

### El remate de vídeo, preparado pero sin usar

`assets/anims/smash_video.json` está listo:
- contacto a 1,43 s, con la pala a 2,12 m justo encima de la cabeza;
- final hacia la cadera izquierda;
- sin salto.

En la página el remate quedaba mejor que el de tenis. Pero la bandeja, la víbora y los remates por 3 y por 4 se construyen sobre el clip del remate (`OVER` y `SPECIAL`, ajustados al de tenis), y con este la bandeja salía peor: el jugador se ponía justo debajo de la bola, arqueado hacia atrás y con la pala sobre la cabeza.

En el pádel hay más bandejas que remates, así que hace falta ajustar `OVER` antes de usarlo: dónde se pone el jugador respecto a la bola y lo que se queda del clip en la bandeja.

## Sonido

Lo que se quería del audio, golpes y cristal de verdad, **no sale de estos vídeos**:
- **KNSU:** los 9 clips están en silencio digital (−91 dB). El canal los subió mudos.
- **Padel Star:** lleva una voz explicando encima, y el audio solo llega a unos 6 kHz. Los golpes no se pueden separar limpios.

La vía que queda para tener golpes, cristal, malla y bote reales de pádel es **grabarlos con el móvil en una pista**, como la guía del pickleball (`docs/pickleball/notas-*` y `grabacion.md` en el proyecto). Bastan unos minutos de peloteo con el móvil quieto cerca de la red.

## Licencias y créditos

- **KNSU (YouTube):** CC BY. Al publicar hay que citarlos en los créditos: el nombre del canal y el enlace a cada vídeo usado, que son `hw3AeXSWblI` (saque), `ct4qEtYR4uk` (revés) y `0B17bkGJ0B8` (bajada), más `pTGTSzR8K30` si se usa el remate.
- El juego aún no tiene página de créditos; ya estaba pendiente por el pack de Rokoko (`concepto.md`, 0.2).

## Pendiente

- **El remate de vídeo:** ajustar la bandeja y la víbora sobre él (ver arriba).
- **Otros clips convertidos y sin poner:**
  - globo, para la derecha de abajo arriba;
  - cortado, que podría ser la derecha del jugador de fondo;
  - remate liftado, para el por 4;
  - la «bandeja», una derecha alta, para la volea alta de derecha.
- **La víbora:** volver a lanzar el `.bat`.
- **Probar en el móvil:** tres clips más (unos 150 KB en total).
