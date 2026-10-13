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
