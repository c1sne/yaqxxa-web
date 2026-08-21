// main.js — arma los dos bloques y los conecta al banco.

import * as ia from './ia.js';
import * as mundo from './mundo.js';
import * as tablero from './tablero.js';
import * as puente from './puente.js';
import * as compositor from './compositor.js';
import * as sinte from './sinte.js';
import * as visual from './visualx.js';

const $ = s => document.querySelector(s);
const crear = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

function estadoHeader(nombre, estado = '', detalle = '') {
  const el = document.querySelector(`[data-estado-modulo="${nombre}"]`);
  if (!el) return;
  el.classList.toggle('activo', estado === 'activo');
  el.classList.toggle('alerta', estado === 'alerta');
  if (detalle) el.title = detalle;
}

let piezas = [];   // [{ letra, nombre, archivo, url }]
let visualMonitor = null;

function compilarVisuales(fuente) {
  visualMonitor?.compilar(fuente);
  visual.compilar(fuente);
}

function ponerEnVisuales(señal) {
  visual.poner(señal);
  visualMonitor?.poner(señal);
}

// ── llaves ───────────────────────────────────────────────────────────────────

function pintarLlaves() {
  const c = ia.credenciales();
  const caja = $('#llaves');
  caja.innerHTML = '';

  if (c) {
    caja.className = 'llaves con';
    caja.append(
      crear('span', 'punto', '●'),
      crear('span', null, `llaves guardadas · ${c.acceso.slice(0, 6)}…`),
      Object.assign(crear('button', 'btn chico', 'olvidar'), {
        onclick: () => { ia.olvidarCredenciales(); pintarLlaves(); revisar(); }
      })
    );
    return;
  }

  caja.className = 'llaves sin';
  const acceso = Object.assign(crear('input'), { placeholder: 'access key', autocomplete: 'off', spellcheck: false });
  const secreto = Object.assign(crear('input'), { placeholder: 'secret key', type: 'password', autocomplete: 'off' });
  const guardar = Object.assign(crear('button', 'btn', 'guardar'), {
    onclick: () => {
      if (!acceso.value.trim() || !secreto.value.trim()) return;
      ia.guardarCredenciales(acceso.value, secreto.value);
      pintarLlaves(); revisar();
    }
  });
  const ayuda = crear('p', 'tenue');
  ayuda.innerHTML = 'llaves de <a href="https://archive.org/account/s3.php" target="_blank" ' +
    'rel="noopener">archive.org/account/s3.php</a> — se quedan en este navegador ' +
    '(<a href="#" data-abrir-doc>cómo funciona</a>)';
  caja.append(ayuda, acceso, secreto, guardar);
  ayuda.querySelector('[data-abrir-doc]').onclick = e => {
    e.preventDefault();
    abrirPanel($('#panel-doc'));
  };
}

// ── piezas ───────────────────────────────────────────────────────────────────

function agregar(lista) {
  for (const archivo of lista) {
    const tipo = (archivo.type || '').split('/')[0];
    const letra = ia.LETRAS[tipo];
    if (!letra) { aviso(`"${archivo.name}" no es foto, sonido ni video — lo salteo`); continue; }
    if (piezas.some(p => p.letra === letra)) { aviso(`ya hay ${ia.NOMBRES[letra]} en este depósito`); continue; }
    const ext = (archivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    piezas.push({ letra, nombre: `${ia.NOMBRES[letra]}.${ext}`, archivo, url: URL.createObjectURL(archivo) });
  }
  pintarPiezas(); revisar();
}

function pintarPiezas() {
  const caja = $('#piezas');
  caja.innerHTML = '';
  for (const p of piezas) {
    const el = crear('div', 'pieza');
    const vista = crear('div', 'vista');
    if (p.letra === 'f') vista.append(Object.assign(crear('img'), { src: p.url }));
    else if (p.letra === 'v') vista.append(Object.assign(crear('video'), { src: p.url, muted: true, playsInline: true }));
    else vista.append(crear('span', 'glifo', '≋'));

    const info = crear('div', 'info');
    info.append(
      crear('b', null, `.${p.letra}`),
      crear('span', 'tenue', ` ${p.nombre}`),
      crear('span', 'tenue', ` · ${(p.archivo.size / 1024).toFixed(0)} KB`)
    );
    const quitar = Object.assign(crear('button', 'btn chico', 'quitar'), {
      onclick: () => { URL.revokeObjectURL(p.url); piezas = piezas.filter(x => x !== p); pintarPiezas(); revisar(); }
    });
    el.append(vista, info, quitar);
    caja.append(el);
  }
}

// ── depositar ────────────────────────────────────────────────────────────────

const revisar = () => {
  $('#depositar').disabled = !(ia.credenciales() && piezas.length && $('#palabra').value.trim());
};

async function depositar() {
  const palabra = $('#palabra').value.trim();
  const btn = $('#depositar');
  btn.disabled = true;
  $('#resultado').hidden = true;

  try {
    const r = await ia.subir({
      palabra,
      piezas,
      fichaDatos: {
        que: $('#que').value.trim(),
        quien: $('#quien').value.trim(),
        donde: $('#donde').value.trim(),
        cuando: $('#cuando').value.trim(),
        notas: $('#notas').value.trim(),
        consentimiento: $('#consentimiento').checked,
        piezas: piezas.map(p => ({ letra: p.letra, archivo: p.nombre, bytes: p.archivo.size, tipo: p.archivo.type }))
      },
      alAvanzar: t => { $('#progreso').textContent = t; }
    });

    $('#progreso').textContent = '';
    const caja = $('#resultado');
    caja.hidden = false;
    caja.innerHTML = '';
    caja.append(crear('p', 'ok', `depositado como ${r.id}`));
    const invocaciones = crear('div', 'invocaciones');
    for (const p of piezas) {
      const t = `~${palabra}.${p.letra}(${r.n})`;
      invocaciones.append(Object.assign(crear('button', 'chip', t), {
        onclick: () => insertarEnEditor(t)
      }));
    }
    caja.append(invocaciones);
    const enlace = Object.assign(crear('a', null, 'verlo en archive.org →'), { href: r.url, target: '_blank', rel: 'noopener' });
    caja.append(enlace);

    for (const p of piezas) URL.revokeObjectURL(p.url);
    piezas = []; pintarPiezas();
    resumenBanco();
  } catch (e) {
    $('#progreso').textContent = '';
    const caja = $('#resultado');
    caja.hidden = false;
    caja.className = 'resultado error';
    caja.textContent = String(e.message || e);
  } finally {
    revisar();
  }
}

// ── slots del editor ─────────────────────────────────────────────────────────
//
// Referencia: KodeLife. El bloque CÓDIGO tiene varios textos independientes,
// numerados desde 1, con un + para agregar. La casilla de cada slot decide si
// participa cuando se evalúa todo: apagar un slot es callarlo sin borrarlo,
// que en vivo es lo que uno quiere.

const SLOTS = 'yaqxxa.slots';
const SLOT_SHADER_V1 = 'yaqxxa.slot-shader-v4';   // v4: el default pasa a composición

const SLOT_INICIAL = `# yaqxxa · ⌃⏎ evalúa la línea · ⌃⇧⏎ los slots activos · ⌃. silencio
# ~palabra.f(0) invoca del banco · densidad(0.5) mueve los motores

densidad(0.55)
pulso(96, 0.3)
capas(3)
cola(0.4)

~alarako.f(0)`;

let slots = [];
let slotActual = 0;
let shaderActual = visual.SHADER_INICIAL;

const esCodigoShader = fuente => /\bvoid\s+main\s*\(\s*\)/.test(fuente) && /gl_FragColor/.test(fuente);

// Un slot puede traer GLSL crudo o una composición —ruido(8), gira(0.2)…—.
// La composición se arma con compositor.js y sale como GLSL, así que de acá
// para abajo el motor no nota la diferencia.
const esVisual = fuente => esCodigoShader(fuente) || compositor.esComposicion(fuente);

function glslDelSlot(texto) {
  if (esCodigoShader(texto)) return texto;
  return compositor.componer(texto);   // lanza con línea y motivo si algo falta
}

function cargarSlots() {
  const guardado = (() => { try { return JSON.parse(localStorage.getItem(SLOTS)); } catch { return null; } })();
  if (guardado && Array.isArray(guardado.slots) && guardado.slots.length) {
    slots = guardado.slots;
    slotActual = Math.min(guardado.actual ?? 0, slots.length - 1);
  } else {
    slots = [{ texto: $('#editor').value || SLOT_INICIAL, activo: true }];
    slotActual = 0;
  }

  // La primera vez que llega esta versión, el shader pasa a ser el slot 2.
  // Si ya había código ahí, se conserva como slot 3.
  if (!localStorage.getItem(SLOT_SHADER_V1)) {
    const anterior = slots[1];
    // Una composición y no GLSL crudo: se lee, se toca y enseña el lenguaje
    // en la primera pantalla. El motor no nota la diferencia.
    slots[1] = { texto: compositor.EJEMPLO, activo: true };
    if (anterior?.texto?.trim() && !esCodigoShader(anterior.texto)) slots.splice(2, 0, anterior);
    try { localStorage.setItem(SLOT_SHADER_V1, '1'); } catch {}
  }
  const slotShader = slots.find(s => esVisual(s.texto));
  if (slotShader) shaderActual = slotShader.texto;
  $('#editor').value = slots[slotActual].texto;
  try { compilarVisuales(shaderActual); } catch (e) { anotar(String(e.message || e), 'mal'); }
  guardarSlots();
  pintarSlots();
}

const guardarSlots = () => {
  slots[slotActual].texto = $('#editor').value;
  try { localStorage.setItem(SLOTS, JSON.stringify({ slots, actual: slotActual })); } catch {}
};

function irASlot(i) {
  if (i === slotActual || !slots[i]) return;
  slots[slotActual].texto = $('#editor').value;
  slotActual = i;
  $('#editor').value = slots[i].texto;
  guardarSlots();
  pintarSlots();
}

function agregarSlot() {
  slots[slotActual].texto = $('#editor').value;
  slots.push({ texto: '', activo: true });
  slotActual = slots.length - 1;
  $('#editor').value = '';
  guardarSlots();
  pintarSlots();
  $('#editor').focus();
  anotar(`slot ${slots.length} agregado`);
}

function cerrarSlot(i) {
  if (slots.length === 1) { anotar('el último slot no se cierra', 'mal'); return; }
  slots.splice(i, 1);
  if (slotActual >= slots.length) slotActual = slots.length - 1;
  else if (i < slotActual) slotActual--;
  $('#editor').value = slots[slotActual].texto;
  guardarSlots();
  pintarSlots();
  recomponer(`slot cerrado · quedan ${slots.length}`);
}

function alternarSlot(i) {
  slots[i].activo = !slots[i].activo;
  guardarSlots();
  pintarSlots();
  recomponer(`slot ${i + 1} ${slots[i].activo ? 'activo' : 'apagado'}`);
}

function pintarSlots() {
  const barra = $('#slots');
  barra.innerHTML = '';
  slots.forEach((s, i) => {
    const el = crear('div', 'slot' + (i === slotActual ? ' actual' : '') + (s.activo ? '' : ' apagado'));
    el.title = s.activo ? 'activo — participa al evaluar todo' : 'apagado — se saltea al evaluar todo';

    const casilla = crear('span', 'casilla-slot', '✓');
    casilla.addEventListener('click', e => { e.stopPropagation(); alternarSlot(i); });

    const nombre = crear('span', null, String(i + 1));
    el.append(casilla, nombre);

    if (slots.length > 1) {
      const x = crear('span', 'cerrar-slot', '×');
      x.title = 'cerrar slot';
      x.addEventListener('click', e => { e.stopPropagation(); cerrarSlot(i); });
      el.append(x);
    }
    el.addEventListener('click', () => irASlot(i));
    barra.append(el);
  });

  const mas = crear('button', 'slot-mas', '+');
  mas.title = 'agregar slot';
  mas.addEventListener('click', agregarSlot);
  barra.append(mas);
}

// ── el editor: acá corre el lenguaje ─────────────────────────────────────────
//
// Referencia asumida: flok. Un cuadro negro donde se escribe; ⌃⏎ evalúa la
// línea del cursor y la hace destellar; ⌃⇧⏎ evalúa todas; ⌃. silencio.
// Invocar suena y se ve: el audio se reproduce, y la foto o el video ocupan el
// fondo del tablero. El tablero es el escenario.

const SINTAXIS = /^~?\s*([\p{L}\p{N}_-]+)\s*\.\s*([fsv])\s*\(\s*(\d+)\s*\)\s*$/u;
const LINEA_ALTO = 20;   // px — tiene que coincidir con el line-height del CSS

// Las palabras de señal: los siete nombres deliberadamente sosos del
// prototipo 002. Describen lo que hacen y nada más — el vocabulario situado
// sigue siendo un hueco, y las palabras con carga entran por el banco.
const SEÑAL = /^(densidad|peso|pulso|azar|capas|cola)\s*\(\s*([\d.,\s]*)\s*\)$/;

const lim = (v, a, b) => Math.min(b, Math.max(a, v));

/** El shader que deja el VIDEO en negro cuando ningún slot activo trae GLSL. */
const SHADER_NEGRO = `precision mediump float;
void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`;

/** Lee las palabras de señal de un texto sin aplicarlas a nada. */
function señalDe(texto) {
  const s = {};
  for (const cruda of texto.split('\n')) {
    const linea = cruda.split('#')[0].trim();
    const m = SEÑAL.exec(linea);
    if (!m) continue;
    const args = m[2].split(',').map(x => parseFloat(x)).filter(x => !Number.isNaN(x));
    if (!args.length) continue;
    const p = m[1];
    if (p === 'pulso') s.pulso = { bpm: lim(args[0], 30, 240), jitter: lim(args[1] ?? 0, 0, 1) };
    else if (p === 'capas') s.capas = Math.round(lim(args[0], 1, 8));
    else if (p === 'cola') s.cola = lim(args[0], 0, 0.95);
    else s[p] = lim(args[0], 0, 1);
  }
  return s;
}

const invocaFoto = texto => texto.split('\n')
  .some(l => SINTAXIS.test(l.split('#')[0].trim()));

/**
 * El estado de los motores se DERIVA de los slots activos: no se acumula.
 *
 * Antes la señal se mandaba al motor y ahí quedaba, así que apagar la casilla
 * de un slot no deshacía nada — el sonido seguía igual. Ahora se recompone
 * desde cero cada vez que cambia el conjunto de slots activos: apagar o cerrar
 * un slot quita su aporte de verdad, y si era el único que ponía densidad, se
 * va a silencio. Lo mismo con el shader: sin GLSL activo, el video va a negro.
 */
function recomponer(motivo = '') {
  if (slots[slotActual]) slots[slotActual].texto = $('#editor').value;
  const activos = slots.filter(s => s.activo);

  const señal = sinte.señalInicial();
  let hayTexto = false;
  for (const s of activos) {
    if (esVisual(s.texto)) continue;
    const aporte = señalDe(s.texto);
    if (Object.keys(aporte).length) hayTexto = true;
    Object.assign(señal, aporte);
  }

  if (tablero.conectado('bloque-codigo', 'bloque-audio')) {
    sinte.poner(señal);
    if (!hayTexto || !señal.densidad) { sinte.detener(); refrescarAudio(); }
  }
  if (tablero.conectado('bloque-codigo', 'bloque-video')) {
    ponerEnVisuales(señal);
    puente.emitir('senal-video', señal);
  }

  // el shader: si ningún slot activo lo trae, el video se va a negro
  const conShader = activos.find(s => esVisual(s.texto));
  let fuenteGlsl = SHADER_NEGRO;
  try {
    if (conShader) fuenteGlsl = glslDelSlot(conShader.texto);
    visual.compilar(fuenteGlsl);
  } catch (e) { anotar(e.message.split('\n')[0].slice(0, 80), 'mal'); }
  puente.emitir('shader', { fuente: fuenteGlsl });

  // y las fotos del banco: sin slot activo que invoque, no queda textura
  if (!activos.some(s => invocaFoto(s.texto))) {
    visual.vaciarTextura();
    puente.emitir('vaciar', null);
  }

  if (motivo) anotar(motivo);
}

function aplicarSeñal(nLinea, palabra, brutos, alaVista = true, donde = null) {
  donde = donde ?? `línea ${nLinea + 1}`;
  const args = brutos.split(',').map(x => parseFloat(x)).filter(x => !Number.isNaN(x));
  if (!args.length) {
    if (alaVista) destello(nLinea, 'mal');
    anotar(`${donde} · ${palabra}() necesita un número`, 'mal');
    return;
  }
  const alAudio = tablero.conectado('bloque-codigo', 'bloque-audio');
  const alVideo = tablero.conectado('bloque-codigo', 'bloque-video');
  if (!alAudio && !alVideo) {
    if (alaVista) destello(nLinea, 'mal');
    anotar(`${palabra}() no llega a ningún motor — conectá CÓDIGO al AUDIO o al VIDEO`, 'mal');
    return;
  }

  const s = {};
  if (palabra === 'pulso') s.pulso = { bpm: lim(args[0], 30, 240), jitter: lim(args[1] ?? 0, 0, 1) };
  else if (palabra === 'capas') s.capas = Math.round(lim(args[0], 1, 8));
  else if (palabra === 'cola') s.cola = lim(args[0], 0, 0.95);
  else s[palabra] = lim(args[0], 0, 1);

  if (alaVista) destello(nLinea);
  if (alAudio) { sinte.poner(s); sinte.iniciar().then(refrescarAudio).catch(e => anotar(e.message, 'mal')); }
  if (alVideo) {
    ponerEnVisuales(s);
    puente.emitir('senal-video', s);
  }
  anotar(`${palabra} → ${alAudio ? 'audio' : ''}${alAudio && alVideo ? ' + ' : ''}${alVideo ? 'video' : ''}`);
}

const cacheResolucion = new Map();   // "palabra.letra.n" → resultado de ia.resolver
const sonando = new Set();           // Audio en reproducción, para el silencio

async function resolverConCache(palabra, letra, n) {
  const clave = `${palabra}.${letra}.${n}`;
  if (cacheResolucion.has(clave)) return cacheResolucion.get(clave);
  const r = await ia.resolver(palabra, letra, n);
  // "no existe" no se cachea: puede existir dentro de un rato
  if (!r.error) cacheResolucion.set(clave, r);
  return r;
}

const lineaDelCursor = ed => ed.value.slice(0, ed.selectionStart).split('\n').length - 1;

function destello(nLinea, clase) {
  const ed = $('#editor');
  const f = crear('div', 'destello' + (clase ? ' ' + clase : ''));
  f.style.top = (10 + nLinea * LINEA_ALTO - ed.scrollTop) + 'px';
  $('#destellos').append(f);
  setTimeout(() => f.remove(), 650);
}

function anotar(texto, clase) {
  const caja = $('#estado-editor');
  caja.prepend(crear('div', clase || null, texto));
  while (caja.children.length > 4) caja.lastChild.remove();
}

function evaluarShader(fuente, numSlot = slotActual, alaVista = true) {
  try {
    // una composición se arma primero; el GLSL crudo pasa tal cual
    const compuesto = !esCodigoShader(fuente);
    const glsl = glslDelSlot(fuente);
    compilarVisuales(glsl);
    shaderActual = glsl;
    puente.emitir('shader', { fuente: glsl });
    if (alaVista) destello(lineaDelCursor($('#editor')));
    const pasos = compuesto
      ? fuente.split('\n').map(l => l.split('#')[0].trim()).filter(Boolean).length + ' operaciones'
      : 'shader';
    anotar(`slot ${numSlot + 1} · ${pasos} → VIDEO`);
  } catch (e) {
    if (alaVista) destello(lineaDelCursor($('#editor')), 'mal');
    anotar(`slot ${numSlot + 1} · ${String(e.message || e).trim()}`, 'mal');
  }
}

async function evaluarLinea(nLinea, textoSlot = null, numSlot = null) {
  const fuente = textoSlot ?? $('#editor').value;
  const alaVista = textoSlot === null;
  const cruda = (fuente.split('\n')[nLinea] || '');
  const texto = cruda.split('#')[0].trim();
  if (!texto) return;   // vacía o comentario
  const donde = alaVista ? `línea ${nLinea + 1}` : `slot ${numSlot + 1}:${nLinea + 1}`;

  // ¿es una palabra de señal? densidad(0.5), pulso(96, 0.3)…
  const ms = SEÑAL.exec(texto);
  if (ms) {
    aplicarSeñal(nLinea, ms[1], ms[2], alaVista, donde);
    return;
  }

  const m = SINTAXIS.exec(texto);
  if (!m) {
    if (alaVista) destello(nLinea, 'mal');
    anotar(`${donde} · no entiendo «${texto}» — la forma es ~palabra.f(0) o densidad(0.5)`, 'mal');
    return;
  }
  const [, palabra, letra, num] = m;
  if (alaVista) destello(nLinea);

  let r;
  try { r = await resolverConCache(palabra, letra, Number(num)); }
  catch (e) { anotar(`${donde} · ${e.message}`, 'mal'); return; }

  if (r.error) {
    if (alaVista) destello(nLinea, 'mal');
    let extra = '';
    try {
      const nums = await ia.indice(palabra);
      extra = nums.length
        ? ` — ~${palabra} tiene: ${nums.join(', ')}`
        : ` — ~${palabra} no tiene depósitos todavía`;
    } catch {}
    anotar(`${donde} · ${r.error}${extra}`, 'mal');
    return;
  }

  if (letra === 's') {
    const a = new Audio(r.url);
    a.crossOrigin = 'anonymous';
    sonando.add(a);
    a.addEventListener('ended', () => sonando.delete(a));
    a.play().catch(e => anotar(`${donde} · el audio no arrancó: ${e.message}`, 'mal'));
    anotar(`~${palabra}.s(${num}) suena · ${r.id}`);
  } else {
    mostrarEnEscenario(letra, r);
    anotar(`~${palabra}.${letra}(${num}) en escena · ${r.id}`);
    if (letra === 'f' && tablero.conectado('bloque-codigo', 'bloque-monitor')) {
      texturaMundoActual = { palabra, letra, n: Number(num), id: r.id };
      puente.emitir('textura', texturaMundoActual);
      if (mundoListo) {
        mundo.traer(palabra, letra, Number(num))
          .then(() => anotar(`~${palabra}.f(${num}) → también al monitor, por el cable`))
          .catch(() => {});
      }
    }
    // la foto entra al sintetizador de video como material, si el cable está
    if (letra === 'f' && tablero.conectado('bloque-codigo', 'bloque-video')) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        visual.textura(img);
        visualMonitor?.textura(img);
        texturaVideoActual = { palabra, letra, n: Number(num), id: r.id };
        puente.emitir('textura-video', texturaVideoActual);
        anotar(`~${palabra}.f(${num}) → textura del video, por el cable`);
      };
      img.src = r.url;
    }
  }
}

function mostrarEnEscenario(letra, r) {
  const esc = $('#escenario');
  esc.innerHTML = '';
  if (letra === 'f') {
    esc.append(Object.assign(crear('img'), { src: r.url, crossOrigin: 'anonymous' }));
  } else {
    const v = Object.assign(crear('video'), {
      src: r.url, crossOrigin: 'anonymous', playsInline: true, loop: true
    });
    esc.append(v);
    v.play().catch(() => {});
  }
}

function silencio() {
  for (const a of sonando) a.pause();
  sonando.clear();
  sinte.detener();
  refrescarAudio();
  visual.vaciarTextura();
  visualMonitor?.vaciarTextura();
  texturaVideoActual = null;
  puente.emitir('vaciar', null);
  $('#escenario').innerHTML = '';
  anotar('silencio');
}

/** ⌃⇧⏎ evalúa todos los slots activos, no solo el que se está mirando. */
function evaluarTodo() {
  slots[slotActual].texto = $('#editor').value;
  const activos = slots.map((s, i) => [s, i]).filter(([s]) => s.activo);
  if (!activos.length) { anotar('todos los slots están apagados', 'mal'); return; }

  for (const [s, i] of activos) {
    if (esVisual(s.texto)) {
      evaluarShader(s.texto, i, i === slotActual);
      continue;
    }
    const lineas = s.texto.split('\n');
    if (i === slotActual) {
      lineas.forEach((_, n) => evaluarLinea(n));
    } else {
      // los otros slots se evalúan sin destello: su texto no está a la vista
      lineas.forEach((_, n) => evaluarLinea(n, s.texto, i));
    }
  }
  if (activos.length > 1) anotar(`evaluados ${activos.length} slots`);
  // recomponer al final: si un slot apagado había dejado señal puesta antes,
  // acá se va
  recomponer();
}

/** Los chips del depósito escriben la invocación en el editor y la evalúan. */
function insertarEnEditor(texto) {
  const ed = $('#editor');
  const v = ed.value;
  ed.value = (v && !v.endsWith('\n') ? v + '\n' : v) + texto + '\n';
  ed.focus();
  evaluarLinea(ed.value.split('\n').length - 2);
}

async function resumenBanco() {
  try {
    const c = await ia.palabras();
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    const n = Object.keys(c).length;
    $('#resumen-banco').textContent = total
      ? `${n} palabra(s) · ${total} depósito(s)`
      : 'el banco está vacío';
    document.querySelector('.barra')?.setAttribute('data-banco', 'activo');
    estadoHeader('bank', 'activo', total ? `${total} depósitos disponibles` : 'banco conectado, sin depósitos');
  } catch (e) {
    $('#resumen-banco').textContent = e instanceof ia.Saturado ? 'archive.org saturado' : 'no pude leer el banco';
    document.querySelector('.barra')?.setAttribute('data-banco', 'alerta');
    estadoHeader('bank', 'alerta', 'no se pudo consultar el banco');
  }
}

// ── capacidades del dispositivo ──────────────────────────────────────────────

async function capacidades() {
  const bool = v => [v ? 'sí' : 'no', v ? 'si' : 'no'];
  const xr = async m => {
    if (!navigator.xr) return ['sin WebXR', 'no'];
    try { return bool(await navigator.xr.isSessionSupported(m)); } catch { return ['no se pudo consultar', 'no']; }
  };
  const filas = [
    ['contexto seguro (HTTPS)', bool(isSecureContext)],
    ['XR inmersivo (VR)', await xr('immersive-vr')],
    ['XR inmersivo (AR)', await xr('immersive-ar')],
    ['WebGL2', bool(!!document.createElement('canvas').getContext('webgl2'))],
    ['WebGPU', bool('gpu' in navigator)],
    ['WebAudio', bool('AudioContext' in window || 'webkitAudioContext' in window)],
    ['AudioWorklet', bool('AudioWorkletNode' in window)],
    ['WebMIDI', bool('requestMIDIAccess' in navigator)],
    ['núcleos', [navigator.hardwareConcurrency ?? '—', 'dato']],
    ['pantalla', [`${screen.width}×${screen.height} @${devicePixelRatio}x`, 'dato']]
  ];
  const dl = $('#capacidades');
  for (const [k, [v, c]] of filas) {
    dl.append(crear('dt', null, k), crear('dd', c, v));
  }
  const vr = filas[1][1][0] === 'sí', ar = filas[2][1][0] === 'sí';
  $('#veredicto').textContent = vr || ar
    ? 'Este dispositivo puede entrar a XR inmersivo.'
    : navigator.xr
      ? 'Hay WebXR pero no hay visor compatible conectado.'
      : 'Este navegador no tiene WebXR. En Quest, Android con Chrome o Vision Pro, sí.';
}

// ── avisos ───────────────────────────────────────────────────────────────────

function aviso(t) {
  const caja = $('#resultado');
  caja.hidden = false;
  caja.className = 'resultado error';
  caja.textContent = t;
  setTimeout(() => { if (caja.textContent === t) caja.hidden = true; }, 5000);
}

// ── arranque ─────────────────────────────────────────────────────────────────

const zona = $('#soltar');
['dragenter', 'dragover'].forEach(e => zona.addEventListener(e, ev => {
  ev.preventDefault(); zona.classList.add('encima');
}));
['dragleave', 'drop'].forEach(e => zona.addEventListener(e, ev => {
  ev.preventDefault(); zona.classList.remove('encima');
}));
zona.addEventListener('drop', ev => agregar(ev.dataTransfer.files));
$('#archivos').addEventListener('change', ev => { agregar(ev.target.files); ev.target.value = ''; });
$('#palabra').addEventListener('input', revisar);
$('#depositar').addEventListener('click', depositar);
$('#editor').addEventListener('input', () => { slots[slotActual].texto = $('#editor').value; });
$('#editor').addEventListener('blur', guardarSlots);
$('#editor').addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) evaluarTodo();
    else if (esCodigoShader($('#editor').value)) evaluarShader($('#editor').value);
    else evaluarLinea(lineaDelCursor($('#editor')));
  } else if (ctrl && e.key === '.') {
    e.preventDefault();
    silencio();
  }
});


// ── bloque mundo ─────────────────────────────────────────────────────────────

let mundoListo = false;
let texturaMundoActual = null;
let texturaVideoActual = null;

async function abrirMundo() {
  if (mundoListo) return;
  const nota = $('#nota-mundo');
  nota.textContent = 'cargando A-Frame (1,28 MB)…';
  nota.innerHTML = 'cargando <a href="https://aframe.io/" target="_blank" rel="noopener">A-Frame</a> (1,28 MB)…';
  try {
    await mundo.montar($('#escena'));
    mundoListo = true;
    estadoHeader('xr', 'activo', 'mundo inmersivo montado');
    nota.innerHTML = '<a href="https://aframe.io/" target="_blank" rel="noopener">A-Frame ' +
      (window.AFRAME?.version || '') + '</a> — desde <code>vendor/</code>, sin CDN.';
    pintarParametros();
    const vr = await mundo.soportaVR();
    $('#entrar-vr').hidden = !vr;
    $('#vr-nota').textContent = vr
      ? ''
      : navigator.xr
        ? 'no hay visor conectado — la escena en pantalla funciona igual'
        : 'este navegador no tiene WebXR (en Quest, Android con Chrome o Vision Pro, sí)';
    tecladoDelMundo();
  } catch (e) {
    nota.textContent = String(e.message || e);
  }
}

// ── el foco del mundo ────────────────────────────────────────────────────────
//
// WASD y espacio solo mueven la cámara cuando el monitor está activo: se
// activa al hacer clic en la escena, se suelta al hacer clic afuera o al
// tocar el editor. Sin esto, escribir "w" en el código te movía por el mundo.

function tecladoDelMundo() {
  const aviso = $('#foco-mundo');
  if (aviso) aviso.textContent = 'clic en el bloque para caminar por el mundo';
  const nota = $('#nota-mundo');
  if (nota && !nota.textContent.trim()) {
    nota.innerHTML = '<a href="https://aframe.io/" target="_blank" rel="noopener">A-Frame</a> ' +
      'pesa 1,28 MB y se carga solo al abrir este bloque.';
  }
}

/**
 * Un valor sale por el puerto de un parámetro y llega a los que tenga
 * conectados. Cada destino recibe el valor recortado a su propio rango: un
 * nivel de audio entre 0 y 1 llega a giro como 0 a 180°/s.
 */
function propagar(idOrigen, valor, visitados = new Set()) {
  if (visitados.has(idOrigen)) return;   // sin lazos infinitos
  visitados.add(idOrigen);

  // por el cable viaja una proporción, no el número crudo: escala 2.4 de un
  // rango 0.2–3 sale como 0.79, y cada destino la abre a su propio rango
  const specOrigen = mundo.PARAMETROS[idOrigen.split(':')[1]];
  const prop = specOrigen
    ? (valor - specOrigen.min) / (specOrigen.max - specOrigen.min)
    : valor;

  for (const destino of tablero.destinosDe(idOrigen)) {
    const [bloque, param] = destino.split(':');
    if (!param) continue;                       // cable al bloque entero: no es de parámetro
    const spec = mundo.PARAMETROS[param];
    if (bloque !== 'bloque-parametros' || !spec) continue;

    const v = spec.min + (spec.max - spec.min) * Math.min(1, Math.max(0, prop));
    const ajustado = spec.paso >= 1 ? Math.round(v) : v;
    ponerEnMundo(param, ajustado);

    const fila = [...document.querySelectorAll('.parametro')]
      .find(f => f.querySelector('span')?.textContent === param);
    if (fila) {
      fila.querySelector('input').value = ajustado;
      fila.querySelector('.valor').textContent =
        (spec.paso >= 1 ? ajustado : ajustado.toFixed(2)) + spec.unidad;
    }
    propagar(destino, ajustado, visitados);
  }
}

// Un cambio de parámetro va al mundo de esta pestaña y, por el puente, al de
// la pestaña aparte si está abierta. Las dos son el mismo mundo.
function ponerEnMundo(nombre, valor) {
  mundo.poner(nombre, valor);
  puente.emitir('parametro', { nombre, valor });
}

function pintarParametros() {
  const caja = $('#parametros');
  caja.innerHTML = '';
  const actual = mundo.leer();
  for (const [nombre, spec] of Object.entries(mundo.PARAMETROS)) {
    const fila = crear('label', 'parametro');
    const val = crear('span', 'valor', String(actual[nombre]) + spec.unidad);
    const rango = Object.assign(crear('input'), {
      type: 'range', min: spec.min, max: spec.max, step: spec.paso, value: actual[nombre]
    });
    rango.addEventListener('input', () => {
      const v = parseFloat(rango.value);
      val.textContent = v + spec.unidad;
      propagar(`bloque-parametros:${nombre}`, v);
      if (!tablero.conectado('bloque-parametros', 'bloque-monitor')) {
        anotar('PARÁMETROS está desconectado del MONITOR — tirá el cable de nuevo', 'mal');
        return;
      }
      ponerEnMundo(nombre, v);
    });
    fila.append(crear('span', null, nombre), rango, val);
    caja.append(fila);
    tablero.puertosDeParametro(fila, 'bloque-parametros', nombre);
  }
}

async function traerAlMundo() {
  $('#bloque-monitor').open = true;
  await abrirMundo();
  const m = SINTAXIS.exec($('#traer-inv').value.trim());
  const est = $('#mundo-estado');
  if (!m) { est.textContent = 'la forma es ~palabra.f(0)'; return; }
  est.textContent = 'trayendo…';
  try {
    const r = await mundo.traer(m[1], m[2], m[3]);
    texturaMundoActual = { palabra: m[1], letra: m[2], n: Number(m[3]), id: r.id };
    texturaVideoActual = texturaMundoActual;
    visual.textura(r.imagen);
    visualMonitor?.textura(r.imagen);
    puente.emitir('textura', texturaMundoActual);
    puente.emitir('textura-video', texturaVideoActual);
    est.textContent = `${r.id} · ${r.ancho}×${r.alto}`;
  } catch (e) { est.textContent = String(e.message || e); }
}

// ── la pestaña aparte ────────────────────────────────────────────────────────
//
// El mundo se abre en su propia página, a pantalla completa: el instrumento en
// la laptop, el mundo en el proyector. Las dos pestañas son el mismo mundo.

let mundoAparte = null;

$('#abrir-aparte').addEventListener('click', () => {
  if (mundoAparte && !mundoAparte.closed) { mundoAparte.focus(); return; }
  mundoAparte = window.open('mundo.html', 'yaqxxa-mundo');
  if (!mundoAparte) { anotar('el navegador bloqueó la ventana — permitila y volvé a intentar', 'mal'); return; }
  anotar('mundo abierto en pestaña aparte — los parámetros van a las dos');
});

puente.escuchar('hola', ({ desde }) => {
  if (desde === 'mundo') {
    anotar('la pestaña del mundo se conectó');
    puente.emitir('hola', { desde: 'instrumento' });
  }
});

// cuando la otra pestaña pide el estado, se le manda todo lo que hay
puente.escuchar('pedir', () => {
  for (const [nombre, valor] of Object.entries(mundo.leer())) {
    puente.emitir('parametro', { nombre, valor });
  }
  if (texturaMundoActual) puente.emitir('textura', texturaMundoActual);
  else puente.emitir('vaciar', null);
  puente.emitir('shader', { fuente: shaderActual });
  puente.emitir('senal-video', visual.leerSeñal());
  puente.emitir('encaje-video', { modo: visual.leerEncaje() });
  puente.emitir('salida-video', {
    activa: tablero.conectado('bloque-video', 'bloque-monitor')
  });
  if (texturaVideoActual) puente.emitir('textura-video', texturaVideoActual);
});

puente.escuchar('adios', ({ desde }) => {
  if (desde === 'mundo') anotar('la pestaña del mundo se cerró');
});

window.addEventListener('beforeunload', () => puente.emitir('adios', { desde: 'instrumento' }));

const detMonitor = document.querySelector('#bloque-monitor');
detMonitor.addEventListener('toggle', () => { if (detMonitor.open) abrirMundo(); });
$('#traer').addEventListener('click', traerAlMundo);
$('#vaciar').addEventListener('click', () => {
  texturaMundoActual = null;
  texturaVideoActual = null;
  mundo.vaciar();
  visual.vaciarTextura();
  visualMonitor?.vaciarTextura();
  puente.emitir('vaciar', null);
  $('#mundo-estado').textContent = '';
});
$('#entrar-vr').addEventListener('click', () => {
  try { mundo.entrarVR(); } catch (e) { $('#vr-nota').textContent = String(e.message); }
});

// ── cajones del riel ─────────────────────────────────────────────────────────
//
// ARCHIVO y la documentación no son bloques del tablero: viven detrás de los
// iconos de la esquina derecha, como paneles que se despliegan.

const CAJONES = [$('#panel-archivo'), $('#panel-doc')];
const ICONOS = { 'panel-archivo': $('#icono-archivo'), 'panel-doc': $('#icono-doc') };
let capacidadesMedidas = false;

function abrirPanel(panel) {
  for (const c of CAJONES) c.classList.toggle('abierto', c === panel);
  refrescarIconos();
  if (panel.id === 'panel-doc' && !capacidadesMedidas) {
    capacidadesMedidas = true;
    capacidades();
  }
}

function alternarPanel(panel) {
  if (panel.classList.contains('abierto')) {
    panel.classList.remove('abierto');
    refrescarIconos();
  } else {
    abrirPanel(panel);
  }
}

function refrescarIconos() {
  for (const c of CAJONES) ICONOS[c.id].classList.toggle('activo', c.classList.contains('abierto'));
}

$('#icono-archivo').addEventListener('click', () => alternarPanel($('#panel-archivo')));
$('#icono-doc').addEventListener('click', () => alternarPanel($('#panel-doc')));
for (const b of document.querySelectorAll('.cerrar-panel')) {
  b.addEventListener('click', () => alternarPanel(b.closest('.cajon')));
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { for (const c of CAJONES) c.classList.remove('abierto'); refrescarIconos(); }
});

// ── memoria de qué bloques quedaron abiertos ─────────────────────────────────

const ABIERTOS = 'yaqxxa.abiertos';

function recordarPliegues() {
  const bloques = [...document.querySelectorAll('details.bloque')];
  let guardado;
  try { guardado = JSON.parse(localStorage.getItem(ABIERTOS)); } catch { guardado = null; }
  if (guardado) {
    for (const b of bloques) if (b.id in guardado) b.open = guardado[b.id];
  }
  for (const b of bloques) {
    b.addEventListener('toggle', () => {
      const estado = Object.fromEntries(bloques.map(x => [x.id, x.open]));
      try { localStorage.setItem(ABIERTOS, JSON.stringify(estado)); } catch {}
    });
  }
}
recordarPliegues();

// ── el tablero: zoom, arrastre, redimensión y cables ────────────────────────
//
// La semántica de los cables se define acá:
//   PARÁMETROS → MONITOR   los controles mueven el mundo (conectado por defecto)
//   CÓDIGO → MONITOR       las fotos invocadas entran como textura del espacio
//   VIDEO → MONITOR        la salida del shader cubre las superficies del mundo
// Cualquier otro cable se guarda pero no hace nada, y el sistema lo dice.

const CABLES_CON_SEMANTICA = new Set([
  'bloque-parametros→bloque-monitor',
  'bloque-codigo→bloque-monitor',
  'bloque-codigo→bloque-audio',
  'bloque-codigo→bloque-video',
  'bloque-video→bloque-monitor'
]);

function sincronizarSalidaVisual() {
  const activa = tablero.conectado('bloque-video', 'bloque-monitor');
  mundo.usarSalidaVisual(activa ? visualMonitor?.salida() : null);
  estadoHeader('video', activa ? 'activo' : '', activa ? 'video conectado al monitor' : 'video desconectado');
  puente.emitir('salida-video', { activa });
}

// Quien tiene el foco escucha: el mundo solo camina cuando el MONITOR está
// enfocado, así escribir "w" en el CÓDIGO nunca mueve la cámara.
tablero.escucharFoco(bloque => {
  const esMonitor = bloque?.id === 'bloque-monitor';
  mundo.activarTeclado(esMonitor);
  $('#escena')?.classList.toggle('activo', esMonitor);
  const aviso = $('#foco-mundo');
  if (aviso) {
    aviso.textContent = esMonitor
      ? 'WASD o flechas caminan · espacio salta · shift corre'
      : 'clic en el bloque para caminar por el mundo';
  }
});

tablero.montarTablero({
  alAviso: anotar,
  cablesIniciales: [
    { de: 'bloque-parametros', a: 'bloque-monitor' },
    { de: 'bloque-codigo', a: 'bloque-audio' },
    { de: 'bloque-codigo', a: 'bloque-video' },
    { de: 'bloque-video', a: 'bloque-monitor' }
  ],
  alCambioDeCable: (de, a) => {
    // un cable entre parámetros siempre hace algo: el valor de uno abre el otro
    if (de.includes(':') && a.includes(':')) return;
    if (de === 'bloque-video' && a === 'bloque-monitor') sincronizarSalidaVisual();
    if (!CABLES_CON_SEMANTICA.has(de + '→' + a)) {
      anotar('ese cable todavía no hace nada — queda guardado igual', 'mal');
    }
  }
});

// los parámetros existen aunque el monitor no esté montado: mundo.poner()
// guarda el estado y la escena lo toma cuando aparece
pintarParametros();

// ── sinte y visual ───────────────────────────────────────────────────────────
//
// El sinte emite eventos; el visual los dibuja. No se conocen: comparten la
// señal y el bus, que es la tesis de los prototipos hecha bloques.

sinte.escucharEventos(ev => {
  visual.evento(ev);
  visualMonitor?.evento(ev);
  puente.emitir('evento-video', ev);
});
visual.montar($('#lienzo-video'));
const canvasMonitor = document.createElement('canvas');
canvasMonitor.hidden = true;
document.body.append(canvasMonitor);
visualMonitor = visual.crearMotor(canvasMonitor, {
  autoAjustar: false, ancho: 640, alto: 360
});
if (!localStorage.getItem('yaqxxa.video-monitor-v1')) {
  tablero.asegurarConexion('bloque-video', 'bloque-monitor');
  try { localStorage.setItem('yaqxxa.video-monitor-v1', '1'); } catch {}
}
sincronizarSalidaVisual();

$('#encaje').addEventListener('click', () => {
  const nuevo = visual.leerEncaje() === 'contener' ? 'cubrir' : 'contener';
  visual.ponerEncaje(nuevo);
  visualMonitor?.ponerEncaje(nuevo);
  puente.emitir('encaje-video', { modo: nuevo });
  $('#encaje').textContent = nuevo;
});

/** El AUDIO expone su nivel como una salida patcheable: el sonido puede
 *  manejar cualquier parámetro del mundo con solo tirarle un cable. */
function salidaDelAudio() {
  const caja = $('#audio-salidas');
  if (!caja) return;
  const fila = crear('div', 'parametro con-puertos');
  fila.append(crear('span', null, 'nivel'), crear('span', 'barra-nivel'), crear('span', 'valor', '0.00'));
  caja.append(fila);
  fila.append(tablero.crearPuerto('bloque-audio:nivel', 'salida', 'salida del nivel — arrastra a un parámetro'));
}

function refrescarAudio() {
  const b = $('#audio-onoff');
  b.textContent = sinte.estaCorriendo() ? 'sonando' : 'apagado';
  b.classList.toggle('activo', sinte.estaCorriendo());
  estadoHeader('audio', sinte.estaCorriendo() ? 'activo' : '', sinte.estaCorriendo() ? 'motor de audio activo' : 'motor de audio apagado');
}
$('#audio-onoff').addEventListener('click', async () => {
  if (sinte.estaCorriendo()) sinte.detener();
  else await sinte.iniciar();
  refrescarAudio();
});
salidaDelAudio();

setInterval(() => {
  const n = sinte.nivel();
  const barra = document.querySelector('.barra');
  if (barra) {
    barra.style.setProperty('--audio-escala', Math.max(.16, n).toFixed(3));
    barra.style.setProperty('--audio-opacidad', Math.max(.18, n).toFixed(3));
    barra.style.setProperty('--traza-ancho', (8 + n * 72).toFixed(1) + '%');
  }
  $('#audio-medidor').style.setProperty('--nivel', (n * 100).toFixed(1) + '%');
  visual.nivel(n);
  visualMonitor?.nivel(n);
  puente.emitir('nivel-video', { nivel: n });
  const fila = $('#audio-salidas .parametro');
  if (fila) {
    fila.querySelector('.barra-nivel').style.setProperty('--nivel', (n * 100).toFixed(1) + '%');
    fila.querySelector('.valor').textContent = n.toFixed(2);
  }
  if (n > 0.001) propagar('bloque-audio:nivel', n);
}, 90);

const notaMundo = $('#nota-mundo');
if (notaMundo) {
  notaMundo.innerHTML = '<a href="https://aframe.io/" target="_blank" rel="noopener">A-Frame</a> ' +
    'pesa 1,28 MB y se carga solo al abrir este bloque. Todavía no se descargó nada.';
}

cargarSlots();
// Al abrir, el motor se quedaba con el shader de arranque y capas en 1: una
// franja, o sea una línea horizontal, y parecía roto. Recomponer al cargar
// hace que lo que se ve sea lo que dicen los slots activos, sin tocar nada.
recomponer();
pintarLlaves();
revisar();
resumenBanco();
