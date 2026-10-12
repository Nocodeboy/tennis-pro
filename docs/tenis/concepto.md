# Tenis · ficha de concepto y estado

*Nombre provisional:* **Tenis · Pro Tour**. Es un juego propio del estudio Nocodeboy Games, como el pádel y el pickleball. El nombre, la marca, las tiendas y la publicación los decide el estudio con sus protocolos. La marca está en `src/tour.ts`.

*Estado (13 oct 2026):* **prototipo 0.1 jugable en web**, en la rama `tenis` de `Nocodeboy/padel-pro`.

## El origen

Germán (12 oct): «aprovechar el motor que tenemos en los juegos de pádel y pickleball y hacer nuestro propio juego de tenis». Decidió:

- **Base:** el pádel 0.6 (puntuación, sets, tie-break, físico, atributos y gráficos) más el individual del pickleball (IA de individual y pista abierta).
- **Modalidades:** individual y dobles desde la primera versión.
- **Superficies:** las tres (dura, tierra batida y hierba), con bote distinto.
- **Código:** rama `tenis` en `padel-pro`. **No se fusiona nunca en `main`**, que es el pádel y se publica sola en Vercel. Si el tenis se publica, se le hace su propio repositorio desde esta rama.

## Cómo se hizo

Primero, un contrato común: pista, reglas, golpes, eventos, atributos y jugadores (`contrato.md`). Después, tres frentes a la vez, cada uno con sus ficheros:

- **Simulación** (`notas-01-simulacion.md`): bola y bote por superficie, reglas y puntuación de tenis, saque por arriba, individual y dobles, el nuevo modelo de error y la IA. Los bots miden el equilibrio.
- **Gráficos** (`notas-01-graficos.md`): pista ITF en tres superficies, red con palos de individual, raqueta con cuerdas, revés a dos manos, cortados, saque por arriba con lanzamiento, cámara de tele en vertical y en horizontal, y estadio sin jaula.
- **Interfaz** (`notas-01-interfaz.md`): individual y dobles con su cuadro cada uno, la superficie del torneo, los ajustes de reglas, un marcador con hasta cinco sets y bola de break, carteles de tenis, explicaciones, sonido por superficie y textos en español e inglés.

## Qué se reutiliza y qué es nuevo

- **Igual que en el pádel:**
  - el control de un gesto: mantener, apuntar y soltar en la ventana dorada; toque para bloquear y latigazo para atacar;
  - los pies con aceleración y frenada de persona y la asistencia de colocación;
  - el físico, los atributos 0–99, el estadio, el público, las cámaras de tele y las repeticiones;
  - los jugadores hechos con IA y los bots de medida.
- **Del pickleball:** el individual (la bisectriz, el passing, la colocación tras el golpe) y el revés a dos manos de captura.
- **Nuevo:**
  - la bola de tenis y el bote de tres superficies;
  - el saque por arriba (plano, cortado o liftado, según el gesto);
  - fuera por líneas y la bola que llega a las vallas;
  - el modelo de error con dispersión gaussiana;
  - el plan de juego de tenis de la CPU (`TENNIS`);
  - el tie-break a 10 en el quinto set.
- **Quitado:** paredes, por 3, por 4, bajada, bandeja y víbora.

## Rivales (nombres al estilo del PES sin licencia)

| Ronda | Rival | Suena a | Media |
|---|---|---|---|
| Dieciseisavos | Kasper Rud | Casper Ruud | 63 |
| Octavos | Álex de Miñor | Alex de Minaur | 72 |
| Cuartos | Danil Medvédiev | Daniil Medvedev | 80 |
| Semifinal | Yannik Siner | Jannik Sinner | 83 |
| Final | Carlos Alcarás | Carlos Alcaraz | 88 |

**Dobles:** tú y Marcel Granoyers (suena a Marcel Granollers, 78) contra Rud y de Miñor, de Miñor y Medvédiev, Medvédiev y Siner, y Siner y Alcarás.

**Riesgo legal:** igual que en el pádel, son nombres que evocan a deportistas reales. Para una versión publicada lo decide el estudio; cambiarlos es tocar `src/sim/brain.ts` (nombres de pila) y `src/tour.ts` (apellidos).

## Dificultad medida con el bot

Pista dura, un set a 4 juegos con ventajas. Partidos ganados y, entre paréntesis, puntos ganados:

**Individual:**

| Humano | Rud | de Miñor | Medvédiev | Siner | Alcarás |
|---|---|---|---|---|---|
| Novato | 100 (73) | 50 (50) | 0 (41) | 0 (38) | 0 (29) |
| Medio | 100 (76) | 100 (61) | 44 (49) | 38 (48) | 13 (41) |
| Bueno | 100 (83) | 94 (64) | 94 (58) | 69 (54) | 38 (46) |

**Dobles:**

| Humano | Rud + de Miñor | de Miñor + Medvédiev | Medvédiev + Siner | Siner + Alcarás |
|---|---|---|---|---|
| Novato | 100 (67) | 75 (55) | 33 (47) | 8 (42) |
| Medio | 100 (72) | 83 (57) | 58 (54) | 25 (45) |
| Bueno | 100 (75) | 92 (61) | 100 (60) | 42 (48) |

- **Golpes por punto:** 8–12. **Duración de un set a 4 juegos:** 5–15 minutos, según lo igualado.
- **Los puntos acaban** un 22–29 % en ganadores (incluidos los aces) y el resto en errores, más fuera que a la red.
- **Fuzz:** 320 partidos con pulgares al azar sin fallos ni atascos.

## Pendiente

- **Probar en un móvil real.** Es lo primero: la ventana del golpe con el tiempo del tenis, el saque por gesto, el tamaño de los jugadores en vertical (5 % y 9 % de la altura de la pantalla) y las cuerdas de la raqueta.
- **Más vida en los puntos:** más ganadores y peloteos algo más cortos (en el circuito son 4–5 golpes).
- **Dobles:** más juego en la red.
- **Por superficie:** fichas que cambien con la superficie (Rud mejor en tierra, saque y volea en hierba).
- **Luz horneada nueva** para la pista de tenis y una silla de juez de línea, las dos en Blender.
- **Saque liftado y cortado** con su propio lanzamiento; revés a una mano para quien lo juegue.
- **Sonido propio de tenis:** raqueta con cordaje, bote de la bola de tenis y el «Out!» del juez de línea.
- **Online:** el mismo plan que en el pádel (Colyseus en el VPS sobre la simulación determinista).
