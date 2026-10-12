# Animación del pádel 0.3 (12 oct): bajada, remates por 3 y por 4, potencia y bandeja más baja

Notas del agente de render y animación. La simulación (golpe `bajada`, `power` y `special` en `ShotSpec` y en el evento `hit`, `ballCue` → `'bajada'`, `Plan.wall`) la hace el agente de juego; aquí solo cambia la vista. Todo se midió con las mismas semillas que en la 0.2.

## Qué cambia

| Golpe | Cómo se ve |
|---|---|
| **Bajada de pared** (derecha) | De lado, la pala arriba detrás del hombro, baja sobre la bola a la altura del hombro y termina cruzada en la cadera izquierda. Sin salto |
| **Bajada de revés** | Lo mismo en espejo: la pala arriba a la izquierda, baja sobre la bola por delante y termina abajo a la derecha |
| **Remate plano** | Sin cambios (el remate de captura con su salto) |
| **Remate por 3** | El plano, más violento: el final va un 25 % más rápido y un 15 % más lejos, y el pecho se dobla sobre la bola (0,32 rad) |
| **Remate por 4** («liftado») | Desde el contacto, la pala cepilla la bola hacia arriba y adelante, pasa por encima y baja **delante** del cuerpo, no cruzada. La cabeza de la pala da la vuelta sobre la bola |
| **Bandeja** | Salta menos cuanto más baja se golpea (ver abajo) |
| **Potencia** | Desde el contacto: el destello de la pala, la estela de la bola y la velocidad del final |

### La bajada
- **Un golpe propio:** `bajada` y `bajada_l` en `SwingKind` (`chars.ts`).
  - El cuerpo es el del remate de captura (`smash_mocap`): de lado, la pala arriba, la mano libre hacia la bola. Solo el 25 % de sus piernas (`legs`), para que no haya tijera ni salto.
  - El revés usa el clip del revés.
  - La pala sigue una trayectoria propia (`BAJADA`, dos curvas de Bézier):
    - arriba, detrás del hombro, hasta 0,24 s antes del contacto;
    - baja sobre la bola, acelerando (9 m/s en el contacto);
    - termina en la cadera contraria en 0,3 s.
  - La IK lleva el brazo durante todo el golpe.
- **La bola, por delante y al lado:** a 0,75 m de los pies y 0,45 rad del pecho, hacia el lado de la pala. Al terminar el golpe, el cuerpo se cuadra.
- **La cara de la pala** va más cerrada en el contacto (`FACE.bajada`, −0,3 rad, en `keyposes.ts`).
- **Cuándo la juega la vista:** el golpe solo se sabe en el contacto, así que la vista lo adivina (`bajadaGuess`).
  - Hace falta todo esto: bola entre 1,3 y 1,95 m, en su campo, a más de 6,3 m de la red, después del bote y saliendo del cristal de fondo.
  - Para saber si sale del cristal de fondo usa `plan.wall === 'back'`, la misma regla que `isBajada` del cerebro. Si el plan no trae `wall`, mira si la bola viene hacia la red.
  - Si la bola está a más de 1,95 m, la vista juega un remate.

### Remates por 3 y por 4
- **Cuándo se nota:** `special` llega con el golpe, igual que bandeja y víbora. La preparación y el salto son los mismos para todos (`SPECIAL` en `chars.ts`).
- **Por 3:** el final del clip, más rápido y más largo, con el pecho doblado.
- **Por 4:** su propia trayectoria desde el contacto:
  - sube 16 cm y avanza 30 cm a los 0,06 s;
  - pasa por encima de la bola a los 0,13 s;
  - acaba 1,15 m por debajo del contacto y 0,5 m por delante a los 0,3 s, bajando con el cuerpo al caer del salto;
  - la pala se gira hacia delante y abajo.

### Potencia (`power` del evento `hit`, 0…1)
- **Por qué solo desde el contacto:** la potencia se decide al soltar.
- **El final del golpe** va `1 + 0,5 × (power − 0,5)` de rápido (`POWER` en `chars.ts`): fuerte, ×1,25; colocado, ×0,75. Por 3 lo multiplica por 1,25 más.
- **El destello de la pala** (`POWER_FX` en `view.ts`):
  - mide de 14 a 50 cm, con una opacidad de 0,3 a 0,85 y una duración de 0,07 a 0,16 s;
  - las chispas son más o menos numerosas y rápidas según la potencia.
- **Hasta el siguiente golpe**, en un golpe fuerte:
  - la estela de la bola empieza a menor velocidad y es más larga y más brillante;
  - el borrón de la bola es más largo.
  - En uno colocado, todo es más tenue.
- **Por 3 y por 4** cuentan como fuertes: como mínimo 0,9 y 0,75.
- **De dónde sale el dato:** `View.onHit` lo lee del evento `hit` que `main.ts` está procesando (`match.events`). No hace falta cambiar la llamada. También se le puede pasar el evento como 7.º argumento.

### Señal «BAJADA» y colores
- **`view.cue`:** `'attack' | 'block' | 'bajada' | null`. El anillo de los pies y el círculo del sitio se ponen:
  - naranja para atacar;
  - rosa (`HUE.bajada`, `#ff5cc8`) para la bajada.
- **`view.attackCue`** sigue funcionando como antes.
- **Falta en `main.ts`** (agente de UI): poner `view.cue = cueNow.kind`. Hasta entonces, el anillo rosa no sale. La etiqueta puede usar `aimHue('bajada', true)`.
- **La mira** de la bajada es rosa (`KIND_HUE.bajada`). Los golpes por arriba siguen en naranja.

### Bandeja más baja
- **El salto de la bandeja** crece desde 2,15 m, 1 m por metro, hasta 0,58 m (`OVER.skipFrom` y `skipK`):

| Bola | Salto ahora | Salto antes |
|---|---|---|
| 2,30 m | 15 cm | 30 cm |
| 2,50 m | 35 cm | 50 cm |
| 2,73 m o más | 58 cm | — |

- **El remate** sigue saltando desde 2,0 m.
- **El alcance de pie** con el brazo estirado es de unos 2,15 m.

## Comprobado
- **`tools/stage.ts`**, golpes escenificados (pala a la bola en el contacto):

| Golpe | Pala a la bola | Salto |
|---|---|---|
| Bajadas de derecha, de 1,30 a 1,75 m | 0,0 cm | — |
| Bajadas de revés, a 1,35 y 1,60 m | 0,0 cm | — |
| Remate plano | 1,5 cm | — |
| Por 3 | 2,9 cm | — |
| Por 4 | 1,9 cm | — |
| Bandeja de 2,30 a 2,60 m | 3,8–4,0 cm | 15–45 cm |
| Bandeja a 2,85 m | 14 cm | — |

- **`tools/poses.ts 90`:** 8 partidos, 43.200 fotogramas. El simulador ya juega bajadas, por 3 y por 4. Pala a la bola (cm; mediana / p90 / máx.):

| Golpe | Antes (0.2) | Ahora |
|---|---|---|
| Bajada (n = 23) | — | **0,0 / 0,8 / 2,3** |
| Bajada, `FORCE=1` (n = 73) | — | 0,0 / 0,0 / 2,3 |
| Bandeja | 16,8 / 20,8 / 25,1 (bola a 2,85 m, salto 58 cm) | **14,8 / 22,0 / 33,4** (bola a 2,49 m, salto 34 cm) |
| Víbora | 16,9 / 20,8 / 26,0 | 14,9 / 23,3 / 23,3 |
| Derecha | 0,5 / 2,7 / 8,4 | 0,4 / 1,5 / 6,1 |
| Revés | 0,1 / 5,0 / 20,9 | 0,1 / 3,8 / 34,4 (un caso; la simulación ha cambiado entre medias) |
| Saque | 0 | 0 |

  - Cambios de golpe que se ven: 14 (antes, 19).
  - Espera congelada: 2,2 %.
- **Consola limpia** en las capturas. `tsc` está limpio en mis archivos y `node build.mjs` construye.
- **Capturas** de cada golpe (`tools/stage.py`, de lado y de frente a tres cuartos, de −0,45 a +0,45 s). Se ven golpes de pádel:
  - la bajada baja sobre la bola y cruza;
  - el revés va en espejo;
  - el por 4 sube por encima de la bola cuando el plano ya está bajando;
  - el por 3 dobla el cuerpo;
  - la bandeja a 2,30 m es un saltito de 15 cm con el brazo estirado.

## Pendiente
- **La conjetura de bajada falla mucho con la CPU.** De 65 bolas altas que la CPU espera tras el cristal de fondo (la regla `isBajada`), solo 25 las juega como bajada. Las demás:
  - 25 globos;
  - 8 dejadas;
  - 4 derechas;
  - 3 golpes automáticos.

  En esas, la vista prepara una bajada (la pala arriba) y el golpe es otro. El globo termina subiendo (`LOB_FINISH`), pero la bajada sobre la bola ya se ha visto.

  **Propuesta para el agente de juego:** decidir la bajada al planear el contacto, por ejemplo con un campo en el plan, o no esperar la bola alta si no va a ser una bajada.
- **El revés de bajada** se ve algo de frente en el contacto: el clip de revés de Meshy gira poco los hombros.
- **La bandeja en partido** se queda a 15 cm de mediana, cuando escenificada se queda a 4 cm. En partido el cuerpo no siempre llega bajo la bola. El tirón de la bola hacia la pala (`paddlePull`) lo tapa.
- **Probar en un móvil de verdad:** el destello fuerte (50 cm) desde la cámara del juego y el doblado del por 3.

## Herramientas
- **`tools/stage-lib.ts`, `tools/stage.ts` y `tools/stage.py` (nuevos):** golpes escenificados, sin simulación detrás.
  - Un `CharacterView` con un `Match` de mentira y un único contacto elegido a mano: tipo, `power`, `special` y altura.
  - `stage.ts` da los números en Node (`npx tsx tools/stage.ts [prefijo…]`).
  - `stage.py` hace las hojas de capturas en la página real. Necesita `stage.js` junto a la página: `npx esbuild tools/stage-lib.ts --bundle --format=iife --global-name=__stage --outfile=<dist>/stage.js`.
- **`tools/poses.ts`:**
  - pasa `power` y `special` a `onHit`;
  - separa en la tabla los fallos de la conjetura: `bajada(lob)` (la vista jugó bajada y el golpe fue un globo) y `bajada→smash`;
  - con `FORCE=1` fuerza bajadas, por 3 y por 4 y potencias en las bolas que tocan.

## Archivos
- **`src/render/chars.ts`:**
  - `bajada` y `bajada_l`, `BAJADA` y `bajadaGuess`;
  - `SPECIAL` (por 3 y por 4), `POWER` y `finishPace`;
  - `onHit(…, shot)` y el salto de la bandeja (`OVER.skipFrom`).
- **`src/render/keyposes.ts`:** la cara de la pala y el brazo libre de las bajadas.
- **`src/render/view.ts`:**
  - `HUE.bajada` y `KIND_HUE.bajada`, `cue`;
  - `onHit` lee el evento;
  - `POWER_FX` (destello, estela y borrón).
- **`tools/poses.ts`**; nuevos `tools/stage-lib.ts`, `tools/stage.ts` y `tools/stage.py`; esta nota.
