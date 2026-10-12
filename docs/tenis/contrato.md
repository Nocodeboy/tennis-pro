# Tenis 0.1 · contrato entre simulación, gráficos e interfaz

Empezado en la rama `tenis` de `Nocodeboy/padel-pro` (12 oct 2026); desde el 13 oct, en `Nocodeboy/tennis-pro`. Germán: «aprovechar el motor que tenemos en los juegos de pádel y pickleball y hacer nuestro propio juego de tenis». Decidió:

- **Base:** el pádel 0.6 (puntuación, sets, tie-break, físico, atributos, gráficos) más el individual del pickleball (`Nocodeboy/Pickleball`, IA de individual y pista abierta).
- **Modalidades:** individual y dobles desde la primera versión.
- **Superficies:** las tres (dura, tierra batida y hierba), con bote distinto.
- **Código:** rama `tenis` en `padel-pro`, sin fusionarse nunca en su `main` (el pádel, que se publica solo en Vercel). Trasladada a `Nocodeboy/tennis-pro` el 13 oct.

Este documento es lo que comparten las tres partes mientras se rehace el juego. Si algo cambia, se cambia aquí.

## Pista (`src/sim/court.ts`)

| Constante | Valor | Qué es |
|---|---|---|
| `L`, `HL` | 23,77 m, 11,885 m | largo de la pista y media pista (fondo en `z = ±HL`) |
| `W_D`, `W_S`, `W` | 10,97 m, 8,23 m, `W_D` | ancho de dobles, de individual, y el ancho al que se dibuja la pista |
| `SERVICE` | 6,40 m | la línea de saque, desde la red |
| `NET_C`, `NET_S` | 0,914 m, 1,07 m | altura de la red en el centro (la cinta central) y en los postes |
| `POST_X`, `STICK_X` | 6,40 m, 5,03 m | postes de dobles (0,914 m fuera de la línea de dobles) y palos de individual |
| `R` | 0,0335 m | radio de la bola |
| `LINE` | 0,025 m | media línea (las líneas miden 5 cm; la bola que toca la línea es buena) |
| `RUN` | fondo 6,40 m, lados 3,66 m | zona libre de una pista del circuito |
| `BOARDS` | `x = ±9,145`, `z = ±18,285` | las vallas de las gradas: la bola muerta se para ahí; nadie corre más allá |
| `DEPTH_Z` | 12,8 · 7,6 · 2,9 m | dónde esperan los jugadores: fondo (un paso tras la línea), media pista, red |
| `AT_NET` | 5,0 m | más cerca de la red que esto, el jugador «está en la red» |

- **Sin paredes.** No hay `WALL`, `sideTop`, `sideSurface` ni `backSurface`. La bola que bota fuera de las líneas es mala; la que bota dentro y no se devuelve antes del segundo bote es del que la pegó.
- `COURT.singles` (mutable, lo pone `Match`): qué líneas laterales valen. `halfW()` da la media anchura en juego.
- `CourtSurface = 'hard' | 'clay' | 'grass'` y `SURFACES`. La física de cada una está en `ball.ts` (`GROUND`); los colores, en el render.

## Reglas (`src/sim/types.ts`, `Rules`)

```ts
interface Rules {
  games: number;          // 6 en un set normal; tie-break a 7 con games-games
  golden: boolean;        // true: punto decisivo (sin ventaja); false: ventajas, como en el circuito
  sets?: 1 | 3 | 5;       // un set, al mejor de tres o al mejor de cinco
  surface?: CourtSurface; // 'hard' por defecto
}
```

- Individual o dobles lo decide el número de jugadores: `new Match(cfgs, rules, seed)` con 2 o 4 `PlayerCfg`. `match.doubles` lo dice.
- Saque por arriba desde detrás de la línea de fondo, cruzado al cuadro de saque, dos oportunidades, let. El resto tiene que botar.
- Saque: en individual alterna cada juego; en dobles rota entre los cuatro como en el pádel.
- `SERVE_HEIGHT` = 2,75 m (contacto del saque) y `SERVE_WINDUP` = 1,05 s (de que el sacador lanza la bola al contacto). La animación del saque se ajusta a estos números (el contacto en el segundo 1,05 del clip, o el clip escalado a ello).

## Golpes (`ShotKind`)

`'serve' | 'return' | 'drive' | 'slice' | 'dink' | 'drop' | 'lob' | 'smash' | 'speedup' | 'auto'`

| Tipo | En tenis | Animación sugerida |
|---|---|---|
| `serve` | saque por arriba (plano, cortado o liftado: `ShotSpec.spin`) | nuevo, desde el remate de captura (`smash_mocap`) |
| `return` | resto | derecha o revés de fondo |
| `drive` | golpe de fondo con liftado, derecha o revés; también el passing | `drive_mocap` / revés a dos manos `backhand_mocap` (del pickleball) |
| `slice` | cortado: bajo, con efecto hacia atrás | derecha/revés con el gesto de arriba abajo |
| `dink` | dejada de volea, volea suave | volea |
| `drop` | dejada desde el fondo | golpe de fondo suave |
| `lob` | globo | final con la raqueta subiendo |
| `smash` | remate | `smash_mocap` |
| `speedup` | volea firme | volea |
| `auto` | bloqueo, volea de reflejo, bola automática segura | volea o golpe corto |

Ya no existen `bandeja`, `vibora`, `bajada`, `Special` (por 3 / por 4) ni `Plan.wall` / `Plan.bajada`.

## Eventos (`MatchEvent`)

- Se quita `wall` (no hay paredes). Se quitan los motivos de punto `wall`, `exit` y `back`, y la falta de saque `serveFence`.
- `bounce` lleva `out` (cuánto se fue, en metros) cuando la bola bota fuera: para el «¡fuera!» ajustado y, más adelante, el ojo de halcón.
- `hit` lleva `spin` (el efecto del golpe) en vez de `special`.
- `point` con motivo `winner` y `rally === 1` es un **ace**.

## Atributos (`src/sim/attributes.ts`)

`pot` potencia · `con` control · `vel` velocidad · `ref` reflejos · `saq` saque · `red` red (volea y remate) · `tq` toque. Claves de i18n: `attr.<clave>` y `attr.<clave>.short`.

## Jugadores (`src/sim/brain.ts` y `src/tour.ts`)

Los `id` internos se mantienen (las equipaciones, los cuerpos y las caras van por `id`). Nombres al estilo del PES sin licencia, como en el pádel: suenan a tenistas reales sin ser su nombre. **Riesgo legal** igual que en el pádel: para publicar lo decide el estudio.

| id | Nombre (brain.ts) | Apellido (tour.ts) | Suena a | Juego | Media |
|---|---|---|---|---|---|
| `paco` | Kasper | Rud | Casper Ruud | fondo con mucho liftado, sube poco; mejor en tierra | 63 |
| `lola` | Álex | de Miñor | Alex de Minaur | corre todo y lo devuelve todo, poca pegada | 72 |
| `bruno` | Danil | Medvédiev | Daniil Medvedev | plano y profundo, resta desde muy atrás, gran saque | 80 |
| `nuria` | Yannik | Siner | Jannik Sinner | pega muy fuerte y pronto desde el fondo | 83 |
| `reina` | Carlos | Alcarás | Carlos Alcaraz | lo hace todo: potencia, dejadas, red | 88 |
| `marta` | Marcel | Granoyers | Marcel Granollers | tu pareja de dobles: especialista, sólido en la red | 78 |

- **Individual:** `RIVALS` en orden, del primer partido a la final (cinco rondas: dieciseisavos a la final).
- **Dobles:** `PAIRS` como en el pádel (paco-lola, lola-bruno, bruno-nuria, nuria-reina) y tu pareja `PARTNER` (Marcel).

## Quién toca qué

- **Simulación** (`src/sim/*`, `src/human.ts`, `src/input.ts`, `tools/`): física, reglas, puntuación, IA, control.
- **Gráficos** (`src/render/*`, `assets/anims`, `assets/props`, `assets/light`): pista, red, raqueta, estadio, cámaras, animaciones.
- **Interfaz** (`src/main.ts`, `src/broadcast.ts`, `src/explain.ts`, `src/i18n.ts`, `src/tour.ts`, `src/kits.ts`, `src/audio.ts`, `src/style.css`, `build.mjs`): menús, cuadro, marcador, textos, sonido, marca.

## Cambios al cerrar la 0.1 (13 oct)

- **Saque:** el sacador está 15 cm detrás de la línea de fondo, a 0,55 m de la marca central en individual y a 2,4 m en dobles (`SERVE_SPOT`). `Match.serveContact(p)` da el punto de contacto.
- **Vallas:** la bola viva que llega a las vallas acaba el punto. Si ya había botado dentro, es del que la pegó (`winner`, `miss` o `letGo`). Si no, es `out` (en el saque, falta).
- **`ShotSpec.spin`:** el efecto propio de un golpe (plano, cortado o liftado en el saque). `hit` lo lleva siempre.
- **`Plan.kind`:** el golpe que la CPU ya ha decidido al salir a por la bola (un cortado). La vista lo usa para preparar el golpe.
- **`Rules.sets` 5:** el tie-break del quinto set va a 10 (`Match.tiebreakTo()`).
- **Fichas:** Siner (control y reflejos 90, toque 73), Alcarás (control 87, toque 85) y Granoyers (control 85, reflejos 88, toque 69). Las medias no cambian (83, 88 y 78). Los detalles, en `notas-01-simulacion.md`.
