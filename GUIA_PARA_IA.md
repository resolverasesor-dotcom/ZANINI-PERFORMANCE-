# Guía rápida para continuar este proyecto (para ChatGPT u otra IA)

Juego de karts 3D para navegador: **Three.js 0.170 + TypeScript + Vite**. Sin archivos externos:
texturas con canvas, sonido sintetizado con Web Audio. ~12.700 líneas en `src/`.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # versión publicable en dist/ (estática, base relativa)
```

Pruebas sin navegador (ejecútalas tras cada cambio de física, IA o circuitos):

```bash
npm run typecheck
npm run test:physics   # banco de dinámica: aceleración, frenada, agarre, derrapes, parrilla quieta
npm run test:ai        # carreras completas solo con IA en todos los circuitos (sin atravesar muros, parrilla quieta)
npm run test:tracks    # validez de los trazados (solapes, radios, recta de salida); genera SVG
npm run test:laps      # tiempos de vuelta por cilindrada (ninguno > 1:20)
npm run test:assists   # ayudas a la conducción con un "jugador torpe" simulado
npm run test:chassis   # modelos de kart: tiempos equilibrados y carácter de cada uno
```

Parámetros de depuración en la URL: `?autopilot` (la IA conduce tu kart), `?speed=3` (acelera el tiempo).

## Mapa del código

| Carpeta | Qué hay | Lo más importante |
| --- | --- | --- |
| `src/physics/Kart.ts`, `tyre.ts` | Física del kart | Vehículo de 4 ruedas a 960 Hz: cargas por rueda (transferencias + jacking del avance), neumático de deslizamiento combinado con relajación, eje trasero macizo, ruedas con inercia, embrague centrífugo, frenos con bloqueo, Ackermann, choques por impulso. Constantes en `KART`, `TYRE_FRONT`, `TYRE_REAR`. |
| `src/physics/chassis.ts` | Modelos de kart | Cada modelo cambia masa, inercia, motor, compuesto, rigidez del chasis y frenos (`Kart.spec`), y elige carrocería (`body` en `KartModel.ts`). |
| `src/core/steerFilter.ts` | Filtro del mando | Escala la dirección del jugador con la velocidad (tope = límite de agarre, algo más en curva rápida para derrapar) y añade el contravolante del autoalineado del avance. Capa de entrada, no física. |
| `src/ai/` | IA | `RacingLine.ts` (trazada por banda elástica + perfil de velocidad), `AIDriver.ts` (persecución pura + dirección estacionaria, adelantar/defender, errores, saltitos, anti-atascos), `Drivers.ts` (11 pilotos). |
| `src/race/` | Reglamento | `RaceSim.ts` (sesión sin render: semáforo, salida anticipada, atajos, tiempos, posiciones, resultados), campeonato, fantasma/récords, medallas, desbloqueables, `assists.ts`. |
| `src/track/` | Circuitos como datos | Un circuito = polígono con radios (`circuits/helpers.ts → rounded()`). `Track.ts` muestrea la spline cada ~1 m. Añadir circuito: nuevo `TrackDef` y registrarlo en `circuits/index.ts`. |
| `src/engine/` | Render | `TrackScene.ts` (pista, muros/neumáticos, decorado), `kartVenue.ts` (kartódromo: paddock, valla, focos, comisarios), `KartModel.ts`, `Effects.ts` (partículas y rodadas), `CameraRig.ts`, `PostFX.ts`. |
| `src/audio/AudioEngine.ts` | Sonido | Motor 2T, neumáticos, pianos, roces, superficies, golpes, Doppler, público, música. |
| `src/game/` | Juego | `Game.ts` (menús, modos y garaje), `RaceView.ts` (bucle de carrera: física 120 Hz fija, cámara, efectos, audio, HUD, radio), `Intro.ts` (cortometraje inicial con guion, cámaras y efectos). |
| `src/ui/` | Interfaz | HUD, minimapa, controles táctiles, tutorial, radio del equipo (`TeamRadio.ts`), estilos. |
| `src/config.ts` | Identidad | Dedicatoria, colores, puntos. |

## Convenciones que conviene respetar

- Rumbo: adelante = `(sin yaw, cos yaw)`; derecha = `(-cos yaw, sin yaw)`. `yawRate` y `steer` positivos = derecha.
- Pista: `lat` positivo = derecha; los muros están en `hw + runL/runR`.
- La física corre a paso fijo de 1/120 s (8 subpasos dentro, 960 Hz). No la ates a los FPS.
- La simulación (`RaceSim`) no depende del render: así funcionan las pruebas sin navegador.
- Todo el texto del juego está en español.

## Ideas para un juego nuevo partiendo de esta base

- Cambia `config.ts` (nombre, dedicatoria, colores) y el logo en `src/ui/dom.ts`.
- Reutiliza tal cual física, IA, reglamento y audio; crea tus circuitos en `src/track/circuits/`.
- Para retocar el "tacto" del kart toca `KART` (`rollFront`, `jacking`, pesos, frenos) o los neumáticos en `tyre.ts`, y comprueba con `npm run test:physics` y `npm run test:ai`.
- Regla de la casa: nada de multiplicadores mágicos dentro de la física; lo que sea ayuda o filtro va fuera (`assists.ts`, `steerFilter.ts`).
