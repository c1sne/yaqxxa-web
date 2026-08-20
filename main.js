// main.js — v4, primer commit.
//
// Lo único que hace esta página es preguntarle al navegador qué es capaz de
// hacer, y decirlo sin adornar. Nada se guarda, nada se envía: no hay servidor
// detrás. Se puede verificar leyendo este archivo, que es lo que hay.

const $ = s => document.querySelector(s);

// Cada entrada devuelve { valor, clase } o una promesa de eso.
const PRUEBAS = [
  ['contexto seguro (HTTPS)', () => bool(isSecureContext)],
  ['WebXR en el navegador',   () => bool('xr' in navigator)],
  ['XR inmersivo (VR)',       () => sesionXR('immersive-vr')],
  ['XR inmersivo (AR)',       () => sesionXR('immersive-ar')],
  ['WebGL2',                  () => bool(!!document.createElement('canvas').getContext('webgl2'))],
  ['WebGPU',                  () => bool('gpu' in navigator)],
  ['WebAudio',                () => bool('AudioContext' in window || 'webkitAudioContext' in window)],
  ['AudioWorklet',            () => bool('AudioWorkletNode' in window)],
  ['WebMIDI',                 () => bool('requestMIDIAccess' in navigator)],
  ['gamepads / mandos',       () => bool('getGamepads' in navigator)],
  ['núcleos',                 () => dato(navigator.hardwareConcurrency)],
  ['memoria declarada',       () => dato(navigator.deviceMemory ? navigator.deviceMemory + ' GB' : null)],
  ['pantalla',                () => dato(`${screen.width}×${screen.height} @${devicePixelRatio}x`)]
];

const bool = v => ({ valor: v ? 'sí' : 'no', clase: v ? 'si' : 'no' });
const dato = v => ({ valor: v == null ? '—' : String(v), clase: 'dato' });

async function sesionXR(modo) {
  if (!navigator.xr) return { valor: 'sin WebXR', clase: 'no' };
  try {
    const ok = await navigator.xr.isSessionSupported(modo);
    return bool(ok);
  } catch {
    // el navegador tiene la API pero rechaza la consulta (permisos, iframe…)
    return { valor: 'no se pudo consultar', clase: 'no' };
  }
}

async function medir() {
  const dl = $('#capacidades');
  dl.innerHTML = '';

  const resultados = {};
  for (const [nombre, prueba] of PRUEBAS) {
    let r;
    try { r = await prueba(); }
    catch { r = { valor: 'error al consultar', clase: 'no' }; }
    resultados[nombre] = r;

    const dt = document.createElement('dt');
    dt.textContent = nombre;
    const dd = document.createElement('dd');
    dd.textContent = r.valor;
    dd.className = r.clase;
    dl.append(dt, dd);
  }

  $('#veredicto').textContent = veredicto(resultados);
}

function veredicto(r) {
  const vr = r['XR inmersivo (VR)'].valor === 'sí';
  const ar = r['XR inmersivo (AR)'].valor === 'sí';
  const xr = r['WebXR en el navegador'].valor === 'sí';

  if (vr && ar) return 'Este dispositivo puede entrar a XR inmersivo en VR y en AR.';
  if (vr) return 'Este dispositivo puede entrar a una sesión de realidad virtual inmersiva.';
  if (ar) return 'Este dispositivo puede entrar a una sesión de realidad aumentada inmersiva.';
  if (xr) return 'El navegador tiene WebXR pero no hay visor ni cámara compatible conectada. La vista 3D en pantalla va a funcionar igual; la inmersiva no.';
  return 'Este navegador no tiene WebXR. En iPhone eso es Safari y hoy no tiene vuelta: el 3D en pantalla va a funcionar, lo inmersivo no. En Quest, Android con Chrome o Vision Pro, sí.';
}

function reloj() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  $('#hora').textContent =
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

reloj();
medir();
