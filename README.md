# ZANINI PERFORMANCE

Juego de karts 3D para navegador hecho con **Three.js + TypeScript + Vite**. Todo
(geometría, texturas, sonido y música) se genera por código: no hay archivos externos.

> Para Ale. 🏁

## Arrancar

```bash
npm install
npm run dev        # abre http://localhost:5173
npm run build      # genera la versión publicable en dist/
npm run preview    # sirve dist/ para probarla
```

`dist/` es estático: se puede subir tal cual a cualquier hosting (GitHub Pages,
Netlify, un servidor propio…). Las rutas son relativas, funciona en cualquier carpeta.

Pruebas automáticas (sin navegador):

```bash
npm run test:tracks   # valida los circuitos (solapes, radios, recta de salida)
npm run test:laps     # tiempos de vuelta por cilindrada (ninguno pasa de 1:20)
npm run test:ai       # 12 IA corren una carrera en cada circuito: nadie se atasca ni atraviesa muros
npm run test:assists  # comprueba que las ayudas mantienen en pista a un jugador torpe
```

## Cómo jugar

Elige un modo en el menú principal:

| Modo | Qué es |
| --- | --- |
| **Entrenamientos libres** | Vueltas ilimitadas, deltas por sector (verde = tu mejor, morado = el mejor absoluto) y el fantasma de tu mejor vuelta. |
| **Contrarreloj** | Bate el récord del circuito contra tu fantasma. El récord y el fantasma se guardan. |
| **Carrera rápida** | Circuito, vueltas, dificultad y número de rivales a tu gusto. |
| **Fin de semana** | Formato de karting: Libres (5 min) → Cronometrados (3 min) → **Prefinal** (la mitad de vueltas) → **Final**. La parrilla de la prefinal sale de los cronometrados y la de la final, del resultado de la prefinal. |
| **Tutorial** | 20 segundos como máximo: acelerar, girar, derrapar y mini-turbo. Se ofrece la primera vez. |
| **Campeonato** | 6 Grandes Premios, cada uno con clasificación y carrera. Puntos 25-18-15-12-10-8-6-4-2-1 y +1 por vuelta rápida si acabas en el top 10. Se guarda tras cada sesión: puedes cerrar el navegador y continuar. Tres calendarios: **Liga de Kartódromos**, **Campeonato Zanini** y **Copa Costa Blanca**. |

Reglas:

- **Salida parada** con semáforo de 5 luces. Si avanzas antes de que se apaguen: **+5 s**.
- **Atajar** (cortar por dentro de una curva fuera de la pista): en clasificación/libres invalida la vuelta; en carrera, primero aviso y después **+3 s** cada vez.
- Cuando el líder ve la **bandera a cuadros**, el resto termina su vuelta.

Consejos para ir rápido:

- El botón de derrape sin girar actúa como **freno de mano** (frena la zaga y la hace deslizar).
- **Derrapa** en las curvas: mantén el botón de derrape mientras giras. Las chispas pasan de
  blanco a **azul** (mini-turbo nivel 1) y a **naranja** (nivel 2). Suelta para salir disparada/o.
  Girar hacia dentro del derrape lo carga más rápido.
- Ponte detrás de otro kart en recta para coger **rebufo**.
- La hierba, la grava y la arena frenan mucho. Los pianos no.
- Si te quedas atascado, pulsa **reaparecer**.

## Circuitos

Ninguna vuelta pasa de 1:20, como en karting real: casi todos se dan en 35–55 s
(`npm run test:laps` lo comprueba en las tres cilindradas).

**Liga de Kartódromos** (instalaciones de karting de verdad, pequeñas y «ratoneras»: pista de 8–9 m,
tramos paralelos separados solo por hierba y neumáticos, horquillas y rectas cortas):

| Kartódromo | Longitud | Vuelta | Carácter |
| --- | --- | --- | --- |
| La Nucía | 825 m | ~45 s | El ratonero: ángulos de 90° y horquillas |
| Finestrat | 862 m | ~41 s | Ocho con puente sobre el trazado, subidas y bajadas |
| Elche · Palmeral | 1.090 m | ~46 s | El más rápido, curvas enlazadas entre palmeras |
| Santa Pola | 681 m | ~39 s | Nocturna bajo focos, el más corto y revirado |
| Xàbia · Montgó | 817 m | ~44 s | Técnico, con chicane final |
| Internacional Zanini | 1.158 m | ~52 s | Homologado, recta larga y pista de 9 m |

Cada kartódromo tiene **barrera de neumáticos** (negros en recta, rojos y blancos en curva), valla
perimetral con publicidad, **paddock** con carpas de equipo y karts en sus caballetes, furgonetas,
edificio del club con terraza y público, torre de tiempos, grada pequeña, **torres de focos**,
comisarios con bandera amarilla en las curvas y una arboleda que cierra el recinto.

**Circuitos Zanini:** Zanini Ring, Costa Blanca, Montaña (ocho con puente), Urbano Nocturno, Cantera y Gran Premio Zanini.

**Kartódromos de la Costa Blanca** (estrechos y revirados, con su monumento y barrera de neumáticos):
Benidorm (rascacielos e Intempo), Calpe (Peñón de Ifach), Altea (atardecer y cúpula azul),
Torrevieja (lagunas rosas y montañas de sal) y Dénia (puerto, castillo y faro).

En **Contrarreloj** cada circuito tiene medallas 🥇🥈🥉 (el oro es el récord del circuito).

## Desbloqueables

En *Perfil* eliges color, decoración del kart (la **Edición Ale** viene de serie) y casco.
Otros se ganan jugando: victorias, podios, campeonatos (en Difícil/Pro, el kart de **oro cromado**),
récords y medallas de contrarreloj.

## Después de la carrera

Al cruzar la meta hay una **repetición** de los últimos segundos con cámaras de TV (se puede saltar).
Los resultados incluyen un **gráfico de posiciones vuelta a vuelta** y un resumen: ganador, vuelta rápida,
mayor remontada, más adelantamientos y tus datos (mini-turbos, tiempo derrapando… y besos al muro).

## Controles

| Acción | Teclado | Mando | Táctil |
| --- | --- | --- | --- |
| Acelerar | ↑ / W | RT o A | ACEL |
| Frenar / marcha atrás | ↓ / S | LT o X | FRENO |
| Girar | ← → / A D | Stick izquierdo o cruceta | ◀ ▶ |
| Derrapar / freno de mano | Espacio / Mayús | RB, LB o B | DERRAPE |
| Reaparecer | R | Y | ↺ |
| Cambiar cámara | C | Select | (en pausa) |
| Pausa | Esc / P | Start | ❚❚ |

Las teclas se pueden **reasignar** en *Ajustes → Controles*. Los menús se manejan también con
flechas o con el mando (A aceptar, B volver). En móvil los controles táctiles aparecen solos
(se pueden forzar o quitar en Ajustes). A la izquierda, la **barra de dirección analógica**: pon el dedo
y deslízalo (cuanto más lejos del centro, más giras). También hay flechas o **inclinar el móvil**.
A la derecha, el racimo del pulgar: **ACEL** grande en la esquina, **DERRAPE** encima (también acelera:
puedes deslizar el pulgar de uno a otro sin soltar) y **FRENO** al lado. La aceleración automática es
opcional (desactivada por defecto; se cambia en Ajustes o en la pausa). Mejor en horizontal.

### Cilindrada y ayudas

- **Cilindrada:** 50cc (tranquilo), 100cc o 150cc (rápido). En móvil empieza en 100cc.
- **Ayudas:** *Media* te mantiene en la pista y frena si entras pasado en una curva; *Máxima* añade un
  copiloto que conduce cuando no tocas la dirección (ideal para empezar). Se cambian en Ajustes, al
  preparar la carrera o desde la pausa. Solo afectan a tu kart.

## Ajustes

- **Juego:** dificultad (Fácil / Normal / Difícil / Pro), vueltas y rivales. Solo en *Fácil* la IA se reagrupa (rubber-banding).
- **Gráficos:** calidad Baja (móvil) / Media / Alta, líneas de velocidad, fantasma.
- **Audio:** volumen general, efectos, música y música de menú on/off.
- **Controles:** teclas, táctil, aceleración automática, vibración del mando.
- **Cámara:** trasera, cercana o capó.
- **Perfil** (menú principal): nombre, dorsal y color del kart.

La dedicatoria de la pantalla de inicio está en `src/config.ts` (`DEDICATION`).

## Cómo añadir un circuito

Un circuito es solo un objeto de datos. Todo lo demás (malla de la pista, muros,
pianos, escapatorias, línea de carrera de la IA, perfil de frenadas, sectores,
minimapa y vista previa) se calcula automáticamente.

1. Crea `src/track/circuits/miCircuito.ts`:

```ts
import type { TrackDef } from '../TrackData';
import { rounded, type V } from './helpers';

// Polígono: [x, z, radio de la curva, altura?, anchura?, escapatoria izq?, escapatoria dcha?]
// Cada vértice se convierte en una curva del radio indicado. Medidas en metros.
const poly: V[] = [
  [-200, 0, 0],      // recta de meta
  [150, 0, 30],
  [180, 120, 20],
  [0, 160, 40, 3],   // esta curva está 3 m más alta
  [-220, 110, 25],
];

export const miCircuito: TrackDef = {
  id: 'mi-circuito',
  name: 'Mi Circuito',
  subtitle: 'Rápido',
  description: 'Descripción para la pantalla de selección.',
  theme: 'ring',            // ring | coast | mountain | night | quarry | gp
  points: rounded(poly),
  width: 12,                // anchura de la pista (m)
  runoff: 7,                // escapatoria hasta el muro (m)
  surface: 'grass',         // grass | gravel | sand | asphalt (frenan distinto)
  startAt: 0.1,             // dónde está la meta (fracción de vuelta)
  laps: 4,
  record: { time: 40.0, holder: 'M. Zanini' },
  length: 1000,             // informativa; la real se calcula
  difficulty: 2,            // estrellas 1..5
  decor: [
    { type: 'tree', side: 0, every: 20, offset: 8, jitter: 5 },
    { type: 'grandstand', side: -1, every: 34, offset: 5, from: 0.95, to: 0.1 },
  ],
  scatter: [{ type: 'tree', count: 120, minDist: 30, maxDist: 160 }],
};
```

2. Regístralo en `src/track/circuits/index.ts` (añádelo a `CIRCUITS`; el orden es el del campeonato).
3. Ejecuta `npm run test:tracks`: avisa si el trazado se solapa consigo mismo o si la
   meta/parrilla cae en una curva (ajusta `startAt`); deja vistas previas SVG en `track-previews/`. Luego `npm run test:ai`
   para comprobar que la IA lo completa.

Si dos tramos se cruzan a distinta altura (≥ 4 m), se detecta un **puente** automáticamente
(mira `montana.ts`). Tipos de decoración: `tree, pine, palm, rock, building, lamp,
grandstand, tyres, banner, cone, crate, promenade`. `sea` añade mar (ver `costaBlanca.ts`).

## Arquitectura

```
src/
  core/      utilidades, entrada (teclado/mando/táctil), ajustes, guardado
  track/     circuitos como datos + Track (muestreo de la spline, proyecciones)
  physics/   física arcade del kart (derrape, turbo, rebufo, colisiones, muros)
  ai/        pilotos, línea de carrera y conductor IA
  race/      simulación de sesión y reglamento, fantasma/récords, campeonato
  engine/    render: escena del circuito, kart low-poly, partículas, cámara, texturas
  audio/     motor, efectos y música con Web Audio
  ui/        HUD, minimapa, controles táctiles, estilos
  game/      flujo de menús y modos (Game) y vista de carrera (RaceView)
```

La simulación (`race/RaceSim.ts`) no depende del render: corre a 120 Hz fijos y es la
misma que usan las pruebas automáticas.

Parámetros de depuración en la URL: `?autopilot` (la IA conduce tu kart) y `?speed=4`
(acelera la simulación).
