// main.js — arma los dos bloques y los conecta al banco.

import * as ia from './ia.js';

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
  ayuda.innerHTML = 'Para depositar hacen falta tus llaves de archive.org: ' +
    '<a href="https://archive.org/account/s3.php" target="_blank" rel="noopener">archive.org/account/s3.php</a>. ' +
    'Se quedan en este navegador y solo se envían a archive.org — yaqxxa no tiene servidor donde guardarlas.';
  caja.append(ayuda, acceso, secreto, guardar);
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
        onclick: () => { $('#invocacion').value = t; invocar(); }
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

// ── invocar ──────────────────────────────────────────────────────────────────

const SINTAXIS = /^~?\s*([\p{L}\p{N}_-]+)\s*\.\s*([fsv])\s*\(\s*(\d+)\s*\)\s*$/u;

// Cada invocación lleva número. Una respuesta lenta de archive.org no puede
// pisar el resultado de una invocación posterior.
let generacion = 0;

async function invocar() {
  const mia = ++generacion;
  const vigente = () => mia === generacion;
  const salida = $('#salida');
  salida.innerHTML = '';

  const texto = $('#invocacion').value.trim();
  const m = SINTAXIS.exec(texto);
  if (!m) { salida.append(crear('p', 'error', 'no entiendo eso. La forma es ~palabra.f(0)')); return; }

  const [, palabra, letra, num] = m;
  salida.append(crear('p', 'tenue', `resolviendo ~${palabra}.${letra}(${num})…`));

  const r = await ia.resolver(palabra, letra, Number(num));
  if (!vigente()) return;
  salida.innerHTML = '';

  if (r.error) {
    salida.append(crear('p', 'error', r.error));
    await pintarIndice(palabra, salida, vigente);
    return;
  }

  const vista = crear('div', 'vista-grande');
  if (letra === 'f') vista.append(Object.assign(crear('img'), { src: r.url, crossOrigin: 'anonymous' }));
  if (letra === 'v') vista.append(Object.assign(crear('video'), { src: r.url, controls: true, crossOrigin: 'anonymous', playsInline: true }));
  if (letra === 's') vista.append(Object.assign(crear('audio'), { src: r.url, controls: true, crossOrigin: 'anonymous' }));
  salida.append(vista);

  const meta = crear('div', 'meta');
  meta.append(crear('span', 'tenue', `${r.id} · ${r.archivo} · ${(r.bytes / 1024).toFixed(0)} KB`));
  const ver = Object.assign(crear('a', null, 'archive.org →'), { href: ia.urlPagina(r.id), target: '_blank', rel: 'noopener' });
  meta.append(ver);
  salida.append(meta);

  await pintarFicha(r.id, salida, vigente);
  await pintarIndice(palabra, salida, vigente);
}

// La procedencia viaja como archivo dentro del depósito, no solo como metadato.
async function pintarFicha(id, salida, vigente = () => true) {
  try {
    const f = await (await fetch(ia.urlBytes(id, 'ficha.json'))).json();
    const dl = crear('dl', 'ficha');
    const filas = [['qué es', f.que], ['quién', f.quien], ['dónde', f.donde],
                   ['cuándo', f.cuando], ['notas', f.notas],
                   ['consentimiento', f.consentimiento ? 'sí' : 'no declarado']];
    for (const [k, v] of filas) {
      if (!v) continue;
      dl.append(crear('dt', null, k), crear('dd', null, v));
    }
    if (!vigente()) return;
    if (dl.children.length) { salida.append(crear('div', 'titulillo', 'procedencia')); salida.append(dl); }
  } catch { if (vigente()) salida.append(crear('p', 'falta', 'este depósito no trae ficha de procedencia')); }
}

async function pintarIndice(palabra, salida, vigente = () => true) {
  const nums = await ia.indice(palabra);
  if (!vigente()) return;
  const caja = crear('div', 'indice');
  caja.append(crear('span', 'tenue', nums.length ? `~${palabra} tiene ${nums.length} depósito(s): ` : `~${palabra} no tiene nada todavía`));
  for (const n of nums) {
    caja.append(Object.assign(crear('button', 'chip chico', String(n)), {
      onclick: () => { $('#invocacion').value = `~${palabra}.${SINTAXIS.exec($('#invocacion').value)?.[2] || 'f'}(${n})`; invocar(); }
    }));
  }
  salida.append(caja);
}

async function resumenBanco() {
  try {
    const c = await ia.palabras();
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    const n = Object.keys(c).length;
    $('#resumen-banco').textContent = total
      ? `${n} palabra(s) · ${total} depósito(s)`
      : 'el banco está vacío';
  } catch { $('#resumen-banco').textContent = 'no pude leer el banco'; }
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
$('#invocar').addEventListener('click', invocar);
$('#invocacion').addEventListener('keydown', e => { if (e.key === 'Enter') invocar(); });

pintarLlaves();
revisar();
resumenBanco();
capacidades();
