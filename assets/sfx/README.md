# Efectos de sonido

Generados con IA (ElevenLabs, a través de Magnific) para Nocodeboy Games el 12 de octubre de 2026. Son del estudio.

| Archivo | Toma original | Uso |
|---|---|---|
| pala-fuerte-1, -2 | pala-fuerte-3, -2 | golpes firmes: golpes de fondo, saque, volea, remate |
| pala-suave-1, -2 | pala-suave-1, -2 | toques: dejada, dejada de volea, bloqueo |
| bote-1, -2 | bote-1, -2 | bote en la pista, coloreado según la superficie (`audio.ts`, `SURF`), y, apagado, la bola en la red |

**Tenis (rama `tenis`, 12 oct 2026):** son las tomas del pádel, que sirven mientras no haya tomas de tenis (raqueta con cordaje y bote de una bola de tenis). Los nombres se quedan como estaban (pala, bote). Se quitaron `cristal-1`, `-2` y `-3`: el tenis no tiene paredes.

Descartadas: pala-fuerte-1 y -4 (muy flojas, un zumbido grave y un timbre metálico), pala-suave-3 (un segundo golpe a 0,35 s), pala-suave-4 (sin chasquido: un tom grave), cristal-4 (ataque doble).

Preparadas con `tools/audio/prep-sfx.py`: mono, filtro paso alto bajo el cuerpo de cada familia, inicio en t = 0, recorte con fundido, el mismo volumen dentro de cada familia, mp3 mono a 96 kb/s (42 KB en total).
