# Jugadores, pala y bola 0.9 (10 oct): aspecto de profesional

Germán, tras ver la 0.8: «Dale una estética más pro, no Pickleball El Pinar, hazlo realista». El escenario pasa a ser la pista central de un torneo profesional de noche (eso lo hace G1). Esta parte toca solo cómo van vestidos los jugadores, sus materiales (piel, tela, pelo y zapatillas), la pala y la bola. No toca la animación, las luces, el entorno, el posprocesado ni la interfaz.

## Qué delataba «videojuego barato» en la 0.8

Lo miré en primeros planos de cada jugador, en la cámara de juego del móvil (vertical 390 × 844 y horizontal 844 × 390, niveles alto, medio y bajo) y en los planos de televisión. De más a menos impacto:

1. **Camisetas de un color plano y saturado** (verde lima, violeta, cian, amarillo) sin costuras, paneles, ribetes ni logo. Parecían camisetas de algodón teñidas. El panel lateral blanco del modelo original se quedaba blanco en todos.
2. **Pantalones recoloreados con tonos raros** (caqui, azul pastel, granate), que además arrastraban el sombreado del azul marino original.
3. **Todos iguales salvo la camiseta:** mismo pelo, misma piel y los mismos calcetines y zapatillas blancos.
4. **Un único material para todo** (rugosidad 0,78): piel, tela, pelo y zapatillas brillaban igual. Aspecto de plástico.
5. **Restos del coral de la camiseta** en el dorso de una mano y en el borde de las mangas: un fallo de la textura que hizo la IA.
6. **La pala:** un rectángulo redondeado de un solo color y un cilindro negro como mango. Sin protector de borde, sin cara de carbono y sin grip.
7. **La bola:** bien de lejos. De cerca, los agujeros eran elipses pintadas, deformadas cerca de los polos, y sin relieve.
8. **Un fallo de memoria.** Cada partido creaba texturas nuevas para las equipaciones y nunca las liberaba: unos 11 MB de GPU por partido individual y 22 MB por partido de dobles. Tras 18 partidos seguidos había 104 texturas de más, unos 290 MB. En un móvil, la pestaña acaba cerrándose.

## Qué cambia

### Equipaciones pintadas sobre el cuerpo (nuevo `src/render/outfit.ts`)

La textura del modelo es un atlas de Tripo con las piezas desordenadas, así que no se puede pintar «a mano» sobre ella. En lugar de eso, la equipación se pinta en la tarjeta gráfica sobre el cuerpo:

- **Cómo funciona.** Una vez por equipación, el modelo se dibuja sobre su propio mapa de textura. Cada píxel sabe en qué punto del cuerpo está (en la pose en T) y de qué color era. Con eso se decide qué es (camiseta, pantalón, calcetín, zapatilla, piel o pelo) y de qué color va. Medí en el modelo dónde están el cuello, las mangas, el bajo de la camiseta, la cintura y el bajo del pantalón, la parte de arriba de los calcetines y el borde de la zapatilla.
- **Se conservan los pliegues y el sombreado** que pintó la IA: cada píxel guarda su brillo respecto a la media de lo que era. Los bordes entre prenda y piel siguen los de la textura original, así que quedan suaves.
- **Camiseta técnica con corte propio:**
  - paneles laterales (donde estaban los blancos de la IA, así coinciden las costuras);
  - según el jugador, canesú en los hombros, banda en el pecho, banda diagonal o degradado con trama de puntos hacia el bajo;
  - ribetes de 4–5 mm en cada costura;
  - cuello y puños de canalé;
  - estampado tono sobre tono (rayas finas, puntos o chevrones);
  - una marca inventada en el pecho (dos chevrones inclinados) y otra pequeña en la espalda, bajo el cuello.
- **Pantalón:** cintura algo más oscura, una o dos franjas en el costado y la marca en la pernera izquierda.
- **Calcetines** lisos o con dos rayas. **Zapatillas** con talonera y línea de la mediasuela en el color del jugador, mediasuela y suela.
- **Muñequeras, color de pelo y tono de piel por jugador.** Como todos comparten cara, el pelo ayuda mucho a distinguirlos en los planos de televisión.
- **Se corrigen los restos de coral** en las manos y en el borde de las mangas.
- **Una segunda textura pequeña (256 px)** guarda de qué está hecho cada punto: brillo de tela, rugosidad, relieve de punto e intensidad del reflejo.

### Los jugadores (`src/kits.ts`)

Colores sobrios y reales. Cada rival se reconoce de lejos por el color y el corte de la camiseta. Tú vas en rojo, y tu compañera lleva los mismos colores al revés:

| Jugador | Camiseta | Corte | Pantalón | Detalles | Pala |
|---|---|---|---|---|---|
| Tú | rojo `#b8302a` | banda en el pecho gris marengo, rayas finas | marengo con franja roja | talonera roja | alargada, carbono con banda roja |
| Marta (compañera) | blanca | banda roja en el pecho | marengo con franja blanca | muñequera roja, pelo castaño | estándar, cara clara con gráfico rojo |
| Paco | verde bosque | paneles blancos, puños blancos | blanco con franja verde | calcetines a rayas, suela crudo, pelo canoso | estándar, fibra de vidrio azul |
| Lola | ciruela | degradado a berenjena con trama de puntos | berenjena | muñequera blanca | híbrida, fibra de vidrio fucsia |
| Bruno | negra | banda diagonal grafito con ribete naranja, chevrones | negro con doble franja naranja | calcetines y zapatillas negros, dos muñequeras, piel más morena, pelo negro | alargada, carbono con naranja |
| Nuria | verde azulado `#14857a` | paneles oscuros, puntos | petróleo oscuro | muñequera, pelo caoba | híbrida, cara clara con gráfico verde azulado |
| Reina | oro `#d6a531` | canesú azul marino con ribete blanco | azul marino | pelo rubio oscuro | alargada, carbono con oro |

El color de avatar de los menús y de las rótulos de televisión (`css` e `ink` de `kits.ts`) cambia al de la camiseta nueva (ver «Para G2»).

### Materiales

Material físico (`MeshPhysicalMaterial`) con la textura de material:

- **Piel:** rugosidad 0,56, reflejo como el de la piel (0,7) y un poco de *sheen*.
- **Tela de punto:** rugosidad 0,8, *sheen* alto, reflejo bajo y el relieve de un punto piqué solo en la tela. Probé con el reflejo más alto, pero en las prendas oscuras marcaba las facetas del modelo simplificado como manchas, así que lo dejé en 0,15.
- **Cuello y puños** de canalé, más mates.
- **Logos y estampados:** más lisos y brillantes, como un vinilo.
- **Calcetines** de rizo, del todo mates.
- **Zapatillas** semimate; las suelas, de goma.
- **Pelo** algo más brillante que la piel.

### La pala (nuevo `src/render/gear.ts`)

- **Forma real**, según el jugador:
  - alargada: 18,8 cm de ancho y 40,5 cm de largo;
  - estándar: 20 × 39,5 cm;
  - híbrida: 19,5 × 40 cm.

  Todas con un mango de 12,5–13,7 cm y un núcleo de 16 mm.
- **Protector de borde:** el canto redondeado y una banda en las dos caras. También tiene **collarín en la garganta**, **mango octogonal con overgrip** en espiral con perforaciones, y **tapón**.
- **Tres tipos de cara:**
  - carbono crudo, con la trama de sarga en relieve y su rugosidad;
  - fibra de vidrio del color del jugador;
  - cara clara.

  Los gráficos son una banda ancha con su línea, un contorno interior y la marca inventada en la garganta y arriba. No hay ninguna marca real.
- **El centro de la cara sigue a 0,255 m del agarre:** las mediciones del contacto y la IK del brazo no cambian.
- **Coste:** tres llamadas de dibujo por pala, como antes. Hay una geometría por forma, compartida, y los materiales se reutilizan entre partidos (se guardan los 5 últimos).

### La bola

- **40 agujeros redondos** colocados sobre la esfera, así que no se deforman en los polos: uno en cada polo y anillos de 7 y 12 por mitad. Miden unos 7 mm.
- La **costura** del moldeado y **una marca impresa pequeña** en dos lados, que deja ver cómo gira.
- **Agujeros en relieve y más oscuros:** el brillo propio de la bola no entra en ellos.
- **Igual que antes:** el color amarillo óptico, el brillo propio, el tamaño (1,45 veces el real y crece de lejos), la estela de las bolas rápidas y su sombra. En la cámara de juego se ve igual de amarilla que antes (lo medí en el píxel).

### Memoria: el fallo de las texturas

- **Las equipaciones se pintan una vez y se reutilizan.** Se guardan dos (cuatro en dobles). Las que nadie lleva se tiran, y volver a pintar una cuesta unos milisegundos de GPU.
- **Al salir un jugador** se liberan su esqueleto (otra textura que también se perdía) y su material.
- **Medido** con 18 partidos seguidos (5 individuales y 4 de dobles, dos veces):
  - antes, las texturas vivas iban de 30 a 134 y crecían sin parar;
  - ahora se quedan en 42 en individuales y 48 en dobles.
- **Si se pierde el contexto WebGL,** las equipaciones se vuelven a pintar solas.

## Coste

`renderer.info` en el mismo fotograma (semilla 424242, sombras y posprocesado incluidos):

| Escena | Llamadas antes → después | Triángulos antes → después | Texturas antes → después |
|---|---|---|---|
| Primer plano, alto, individual | 66 → 66 | 89.262 → 89.806 | 46 → 53 |
| Primer plano, alto, dobles | 67 → 67 | 160.004 → 160.684 | 71 → 61 |
| Juego, medio, 390 × 844 | 56 → 56 | 89.582 → 90.126 | 34 → 40 |
| Juego, medio, 844 × 390 | 54 → 54 | 89.568 → 90.112 | 34 → 40 |
| Juego, alto, 390 × 844 | 70 → 70 | 89.596 → 90.140 | 46 → 52 |
| Juego, bajo, 390 × 844 | 41 → 41 | 50.066 → 50.338 | 34 → 40 |
| Juego, medio, dobles, 390 × 844 | 74 → 74 | 163.074 → 164.162 | 38 → 47 |

Las llamadas de dibujo no cambian. Los triángulos suben unos 270 por pala (canto redondeado, collarín y tapón). Las texturas suben en 6 (individual) o 9 (dobles): la textura de material de cada equipación, las caras de las palas, el relieve de la bola y tres texturas pequeñas compartidas. En el primer plano de dobles bajan porque antes se arrastraban las de los partidos anteriores.

**Memoria de texturas de los jugadores, la pala y la bola** (con mipmaps):

| | Antes | Después |
|---|---|---|
| Individual | 10,8 MB | 13,6 MB |
| Dobles | 21,5 MB | 26,3 MB |
| Tras 18 partidos seguidos | +≈ 290 MB perdidos | sin pérdidas |

- **Por jugador:** la equipación ocupa 5,6 MB (1024 px, como antes), su textura de material 0,35 MB y la cara de la pala 0,7 MB.
- **Compartidas:** la bola, 0,9 MB (antes, 0,17), y las texturas pequeñas (punto, trama de carbono y overgrip), 0,13 MB.

**Peso:**
- `dist/index.html` pasa de 1.032.811 a 1.057.971 bytes: +25 KB, +9 KB con gzip.
- No hay ningún asset nuevo: `assets/` sigue pesando lo mismo (2,06 MB), y `hero.json` no cambia.

**2048 px para el nivel alto: no hace falta.**
- Los ribetes, logos y franjas se pintan a la resolución de la textura, y a 1024 px (1,7 mm por píxel) salen nítidos hasta en el plano de presentación de la televisión.
- El detalle de la piel y la cara sale de la textura de la IA, que ya es de 1024 px. Para mejorarlo habría que descargar el original de 2K (unos 300 KB más).
- A 2048 px, cada equipación ocuparía 22 MB en lugar de 5,6.

**Tiempo de carga** (estimado, sin medir en un móvil):
- al cargar, las texturas de la bola y de las palas (unos milisegundos);
- por equipación nueva, en la GPU: un dibujo del modelo y 57 copias desplazadas para rellenar los huecos entre piezas, para cada una de sus dos texturas.

**Créditos de Magnific: 0.** El tejido, la trama de carbono, el overgrip y la bola se hacen con código.

## Para G1 (luz y entorno)

- **Sombras de contacto en los pies.** Ya está la mancha bajo cada jugador en `view.ts`, que es tuyo. Mantenla. Si quieres más, dos manchas pequeñas bajo las zapatillas (una por pie) asientan mucho a los jugadores en los primeros planos.
- **Un contraluz** (una luz por detrás de los jugadores desde los focos) realza el *sheen* de la tela y separa a los jugadores del fondo oscuro de noche.
- **El material de los jugadores refleja el entorno** (`envMapIntensity` 0,9, como antes). Con el cielo de día, la cara de carbono de las palas se veía algo azulada. Con un entorno de noche se verá gris oscura, como debe.
- **La bola sigue igual** (brillo propio, estela y sombra): si cambias la exposición para la noche, mira que no se apague.
- **En `view.ts` toqué dos cosas, nada de luz:**
  - la línea que creaba la bola, que ahora llama a `ballMesh()`;
  - unas líneas en `load()`, que crean el pintor de equipaciones;
  - dos `import` nuevos. El de `ballTexture` sigue ahí aunque ya no se use, para no pisar esa línea.

## Para G2 (interfaz)

Cambian los colores de avatar de `kits.ts` (`css`, `ink`), que también usan los rótulos de equipo de la televisión:
- Tú `#b8302a` / blanco
- Paco `#2c5e43` / blanco
- Lola `#6f3b7c` / blanco
- Bruno `#1b1c20` / naranja `#e8702a`
- Nuria `#14857a` / blanco
- Reina `#d6a531` / `#0f1a2e`
- Marta `#eef0f3` / `#1f2531`

## Archivos

- **Nuevos:**
  - `src/render/outfit.ts`: el pintor de equipaciones y el material de los jugadores.
  - `src/render/gear.ts`: la pala y la bola.
  - `tools/kits.py`: primeros planos de cada jugador, la pala, los pies, la bola y la memoria de texturas.
- **Cambiados:**
  - `src/kits.ts`: las equipaciones.
  - `src/render/chars.ts`: solo los materiales, la pala y la limpieza en `dispose`. La animación no cambia.
  - `src/render/view.ts`: la bola y el pintor.
- **Sin tocar:** `docs/concepto.md`, `crowd.ts` (el público se hornea igual, de la textura original), los huesos y `CharAssets.template` e `image`.

## Pendiente

- **Medir en un móvil real** cuánto tarda en pintarse una equipación y el coste del material físico con *sheen*. Son 2–4 jugadores que ocupan poca pantalla.
- **El nivel bajo usa el mismo material físico.** Si va justo, se puede pasar a uno estándar en bajo, pero `setTier` tendría que avisar a los personajes.
- **Falda, gorra o visera:** con el cuerpo común no se pueden hacer. Necesitan geometría o modelos propios por rival.
- **La mano no se cierra del todo sobre el mango.** Es de la pose y la animación, no de la pala.
- **Si cambia el modelo** (`hero.json`), hay que volver a medir las zonas del cuerpo que usa `outfit.ts`. Las comprueba `tools/kits.py`.
- **Lola** se ve algo más violeta de lo previsto con la luz de día azulada. Hay que revisarla con la luz de noche de G1.

## Capturas

En `/tmp/pb-09-jugadores/`:
- `comparar-jugadores.png`, `comparar-pala-bola.png`, `comparar-juego.png`, `comparar-horizontal.png` y `comparar-tv.png`;
- las sueltas, en `antes/` y `despues/`.
