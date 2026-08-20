// mundo.js — el bloque MUNDO.
//
// Una escena de A-Frame chica, embebida en un bloque, cuyos parámetros son
// exactamente eso: parámetros con nombre. Lo mismo que el lenguaje va a mover
// cuando exista.
//
// Lo importante no es que haya 3D. Es que el mundo LEE DEL BANCO: una foto
// depositada en archive.org entra como textura de un objeto en el espacio. El
// depósito y el mundo no son dos sistemas, son el mismo material en dos
// lugares.
//
// A-Frame no se descarga al abrir la página: pesa 1,28 MB y se carga la primera
// vez que alguien abre este bloque. Ver vendor/README.md.

import * as ia from './ia.js';

let cargando = null;
let escena = null;
let anillo = null;
let rig = null;
let salidaVisual = null;

export const PARAMETROS = {
  giro:      { min: 0,   max: 180, paso: 1,    def: 18,  unidad: '°/s' },
  capas:     { min: 1,   max: 12,  paso: 1,    def: 5,   unidad: '' },
  escala:    { min: 0.2, max: 3,   paso: 0.05, def: 1,   unidad: '×' },
  distancia: { min: 1,   max: 8,   paso: 0.1,  def: 3,   unidad: 'm' },
  // el cuerpo que recorre el espacio
  velocidad: { min: 0,   max: 20,  paso: 0.1,  def: 3,   unidad: 'm/s' },
  salto:     { min: 0,   max: 15,  paso: 0.1,  def: 5,   unidad: 'm/s' },
  gravedad:  { min: 0,   max: 30,  paso: 0.1,  def: 9.8, unidad: 'm/s²' }
};

const DEL_CUERPO = new Set(['velocidad', 'salto', 'gravedad']);

const estado = Object.fromEntries(Object.entries(PARAMETROS).map(([k, v]) => [k, v.def]));
let texturaActual = null;

// ── carga diferida ───────────────────────────────────────────────────────────

export function cargarAframe() {
  if (window.AFRAME) return Promise.resolve();
  if (cargando) return cargando;
  cargando = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/aframe.min.js';
    s.onload = () => res();
    s.onerror = () => rej(new Error('no pude cargar A-Frame desde vendor/'));
    document.head.append(s);
  });
  return cargando;
}

// ── caminar ──────────────────────────────────────────────────────────────────
//
// A-Frame trae wasd-controls, pero escucha el teclado de toda la ventana: al
// escribir "w" en el editor la cámara se movía. Este componente es propio para
// poder decidir cuándo escucha, y porque sus valores —velocidad, salto,
// gravedad— tienen que ser parámetros del sistema, no ajustes escondidos.
//
// Va sobre un rig que contiene la cámara: mover el rig y no la cámara es lo
// correcto para XR, donde el visor manda sobre la posición de la cabeza.

let registrado = false;

function registrarCaminar(AFRAME) {
  if (registrado) return;
  registrado = true;

  AFRAME.registerComponent('caminar', {
    schema: {
      velocidad: { default: 3 },
      salto:     { default: 5 },
      gravedad:  { default: 9.8 },
      suelo:     { default: 0 },
      activo:    { default: false }
    },

    init() {
      this.teclas = new Set();
      this.vy = 0;
      this.enSuelo = true;
      this.dir = new AFRAME.THREE.Vector3();

      this.abajo = e => {
        if (!this.data.activo) return;
        // nunca robarle el teclado a quien está escribiendo
        const a = document.activeElement;
        if (a && (/^(INPUT|TEXTAREA)$/.test(a.tagName) || a.isContentEditable)) return;
        this.teclas.add(e.code);
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
          e.preventDefault();   // que la página no scrollee
        }
      };
      this.arriba = e => this.teclas.delete(e.code);
      this.soltarTodo = () => this.teclas.clear();

      window.addEventListener('keydown', this.abajo);
      window.addEventListener('keyup', this.arriba);
      window.addEventListener('blur', this.soltarTodo);
    },

    remove() {
      window.removeEventListener('keydown', this.abajo);
      window.removeEventListener('keyup', this.arriba);
      window.removeEventListener('blur', this.soltarTodo);
    },

    tick(tiempo, delta) {
      const dt = Math.min(100, delta || 16) / 1000;
      const d = this.data;
      const obj = this.el.object3D;
      const k = this.teclas;

      // desplazamiento en el plano, relativo a hacia dónde mira la cámara
      let x = 0, z = 0;
      if (k.has('KeyW') || k.has('ArrowUp'))    z -= 1;
      if (k.has('KeyS') || k.has('ArrowDown'))  z += 1;
      if (k.has('KeyA') || k.has('ArrowLeft'))  x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;

      if (x || z) {
        const cam = this.el.querySelector('[camera]');
        const giroY = cam ? cam.object3D.rotation.y : 0;
        this.dir.set(x, 0, z).normalize();
        const sin = Math.sin(giroY), cos = Math.cos(giroY);
        const mx = this.dir.x * cos + this.dir.z * sin;
        const mz = this.dir.z * cos - this.dir.x * sin;
        const vel = d.velocidad * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2 : 1);
        obj.position.x += mx * vel * dt;
        obj.position.z += mz * vel * dt;
      }

      // salto y gravedad
      if (k.has('Space') && this.enSuelo && d.salto > 0) {
        this.vy = d.salto;
        this.enSuelo = false;
      }
      if (!this.enSuelo || this.vy !== 0) {
        this.vy -= d.gravedad * dt;
        obj.position.y += this.vy * dt;
        if (obj.position.y <= d.suelo) {
          obj.position.y = d.suelo;
          this.vy = 0;
          this.enSuelo = true;
        }
      }
    }
  });
}

function registrarSuperficieVisual(AFRAME) {
  if (AFRAME.components['superficie-visual']) return;
  AFRAME.registerComponent('superficie-visual', {
    init() {
      this.canvas = null;
      this.textura = null;
      this.material = null;
      this.conectar = this.conectar.bind(this);
      this.el.addEventListener('object3dset', this.conectar);
      this.conectar();
    },

    conectar() {
      const malla = this.el.getObject3D('mesh');
      if (!malla || !salidaVisual) return;
      if (this.canvas === salidaVisual && this.material && malla.material === this.material) return;
      this.textura?.dispose();
      this.material?.dispose();
      this.canvas = salidaVisual;
      this.textura = new AFRAME.THREE.CanvasTexture(salidaVisual);
      this.textura.minFilter = AFRAME.THREE.LinearFilter;
      this.textura.magFilter = AFRAME.THREE.LinearFilter;
      this.material = new AFRAME.THREE.MeshBasicMaterial({
        map: this.textura,
        side: AFRAME.THREE.DoubleSide
      });
      malla.material = this.material;
    },

    tick() {
      if (!this.textura || this.canvas !== salidaVisual) this.conectar();
      if (this.textura) this.textura.needsUpdate = true;
    },

    remove() {
      this.el.removeEventListener('object3dset', this.conectar);
      this.textura?.dispose();
      this.material?.dispose();
    }
  });
}

// ── escena ───────────────────────────────────────────────────────────────────

export async function montar(contenedor) {
  await cargarAframe();
  if (escena) return escena;

  escena = document.createElement('a-scene');
  escena.setAttribute('embedded', '');
  escena.setAttribute('vr-mode-ui', 'enabled: false');       // el botón lo ponemos nosotros
  escena.setAttribute('renderer', 'colorManagement: true; antialias: true');
  escena.setAttribute('background', 'color: #0b0b0d');

  registrarCaminar(window.AFRAME);
  registrarSuperficieVisual(window.AFRAME);

  // rig: lo que se mueve. La cámara va adentro, a la altura de los ojos.
  rig = document.createElement('a-entity');
  rig.setAttribute('position', '0 0 0');
  rig.setAttribute('caminar', {
    velocidad: estado.velocidad, salto: estado.salto, gravedad: estado.gravedad, activo: false
  });

  const camara = document.createElement('a-entity');
  camara.setAttribute('camera', '');
  camara.setAttribute('position', '0 1.6 0');
  camara.setAttribute('look-controls', 'pointerLockEnabled: false');
  camara.setAttribute('wasd-controls', 'enabled: false');   // el nuestro es caminar
  rig.append(camara);
  escena.append(rig);

  const luz = document.createElement('a-entity');
  luz.setAttribute('light', 'type: ambient; color: #ffffff; intensity: 0.7');
  escena.append(luz);

  const luz2 = document.createElement('a-entity');
  luz2.setAttribute('light', 'type: directional; intensity: 0.5');
  luz2.setAttribute('position', '2 4 1');
  escena.append(luz2);

  const suelo = document.createElement('a-entity');
  suelo.setAttribute('geometry', 'primitive: plane; width: 24; height: 24');
  suelo.setAttribute('material', 'color: #14141a; side: double');
  suelo.setAttribute('rotation', '-90 0 0');
  suelo.setAttribute('position', '0 0 0');
  escena.append(suelo);

  registrarGirar(window.AFRAME);
  anillo = document.createElement('a-entity');
  anillo.setAttribute('position', '0 1.6 0');
  anillo.setAttribute('girar', 'velocidad', estado.giro);
  escena.append(anillo);

  contenedor.append(escena);
  if (!escena.hasLoaded) {
    await new Promise(res => escena.addEventListener('loaded', res, { once: true }));
  }
  reconstruir();
  return escena;
}

/** Rehace el anillo de piezas. Cada pieza lleva la textura del banco si la hay. */
function reconstruir() {
  if (!anillo) return;
  const n = Math.round(estado.capas);
  const piezas = [...anillo.children].filter(pieza => pieza.classList.contains('pieza'));

  while (piezas.length < n) {
    const pieza = document.createElement('a-entity');
    pieza.classList.add('pieza');
    pieza.setAttribute('geometry', 'primitive: plane; width: 1; height: 1');
    pieza.setAttribute('look-at', '[camera]');
    anillo.append(pieza);
    piezas.push(pieza);
  }
  while (piezas.length > n) piezas.pop().remove();

  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const pieza = piezas[i];
    pieza.setAttribute('position', {
      x: Math.sin(a) * estado.distancia,
      y: Math.sin(i * 1.7) * 0.35,
      z: -Math.cos(a) * estado.distancia
    });
    pieza.setAttribute('scale', `${estado.escala} ${estado.escala} ${estado.escala}`);
    aplicarMaterial(pieza, i, n);
  }
}

function aplicarMaterial(pieza, i, n) {
  if (salidaVisual) {
    pieza.setAttribute('material', 'shader: flat; color: #ffffff; side: double');
    pieza.setAttribute('superficie-visual', '');
  } else if (texturaActual) {
    pieza.removeAttribute('superficie-visual');
    pieza.setAttribute('material', {
      shader: 'flat', src: texturaActual, side: 'double', transparent: true
    });
  } else {
    pieza.removeAttribute('superficie-visual');
    // sin nada del banco: placas de color, y se nota que están vacías
    const tono = 45 + (i / n) * 140;
    pieza.setAttribute('material', `shader: flat; color: hsl(${tono}, 35%, 45%); side: double; opacity: 0.75`);
  }
}

/** Usa la salida animada del bloque VIDEO como superficie de todas las piezas. */
export function usarSalidaVisual(canvas) {
  salidaVisual = canvas || null;
  reconstruir();
}

/**
 * El anillo gira solo. Se hace con un componente propio y no con la animación
 * de A-Frame porque aquella, en bucle y sin `from`, toma la rotación actual al
 * arrancar: después de la primera vuelta queda en 360 y anima de 360 a 360, o
 * sea que se detiene. Un tick que suma grados por segundo no tiene ese
 * problema y además responde al cambio de velocidad sin reiniciar la vuelta.
 */
function registrarGirar(AFRAME) {
  if (AFRAME.components.girar) return;
  AFRAME.registerComponent('girar', {
    schema: { velocidad: { default: 18 } },
    tick(tiempo, delta) {
      if (!this.data.velocidad) return;
      const dt = Math.min(100, delta || 16) / 1000;
      this.el.object3D.rotation.y += this.data.velocidad * dt * Math.PI / 180;
    }
  });
}

function girar() {
  if (!anillo) return;
  anillo.setAttribute('girar', 'velocidad', estado.giro);
}

// ── parámetros ───────────────────────────────────────────────────────────────

export function poner(nombre, valor) {
  if (!(nombre in estado)) return;
  estado[nombre] = valor;
  if (DEL_CUERPO.has(nombre)) {
    if (rig) rig.setAttribute('caminar', nombre, valor);
  } else if (nombre === 'giro') {
    girar();
  } else {
    reconstruir();
  }
}

/** El teclado del mundo solo escucha cuando el monitor está activo. */
export function activarTeclado(si) {
  if (rig) rig.setAttribute('caminar', 'activo', !!si);
}
export const tecladoActivo = () => !!(rig && rig.getAttribute('caminar')?.activo);

export const leer = () => ({ ...estado });

// ── el banco entra al mundo ──────────────────────────────────────────────────

/**
 * Trae una invocación del banco y la pone como textura en el mundo.
 * La imagen se carga con crossOrigin porque WebGL necesita leer sus píxeles, y
 * por eso pasa por archive.org/cors/ y no por /download/.
 */
export async function traer(palabra, letra, n) {
  const r = await ia.resolver(palabra, letra, Number(n));
  if (r.error) throw new Error(r.error);
  if (letra !== 'f') throw new Error('por ahora el mundo solo acepta fotos — .f(n)');

  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('la imagen no cargó con permisos para WebGL'));
    i.src = r.url;
  });

  texturaActual = img;
  reconstruir();
  return { id: r.id, ancho: img.naturalWidth, alto: img.naturalHeight, imagen: img };
}

export function vaciar() { texturaActual = null; reconstruir(); }

// ── XR ───────────────────────────────────────────────────────────────────────

export async function soportaVR() {
  if (!navigator.xr) return false;
  try { return await navigator.xr.isSessionSupported('immersive-vr'); } catch { return false; }
}

export function entrarVR() {
  if (!escena) throw new Error('el mundo no está montado');
  escena.enterVR();
}
