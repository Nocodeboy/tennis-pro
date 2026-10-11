# Pádel (encargo) · ficha de concepto y estado

*Nombre provisional:* **Pádel · Pro Tour**. El nombre y la marca finales los pone el cliente (el mismo del pickleball); están en `src/tour.ts`.
*Estado (12 oct 2026):* **prototipo 0.2 jugable en web**, hecho a partir del pickleball 0.10 (`Nocodeboy/Pickleball@2f15030`). La 0.2 trae de la 0.12 del pickleball (`cc00ccb`) las animaciones de captura de movimiento y el trabajo de Blender: ver «0.2» al final.

## El encargo

Germán (11 oct): clonar el juego de pickleball y usarlo de inspiración para uno de pádel. Decisiones:

- **Repositorio:** uno nuevo (`Nocodeboy/padel`, privado) con una copia del motor; cada juego evoluciona por su lado.
- **Primera entrega:** prototipo jugable de dobles contra la CPU, con paredes, reglas de pádel y pista de cristal.
- **Proyecto:** encargo del mismo cliente que el pickleball. Marca provisional.

**Antes de publicarlo**, hay que confirmar con el cliente que el motor del estudio se puede reutilizar entre sus dos encargos (si el contrato del pickleball le cede el código, haría falta su permiso).

## Qué se reutiliza y qué es nuevo

- **Igual que en el pickleball:** control de un gesto (mantener, apuntar y soltar en la ventana dorada; toque para bloquear, latigazo para atacar), pies con aceleración y frenada de persona, asistencia de colocación, estadio, público, cámaras de TV, repeticiones, audio sintetizado, personajes y poses, y los bots de medida.
- **Nuevo en pádel:**
  - Pista FIP de 20 × 10 m con cristal y malla (`src/sim/court.ts`, `src/render/cage.ts`).
  - Rebotes en las paredes con solución cerrada, deterministas también en la malla (`src/sim/ball.ts`).
  - Reglas: saque por abajo tras bote con dos oportunidades, let, malla tras el bote del saque, resto obligado a botar, pared directa, por 3 y por 4.
  - Puntuación 15-30-40 con punto de oro o ventajas, set corto con tie-break y saque rotando entre los cuatro.
  - Un planificador que juega la bola después de que vuelva del cristal (`Match.path`).
  - IA de pádel: globo para tomar la red, chiquita, bandeja, víbora, remate y voleas a los pies.
- **Quitado:** cocina, regla del doble bote, individual y modo entrenamiento.

Detalle: `notas-01-simulacion.md` (física, reglas, IA y números) y `notas-01-graficos.md` (pista, jaula, pala, cámara y rendimiento).

## Rivales (cuadro de parejas, nombres al estilo del PES sin licencia)

| Pareja | Suena a |
|---|---|
| Paquito Navarra + Fede Chingoto | Paquito Navarro, Fede Chingotto |
| Fede Chingoto + Alejandro Galván | Fede Chingotto, Ale Galán |
| Alejandro Galván + Agustín Tapira | Ale Galán, Agustín Tapia |
| Agustín Tapira + Arturo Coeyo | Agustín Tapia, Arturo Coello |

Tu pareja es **Martín Di Neno** (suena a Martín Di Nenno).

**Riesgo legal:** igual que en el pickleball, son nombres que evocan a deportistas reales. Para la versión que se publique lo decide el cliente; cambiarlos es tocar `src/sim/brain.ts` (nombres de pila) y `src/tour.ts` (apellidos).

## Dificultad medida con el bot (16 partidos por celda, set a 3 juegos, punto de oro)

| Humano simulado | 1.ª pareja | 2.ª | 3.ª | Campeones |
|---|---|---|---|---|
| Novato | 100 % | 94 % | 63 % | 13 % |
| Medio | 100 % | 100 % | 69 % | 13 % |
| Bueno | 100 % | 100 % | 88 % | 44 % |

- **Golpes por punto:** de 12,7 a 14,7.
- **Duración del partido:** de 3,8 a 7,2 minutos.
- **Cómo acaban los puntos:**
  - un 42 % en la red y un 35 % en pared directa;
  - un 19 % ganadores o bolas a las que no se llega;
  - alrededor de un 1 % por 3.
- **Fuzz:** 68 partidos con pulgares al azar, sin fallos ni atascos.

## Pendiente

- **Probarlo en un móvil real**, como en el pickleball: la ventana del golpe, el cristal transparente (coste de dibujo) y el umbral del latigazo para la víbora.
- **Pocos ganadores** (19 %, frente al 30–40 % del pádel real) y demasiados puntos que acaban en pared directa: hay que afinar la IA para que remate y defina más.
- **Por 4:** la IA nunca lo busca.
- **Remates muy altos:** con globos de 2,7–2,9 m la pala aún no llega del todo a la bola en la animación.
- **Martín** falla demasiado en la red contra las parejas fuertes.
- **Personajes:** siguen el cuerpo y los clips del pickleball (falta un modelo de mujer y movimiento capturado de personas reales).
- **Online:** el mismo plan que en el pickleball (Colyseus en el VPS sobre la simulación determinista).

## 0.2 (12 oct): captura de movimiento y Blender, desde el pickleball 0.12

Germán, tras probar la 0.1 («se siente bien»): aprovechar del pickleball «el modelado en Blender y los movimientos y animaciones».

- **Animaciones** (`notas-02-animacion.md`):
  - carrera, andar, celebración y lamento de captura real (CMU);
  - derecha y remate de un tenista (pack *Sports* de Rokoko). La derecha es más compacta que la de tenis;
  - el revés se queda a una mano, como en el pádel: el de captura es a dos manos;
  - bandeja y víbora se montan sobre el remate de captura, sin tijera, de lado y con el final cruzado;
  - de la 0.11: tu jugador prepara el golpe con el círculo mientras llega, y el globo tiene su final con la pala subiendo.
- **Blender** (`notas-02-blender.md`, `art/blender/`):
  - mobiliario modelado con la oclusión horneada: la silla del juez en la red, los banquillos fuera de la jaula, las cámaras de TV y los taburetes de fotógrafos;
  - postes de la red de pádel nuevos, a ras de la malla, con el tensor;
  - sin sillas de jueces de línea;
  - la luz de los focos horneada sobre la pista, con las sombras suaves de la jaula y la red;
  - el mobiliario va en `assets/props/props.bin` y la luz en `assets/light/floor.webp`, fuera de la página.
- **Números:**
  - pala–bola en el remate, de 15,8 a 2,7 cm de mediana;
  - remate, bandeja y víbora golpean delante del cuerpo y no 33 cm por detrás;
  - mismas llamadas de dibujo, unos 49.000 triángulos más en calidad alta y media.
- **Para comparar en la URL:** `?mocap=off` (clips de antes), `?props=box` (mobiliario de cajas) y `?light=off` (sin luz horneada).

### Pendiente de la 0.2
- **La bandeja salta demasiado:** la simulación la golpea a unos 2,85 m (lo real es 2,3–2,6 m). Hay que bajar ahí la altura del contacto de la bandeja.
- **Licencia del pack de Rokoko:** confirmarla antes de publicar en una tienda. CMU se puede usar en un juego comercial; la cita está en `notas-02-animacion.md`.
- **Probar en el móvil:** los triángulos de más del mobiliario, la derecha y el salto del remate a la velocidad del juego.
- **Golpes propios del pádel con captura:** volea, chiquita, bandeja de verdad y salida de pared. El método de Blender ya está en el repo (`art/blender/padel_clip.py`); falta una fuente de capturas de pádel.

