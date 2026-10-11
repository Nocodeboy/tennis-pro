# Pádel (encargo) · ficha de concepto y estado

*Nombre provisional:* **Pádel · Pro Tour**. El nombre y la marca finales los pone el cliente (el mismo del pickleball); están en `src/tour.ts`.
*Estado (12 oct 2026):* **prototipo 0.1 jugable en web**, hecho a partir del pickleball 0.10 (`Nocodeboy/Pickleball@2f15030`).

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
