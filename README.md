# yaqxxa

**Entorno web de live coding, memoria territorial y soberanía digital.**

En vivo: **https://c1sne.github.io/yaqxxa-web/**

---

## El banco

El banco de yaqxxa no es un servidor. Es **una consulta**: todo lo que lleve la
etiqueta `yaqxxa` en archive.org forma parte de él.

```
subject:"yaqxxa"              todo el banco
identifier:yaqxxa-alarako-*   todos los depósitos de una palabra
```

Nadie lo aloja, nadie lo administra, nadie es su dueño. Dos personas en ciudades
distintas ven lo mismo porque le hacen la misma pregunta a archive.org. Cada
depósito pertenece a quien lo subió, bajo su propia cuenta. Si yaqxxa desaparece,
el banco sigue existiendo.

## Cómo se nombra

Un **depósito** es un ítem de archive.org y tiene un número. Dentro puede traer
una foto, un sonido y un video: los tres comparten el número.

```
yaqxxa-alarako-0
├── foto.jpg     →  ~alarako.f(0)
├── sonido.wav   →  ~alarako.s(0)
├── video.mp4    →  ~alarako.v(0)
└── ficha.json      la procedencia, como archivo
```

El número **no vive en ninguna base de datos**: va en el identificador. Como los
identificadores de archive.org son únicos globalmente, si `yaqxxa-alarako-0` ya
existe la creación falla y se prueba con el 1. Eso convierte la unicidad de
nombres en un contador atómico: dos personas subiendo a la vez desde ciudades
distintas no pueden pisarse, sin servidor y sin coordinación.

Y el número es estable para siempre. Si alguien borra el 0, no se renumera nada:
queda un hueco, y el instrumento lo dice en vez de disimularlo.

## Una palabra es lo que la gente le deposita

`alarako` no significa algo porque alguien le escribió una etimología. Significa
**lo que la gente puso bajo esa palabra**: `~alarako.f(0)` es una foto de
alguien, `~alarako.f(7)` es la de otra persona, y entre las dos hay una
diferencia que nadie tuvo que redactar.

De ahí sale la única regla del vocabulario:

> No se agrega una palabra escribiendo documentación. Se agrega dándole material.

## Depositar

Hacen falta tus llaves de archive.org — [archive.org/account/s3.php](https://archive.org/account/s3.php).
Se quedan en tu navegador y solo se envían a archive.org: yaqxxa **no tiene
servidor** donde guardarlas aunque quisiera.

Arrastrás el archivo, escribís la palabra, completás la ficha y depositás.

## Correr localmente

```bash
./servir.sh
```

Y abrir `http://localhost:8099`. Sin build, sin `node_modules`, sin instalación.

El script es `python3 -m http.server` con una diferencia que importa al
desarrollar: manda `Cache-Control: no-store`, así que editás un archivo,
recargás, y ves el cambio. Con el servidor pelado el navegador te devuelve la
versión anterior y perdés media hora buscando un bug que no existe.

Para elegir otro puerto: `./servir.sh 8080`.

## Cómo funciona por dentro

| endpoint | para qué |
|---|---|
| `archive.org/metadata/<id>` | leer la ficha de un depósito |
| `archive.org/cors/<id>/<archivo>` | leer los **bytes** — el único que da CORS |
| `archive.org/advancedsearch.php` | el índice, que es una búsqueda |
| `s3.us.archive.org` | depositar (PUT desde el navegador) |

`/download/` y `/serve/` **no** dan CORS. Sin `/cors/` no se pueden leer píxeles
ni decodificar audio, y el banco sería una vitrina en vez de un instrumento.

## Estado

- ✅ depositar desde el navegador a tu cuenta de archive.org
- ✅ invocar `~palabra.f(n)` `.s(n)` `.v(n)` y que se vea o suene
- ✅ índice por palabra, huecos detectados, procedencia en `ficha.json`
- ⬜ que los píxeles y las muestras se vuelvan material del lenguaje
- ⬜ traza degradada en el repositorio, para que exista sin archive.org
- ⬜ caché local para tocar sin red
- ⬜ 3D y XR

## Advertencias

Las llaves S3 de archive.org son de cuenta completa. Viven en `localStorage` de
tu navegador. **Por eso esta página no tiene ni una dependencia de terceros**: no
hay ningún script ajeno que pueda leerlas. Se rotan desde tu cuenta.

Lo que depositás es **público y permanente**. Si hay personas en el material,
tiene que haber consentimiento.

## Licencia

**Pendiente, y ahora importa** — repositorio público sin licencia significa
*todos los derechos reservados*. Ver [`LICENSE`](LICENSE).

## Contexto

Se desarrolla en el marco de la Escuela de Sensibilización Tecnológica
Latinoamericana. Lima, 2026.
