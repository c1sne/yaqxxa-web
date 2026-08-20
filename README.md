# yaqxxa

**Entorno web de live coding, memoria territorial y soberanía digital.**

Versión 4. Empezada de cero el 20 de agosto de 2026, en Lima.

En vivo: **https://c1sne.github.io/yaqxxa-web/**

---

## Estado

Primer commit. Lo único que hace la página es preguntarle a tu navegador qué es
capaz de hacer —WebXR, WebGPU, WebAudio, AudioWorklet, MIDI— y decirlo sin
adornar.

Es poco a propósito. Lo que se construya acá se construye de a una cosa por vez,
y cada cosa tiene que funcionar antes de que entre la siguiente.

## Por qué de cero

Hubo tres prototipos antes. Cada uno demostró algo —que el código y los nodos
pueden ser dos vistas de un mismo estado; que el archivo vivo y la vigilancia se
construyen con el mismo mecanismo; que WebXR corre sin dependencias— y cada uno
lo hizo con su propio parser y su propio motor, sin acumular sobre el anterior.

Esta versión existe para tener un solo núcleo.

La investigación, la bitácora, las conversaciones de origen y esos tres
prototipos viven en un repositorio aparte, privado, que funciona como archivo.

## Correr localmente

```bash
python3 -m http.server 8080
```

Y abrir `http://localhost:8080`.

Nada de build, nada de `node_modules`, nada de instalación. Se abre, se lee y se
modifica. Cuando llegue el 3D, Three.js va a entrar como archivo local con
import map, no desde un CDN: XR sin bundler y sin red.

## Qué sigue

1. Un núcleo único: código y nodos como dos vistas de un mismo estado.
2. Que suene.
3. Un dato real, peruano y verificable, entrando a la performance.
4. Una palabra conseguida escuchando, no inventada.
5. XR sobre el mismo estado, no como aplicación aparte.

## Sobre esta página

No hay servidor detrás. No hay analítica, ni cookies, ni almacenamiento. Las
capacidades que muestra se miden en tu navegador y se quedan ahí. Son 90 líneas
en [`main.js`](main.js): se puede comprobar.

## Licencia

**Pendiente, y ahora importa.** Este repositorio es público y sin licencia
elegida, lo que legalmente significa *todos los derechos reservados* — lo
contrario de lo que el proyecto dice querer ser. Ver [`LICENSE`](LICENSE).

## Contexto

Se desarrolla en el marco de la Escuela de Sensibilización Tecnológica
Latinoamericana, con vínculos a Asimtria (Perú), Sonami y participantes de Chile,
agentes y espacios de México, Toda la Teoría del Universo y el Centro Cultural de
México.
