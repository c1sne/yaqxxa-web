// tablero.js — el tablero como espacio de patching.
//
// Referencia asumida: PatchXR / ComfyUI. El espacio se navega (rueda = zoom,
// arrastrar el fondo = paneo, doble clic = volver), los bloques se arrastran
// desde su cabecera y se redimensionan desde sus bordes y su esquina, y cada
// bloque tiene dos puntos de conexión: entrada a la izquierda, salida a la
// derecha. Un cable se tira de un punto al otro.
//
// Un cable no es decoración: la semántica la define quien monta el tablero
// (main.js). Un cable sin semántica se guarda igual, y el sistema lo dice.
//
// Todo el estado —posiciones, tamaños, vista, cables— vive en tu navegador.

const VISTA = 'yaqxxa.vista';
const POSICIONES = 'yaqxxa.posiciones';
const GRAFO = 'yaqxxa.grafo';

const MUNDO_ANCHO = 6000, MUNDO_ALTO = 6000;
// Los bloques viven alrededor del centro del mundo, no de la esquina: así hay
// espacio para ordenar y zoomear en todas las direcciones.
const ORIGEN = 2700;
const Z_MIN = 0.35, Z_MAX = 2.5;

let vista = { x: 0, y: 0, z: 1 };
let pos = {};
let conexiones = [];
let alAviso = () => {};
let alCambioDeCable = () => {};

let tableroEl = null, lienzoEl = null, svg = null;
let zTope = 10;

const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// Los bloques se renombraron (invocar→codigo, sinte→audio, visual→video) y el
// estado guardado en el navegador de quien ya venía usando esto tiene los ids
// viejos. Sin esto, se le perderían las posiciones y los cables en silencio.
const RENOMBRES = {
  'bloque-invocar': 'bloque-codigo',
  'bloque-sinte': 'bloque-audio',
  'bloque-visual': 'bloque-video'
};
const alDia = id => RENOMBRES[id] || id;

function migrar() {
  const pos = leer(POSICIONES, null);
  if (pos && Object.keys(pos).some(k => k in RENOMBRES)) {
    guardar(POSICIONES, Object.fromEntries(Object.entries(pos).map(([k, v]) => [alDia(k), v])));
  }
  const grafo = leer(GRAFO, null);
  if (grafo && grafo.some(c => c.de in RENOMBRES || c.a in RENOMBRES)) {
    guardar(GRAFO, grafo.map(c => ({ de: alDia(c.de), a: alDia(c.a) })));
  }
  const abiertos = leer('yaqxxa.abiertos', null);
  if (abiertos && Object.keys(abiertos).some(k => k in RENOMBRES)) {
    guardar('yaqxxa.abiertos', Object.fromEntries(Object.entries(abiertos).map(([k, v]) => [alDia(k), v])));
  }
}

export function conectado(de, a) {
  return conexiones.some(c => c.de === de && c.a === a);
}

export function montarTablero(opciones = {}) {
  migrar();
  alAviso = opciones.alAviso || (() => {});
  alCambioDeCable = opciones.alCambioDeCable || (() => {});
  conexiones = leer(GRAFO, null) ?? (opciones.cablesIniciales || []);
  guardar(GRAFO, conexiones);

  tableroEl = document.querySelector('#tablero');
  lienzoEl = document.querySelector('#lienzo-t');

  // en pantallas chicas el tablero es una lista: nada de zoom ni cables,
  // pero las conexiones por defecto siguen valiendo como datos
  if (!matchMedia('(min-width: 900px)').matches) return;

  const vistaGuardada = leer(VISTA, null);
  if (vistaGuardada) vista = vistaGuardada;
  pos = leer(POSICIONES, {});

  // Quien ya usó el tablero tiene posiciones cerca de la esquina (el origen
  // viejo). Se corren al centro y la vista se corre igual: visualmente no
  // cambia nada, pero ahora hay mundo alrededor.
  if (!leer('yaqxxa.centrado', false)) {
    for (const k of Object.keys(pos)) {
      pos[k].x = (pos[k].x || 0) + ORIGEN;
      pos[k].y = (pos[k].y || 0) + ORIGEN;
    }
    if (Object.keys(pos).length) guardar(POSICIONES, pos);
    if (vistaGuardada) {
      vista.x -= ORIGEN * vista.z;
      vista.y -= ORIGEN * vista.z;
      guardar(VISTA, vista);
    }
    guardar('yaqxxa.centrado', true);
  }

  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('cables');
  svg.setAttribute('width', MUNDO_ANCHO);
  svg.setAttribute('height', MUNDO_ALTO);
  lienzoEl.prepend(svg);

  for (const b of lienzoEl.querySelectorAll('details.bloque')) prepararBloque(b);

  navegacion();
  focoDeBloques();
  tecladoHistoria();
  if (!vistaGuardada) encuadrar();
  aplicarVista();
  dibujarCables();
  marcarHistoria();   // el estado con el que se llegó es el piso de la historia
}

/** La vista queda mostrando los bloques, con margen, a zoom 1. */
function encuadrar() {
  const bloques = [...lienzoEl.querySelectorAll('details.bloque')];
  if (!bloques.length) { vista = { x: -ORIGEN, y: -ORIGEN, z: 1 }; return; }
  const minX = Math.min(...bloques.map(b => b.offsetLeft));
  const minY = Math.min(...bloques.map(b => b.offsetTop));
  vista = { x: 36 - minX, y: 24 - minY, z: 1 };
  guardar(VISTA, vista);
}

// ── vista: zoom y paneo ──────────────────────────────────────────────────────

function aplicarVista() {
  lienzoEl.style.transform = `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})`;
}

const pantallaAMundo = (cx, cy) => {
  const r = tableroEl.getBoundingClientRect();
  return { x: (cx - r.left - vista.x) / vista.z, y: (cy - r.top - vista.y) / vista.z };
};

function navegacion() {
  tableroEl.addEventListener('wheel', e => {
    e.preventDefault();
    const nz = Math.min(Z_MAX, Math.max(Z_MIN, vista.z * Math.exp(-e.deltaY * 0.0015)));
    const r = tableroEl.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    vista.x = cx - (cx - vista.x) * (nz / vista.z);
    vista.y = cy - (cy - vista.y) * (nz / vista.z);
    vista.z = nz;
    aplicarVista(); guardar(VISTA, vista);
  }, { passive: false });

  let pan = null;
  tableroEl.addEventListener('pointerdown', e => {
    if (e.target !== tableroEl && e.target !== lienzoEl && e.target !== svg) return;
    e.preventDefault();   // sin esto el navegador arranca una selección de texto
    pan = { x0: e.clientX, y0: e.clientY, vx: vista.x, vy: vista.y };
    tableroEl.setPointerCapture(e.pointerId);
  });
  tableroEl.addEventListener('pointermove', e => {
    if (!pan) return;
    vista.x = pan.vx + (e.clientX - pan.x0);
    vista.y = pan.vy + (e.clientY - pan.y0);
    aplicarVista();
  });
  tableroEl.addEventListener('pointerup', () => { if (pan) { pan = null; guardar(VISTA, vista); } });

  tableroEl.addEventListener('dblclick', e => {
    if (e.target !== tableroEl && e.target !== lienzoEl && e.target !== svg) return;
    encuadrar();
    aplicarVista();
  });
}

// ── bloques: arrastre, redimensión, puertos ──────────────────────────────────

function prepararBloque(bloque) {
  const p = pos[bloque.id];
  if (p) {
    if (p.x != null) { bloque.style.left = p.x + 'px'; bloque.style.top = p.y + 'px'; }
    if (p.w != null) bloque.style.width = p.w + 'px';
    if (p.h != null) bloque.style.height = p.h + 'px';
  } else {
    // la posición por defecto del CSS, llevada al centro del mundo
    bloque.style.left = (bloque.offsetLeft + ORIGEN) + 'px';
    bloque.style.top = (bloque.offsetTop + ORIGEN) + 'px';
  }

  arrastre(bloque);
  for (const dir of ['e', 's', 'se']) asa(bloque, dir);
  puertos(bloque);
  expandir(bloque);
  bloque.addEventListener('toggle', dibujarCables);
}

function guardarBloque(bloque, conTamano) {
  const p = pos[bloque.id] || {};
  p.x = bloque.offsetLeft; p.y = bloque.offsetTop;
  if (conTamano) { p.w = bloque.offsetWidth; p.h = bloque.offsetHeight; }
  pos[bloque.id] = p;
  guardar(POSICIONES, pos);
}

function arrastre(bloque) {
  const cab = bloque.querySelector('summary');
  let x0, y0, bx, by, movido = false, pid = null;

  cab.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.puerto')) return;
    pid = e.pointerId;
    try { cab.setPointerCapture(pid); } catch {}
    x0 = e.clientX; y0 = e.clientY;
    bx = bloque.offsetLeft; by = bloque.offsetTop;
    movido = false;
    bloque.style.zIndex = ++zTope;
  });
  cab.addEventListener('pointermove', e => {
    if (pid === null) return;
    const dx = (e.clientX - x0) / vista.z, dy = (e.clientY - y0) / vista.z;
    if (!movido && Math.hypot(dx, dy) * vista.z < 5) return;
    movido = true;
    bloque.style.left = Math.max(0, bx + dx) + 'px';
    bloque.style.top = Math.max(0, by + dy) + 'px';
    dibujarCables();
  });
  cab.addEventListener('pointerup', () => {
    if (pid === null) return;
    pid = null;
    if (movido) { guardarBloque(bloque, false); marcarHistoria(); }
  });
  cab.addEventListener('click', e => { if (movido) { e.preventDefault(); movido = false; } });
}

function asa(bloque, dir) {
  const el = document.createElement('div');
  el.className = 'asa asa-' + dir;
  bloque.append(el);

  let x0, y0, w0, h0, pid = null;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.stopPropagation();
    pid = e.pointerId;
    try { el.setPointerCapture(pid); } catch {}
    x0 = e.clientX; y0 = e.clientY;
    w0 = bloque.offsetWidth; h0 = bloque.offsetHeight;
    bloque.style.zIndex = ++zTope;
  });
  el.addEventListener('pointermove', e => {
    if (pid === null) return;
    const dx = (e.clientX - x0) / vista.z, dy = (e.clientY - y0) / vista.z;
    if (dir !== 's') bloque.style.width = Math.max(240, w0 + dx) + 'px';
    if (dir !== 'e' && bloque.open) bloque.style.height = Math.max(120, h0 + dy) + 'px';
    dibujarCables();
  });
  el.addEventListener('pointerup', () => {
    if (pid === null) return;
    pid = null;
    guardarBloque(bloque, true);
    marcarHistoria();
    // el monitor de A-Frame escucha resize de window, no de su contenedor
    window.dispatchEvent(new Event('resize'));
  });
}

// ── foco: en qué bloque estoy ────────────────────────────────────────────────
//
// En vivo importa saber a dónde va cada tecla. Un bloque tiene el foco cuando
// se hace clic en él; el borde se enciende y el teclado que ese bloque escucha
// deja de ser ambiguo: WASD camina en el MONITOR y solo ahí, ⌃⏎ evalúa en el
// CÓDIGO y solo ahí, ⌘Z ordena el tablero solo cuando no hay bloque con foco.
//
// El foco no se guarda: es de la sesión, no del patch.

let conFoco = null;
let alFoco = () => {};

export const bloqueConFoco = () => conFoco;
export const escucharFoco = fn => { alFoco = fn; };

export function enfocar(bloque) {
  if (conFoco === bloque) return;
  const antes = conFoco;
  if (antes) antes.classList.remove('con-foco');
  conFoco = bloque || null;
  if (conFoco) conFoco.classList.add('con-foco');
  alFoco(conFoco, antes);
}

function focoDeBloques() {
  document.addEventListener('pointerdown', e => {
    const bloque = e.target.closest?.('details.bloque');
    // clic en el fondo del tablero: nadie tiene el foco
    enfocar(bloque && lienzoEl.contains(bloque) ? bloque : null);
  }, true);

  // escribir en un campo enfoca su bloque: el indicador tiene que ser fiel a
  // dónde va el teclado, o en vivo miente
  document.addEventListener('focus', e => {
    const bloque = e.target?.closest?.('details.bloque');
    if (bloque && lienzoEl.contains(bloque)) enfocar(bloque);
  }, true);
}

// ── deshacer / rehacer ───────────────────────────────────────────────────────
//
// La historia es del TABLERO: mover, redimensionar, conectar y cortar cables.
// El texto del editor no pasa por acá — el textarea tiene el deshacer nativo
// del navegador, y pisárselo sería peor que no tener nada.
//
// ⌘Z / ⌃Z deshace · ⌘⇧Z / ⌃⇧Z (o ⌃Y) rehace · máx. 100 pasos, en memoria.

const historial = [];
let hIndice = -1;
const HIST_MAX = 100;

function foto() {
  const bloques = {};
  for (const b of lienzoEl.querySelectorAll('details.bloque')) {
    bloques[b.id] = { left: b.style.left, top: b.style.top, width: b.style.width, height: b.style.height };
  }
  // un bloque expandido vive fuera del lienzo mientras dura: no entra en la
  // foto, y deshacer no lo toca. Límite conocido y aceptado.
  return { bloques, cables: conexiones.map(c => ({ ...c })) };
}

function marcarHistoria() {
  historial.splice(hIndice + 1);
  historial.push(foto());
  if (historial.length > HIST_MAX) historial.shift();
  hIndice = historial.length - 1;
}

function aplicarFoto(f) {
  for (const [id, g] of Object.entries(f.bloques)) {
    const b = document.getElementById(id);
    if (!b || b.classList.contains('expandido')) continue;
    b.style.left = g.left; b.style.top = g.top;
    b.style.width = g.width; b.style.height = g.height;
    const q = pos[id] || (pos[id] = {});
    q.x = b.offsetLeft; q.y = b.offsetTop;
    if (g.width) q.w = b.offsetWidth;
    if (g.height) q.h = b.offsetHeight;
  }
  guardar(POSICIONES, pos);
  conexiones = f.cables.map(c => ({ ...c }));
  guardar(GRAFO, conexiones);
  dibujarCables();
}

export function deshacer() {
  if (hIndice <= 0) { alAviso('no hay nada más que deshacer'); return; }
  hIndice--;
  aplicarFoto(historial[hIndice]);
  alAviso(`deshecho (${hIndice}/${historial.length - 1})`);
}

export function rehacer() {
  if (hIndice >= historial.length - 1) { alAviso('no hay nada que rehacer'); return; }
  hIndice++;
  aplicarFoto(historial[hIndice]);
  alAviso(`rehecho (${hIndice}/${historial.length - 1})`);
}

function tecladoHistoria() {
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const enTexto = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '') ||
                    document.activeElement?.isContentEditable;
    const k = e.key.toLowerCase();
    if (k === 'z') {
      if (enTexto) return;                    // el editor conserva su deshacer nativo
      if (conFoco && conFoco.id === 'bloque-monitor') return;   // el mundo tiene lo suyo
      e.preventDefault();
      if (e.shiftKey) rehacer(); else deshacer();
    } else if (k === 'y' && !enTexto) {
      e.preventDefault();
      rehacer();
    }
  });
}

// ── expandido ────────────────────────────────────────────────────────────────
//
// Un bloque puede ocupar la pantalla entera sin salir de la aplicación: no es
// pantalla completa del sistema operativo, es el bloque agrandado sobre el
// tablero. Útil sobre todo para el MONITOR, que es donde uno quiere mirar.
// Escape lo devuelve.

let expandidoActual = null;

function expandir(bloque) {
  const btn = document.createElement('button');
  btn.className = 'expandir';
  btn.type = 'button';
  btn.title = 'expandir — Escape para volver';
  btn.textContent = '⤢';
  bloque.querySelector('summary').append(btn);

  btn.addEventListener('pointerdown', e => e.stopPropagation());   // no arrastrar
  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    alternarExpandido(bloque);
  });
}

// Dónde estaba el bloque antes de expandirse, para devolverlo a su sitio.
const nido = new WeakMap();

export function alternarExpandido(bloque) {
  const abrir = expandidoActual !== bloque;
  if (expandidoActual) devolver(expandidoActual);
  if (abrir) {
    bloque.open = true;
    // Un ancestro con transform —el lienzo del tablero— se vuelve el marco de
    // referencia de position:fixed, así que el bloque se mediría contra los
    // 6000px del mundo en vez de contra la ventana. Se saca del lienzo
    // mientras dure el expandido y se devuelve exactamente a su lugar.
    nido.set(bloque, { padre: bloque.parentNode, hermano: bloque.nextSibling });
    document.body.append(bloque);
    bloque.classList.add('expandido');
    bloque.querySelector('.expandir').textContent = '⤡';
    expandidoActual = bloque;
  }
  document.body.classList.toggle('hay-expandido', !!expandidoActual);
  // los motores que dibujan escuchan resize de window, no de su contenedor
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  dibujarCables();
}

function devolver(bloque) {
  bloque.classList.remove('expandido');
  bloque.querySelector('.expandir').textContent = '⤢';
  const n = nido.get(bloque);
  if (n && n.padre) n.padre.insertBefore(bloque, n.hermano);
  nido.delete(bloque);
  expandidoActual = null;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && expandidoActual) alternarExpandido(expandidoActual);
});

// ── puertos y cables ─────────────────────────────────────────────────────────

function puertos(bloque) {
  // Los puertos viven en el summary, no en el details: el contenido de un
  // details plegado queda en ::details-content y no recibe clics, y un puerto
  // tiene que poder conectarse aunque el bloque esté plegado.
  const cab = bloque.querySelector('summary');
  for (const tipo of ['entrada', 'salida']) {
    const p = document.createElement('div');
    p.className = 'puerto ' + tipo;
    p.title = tipo === 'salida'
      ? 'salida — arrastrá hasta la entrada de otro bloque'
      : 'entrada';
    cab.append(p);
    if (tipo === 'salida') tirarCable(bloque, p);
  }
}

function tirarCable(bloque, puerto) {
  let pid = null, tent = null;

  puerto.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.stopPropagation();
    pid = e.pointerId;
    try { puerto.setPointerCapture(pid); } catch {}
    tent = trazo(); tent.classList.add('tentativo');
    svg.append(tent);
  });
  puerto.addEventListener('pointermove', e => {
    if (pid === null) return;
    const d = pantallaAMundo(e.clientX, e.clientY);
    tent.setAttribute('d', curva(salidaDe(bloque), d));
  });
  puerto.addEventListener('pointerup', e => {
    if (pid === null) return;
    pid = null;
    tent.remove(); tent = null;
    // setPointerCapture desvía el target: buscamos qué hay bajo el cursor
    const bajo = document.elementFromPoint(e.clientX, e.clientY);
    const entrada = bajo && bajo.closest('.puerto.entrada');
    const destino = entrada && entrada.closest('details.bloque');
    if (!destino || destino === bloque) return;
    alternarConexion(bloque.id, destino.id);
  });
}

function alternarConexion(de, a) {
  const i = conexiones.findIndex(c => c.de === de && c.a === a);
  if (i >= 0) {
    conexiones.splice(i, 1);
    alAviso(`cable ${nombre(de)} → ${nombre(a)} desconectado`);
  } else {
    conexiones.push({ de, a });
    alAviso(`cable ${nombre(de)} → ${nombre(a)} conectado`);
  }
  guardar(GRAFO, conexiones);
  dibujarCables();
  marcarHistoria();
  alCambioDeCable(de, a);
}

const nombre = id => (document.getElementById(id)?.querySelector('.tit')?.textContent || id).trim();

const salidaDe = b => ({ x: b.offsetLeft + b.offsetWidth, y: b.offsetTop + 16 });
const entradaDe = b => ({ x: b.offsetLeft, y: b.offsetTop + 16 });

const curva = (a, b) =>
  `M ${a.x} ${a.y} C ${a.x + 70} ${a.y}, ${b.x - 70} ${b.y}, ${b.x} ${b.y}`;

function trazo() {
  return document.createElementNS('http://www.w3.org/2000/svg', 'path');
}

export function dibujarCables() {
  if (!svg) return;
  for (const p of svg.querySelectorAll('path:not(.tentativo)')) p.remove();
  for (const c of conexiones) {
    const de = document.getElementById(c.de), a = document.getElementById(c.a);
    if (!de || !a) continue;
    if (de.parentNode !== lienzoEl || a.parentNode !== lienzoEl) continue;   // alguno está expandido
    const path = trazo();
    path.setAttribute('d', curva(salidaDe(de), entradaDe(a)));
    path.addEventListener('click', () => alternarConexion(c.de, c.a));
    svg.append(path);
  }
}
