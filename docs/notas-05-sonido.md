# Notas 0.5 · Sonido

Germán: «el sonido tiene que mejorar… en esta versión suena como raro». Sin oídos, todo se ha medido: cada sonido renderizado offline (OfflineAudioContext en Chromium), la sonoridad en LUFS (BS.1770), los picos, el espectro y lo que pide un partido jugado de verdad (gestos reales por CDP, 14–16 puntos, 5,5 min).

## Qué sonaba raro (y por qué)

La 0.4 no tocó `audio.ts` (es idéntico a la 0.3). Contra la 0.2, el mismo partido grabado suena casi igual (−36,4 frente a −36,2 LUFS): el «crack» de los gestos fuertes (potencia > 0,65) salió en el 5 % de los golpes (10 de 219) y el por 3 una vez por partido. Lo raro no era una regresión de la 0.4, sino la mezcla:

1. **La bola era lo que menos se oía.** Sonoridad momentánea de cada sonido (máx. en 400 ms): drive −36,7 LUFS, chiquita −44,5; pero rugido −27, «uy» −35, aplauso −35,6, campana del árbitro −34,7, la melodía de punto −33,2 y el chirrido de zapatilla −36 (tan alto como un drive, y salía 27 veces por minuto).
2. **El público estallaba en 3 de cada 4 puntos** (12 de 16): cualquier winner rápido sumaba 2,5 en `planReplay` y eso ya era un rugido. El rugido era ruido filtrado en tres bandas más un aplauso de centroide 8,5 kHz: un «shhh» 10 dB por encima del peloteo.
3. **Graves que un móvil no reproduce.** El cristal tenía el 98–99 % de su energía bajo 150 Hz (un seno de 118 → 62 Hz); remate, víbora y bajada el 81–88 %; el por 3 el 99 %. En el altavoz de un móvil el cristal casi desaparecía; con cascos era un «bum».
4. **Voces de sintetizador.** El «uy» eran 7 dientes de sierra por dos filtros: un zumbido.

## Qué cambia

- **Golpes grabados** (`assets/sfx`, IA de ElevenLabs vía Magnific, 9 tomas de 14, 42 KB en total, ver su README): familia suave para chiquita, dejada y bloqueo; dura para drives, voleas y remates; fundido de potencia constante entre las dos según la potencia del gesto. Nunca repite la misma toma dos veces seguidas, con ±3,5 % de tono y ±7 % de volumen. El crack sintetizado solo va encima en el por 3 y el por 4. Cristal y bote también son grabados (el cristal más fuerte y un poco más grave según la velocidad, con un realce a 520 Hz para que se oiga en el móvil). La malla es sintetizada: el golpe apagado de la bola y el traqueteo del panel metálico. El fondo de la pista suena más bajo (−5 dB) y más apagado (paso bajo de 16 a 3,5 kHz); el panorama sigue la x en pantalla.
- **Las tomas se cargan con el primer toque.** Se recorta el inicio de cada una al decodificarla, por si el decodificador añade silencio. Si fallan, cada familia vuelve a su versión sintetizada, con ganancia de compensación (medido con `AUDIO_NOSFX=1`).
- **Espacio y mezcla.** Reverb de pabellón con respuesta al impulso generada (1,3 s, oscurece al apagarse) para la pista, el público y la campana (que suena por la megafonía). La interfaz va en seco. Al final hay un limitador. El nivel del partido sube de −36 a −29 LUFS.
- **Público.** El murmullo son 26 voces renderizadas (sílabas, frases y pausas) en un bucle de 7 s que suena dos veces, desfasado y abierto en estéreo, sin un periodo audible. Crece con los peloteos largos y baja en las repeticiones (con un seguro: si una repetición no avisa de que terminó, a los 25 s vuelve). El «uy» son 36 voces y el rugido 50, con formantes que se mueven. El aplauso son 700 palmadas resonantes (centroide 2 kHz, antes 8,5). Ruge solo con el por 3 o el por 4, un remate o una cinta ganadores, un peloteo de 24 golpes o más, y el final del partido. Un winner normal o un peloteo largo se llevan un aplauso cálido.
- **Chirridos** −7 dB y como mucho uno cada 0,35 s. **La interfaz** suena más suave: un toque de dos notas por punto.
- **Música:** el tema de menú del pickleball (`assets/music/menu-loop.mp3`, bucle de 11,27 s a 83,27 s), solo en los menús, a −25 LUFS. Ajustes tiene «Música: Sí / No», separado de «Sonido».

## Medidas (después)

| sonido | LUFS mom. | | sonido | LUFS mom. |
|---|---|---|---|---|
| remate / por 3 | −18,9 / −18,1 | | cristal suave / fuerte | −22,3 / −18,2 |
| drive (potencia 0,5 / 0,9) | −24,5 / −19,4 | | bote | −25,0 |
| chiquita | −27,2 | | malla | −26,9 |
| drive al fondo | −32,2 | | rugido / «uy» / aplauso | −20,9 / −26,0 / −27,6 |
| zapatilla | −43,0 | | murmullo (partido / tensión) | −40,2 / −36,1 |

- 90 s del mismo partido: −28,8 LUFS integrados (antes −36,2), pico −3,9 dBFS, ningún bloque por encima de −3 dBFS. En la banda que reproduce un móvil (> 150 Hz) da −31,2 (antes −36,7).
- Carga: el toque que desbloquea el audio tarda 34 ms; las tomas y los buffers del público están listos a los 0,56 s (Chromium sin GPU).
- Build del artefacto (`dist/artifact.html`): pide las 9 tomas y la música con rutas relativas, todas con 200; el motor queda en marcha, con las tomas cargadas y la música sonando; consola limpia. Partido jugado (14 puntos): ningún error.

## Pendiente

- **Voz** (árbitro, «¡vamos!»): no hay presupuesto para voz generada; queda la campana.
- **Más tomas:** solo hay 2 duras y 2 suaves, y la pala-fuerte-2 es casi toda grave. Harían falta unas 6 duras, 4 suaves y tomas propias de malla, cinta y público real. Puede generarlas Magnific: «crowd ooh», «arena applause».
- **Repeticiones:** no guardan la potencia ni el especial (no hay crack del por 3) ni los golpes en pared. Es `view.record`, en `src/render`.
- Los chirridos salen 27 veces por minuto (`view.onSqueak`); ahora son discretos, pero siguen siendo muchos.
- Falta escucharlo: Germán, con el móvil y con cascos (las voces del público y la malla, sobre todo).

## Herramientas (`tools/audio/`)

`prep-sfx.py` (tomas → `assets/sfx`), `render.py suite|match|decode` (render offline y tabla; acepta el motor de otra versión, por ejemplo `git show 3080ddf:src/audio.ts`), `record.py` (graba las llamadas de un partido jugado con `tools/audit/ux/play.py`), `events.py` (frecuencias y solapes), `fetch-check.py` (el artefacto pide los sonidos), `analyse.py` (LUFS, picos, centroide).
