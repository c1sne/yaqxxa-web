# vendor

Dependencias de terceros, guardadas acá como archivo y no traídas de un CDN.

Un CDN significa que la página deja de funcionar sin internet, que un tercero
sabe quién la abre, y que alguien más puede cambiar el código que corre en tu
navegador. Vendorizar cuesta peso en el repositorio y lo resuelve todo eso.

| archivo | qué es | versión | licencia |
|---|---|---|---|
| `aframe.min.js` | A-Frame — escenas 3D y WebXR declarativas, sobre Three.js | 1.7.0 | MIT |
| `tone.min.js` | Tone.js — instrumentación WebAudio: sintes, transport, efectos | 15.1.22 | MIT |

## Por qué A-Frame

La pregunta obligatoria antes de cada dependencia es: **¿qué capacidad
perderíamos si desapareciera?**

Perderíamos el mundo 3D y el camino corto a WebXR. No perderíamos el banco, ni
la invocación, ni la procedencia, ni nada del núcleo: el bloque MUNDO se carga
solo cuando alguien lo abre, y el resto de yaqxxa funciona con el archivo
borrado.

Se eligió sobre las alternativas por esto:

- **WebGL crudo** — sin dependencias, pero 385 líneas para una escena mínima
  (probado en el prototipo 003) y todo el trabajo de WebXR a mano.
- **Three.js** — más control y menos peso, pero hay que escribir la sesión XR,
  los controles y el bucle de render.
- **A-Frame** — trae Three.js adentro, la sesión XR resuelta, y un modelo
  declarativo donde cada propiedad es un parámetro con nombre. Eso último es lo
  que lo hace encajar: yaqxxa ya piensa en parámetros con nombre.

**Riesgo declarado:** A-Frame trae su propio modelo conceptual —entidades HTML,
su sistema de componentes, su bucle de render— y quiere ser dueño del DOM donde
vive. Es el mismo riesgo que se le marcó a Strudel y a Hydra: una herramienta
que aporta capacidad y de paso importa su manera de pensar. Se acepta acotado a
un bloque, detrás de una interfaz propia, y no debe filtrarse al resto del
sistema.

**Carga diferida:** el archivo pesa 1,28 MB y **no se descarga al abrir la
página**. Se carga la primera vez que alguien despliega el bloque MUNDO. En una
laptop modesta o con datos móviles, eso importa.

## Por qué Tone.js

Decisión de Andrés (20 ago 2026): audio con Tone.js, video con shaders propios.

**¿Qué perderíamos si desapareciera?** La instrumentación —sintes, envolventes,
efectos, transport con swing— pero no el lenguaje: Tone.js es una biblioteca,
no un lenguaje de live coding. A diferencia de Strudel, no trae mini-notation
ni un modelo de tiempo que pueda volverse el nuestro sin decidirlo. El bloque
SINTE conserva su interfaz propia (poner/iniciar/detener/nivel) así que
reemplazar el motor por otro es cambiar un archivo.

**Carga diferida:** 345 KB que no se descargan al abrir la página; se cargan la
primera vez que el sinte arranca.

**Riesgo declarado:** Tone.Transport es dueño del reloj mientras corre. Si un
día el lenguaje de yaqxxa define su propio tiempo, habrá que decidir quién
manda — está anotado para que no pase en silencio.
