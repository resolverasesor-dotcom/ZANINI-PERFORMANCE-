# ZANINI PERFORMANCE

Juego de karts 3D para navegador hecho con **Three.js + TypeScript + Vite**. Todo
(geometría, texturas, sonido y música) se genera por código: no hay archivos externos.

> Para Ale, de papá. 🏁

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
| **Tutorial** | 20 segundos como máximo: acelerar, girar, dejar rodar el kart y el saltito. Se ofrece la primera vez. |
| **Campeonato** | 6 Grandes Premios, cada uno con clasificación y carrera. Puntos 25-18-15-12-10-8-6-4-2-1 y +1 por vuelta rápida si acabas en el top 10. Se guarda tras cada sesión: puedes cerrar el navegador y continuar. Tres calendarios: **Liga de Kartódromos**, **Campeonato Zanini** y **Copa Costa Blanca**. |

Reglas:

- **Salida parada** con semáforo de 5 luces. Si avanzas antes de que se apaguen: **+5 s**.
- **Atajar** (cortar por dentro de una curva fuera de la pista): en clasificación/libres invalida la vuelta; en carrera, primero aviso y después **+3 s** cada vez.
- Cuando el líder ve la **bandera a cuadros**, el resto termina su vuelta.

Consejos para ir rápido:

- **Frena lo mínimo.** Un kart pesa poco y apenas se frena al soltar el gas (unos 0,25 g), pero
  cuesta mucho que vuelva a coger velocidad (0-100 km/h en ~6,5 s). Conserva la inercia.
- **El derrape no es un botón**: sale solo cuando superas el agarre, por ejemplo al entrar pasado o al
  frenar girando (la zaga se descarga y se suelta). Un poco de deslizamiento es rápido; mucho, lento.
  El marcador muestra el ángulo: verde (bien), amarillo, rojo (te estás pasando). Contravolantea.
- **Saltito** (Espacio / RB / botón SALTITO): como hacen los pilotos de verdad, te levantas un instante del
  asiento para descargar peso. El eje trasero rígido deja de "clavarse" en las curvas lentas y el kart sale
  con más fuerza. Úsalo acelerando a la salida de las horquillas; cuando el eje está clavado, el
  marcador avisa con **⇡ SALTITO**. No sirve de nada en recta ni a fondo, y hay que esperar un instante
  entre saltito y saltito.
- Ponte detrás de otro kart en recta para coger **rebufo**.
- La hierba, la grava y la arena frenan mucho. Los pianos no.
- Si te quedas atascado, pulsa **reaparecer**.

## Física del kart

Vehículo de **4 ruedas** integrado a 960 Hz (8 subpasos por paso de 120 Hz), con los valores de un
kart de 125 cc con piloto (165 kg, batalla 1,04 m, vías 1,10 / 1,36 m). Nada de atajos: el derrape,
el arrastre del eje en curva y la rueda trasera interior en el aire **salen** del modelo.

- **Cargas por rueda**: estáticas + transferencia longitudinal (frenar/acelerar) + transferencia lateral
  repartida entre ejes por la rigidez del chasis + **jacking del avance de pivote** (al girar las ruedas
  pasa carga en diagonal y se descarga la trasera interior). Con un retardo por la flexión del chasis.
  Si una rueda se queda sin carga, se despega y su carga pasa a la otra del eje.
- **Neumático completo** (`src/physics/tyre.ts`): deslizamiento combinado longitudinal (κ) + lateral (α)
  con curva de fórmula mágica (acelerar o frenar a fondo deja menos agarre lateral), sensibilidad a la
  carga, longitud de relajación (la fuerza lateral se construye al rodar; estable también parado) y
  resistencia a la rodadura. Delanteros 10x4.50 y traseros 11x7.10, con parámetros distintos.
- **Eje trasero macizo**: las dos ruedas traseras giran a la misma velocidad. En curva la interior
  patina hacia delante y la exterior frena: el arrastre y el par que se opone al giro salen solos, y
  desaparecen cuando la rueda interior se levanta.
- **Ruedas con inercia**: eje trasero (con corona, disco y motor reducido) y cada rueda delantera libre;
  se ve y se oye el patinaje al acelerar y el bloqueo al frenar.
- **Motor** con potencia limitada, embrague centrífugo (en parado sube de vueltas), limitador y freno
  motor de transmisión directa; las revoluciones del sonido son las del eje trasero.
- **Frenos**: disco trasero sobre el eje y delanteros por rueda, con bloqueo real.
- **Dirección con geometría Ackermann** (cada rueda delantera su ángulo) y ángulo máximo fijo de 23°:
  la física **no** reduce la dirección con la velocidad. Como con teclado o pantalla no se puede dosificar
  2–3° de volante a 90 km/h, hay un **filtro de entrada del mando** (`src/core/steerFilter.ts`, se puede
  quitar en *Ajustes → Controles*), fuera de la física. "A tope" equivale al giro en el límite de agarre
  (~1,5 g), un poco por encima en curva rápida para que la trasera **derrape de forma natural** (5–15°), y
  menor en horquillas lentas, donde el eje macizo levanta la rueda interior y hay menos agarre. Además
  imita el **autoalineado del avance**: cuando la zaga se va, las ruedas buscan la dirección de marcha
  (contravolante), así que el derrape se sostiene y se recupera en lugar de acabar en trompo.
- **Saltito**: el piloto se levanta y echa el cuerpo hacia fuera y hacia delante. No multiplica nada: cambia
  el reparto de cargas (el peso total se conserva), descarga la trasera interior y libera el eje. Ayuda a
  girar en las curvas lentas; al límite puede hacer que la zaga se suelte.
- **Balanceo, cabeceo y rueda levantada visibles** calculados a partir de las cargas de cada rueda.
- **Ayudas** (capa aparte, como en un coche): control de estabilidad y de tracción, frenada automática
  y copiloto. No modifican la física.
- En parrilla los pilotos sujetan el kart con el freno (no hay marcha atrás al sujetar).

`npm run test:physics` mide aceleración, inercia, frenada, agarre lateral (~1,5 g), volantazo, frenar
girando, saltito, kart parado y la carga de cada rueda en curva.

## Sonido

Todo se sintetiza en el navegador con Web Audio (sin archivos de sonido):

- **Motor de dos tiempos 125 cc**: una explosión por vuelta (de ~40 a ~280 Hz entre 2.500 y
  17.000 rpm), onda de pulsos estrecha, ruido de escape que late con cada explosión, resonancias de la
  cámara de expansión y tartamudeo/petardeo al cortar gas. Embrague centrífugo: en parrilla sube de
  vueltas al acelerar.
- **Pianos**: el "brrrrr" de los resaltes a *velocidad / 0,42 m* Hz (48 Hz a 72 km/h), traqueteo del
  chasis, sonido del lado que pisas, golpe de entrada, temblor de cámara, el kart vibrando y
  vibración rítmica del mando y del móvil. Se detectan rueda a rueda (antes solo con el centro del kart,
  así que casi nunca sonaban). La IA también muerde los pianos en los vértices.
- **Neumáticos**: roce de goma al acercarte al límite de agarre y chirrido al deslizar, según el ángulo
  de deriva real.
- **Transmisión y rodadura**: silbido de la cadena (sube con la velocidad), rodadura sobre asfalto,
  hierba, crujido granular de la grava y viento.
- **Rivales** con estéreo y efecto Doppler al pasar (los 3 más cercanos).
- **Golpes y roces**: sordo con rebote de goma contra la barrera de neumáticos; "clac" de plástico entre
  karts; roce continuo de goma contra la barrera y de plástico contra otro kart (rueda a rueda, por el lado
  del contacto). Antes solo sonaban golpes de más de 3 m/s y casi todos los contactos son roces.
- **Fuera de pista**: baches del terreno, roce de la hierba, siseo de arena y crujido de grava.
- **Sin cortes**: voces de rivales estables (no se intercambian al reordenarse), sin cortes al soltar gas,
  compresor que no "bombea" y búfer de audio equilibrado para móviles.

## Sensaciones

- **Golpes**: sacudida de cámara, destello rojo en los bordes, micropausa de impacto en los fuertes,
  vibración del mando y del móvil, trozos de goma o de plástico (del color del kart) y chispas en el
  punto real de contacto; las pilas de neumáticos golpeadas se desplazan y vuelven a su sitio.
- **Fuera de pista**: el kart rebota con los baches, la cámara tiembla, vibra el mando/móvil, salen
  disparadas hierba y tierra (o arena) y quedan rodadas en el suelo.
- **Ambiente**: murmullo del público y ovación en la salida y en la bandera a cuadros.

## Circuitos

Ninguna vuelta pasa de 1:20, como en karting real: casi todos se dan en 35–60 s
(`npm run test:laps` lo comprueba en las tres cilindradas).

**Liga de Kartódromos** (instalaciones de karting de verdad, pequeñas y «ratoneras»: pista de 8–9 m,
tramos paralelos separados solo por hierba y neumáticos, horquillas y rectas cortas):

| Kartódromo | Longitud | Vuelta | Carácter |
| --- | --- | --- | --- |
| La Nucía | 825 m | ~48 s | El ratonero: ángulos de 90° y horquillas |
| Finestrat | 862 m | ~45 s | Ocho con puente sobre el trazado, subidas y bajadas |
| Elche · Palmeral | 1.090 m | ~50 s | El más rápido, curvas enlazadas entre palmeras |
| Santa Pola | 681 m | ~42 s | Nocturna bajo focos, el más corto y revirado |
| Xàbia · Montgó | 817 m | ~47 s | Técnico, con chicane final |
| Internacional Zanini | 1.158 m | ~57 s | Homologado, recta larga y pista de 9 m |

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
mayor remontada, más adelantamientos y tus datos (saltitos, tiempo derrapando… y besos al muro).

## Controles

| Acción | Teclado | Mando | Táctil |
| --- | --- | --- | --- |
| Acelerar | ↑ / W | RT o A | ACEL |
| Frenar / marcha atrás | ↓ / S | LT o X | FRENO |
| Girar | ← → / A D | Stick izquierdo o cruceta | ◀ ▶ |
| Saltito (descargar peso) | Espacio / Mayús | RB, LB o B | SALTITO |
| Reaparecer | R | Y | ↺ |
| Cambiar cámara | C | Select | (en pausa) |
| Pausa | Esc / P | Start | ❚❚ |

Las teclas se pueden **reasignar** en *Ajustes → Controles*. Los menús se manejan también con
flechas o con el mando (A aceptar, B volver). En móvil los controles táctiles aparecen solos
(se pueden forzar o quitar en Ajustes). A la izquierda, la **barra de dirección analógica**: pon el dedo
y deslízalo (cuanto más lejos del centro, más giras). También hay flechas o **inclinar el móvil**.
A la derecha, el racimo del pulgar: **ACEL** grande en la esquina, **SALTITO** encima (también acelera:
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
  physics/   vehículo de 4 ruedas (cargas por rueda, eje macizo, neumático combinado), colisiones
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
