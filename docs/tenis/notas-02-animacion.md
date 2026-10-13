# Animaciones desde vídeo: la primera tanda (13 oct)

Germán: «Creo que ya están los vídeos». Se bajaron en el portátil los 43 vídeos de la lista (`docs/tenis/videos-cc.md`, script `tools/descargar_clips_raqueta.bat`) y se probaron los 12 de la primera tanda con el método del pádel (`docs/notas-golpes-video.md`):
1. MediaPipe saca el esqueleto de cada fotograma (`tools/video_pose.py`).
2. Blender lo pasa a nuestro muñeco (`art/blender/padel_clip.py … video`).

## Resultado en una línea

**Funciona con los vídeos grabados de lado y falla con los de frente o de espaldas.** Entra en el juego el saque; la volea de derecha se convirtió, pero no mejora la que había.

| Vídeo | Vista | Resultado |
|---|---|---|
| Saque liftado de Zverev (`nJdUu-5M_2I`, Jim Fawcette) | de lado y algo de frente, cámara lenta, 4K | **Entra en el juego.** Saque de verdad: lanzamiento, trofeo con las rodillas dobladas y la espalda arqueada, caída de la raqueta, salto y caída con la pierna izquierda atrás. El brazo de la raqueta se pierde detrás del cuerpo entre el lanzamiento y la caída de la raqueta (ver abajo) |
| Volea de derecha (KNSU, `B7L-MpPws4M`) | de lado | Convertida, pero en el juego **no mejora** la volea hecha a mano (golpe corto desde la espera). Con la raqueta enganchada a la bola por la IK, el golpe quedaba torcido. Se queda fuera |
| Volea alta de revés (KNSU, `TA_FViUBXLU`) | de frente | **Mal.** MediaPipe no sabe si el tronco va hacia delante o hacia atrás: el jugador salía echado atrás, mirando al cielo |
| Revés a dos manos (KNSU, `QNFNQCKmK7M`) | tres cuartos de frente, 480p | Dudoso. Se parece al revés de captura que ya hay, que es mejor |
| Revés de Nadal (`8BkW9uLqkPM`, Court Level Fans) | **de espaldas** en el contacto | **Mal.** De espaldas, MediaPipe confunde la izquierda con la derecha y el muñeco sale mirando hacia atrás |
| Derechas (KNSU `SFyLnEbfE-8`, Baute `ICJfRUo3DFE`), Shelton | de frente, o detrás y delante | Sin convertir: la misma pega que la volea de revés |
| Pádel (víbora, bandeja, chiquita) y pickleball | de frente o de espaldas | Sin convertir, por lo mismo |

**Por qué:** MediaPipe ve bien el cuerpo en la imagen (los puntos en 2D caen sobre las articulaciones), pero la profundidad la adivina. De lado, el golpe va por el plano de la imagen y la profundidad casi no importa; de frente o de espaldas, todo el golpe es profundidad. **Para que un vídeo sirva, el golpe tiene que verse de lado y con el brazo de la raqueta del lado de la cámara.**

## El saque en el juego

- **Clip:** `assets/anims/serve_kick_video.json` (1,53 s), en la tabla `VIDEO` de `src/render/chars.ts`; `?video=off` vuelve al saque de antes.
- **Tiempo real:** el vídeo va a cámara lenta y se pasó a ×9,9 (247,6 fotogramas por segundo):
  - del lanzamiento (fotograma 205 del corte de 20 a 43 s) al contacto (445) hay 0,97 s;
  - del principio del clip (fotograma 185) al contacto, 1,05 s, que es `SERVE_CLIP.contact` y el `SERVE_WINDUP` de la simulación;
  - la gravedad de la bola en el lanzamiento da algo más de ×8, así que es del orden correcto.
- **El lanzamiento:** la bola sale de la mano a 0,08 s (`SERVE_VIDEO_TOSS`; antes 0,38). Un saque liftado lanza alto: la bola sube unos 0,8 m por encima del contacto.
- **El brazo de la raqueta:**
  - entre 0,4 y 1,0 s el vídeo no lo ve (la cámara ve el lado izquierdo del jugador y el brazo va por detrás) y MediaPipe lo pone pegado al tronco;
  - ahí el brazo es el del saque hecho a mano (`SERVE_ARM` en `keyposes.ts`), con la muñeca y el codo donde estaban respecto al hombro, que se mueve con el cuerpo del vídeo, mezclado con el del vídeo en 0,1 s a cada lado (`SERVE_VIDEO_ARM`);
  - en el contacto vuelve a ser el del vídeo, con la IK de siempre llevando la raqueta a la bola.
- **El salto:** es el del juego (`SERVE_JUMP`), porque la conversión deja los pies en el suelo en cada fotograma.
- **La espera antes de sacar:** es la del saque de antes (`serveset`); el clip entra fundiéndose en 0,2 s.
- **Medido** (`tools/render/stage-tenis.ts saque`): el punto dulce a la bola en el contacto, 7,0 cm (antes 7,3) y el mismo salto, 38 cm.
- **Comprobado en la página** (`tools/closeups.py`, dobles, semilla 7, del lanzamiento a la vuelta a la espera), por orden:
  1. sujeta la bola delante;
  2. lanza con la espalda arqueada;
  3. trofeo con las rodillas muy dobladas;
  4. salta con la raqueta abajo, detrás;
  5. contacto en el aire con el brazo estirado;
  6. cae inclinado hacia la pista con la raqueta cruzada;
  7. vuelve a la espera.
- **Créditos:** el vídeo de Jim Fawcette va en Ajustes → Créditos. Se corrigió además la línea de KNSU: en el tenis solo se usa su revés, para el cortado y la volea de revés.

## Cambios en la conversión

En `art/blender/video_fuente.py`, todos opcionales con variables de entorno:
- **`PROFUNDIDAD=1`** (ya existía, sin usar): rehace la profundidad con la imagen y el largo de cada hueso. Hace falta en todos estos vídeos; sin ella, la volea salía con los brazos encogidos y el cuerpo tumbado.
- **`TRONCO=delante`** (nuevo): el tronco y el cuello solo se inclinan hacia el pecho. Para los golpes de fondo y las voleas grabados de frente; no arregló la volea de revés, cuyo fallo era el giro del cuerpo.
- **`MANO=firme`** (nuevo): la mano sigue al antebrazo, con la muñeca recta. Los puntos de los dedos con la mano borrosa daban vueltas a la raqueta de un fotograma a otro (en el saque, saltos de 20 a 30 m/s). Va bien en el saque; en la volea no, porque la raqueta va con la muñeca echada atrás.

Herramienta nueva, `tools/video_golpes.py`:
- los golpes de un vídeo, por los picos de velocidad de la muñeca;
- una hoja con los fotogramas de alrededor, para elegir la repetición y el contacto;
- con `--escala`, la velocidad en tiempo real en los vídeos a cámara lenta.

Órdenes del saque:

```bash
ffmpeg -ss 20 -to 42.9 -i saque_liftado_zverev_nJdUu-5M_2I.mp4 -an zverev_20_43.mp4
python3 tools/video_pose.py zverev_20_43.mp4 zverev.json        # luego "fps": 247.6 en el JSON
MANO=firme PROFUNDIDAD=1 RED=camara python3 art/blender/padel_clip.py . video zverev.json assets/anims/serve_kick_video.json serve_kick_video 185 572
```

## Lo que queda

- **Para los golpes de fondo y las voleas del tenis, el pack de captura de Motion Cast sigue siendo la vía buena.** Los vídeos que de verdad sirven son pocos.
- **De la lista, los que quedan de lado:**
  - las derechas laterales de Fonseca (`5lf-t4obkkU`, 4K, el jugador pequeño);
  - el saque cortado de Raonic (`fofFYc-obTI`, desde la grada);
  - el saque de Nadal (`6NRbLwWxx6w`).
- **En pádel y pickleball** casi todo lo de la lista está grabado de frente o desde detrás: con este método no van a salir bien.

## Segunda pasada: lo que vale para el prototipo (13 oct, tarde)

Germán: «De momento para la versión prototipo vamos a sacar lo que nos valga y luego veo si merece la pena pillar el pack». Se revisaron los vídeos que quedaban grabados de lado o casi:

| Vídeo | Resultado |
|---|---|
| **Saque de Nadal** (`6NRbLwWxx6w`, Jim Fawcette, vertical, 60 fps a cámara lenta) | **Entra** como segundo saque (ver abajo) |
| Derechas de Fonseca (`5lf-t4obkkU`, TK Tennis) | **No vale.** La primera parte está grabada desde detrás de la pista; la segunda, de lado, pero con cámara en mano, el jugador pequeño (335 px) y a tiempo real con mucho desenfoque. Convertida (del 44 al 62 s, fotogramas 290–400), en el muñeco parece más un baile con los brazos abiertos que una derecha. La de captura (Rokoko) es mejor |
| Saque cortado de Raonic (`fofFYc-obTI`) | Desde la grada, en diagonal por detrás y lejos: no se probó |
| Saques de Vinay Easwaran (`H2wDveavYpc`) | De frente: la misma pega que la volea de revés |
| Remate (`7ElgcnvmVHk`) | Lejos y en movimiento: no se probó |
| Desplazamientos de Federer (`pPFw6sJmCUU`) | Partido con la cámara siguiéndole; la carrera que hay (CMU) ya es captura |

### El segundo saque: Nadal

- **Clip:** `assets/anims/serve_nadal_video.json` (1,55 s), papel `serve_b` (`SERVE_B` en `chars.ts`).
- **El vídeo:**
  - recortado a su franja vertical (660–1260 px) y reflejado, porque es zurdo;
  - pasado a tiempo real ×4 (grabado a 240 y puesto a 60 fps): del lanzamiento (fotograma 160) al contacto (362) quedan 0,84 s;
  - el tramo va del fotograma 110 al 482, con el contacto en 1,05 s, como el otro saque.
- **El lanzamiento:** sale de la mano a 0,21 s, más bajo que el liftado de Zverev. La vista lo toma de cada jugador (`CharacterView.tossRelease`).
- **El brazo y la cara de la raqueta:** el mismo arreglo que el de Zverev (`SERVE_VIDEO_ARM` y `FACE.serve_b` en `keyposes.ts`).
- **Quién saca con él:** De Miñor, Siner y tu pareja Marcel (`serve: 'b'` en `kits.ts`); tú y los demás, con el de Zverev.
  - `?serve=b` pone a todos a sacar con el de Nadal;
  - `?serve=a`, con el de Zverev.
- **Medido** (`stage-tenis.ts saque` con `?serve=b`): el punto dulce a 9,3 cm de la bola en el contacto (el de Zverev, 7,0) y el mismo salto.
- **En la página:** se ve un saque distinto. Trofeo más erguido, lanzamiento más bajo, la misma caída hacia la pista.
- **Créditos:** los dos vídeos de Jim Fawcette.

### Lo que queda tras esta pasada

- **Ya no hay en la lista ningún vídeo de lado que aporte algo.** Para los golpes de fondo y las voleas haría falta captura de verdad (el pack de Motion Cast) o vídeos grabados a propósito, de lado.
- **Pádel y pickleball:** nada nuevo desde vídeo; lo de la lista está grabado de frente.
