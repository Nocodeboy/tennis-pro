# Ataque y bloqueo (0.8, agente A, 10 oct)

Notas del cambio «el ataque como gran decisión». Todo medido con el bot de pulgares (`tools/thumb.ts`, que usa el `Input` y el `HumanController` reales) y con la página real. «Antes» es la 0.7 con las mismas semillas.

## Qué cambia para el jugador

- **La bola atacable se ve.** Cuando la bola que te llega se podrá golpear por encima de la red con margen, el círculo de la pista y el aro de tus pies se ponen **naranjas** (y laten), sale **«¡ATÁCALA!»** al lado del jugador durante un segundo (pequeño, en la pastilla de siempre, nunca sobre la bola) y el móvil hace un **doble tic**. Funciona igual con los indicadores mínimos.
- **Tres gestos con el pulgar derecho:**
  - **Arrastrar despacio coloca** como antes: dejada, drive o globo según dónde apuntes.
  - **Deslizar rápido hacia arriba (un latigazo) ataca:** una aceleración plana (o un remate si la bola viene por encima de la cabeza). Por defecto va **al cuerpo del rival, bajo** (pasa por las rodillas). Si antes del latigazo habías arrastrado a un sitio, va ahí. El ángulo del latigazo la tuerce hacia un lado.
  - **Tocar sin arrastrar bloquea:** una bola suave y baja a la cocina. Sirve sobre todo cuando te atacan.
- **Ordenador:** **F** (o el **botón derecho** del ratón) es el ataque: mantén y suelta en el dorado; con ← → lo llevas a un lado. Un **toque corto de Espacio** es el bloqueo. Espacio con flechas sigue apuntando como antes, y el latigazo del ratón también ataca.
- **El ataque escondido desaparece.** En la 0.7, apuntar al fondo con una bola alta en la red aceleraba sin que lo supieras. Ahora un arrastre lento siempre coloca y acelerar es un gesto propio.
- **Defensa.** Cuando el rival te acelera o remata, aparece el aro de tiempo sobre la bola (también con indicadores mínimos). Un toque mientras está dorado es un bloqueo limpio; un toque fuera de tiempo, o con el dedo aún apoyado cuando llega la bola, es un bloqueo malo (algo peor que el golpe automático).
- **Riesgo de verdad.** Acelerar una bola que llega por debajo de la cinta se paga: con más de 20 cm por debajo, una de cada cuatro acaba en la red o fuera. Atacar la bola alta casi nunca falla. Soltar el latigazo en el dorado cuenta más que en una colocación: fuera del dorado el ataque sale 0,04 más sucio (`ATTACK.rough`).
- **El golpe automático ya no ataca:** resetea a la cocina. La única excepción es la bola por encima de la cabeza en la red, que sigue rematando sola (ver «Remate automático»).
- **Tutorial, consejos y «Cómo se juega»:** la primera bola atacable y el primer ataque que recibes enseñan el gesto («Aro naranja: desliza rápido hacia arriba · ¡ataque!» y «Te atacan · toca en el dorado, sin arrastrar: bloqueo»). Hay un párrafo nuevo en «Cómo se juega» y dos consejos en la pausa, en español y en inglés.

## Los gestos (cifras)

`FLICK` y `TAP` en `src/input.ts`. Se miden en píxeles de un móvil de 390 px y crecen con la pantalla (`Input.scale`).

- **Latigazo:** el dedo se levanta mientras aún va a **650 px/s o más** (medido en los últimos 80 ms), tras recorrer al menos **24 px** en ese tiempo y a menos de **55°** de la vertical hacia arriba. Lo que lo distingue de apuntar es la velocidad en el momento de soltar: quien coloca frena y espera al aro antes de levantar el dedo. Referencias:
  - un latigazo de pulgar recorre 40–120 px en 60–120 ms (500–1.500 px/s);
  - Hammer.js llama «swipe» a 300 px/s, pero eso lo alcanza un arrastre rápido para apuntar.
- **Toque:** como mucho **0,3 s** y sin alejarse más de **14 px** de donde cayó el dedo.
- **Si la bola llega a mitad de gesto:**
  - con el dedo en pleno latigazo, cuenta como ataque;
  - con el dedo de un toque aún apoyado, cuenta como bloqueo tardío.
- `tools/review/gestures.ts` prueba 29 casos por los manejadores de eventos reales y salen los 29 bien:
  - toques, pulsaciones quietas, arrastres lentos y rápidos;
  - latigazos a 60 y 120 Hz, desde quieto o tras apuntar, de lado y hacia abajo;
  - ratón, botón derecho, Espacio, Espacio con flechas, F y F con flechas;
  - las herramientas antiguas que pulsan «a mano».

## Cuándo es atacable una bola (umbral con datos)

`ATTACKABLE` en `src/sim/brain.ts`. Una bola es atacable si se cumple todo esto:

- se golpea al menos **10 cm por encima de la cinta**, a menos de **3 m de la red** (más atrás tiene que venir 12 cm más alta por metro);
- o viene por encima de la cabeza a menos de **4,2 m**;
- es del tercer golpe en adelante;
- no es una volea desde la cocina ni una bola que va fuera;
- hay tiempo para preparar el golpe (dificultad como mucho 0,35).

**Cómo se decidió.** Con `FORCE` (`tools/review/attack08.ts`), el bot ataca la mitad de las bolas al azar, sean como sean. Así se compara el mismo tipo de bola atacada y sin atacar. La tabla da la ventaja de atacar: puntos ganados − perdidos − errores en los dos golpes siguientes, por cada 100 bolas. Son 16 partidos por rival, medio y bueno juntos, con el riesgo bajo la cinta ya puesto.

| Altura del contacto sobre la cinta | En la línea de cocina | De 2,6 a 3,6 m | De 3,6 a 5 m |
|---|---|---|---|
| Más de 20 cm por debajo | −22 (error 24 %) | −15 | −8 |
| De 20 cm por debajo a la cinta | +11 | −9 | −15 |
| 0–10 cm por encima | +17 | 0 | −1 |
| 10–20 cm | +17 | – | – |
| 20–30 cm | +11 | – | – |
| 30–50 cm | +25 | – | – |
| Más de 50 cm | +48 | – | – |
| Por encima de la cabeza | +15 | +19 | −45 |

- **El destino de entonces era la cadera.** Con el destino final (centro del cuerpo, ver más abajo), atacar vale algo más.
- **La posición del rival no cambia la decisión.** Por encima de la cinta en la cocina, atacar suma +19 con el rival atrás y +40 con el rival en la red. Por eso el aviso no mira si el rival está «a tiro».
- **Las bolas que llegan muy apuradas** (dificultad mayor de 0,35) casi nunca se pueden atacar a tiempo. Por eso no se avisan.

## Riesgo de acelerar una bola baja

`ATTACK.lowRisk` multiplica, solo en el ataque del humano, el riesgo de golpear fuerte desde debajo de la cinta (`attackRisk`). Medio, `FORCE` al 50 %, ventaja de atacar en la línea de cocina:

| `lowRisk` | Más de 20 cm por debajo | De 20 cm por debajo a la cinta |
|---|---|---|
| 1 (lo de la CPU) | −3 (error 9 %) | +16 |
| 2,5 | −20 (error 22 %) | +12 |
| **3 (elegido; medio y bueno juntos)** | **−22 (error 24 %)** | **+11** |
| 4 | −29 (error 33 %) | +3 |

Con 1, acelerar una bola a los tobillos no costaba nada. Con 3, una bola baja es un riesgo real y una a la altura de la cinta todavía puede salir bien.

## Adónde va el ataque por defecto

Medio contra Nuria y Reina, 48 partidos:

| Destino sin apuntar | % de puntos (Nuria / Reina) | El ataque gana el punto en sus dos golpes siguientes |
|---|---|---|
| Cadera del lado de la pala, 0,8 m tras los pies | 46 / 36 | 33 % |
| Costado (0,75 m al lado de la pala) | 48 / 36 | 33 % |
| Pies, del lado de la pala | 49 / 37 | 37 % |
| **Centro del cuerpo, bajo (elegido)** | **50–53 / 39** | **46–50 %** |
| Centro del cuerpo, a la cintura | 50 / 34 | 46 % |

Al centro del cuerpo la CPU tiene que apartarse para elegir derecha o revés. Con el rival en la red, la profundidad mínima (cocina + 1,2 m) hace que la bola pase por las rodillas.

## Números: antes → después

**Reparto de los golpes del humano** (`attack08.ts` y su equivalente en la 0.7, 24 partidos por rival; rango entre los cinco rivales):

| Humano | Aceleraciones, antes | Aceleraciones, ahora | Ataques con el gesto (aceleración o remate), ahora | Bloqueos (toques), ahora | Automáticos, antes → ahora |
|---|---|---|---|---|---|
| Novato | 1–3 % | 2–3 % | **3–5 %** | 3–9 % | 57–67 → 49–60 % |
| Medio | 4–7 % | 6–9 % | **10–13 %** | 6–16 % | 30–40 → 22–28 % |
| Bueno | 6–12 % | 9–15 % | **13–20 %** | 10–19 % | 11–21 → 7–9 % |

- **Antes**, las aceleraciones salían del ataque escondido.
- **Ahora**, todas son una decisión. Los remates de bola por encima de la cabeza siguen siendo del 3–10 %.
- **Dentro del objetivo (novato 3–8 %, medio 8–15 %):** los ataques con el gesto. Las aceleraciones solas quedan algo por debajo (medio 6–9 %), porque buena parte de las bolas atacables vienen por encima de la cabeza y salen como remate (remates: novato 3–6 %, medio 4–7 %, bueno 5–10 %).

**Qué pasa con los avisos «¡Atácala!»** (bolas que jugó con el aviso; 24 partidos por rival):

| Humano | Avisos por punto | Atacados | Atacados: gana / pierde / error / sigue | Sin atacar: gana / pierde / error / sigue |
|---|---|---|---|---|
| Novato | 0,5–0,9 | 28 % | 68 / 0 / 0 / 32 % | 23 / 5 / 1 / 70 % |
| Medio | 0,6–1,3 | 62 % | 63 / 1 / 0 / 37 % | 33 / 4 / 0 / 63 % |
| Bueno | 0,7–1,4 | 86 % | 64 / 0 / 0 / 36 % | 37 / 1 / 0 / 61 % |

- **El aviso no engaña:** atacar una bola avisada gana el punto en los dos golpes siguientes el 63–68 % de las veces y casi nunca sale mal (0–1 %).
- **Los ataques sin aviso** (impaciencia, bolas a la altura de la cinta) ganan el 23–24 % y acaban en error el 1–9 %.

**Defensa** (ataques de la CPU que el humano devolvió):

| Humano | Los bloquea con un toque | Bloqueos limpios / tardíos | Tras el bloqueo: gana / pierde / error / sigue | Tras el automático: gana / pierde / error / sigue |
|---|---|---|---|---|
| Novato | 15 % | 61 / 38 % | 15 / 5 / 2 / 78 % | 5 / 15 / 5 / 74 % |
| Medio | 38 % | 62 / 34 % | 16 / 4 / 4 / 76 % | 7 / 15 / 7 / 71 % |
| Bueno | 84 % | 62 / 35 % | 13 / 7 / 7 / 73 % | 7 / 14 / 10 / 70 % |

El bloqueo convierte un ataque recibido en un punto que sigue. Con el automático, el atacante gana un 14–15 % de esos puntos enseguida y el que defiende falla otro 5–10 %. Un tercio de los toques del bot llegan tarde (el dedo aún apoyado al llegar la bola): son bloqueos malos, y por eso la ventana es justa.

**Escalera individual** (`tools/bot.ts 24 1`, % de partidos y, entre paréntesis, de puntos; antes → ahora):

| Humano | Paco | Lola | Bruno | Nuria | Reina |
|---|---|---|---|---|---|
| Novato | 100 (72) → 100 (74) | 71 (53) → 96 (60) | 21 (43) → 25 (44) | 0 (26) → 4 (31) | 0 (16) → 0 (19) |
| Medio | 100 (90) → 100 (92) | 100 (76) → 100 (80) | 100 (67) → 100 (75) | 58 (50) → 71 (54) | 4 (38) → 21 (44) |
| Bueno | 100 (99) → 100 (97) | 100 (87) → 100 (88) | 100 (87) → 100 (87) | 100 (66) → 96 (70) | 67 (55) → 63 (56) |

- **Se mantiene quién gana a quién.** El humano gana de −2 a +8 puntos por pareja (+3 de media).
- **Las que más se mueven:** novato contra Lola (53 → 60 % de puntos) y medio contra Bruno y Reina (+8 y +6).
- **Ayuda 0 y 2** (`bot.ts 12 0` y `12 2`, % de puntos de la 0.7 → ahora): el mismo dibujo, con más ruido.
  - Ayuda 0: novato 68 / 54 / 42 / 29 / 20 → 77 / 63 / 42 / 22 / 24; medio 91 / 79 / 70 / 42 / 37 → 92 / 79 / 70 / 58 / 43; bueno 99 / 87 / 86 / 71 / 47 → 96 / 89 / 83 / 67 / 53.
  - Ayuda 2: novato 85 / 58 / 46 / 33 / 23 → 85 / 66 / 50 / 35 / 28; medio 98 / 83 / 71 / 48 / 37 → 96 / 78 / 75 / 62 / 45; bueno 100 / 90 / 85 / 68 / 47 → 99 / 89 / 87 / 66 / 59.
- **De dónde sale** (novato contra Lola, 48 partidos, % de puntos):
  - la 0.7: 55;
  - lo nuevo sin gestos: 52;
  - solo bloqueo: 55;
  - solo ataque: 60;
  - todo: 59.
- **Es el efecto buscado:** la bola alta que antes se le escapaba con el automático ahora la castiga.

**Lo que vale cada decisión** (`tools/review/aimvalue.ts`, bueno; % de puntos contra Paco / Bruno / Reina; entre paréntesis, la 0.7):

| Variante | Paco / Bruno / Reina |
|---|---|
| Sin apuntar ni gestos (solo el automático) | 71 / 25 / 7 (77 / 19 / 6) |
| **Sin apuntar, pero ataca las bolas naranjas y bloquea** | **90 / 77 / 32** |
| Apunta todo, nunca en el dorado | 98 / 76 / 40 (98 / 83 / 51) |
| Apunta todo, siempre en el dorado | 98 / 89 / 66 (99 / 85 / 63) |

- **Atacar la bola alta y bloquear son ya las decisiones que más pesan:** solas, sin colocar nunca, llevan al bueno de 25 a 77 % de puntos contra Bruno.
- **El dorado vale más que antes** (contra Reina, de 40 a 66). Un ataque fuera del dorado sale algo más sucio, y en esa variante también el arrastre se queda corto: suelta 0,44 s antes del contacto y el dedo no llega. Con arrastre instantáneo (`DRAG_V=99999`) «apunta, nunca en el dorado» da 97 / 81 / 41.
- La variante «sin apuntar» de `aimvalue.ts` quita también los gestos nuevos, para que se compare con la de la 0.7.

**Dobles** (`tools/bot-doubles.ts 12 1`, % de puntos; antes → ahora):
- novato: 80 / 59 / 51 / 28 → 76 / 73 / 56 / 37;
- medio: 82 / 72 / 60 / 45 → 83 / 72 / 60 / 49;
- bueno: 91 / 75 / 69 / 51 → 85 / 85 / 71 / 48.

Con 24 partidos, medio y bueno (medido antes de los dos últimos retoques: el toque tardío y la aspereza del ataque):
- medio: 83 / 72 / 61 / 45 → 84 / 75 / 61 / 45;
- bueno: 89 / 78 / 68 / 51 → 84 / 78 / 65 / 50.

Nadie deja una bola alcanzable (0 %), ningún partido se atasca y el peloteo más largo baja de 60 a 46 golpes.

**Sin fallos:** `tools/review/fuzz.ts 40`, con toques y latigazos por el camino real, juega 40 partidos y 526 puntos, con 56 ataques y 41 bloqueos, sin errores ni atascos.

## Remate automático: se queda

La bola por encima de la cabeza en la red, sin apuntar, se sigue rematando sola. Sin ese remate (`AUTO_SHOT.putAway = false`, 24 partidos), el novato pierde puntos (78 / 60 / 43 / 34 / 21 → 77 / 59 / 43 / 28 / 21; contra Nuria, 6) y el medio no cambia. Además, no es una aceleración escondida:
- devolver alta una bola por encima de la cabeza es regalar el remate al rival;
- el automático remata peor que el gesto: en la 0.7, el remate automático ganaba enseguida el 34–50 % y el apuntado el 74–78 %. Atacar sigue compensando.

## API para el entrenamiento (C)

Todo es de solo lectura y barato:

- `ballCue(m, p, plan)` en `src/sim/brain.ts` devuelve qué pide la bola que llega a `p` en ese contacto: `'attack'`, `'block'` o `null`. El HUD usa `human.cue(m, p)`, que lo calcula con el círculo (o con el contacto a su alcance).
- `attackable(m, p, plan)`: la bola es atacable (`ATTACKABLE`).
- `underAttack(m, p)`: la bola que le llega es un ataque. Es una aceleración o un remate del otro lado, o un drive de más de 13 m/s a un jugador a menos de 4,2 m de la red (`UNDER_ATTACK`).
- **Evento `hit` con `intent`:**
  - `'attack'`: el latigazo (o F, o el botón derecho);
  - `'block'`: el toque.

  El `kind` sigue siendo el del golpe: `speedup` o `smash` en el ataque, `dink` o `drop` en el bloqueo. No se ha creado un tipo de golpe nuevo, para no tocar las animaciones ni la IA. Un bloqueo bien hecho es `intent: 'block'` con `timing: 'perfect'`.
- **Pulgar virtual:** `input.aimDown(t)`, `input.aimMove(dx, dy, t)` y `input.aimUp(t)` sirven para los retos y las pruebas. El tiempo va en segundos y el reloj puede ser el de la simulación. `input.gestureNow()` dice en qué gesto se convierte una pulsación que aún no se ha soltado.
- **En la página:** `window.__pb.cue` da el aviso que se ve ahora mismo.
- **Constantes:** `ATTACK` (destino, riesgo bajo la cinta), `BLOCK` (bloqueo, ventana y calidad), `ATTACKABLE`, `UNDER_ATTACK` y, en `input.ts`, `FLICK` y `TAP`.
- **Para los retos:**
  - «Ataca la bola alta»: cuenta como acierto un `hit` del humano con `intent: 'attack'` sobre una bola con `ballCue === 'attack'`.
  - «Defiende o bloquea»: un `hit` con `intent: 'block'` sobre una bola con `ballCue === 'block'`, mejor si es `timing: 'perfect'` y el punto sigue.

## Para los demás agentes

- **B (CPU):** no se ha tocado `AIController`. Puntos a mirar:
  - **El riesgo de acelerar bajo la cinta:** la CPU sigue con `attackRisk` tal cual y el humano lo tiene multiplicado por 3 (`ATTACK.lowRisk`). Si B quiere que la CPU también pague más sus aceleraciones desde abajo, es esa función.
  - **El bloqueo de la CPU:** contra las aceleraciones del humano bloquea bastante bien las que van a la cadera. Las que van al centro del cuerpo y bajas le cuestan más (ver «Adónde va el ataque»).
  - **`AUTO_PUNISH`:** sigue leyendo `timing === 'auto'`. Un bloqueo con toque no cuenta como automático.
- **D (animaciones):** el ataque usa los clips de `speedup`/`smash` y el bloqueo los de `dink`/`drop`, sin nada nuevo. Si se quiere un bloqueo corto («punch»), el evento `hit` trae `intent: 'block'`.
- **E (gráficos), cambio mínimo en `view.ts`:**
  - `HUE.attack` (el mismo naranja que el ataque al apuntar);
  - `view.attackCue`, que pone en naranja el círculo y el aro de los pies, que laten un poco.

## Archivos

- **Míos:**
  - `src/input.ts`: gestos, F, botón derecho, pulgar virtual;
  - `src/human.ts`: ataque, bloqueo, `cue`;
  - `tools/thumb.ts` y `tools/humans.ts`: el bot ataca, bloquea y arrastra a la velocidad de un dedo;
  - `tools/review/attack08.ts` (medida), `tools/review/gestures.ts` (prueba de gestos) y `tools/attackcue.py` (capturas).
- **En `src/sim/brain.ts`:** solo el lado humano:
  - `kindForAim` ya no acelera con un arrastre lento (`AIM.slowSpeedup` lo devuelve);
  - `ATTACK`, `attackTarget`, `BLOCK`, `blockShot`, `ATTACKABLE`, `attackable`, `UNDER_ATTACK`, `underAttack` y `ballCue`, al final del archivo.
- **Toques pequeños en archivos compartidos:**
  - `src/sim/types.ts`: `intent` en `ShotSpec` y en el evento `hit`;
  - `src/sim/match.ts`: dos líneas (el bloqueo quita velocidad como el automático, y el evento lleva `intent`);
  - `src/render/view.ts`: el color naranja;
  - `src/main.ts`: el aviso, el aro de tiempo en el bloqueo, el tutorial, los consejos, «Cómo se juega» y `__pb.cue`;
  - `src/i18n.ts`: textos nuevos en es/en;
  - `tools/review/fuzz.ts`: gestos;
  - `tools/review/aimvalue.ts`: la variante «sin apuntar» sin gestos y una nueva «sin apuntar, ataca y bloquea».

## Herramientas

- **`npx tsx tools/review/attack08.ts [partidos] [ayuda]`:** escalera con el reparto de ataques, bloqueos y automáticos; cómo acaban los ataques con aviso y sin él; qué pasa con los avisos; y la defensa.
  - `FORCE='{"p":0.5}'` saca la tabla del umbral.
  - Admite `ATTACKABLE`, `ATTACK`, `BLOCK`, `AIM`, `AUTO_SHOT` y `HUMAN='{"medio":{"flick":0.5}}'` sin tocar el código.
- **`npx tsx tools/review/gestures.ts`:** los 29 casos de gestos.
- **`python3 tools/attackcue.py dist /tmp/pb-08-ataque 390 760 8810`:** capturas del aviso, del bloqueo y del aviso con el tutorial (calidad baja, SwiftShader).
- **`DRAG_V=…` en los bots:** velocidad del dedo al apuntar (520 px/s; muy alto = como antes, instantáneo).

## Pendiente

- **Probarlo en un móvil de verdad:**
  - los 650 px/s del latigazo (un Android lento puede dar menos muestras por gesto: se ha probado a 60 y 120 Hz);
  - si el doble tic se distingue del tic de «ya llegas»;
  - si «¡ATÁCALA!» se lee sin tapar nada en apaisado.
- **El humano sale algo más fuerte** (+3 puntos de media por pareja). No es por la calidad del ataque: con la aspereza fuera del dorado a 0,04 o a 0,08 la escalera no se mueve (±1 punto, 24 partidos). Es porque ataca el doble de bolas altas y la CPU las defiende igual que antes. Las palancas, de más a menos eficaz:
  - en la CPU (B): defender mejor los ataques al centro del cuerpo, o atacar más al humano;
  - el umbral del aviso (`ATTACKABLE.over`): menos bolas avisadas, menos ataques;
  - el destino por defecto (`ATTACK.side`, `ATTACK.behind`): a la cadera, el medio pierde 4–7 puntos contra Nuria y Reina;
  - la calidad del bloqueo limpio (`BLOCK.perfectMin`, 0,84).
- **Las aceleraciones solas del medio** (6–9 %) quedan por debajo del 8–15 % orientativo; los ataques con el gesto, contando el remate, sí entran (9–14 %). Para que acelere más, el aviso podría bajar a 5 cm sobre la cinta (los datos dicen +17 de 0 a 10 cm) o el bot ser más impaciente.
- **El bloqueo es un `dink`/`drop` con `intent`, no un tipo de golpe propio.** Si el entrenamiento o las animaciones lo piden, se puede añadir un `kind` nuevo, pero toca a `SPIN`, la IA y los personajes.
- **El aro de tiempo del bloqueo** usa la misma ventana dorada que el resto (0,14 ± 0,1 s antes del contacto). Si en el móvil se ve demasiado fácil, se puede estrechar solo para el bloqueo (`BLOCK.good` y la ventana del aro).
- **Capturas:** solo en vertical (390 × 760). Falta ver el aviso en apaisado y en inglés.
