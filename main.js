// main.js — arma los dos bloques y los conecta al banco.

import * as ia from './ia.js';
import * as mundo from './mundo.js';
import * as tablero from './tablero.js';
import * as sinte from './sinte.js';
import * as visual from './visualx.js';

const $ = s => document.querySelector(s);
const crear = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

let piezas = [];   // [{ letra, nombre, archivo, url }]

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

function aplicarSeñal(nLinea, palabra, brutos) {
  const args = brutos.split(',').map(x => parseFloat(x)).filter(x => !Number.isNaN(x));
  if (!args.length) {
    destello(nLinea, 'mal');
    anotar(`línea ${nLinea + 1} · ${palabra}() necesita un número`, 'mal');
    return;
  }
  const alAudio = tablero.conectado('bloque-codigo', 'bloque-audio');
  const alVideo = tablero.conectado('bloque-codigo', 'bloque-video');
  if (!alAudio && !alVideo) {
    destello(nLinea, 'mal');
    anotar(`${palabra}() no llega a ningún motor — conectá CÓDIGO al AUDIO o al VIDEO`, 'mal');
    return;
  }

  const s = {};
  if (palabra === 'pulso') s.pulso = { bpm: lim(args[0], 30, 240), jitter: lim(args[1] ?? 0, 0, 1) };
  else if (palabra === 'capas') s.capas = Math.round(lim(args[0], 1, 8));
  else if (palabra === 'cola') s.cola = lim(args[0], 0, 0.95);
  else s[palabra] = lim(args[0], 0, 1);

  destello(nLinea);
  if (alAudio) { sinte.poner(s); sinte.iniciar().then(refrescarAudio).catch(e => anotar(e.message, 'mal')); }
  if (alVideo) visual.poner(s);
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

async function evaluarLinea(nLinea) {
  const cruda = ($('#editor').value.split('\n')[nLinea] || '');
  const texto = cruda.split('#')[0].trim();
  if (!texto) return;   // vacía o comentario

  // ¿es una palabra de señal? densidad(0.5), pulso(96, 0.3)…
  const ms = SEÑAL.exec(texto);
  if (ms) {
    aplicarSeñal(nLinea, ms[1], ms[2]);
    return;
  }

  const m = SINTAXIS.exec(texto);
  if (!m) {
    destello(nLinea, 'mal');
    anotar(`línea ${nLinea + 1} · no entiendo «${texto}» — la forma es ~palabra.f(0) o densidad(0.5)`, 'mal');
    return;
  }
  const [, palabra, letra, num] = m;
  destello(nLinea);

  let r;
  try { r = await resolverConCache(palabra, letra, Number(num)); }
  catch (e) { anotar(`línea ${nLinea + 1} · ${e.message}`, 'mal'); return; }

  if (r.error) {
    destello(nLinea, 'mal');
    let extra = '';
    try {
      const nums = await ia.indice(palabra);
      extra = nums.length
        ? ` — ~${palabra} tiene: ${nums.join(', ')}`
        : ` — ~${palabra} no tiene depósitos todavía`;
    } catch {}
    anotar(`línea ${nLinea + 1} · ${r.error}${extra}`, 'mal');
    return;
  }

  if (letra === 's') {
    const a = new Audio(r.url);
    a.crossOrigin = 'anonymous';
    sonando.add(a);
    a.addEventListener('ended', () => sonando.delete(a));
    a.play().catch(e => anotar(`línea ${nLinea + 1} · el audio no arrancó: ${e.message}`, 'mal'));
    anotar(`~${palabra}.s(${num}) suena · ${r.id}`);
  } else {
    mostrarEnEscenario(letra, r);
    anotar(`~${palabra}.${letra}(${num}) en escena · ${r.id}`);
    if (letra === 'f' && mundoListo && tablero.conectado('bloque-codigo', 'bloque-monitor')) {
      mundo.traer(palabra, letra, Number(num))
        .then(() => anotar(`~${palabra}.f(${num}) → también al monitor, por el cable`))
        .catch(() => {});
    }
    // la foto entra al sintetizador de video como material, si el cable está
    if (letra === 'f' && tablero.conectado('bloque-codigo', 'bloque-video')) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        visual.textura(img);
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
  $('#escenario').innerHTML = '';
  anotar('silencio');
}

function evaluarTodo() {
  $('#editor').value.split('\n').forEach((_, i) => evaluarLinea(i));
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
  } catch (e) { $('#resumen-banco').textContent = e instanceof ia.Saturado ? 'archive.org saturado' : 'no pude leer el banco'; }
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
$('#editor').addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) evaluarTodo();
    else evaluarLinea(lineaDelCursor($('#editor')));
  } else if (ctrl && e.key === '.') {
    e.preventDefault();
    silencio();
  }
});


// ── bloque mundo ─────────────────────────────────────────────────────────────

let mundoListo = false;

async function abrirMundo() {
  if (mundoListo) return;
  const nota = $('#nota-mundo');
  nota.textContent = 'cargando A-Frame (1,28 MB)…';
  try {
    await mundo.montar($('#escena'));
    mundoListo = true;
    nota.textContent = 'A-Frame cargado desde vendor/ — sin CDN, sin red de terceros.';
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
      if (!tablero.conectado('bloque-parametros', 'bloque-monitor')) {
        anotar('PARÁMETROS está desconectado del MONITOR — tirá el cable de nuevo', 'mal');
        return;
      }
      mundo.poner(nombre, v);
    });
    fila.append(crear('span', null, nombre), rango, val);
    caja.append(fila);
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
    est.textContent = `${r.id} · ${r.ancho}×${r.alto}`;
  } catch (e) { est.textContent = String(e.message || e); }
}

const detMonitor = document.querySelector('#bloque-monitor');
detMonitor.addEventListener('toggle', () => { if (detMonitor.open) abrirMundo(); });
$('#traer').addEventListener('click', traerAlMundo);
$('#vaciar').addEventListener('click', () => { mundo.vaciar(); $('#mundo-estado').textContent = ''; });
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
// Cualquier otro cable se guarda pero no hace nada, y el sistema lo dice.

const CABLES_CON_SEMANTICA = new Set([
  'bloque-parametros→bloque-monitor',
  'bloque-codigo→bloque-monitor',
  'bloque-codigo→bloque-audio',
  'bloque-codigo→bloque-video'
]);

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
    { de: 'bloque-codigo', a: 'bloque-video' }
  ],
  alCambioDeCable: (de, a) => {
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

sinte.escucharEventos(ev => visual.evento(ev));
visual.montar($('#lienzo-video'));

function refrescarAudio() {
  const b = $('#audio-onoff');
  b.textContent = sinte.estaCorriendo() ? 'sonando' : 'apagado';
  b.classList.toggle('activo', sinte.estaCorriendo());
}
$('#audio-onoff').addEventListener('click', async () => {
  if (sinte.estaCorriendo()) sinte.detener();
  else await sinte.iniciar();
  refrescarAudio();
});
setInterval(() => {
  const n = sinte.nivel();
  $('#audio-medidor').style.setProperty('--nivel', (n * 100).toFixed(1) + '%');
  visual.nivel(n);
}, 90);

pintarLlaves();
revisar();
resumenBanco();
