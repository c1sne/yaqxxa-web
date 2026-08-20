// puente.js — el mismo mundo en dos pestañas.
//
// El bloque MONITOR puede abrirse como página aparte, a pantalla completa: el
// instrumento queda en la laptop y el mundo va al proyector. Para que eso sirva
// las dos pestañas tienen que ser el mismo mundo, no dos copias.
//
// Se usa BroadcastChannel: mensajería entre pestañas del mismo origen, del
// navegador, sin servidor. Nada sale de la máquina — coherente con que yaqxxa
// no tenga backend. Si mañana hiciera falta sincronizar entre máquinas, eso ya
// sería otra cosa y tendría que decidirse aparte.

const NOMBRE = 'yaqxxa';

let canal = null;
const oyentes = new Map();

function abrir() {
  if (canal || typeof BroadcastChannel === 'undefined') return canal;
  canal = new BroadcastChannel(NOMBRE);
  canal.onmessage = e => {
    const { tipo, carga } = e.data || {};
    for (const fn of oyentes.get(tipo) || []) {
      try { fn(carga); } catch (err) { console.error('[puente]', tipo, err); }
    }
  };
  return canal;
}

export function emitir(tipo, carga) {
  abrir();
  if (canal) canal.postMessage({ tipo, carga });
}

export function escuchar(tipo, fn) {
  abrir();
  if (!oyentes.has(tipo)) oyentes.set(tipo, new Set());
  oyentes.get(tipo).add(fn);
  return () => oyentes.get(tipo).delete(fn);
}

export const disponible = () => typeof BroadcastChannel !== 'undefined';

// Tipos de mensaje, listados acá para que no se inventen sueltos:
//
//   'parametro'  { nombre, valor }   una perilla se movió
//   'textura'    { url, id }         una foto del banco entra al mundo
//   'vaciar'     null                se limpió la textura
//   'hola'       { desde }           una pestaña se presenta
//   'aqui'       { desde }           respuesta: ya hay alguien
//   'pedir'      null                "mándenme el estado actual"
