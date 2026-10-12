# Auditoría 04 · la simulación del pádel (realismo y juego)

*Revisión independiente, 12 oct 2026, sobre `main` en `c7055a6`. Solo se ha medido: no se ha tocado código del juego.*

Las sondas nuevas están en `tools/audit/` y se pueden repetir después de cada arreglo:

| Sonda | Qué mide | Cómo se ejecuta |
|---|---|---|
| `fisica.ts` | Golpes tipo de la CPU con la cadena de `Match.launch` sin azar; bote FIP; cristal y malla aislados; deriva | `npx tsx tools/audit/fisica.ts` |
| `partidos.ts` | Estructura del punto, red, globos, saque y resto, posiciones, bolas que atraviesan cuerpos, humano, coste por fotograma | `npx tsx tools/audit/partidos.ts cpu 40` y `LEVEL=medio npx tsx tools/audit/partidos.ts bot 12` (`SEEDS=1` da semillas) |
| `atributos.ts` | Dos parejas CPU idénticas (todo a 70) salvo un atributo +10 o +20 | `npx tsx tools/audit/atributos.ts 30` y `DELTA=20 …` |
| `errores.ts` | De dónde salen los errores a la pared y a la red; por qué pared sale el por 3 | `npx tsx tools/audit/errores.ts 40` |

También he pasado las herramientas del repo: `tools/review/fuzz.ts 48` y `SHOTS=1 tools/bot-doubles.ts 8`.

Las cifras reales son **aproximadas**: reglamento FIP para la pista y el bote, y tendencias publicadas del circuito profesional (estudios de partidos del WPT y Premier Padel de Courel-Ibáñez, Sánchez-Alcaraz y otros; radares y retransmisiones para las velocidades). Úsalas como orden de magnitud, no como cifra exacta.

## Resumen

- **Lo que más pesa:**
  - **La carta apenas cuenta.** Solo control y reflejos ganan puntos; potencia, velocidad, remate, pared y toque no cambian el resultado ni con +20.
  - **Los puntos acaban demasiado en la pared directa** (un 34–35 %, más que en la red), sobre todo por voleas desde la red que se pifian y van al cristal de fondo.
- **Consecuencias:** la pareja que tiene la red solo gana el 58–59 % de los puntos, y sigue vivo el duelo de chiquitas de volea que viene del pickleball.
- **Física:** está bien en lo básico (bote FIP, deriva, cristal y malla). Fallan los **globos, demasiado bajos** (pico de 3,8 m), y la **bandeja, que sale cómoda** del cristal.
- **Estabilidad y coste:** sin fallos (48 partidos de fuzz), con un coste despreciable y la duración del punto bien encajada con la real.

## Hallazgos, de más a menos grave

### 1. ALTA · Cinco de los siete atributos no ganan puntos

**Qué pasa.** `atributos.ts`: 30 partidos por fila, unos 780 puntos, así que el ruido es de ±1,8 puntos. Control 51,4 % de puntos y 57 % de partidos (debería ser 50 %).

| +Δ en los dos jugadores | pot | con | vel | ref | rem | par | tq |
|---|---|---|---|---|---|---|---|
| +10: % de puntos | 48,4 | **55,6** | 50,7 | **55,5** | 51,7 | 50,5 | 48,9 |
| +20: % de puntos | 47,9 | **61,7** | 48,5 | **62,8** | 47,3 | 50,9 | 50,2 |
| +20: % de partidos | 50 | **93** | 40 | **93** | 37 | 53 | 57 |

- **pot +20:** el drive pasa de 72 a 74 km/h y el remate de 107 a 112. Apenas se ve y no gana nada.
- **vel +20:** pasa de 4,67 a 5,33 m/s y no cambia ni las bolas a las que no se llega (32 % frente a 34 %).

**Por qué importa.** El juego vende fichas 0–99 que «mueven el juego». Una carta de 80 frente a una de 70 solo se nota en con y ref. La escalera depende casi entera de esos dos (ver 8).

**Causa** (`brain.ts`, `skillFrom` y `attrQ`; `match.ts`, `launch`):
- `con` entra directo en `q` (0,0055 por punto) y en `qVar`.
- `ref` mueve la reacción, la lectura, el temple (`poise`) y `WHIFF`.
- `pot` da potencia, pero `POWER.spread` y `powerShank` se comen la ventaja.
- `rem`, `par` y `tq` solo valen 0,0025 por punto en `attrQ` (+0,05 de q con +20) y suben la *tendencia* (más ataque es más riesgo).
- `vel` no limita casi ningún punto: los ganadores salen de `WHIFF`, que va con la reacción.

**Arreglo:**
- Que cada atributo pague en resultado:
  - **pot:** más ritmo sin el castigo de dispersión completo (dispersión × (1 − con)) y más prisa para el que la recibe (`rushed` ya lee la velocidad de la bola);
  - **rem, par y tq:** `ATTR_Q.k` de 0,006 en su golpe y menos dispersión en su golpe;
  - **vel:** más estirada (`lunge`) y llegar a los passing (medir «miss» frente a vel).
- **Objetivo:** +10 en cualquier atributo ≈ +2–4 puntos de %, y +20 ≈ +5–8.

### 2. ALTA · Demasiados errores directos al cristal, y casi todos desde la red

**Qué pasa.**
- **Cómo acaban los puntos:**
  - CPU contra CPU: 33,5 % `wall`, 31,0 % `net`, 34 % ganadores;
  - bot medio: 35,0 % `wall` y 32,7 % `net`.
- **Pares fuertes** (`errores.ts`, 954 puntos):
  - el 25,5 % de los puntos acaba en la pared directa;
  - de esos errores, el **56 % son pifias**, con q mediana 0,33 y una diana mediana a **4,15 m** de la red (iban a los pies);
  - el primero es «volea desde la red · pifia» (29,6 %), y le siguen la volea con contacto malo (18,5 %) y la bajada pifiada (5,3 %).
- **La red pierde por la pared:** la manera más frecuente de perder el punto de la pareja que tiene la red es una volea al cristal de fondo (21,7–21,9 % de esos puntos).

**Por qué importa.** En el pádel real la mayoría de los errores van a la red. El fondo directo existe (globos y voleas largas), pero es minoría. Ver a una pareja arriba mandar voleas a los pies que vuelan 11–13 m hasta el cristal resulta extraño, y regala puntos a la pareja de atrás.

**Causa** (`match.ts`, `Match.launch`, bloque `shanked`): con probabilidad 0,55 × 0,65, una pifia de cualquier golpe no blando pone `tz = HL + 0,4…2,0`, sea cual sea el golpe y el sitio. Se suman `SHANK` (`brain.ts`, `shankOf`: margen 0,25, k 1,4, máx. 0,7), `powerShank` y `LONG` sobre dianas `deep()` de 7–8,3 m.

**Arreglo:**
- **Pifia según el golpe:**
  - volea o golpe por arriba desde la red → red, malla lateral cercana o bola que se queda alta y corta;
  - «largo al cristal» solo para drive, globo y bajada desde el fondo, y con menos probabilidad.
- **Objetivos:** pared directa ≤ 12–15 % de los puntos y red ≥ 55–60 % de los errores.

### 3. MEDIA-ALTA · La red no manda lo suficiente

**Qué pasa.** Con una sola pareja en la red en el último golpe (puntos de más de 2 golpes), la pareja de la red gana el **57,9 %** de los puntos (CPU, 347) y el **59,0 %** con el bot (415). En el profesional, la pareja que domina la red gana una mayoría clara (aprox. 65–80 %).

**Causa:** sobre todo el punto 2 (errores no forzados de la pareja de arriba) y el 4.

**Arreglo:** volver a medir después de 2 y 4. Si sigue bajo, bajar `attackRisk` y `LOW_VOLLEY` para la volea alta de la red.

### 4. MEDIA · Duelo de chiquitas de volea con las dos parejas en la red (herencia del pickleball)

**Qué pasa.**
- La formación más frecuente al golpear es **N/N** (las dos parejas arriba): 19,2 % de los golpes (CPU) y 22,5 % (bot).
- La chiquita de volea (`dink` de aire) es el 12,6 % de los golpes.
- «Red · chiquita de volea» cierra el **13 %** de los puntos, y es el 38 % de los errores a la red (pifia incluida).

**Por qué importa.** En el pádel la situación normal es ataque contra defensa. Cuando las cuatro están arriba, alguien globea o pega al cuerpo enseguida. El intercambio de bolas muertas a la red es de pickleball.

**Causa** (`brain.ts`, `chooseShot`, rama `meNet && oppNet`):
- el globo solo sale si `up === 0`, con `netLob` 0,12 × lob;
- si no, `netHard` o una `dink` a los pies;
- `PRESSURE` acaba esos peloteos en la red.

**Arreglo:**
- globo de volea de 0,25 a 0,35 en N/N;
- más volea al cuerpo o a la reja y menos `dink`;
- **objetivo:** N/N ≤ 10 % de los golpes y la chiquita de volea en la red ≤ 5 % de los finales.

### 5. MEDIA · Globos demasiado bajos y rápidos

**Qué pasa.**
- **Golpe tipo** (`fisica.ts`): el globo desde el fondo sube a **3,76 m**, pasa la red a 3,7 m, vuela 1,57 s y bota a 8,6 m; el globo alto defensivo, a 4,57 m.
- **En partido:** pico mediano de **3,8 m** (p10 3,3, p90 4,3).
- **Real (aprox.):** de 5 a 8 m de pico y unos 2–2,5 s de vuelo.
- **Respuesta al globo sobre la pareja de la red:**
  - se juega de aire en el 60–68 % (bandeja 39–45 %, remate 7–15 %, víbora 6–8 %);
  - de pared tras el bote, solo un 14–18 %.

**Por qué importa:**
- El globo, que es el golpe de transición del pádel, apenas obliga a bajar.
- La pareja que globea tiene menos tiempo para subir: solo el 44–52 % de las subidas a la red vienen tras su globo.
- En la cámara se ve un «globo tenso», no un globo de pádel.

**Causa:** los valores de `clear` del globo, de 2,4 a 3,6 m sobre la cinta. Están en `brain.ts`: `chooseShot` (globo, `lobbed`, `returnLob`, `netLob`), `lobShape` del humano y `autoShot`.

**Arreglo:**
- `clear` de 3,8–5,5 (pico de 5–7 m) y a la vez revisar `reachH` y `rushed` del globo;
- **objetivo:** un 40–50 % de los globos buenos jugados de aire y el resto tras retroceder;
- si se suben, conviene pensar en un techo (FIP: pabellón alto; hoy no hay).

### 6. MEDIA · La bola atraviesa a los jugadores

**Qué pasa.**
- **Cuántas:** 0,61 por punto (CPU) y 0,64 (bot) bolas vivas pasan a menos de 0,22 m del eje de un jugador, entre 0,1 y 1,6 m de altura.
- **De quién:** el **98 %** son del jugador que luego juega esa bola: le pasa por el cuerpo tras el bote (46–51 %) o antes del bote (17–47 %), y él la juega después, de pared o tras botar.
- **Semillas:**
  - `cpu bruno-nuria vs nuria-reina seed 6100` (t = 153,8 y 173,0 s);
  - `seed 6131` (t = 65,4 s);
  - `bot medio vs paco-lola seed 2000` (t = 71,2 s).

**Por qué importa.** Se ve en la cámara (la bola cruza el cuerpo). Además, nadie modela que la bola toque a un jugador: en el reglamento eso es punto, y la volea al cuerpo es una táctica de pádel.

**Causa** (`match.ts`): `planContact` solo comprueba los pies en el momento del contacto, no el camino anterior de la bola. `movePlayers` lleva a la CPU en línea recta a `fx`/`fz` y lo deja plantado en la trayectoria.

**Arreglo:**
- en `planContact`, castigar o descartar los planes cuyos pies (±0,3 m) cruza la bola por debajo de 1,7 m antes del contacto;
- o un paso lateral para «dejarla pasar» mientras espera;
- **opcional:** que la bola que toca a un jugador sea punto, para la volea al cuerpo.

### 7. MEDIA · La bandeja no castiga: sale cómoda del cristal

**Qué pasa** (`fisica.ts`, contacto limpio):

| Golpe | Altura a 1,5 m del cristal | Primer bote tras el cristal |
|---|---|---|
| Bandeja | 1,18 m | 4,2 m del cristal |
| Víbora | 0,76 m | 3,1 m |
| Drive liftado | 1,36 m | 5,3 m |

El cortado y el liftado apenas se distinguen tras el fondo. En el pádel real la bandeja y la víbora «se quedan» bajas.

**Causa** (`ball.ts`, `bounce`): el roce con el suelo invierte el efecto (spin de salida = (wr + j/ALPHA)/SPIN_SURF) y la bandeja (−0,55) sale del bote con unos +0,6 de liftado. Después, `wallBounce` la hace trepar por el cristal.

**Arreglo:**
- conservar parte del cortado en el bote cuando `spin < 0` (p. ej., `max(spinOut, 0,5·spinIn)`) o limitar el agarre en el cristal para la bola que venía cortada;
- **objetivo:** bandeja ≤ 0,8 m a 1,5 m del cristal y ≤ 3 m de salida.

### 8. MEDIA · La escalera: dos parejas regaladas y un muro

**Qué pasa.** `bot-doubles.ts 8`: novato, medio y bueno ganan el 88–100 % contra Paquito+Fede y contra Fede+Alejandro. Contra los campeones, novato 0 %, medio 25 % y bueno 13 % de los partidos (40–44 % de los puntos). Con 8 partidos por casilla el ruido es grande, pero las notas de la 0.3 (16 por casilla) muestran la misma forma.

**Causa:** el punto 1. Arturo tiene con 88 y ref 90, y esos dos atributos deciden. El set a 3 juegos amplifica pequeñas diferencias de puntos.

**Arreglo:** después de 1, escalonar las cartas por con y ref y fijar un objetivo por nivel (p. ej., el medio, 70/55/40/25 %).

### 9. BAJA-MEDIA · El resto: mucho globo y poco resto a los pies

**Qué pasa.**
- **Restos de globo:** 30–35 %.
- **El resto sin globo:**
  - se apunta a una profundidad mediana de 6,3–6,5 m;
  - solo el 3–8 % pasa bajo (< 0,35 m sobre la cinta);
  - solo el 9–10 % va a los pies del sacador.
- **Real (aprox.):** la mayoría de los restos son bajos, cruzados o a los pies del que sube, y el globo es minoría.

**Causa** (`chooseShot`, `r.shots === 1`): globo con probabilidad `s.lob × 0,6`; profundidad `SERVICE − 1,6 + …`; `clear` de 0,3 + (1 − risk) × 0,2 + rand × 0,2.

**Arreglo:** globo × 0,3; diana a 3,5–5 m, donde llega el sacador; `clear` de 0,15–0,3.

### 10. BAJA · El sacador no siempre sube

Está en la red en el 3.er golpe en el 73–78 % de los saques. Paquito (netRush 0,3) sube el 65 % de las veces; en el profesional sube casi siempre. Causa: `afterHit` (`r.shots === 1`, `0,5 + 0,5 × netRush`). **Arreglo:** un mínimo de 0,85.

### 11. BAJA · Reglas que faltan o simplificadas

**Revisado y correcto** (código y partidos):
- rotación del saque A1-B1-A2-B2 y tie-break 1-2-2, con los lados;
- segundo saque, let repetido, malla tras el bote del saque, resto de volea;
- pared antes del bote, por 3 (`exit`) y por 4 (`back`);
- punto de oro y ventajas;
- el fuzz no encontró bolas que atraviesen paredes.

**Falta o está simplificado:**
- **Punto de oro:** resta siempre el jugador de la derecha (`serveX`: 6 puntos jugados → derecha). En Premier Padel elige la pareja que resta.
- **Bola que toca a un jugador:** no se modela (ver 6).
- **Salir por la puerta** a por un por 3: imposible. Es una simplificación aceptable, pero el por 3 siempre gana.
- **El por 3** sale tanto por el fondo como por el lateral (2 casos en 954 puntos). En la traza determinista (2,6 m de altura a 2,5 m de la red) sale por el fondo a 4,57 m de altura. En el real sale sobre todo por el lateral.

### 12. BAJA · Velocidades: casi todas en rango; el drive y la bandeja, algo planos

Medianas de salida en partido (km/h; p90 entre paréntesis) frente a referencias reales aproximadas:

| Golpe | Simulación | Real (aprox.) |
|---|---|---|
| Saque | 59–60 | 50–80 |
| Resto | 68–70 | 60–90 |
| Drive | 71 (84–87) | 70–100 |
| Volea | 54–58 (91–97) | 50–90 |
| Bandeja | 67–68 (70) | 60–90 |
| Víbora | 92–93 | 80–110 |
| Remate | 110–118 (113–137) | 100–140 |
| Por 3 | 137–144 | — |
| Por 4 | 131–142 | — |
| Bajada | 88–91 | 80–110 |
| Globo | 53 | 40–70 |
| Chiquita | 37 | 30–50 |

- **La bandeja casi no varía:** el p90 es igual a la mediana, porque `pace` 1,1 fija el vuelo. Es un golpe «de máquina».
- **La volea definitiva a los pies** desde 1,3 m de altura no puede ir rápida (sale a 55 km/h). Es física correcta.

## Lo que está bien

- **Bote FIP:** soltada desde 2,54 m, vuelve a 1,36 m (reglamento: 1,35–1,45 m).
- **Deriva lineal por tramo:** frente a la cuadrática real, menos de un 3 % de diferencia en distancia hasta 144 km/h.
- **Cristal y malla:**
  - la restitución del cristal baja con el golpe (0,67 a 29 km/h, 0,54 a 94 km/h) y el efecto cambia la salida en el sentido correcto;
  - la malla mata la bola (sale con ≈ 45 % de la velocidad);
  - todo es determinista.
- **Duración del punto:**
  - media de 11,7–12,8 golpes, mediana 11 y p90 20–23;
  - 10,3–10,4 s de mediana y 12,4–12,6 de media;
  - encaja con el profesional (aprox. 10–12 golpes y 10–15 s).
- **Las parejas se mueven juntas:**
  - partidas (una arriba y otra abajo) el 4–6 % del tiempo;
  - en el mismo lado < 1 % del tiempo (0,17–0,29 episodios por punto de más de 0,3 s);
  - pegadas al cristal un 0,5 %;
  - ningún golpe por arriba por debajo de 1,75 m.
- **El globo desde la red a una pareja atrás** casi no existe en la CPU (0). Los 4 casos son del bot humano.
- **Hay juego de pared y transiciones:**
  - bajadas en el 5 % de los golpes;
  - 1,2–1,3 subidas a la red por punto;
  - variedad de respuestas al globo.
- **El humano** (bot medio):
  - 50/50 de bolas con Martín;
  - 24 % de golpes automáticos;
  - solo el 9,2 % de los puntos perdidos sin tocar bola;
  - un 4,1 % de sus bolas sin círculo.
- **Estabilidad:**
  - fuzz de 48 partidos y 716 puntos sin fallos ni atascos;
  - 96 partidos de escalera y 160 de CPU sin atascos;
  - ni NaN ni bolas atravesando paredes.
- **Coste:** `m.update(1/60)` tarda de media 0,010–0,015 ms, con p99 de 0,21–0,23 ms. Hay picos aislados de 12–65 ms (arranque, JIT o GC) en 0,8–1,1 millones de fotogramas.

## Orden sugerido

1. Arreglar la pifia por golpe (2) y medir con `errores.ts`.
2. Que la carta cuente (1) y medir con `atributos.ts`; luego escalonar la escalera (8).
3. Rebajar el N/N y la chiquita de volea (4).
4. Subir los globos (5), con su efecto en la red (3).
5. Que la bola no atraviese a los jugadores (6) y que la bandeja se quede baja (7).
6. Resto, saque y reglas (9–11).

Después de cada paso: `partidos.ts cpu 40`, `partidos.ts bot 12` y `fuzz.ts 48`.
