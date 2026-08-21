// registro.js — medir el flujo, y medir el silencio.
//
// Qué mide y qué NO mide, dicho antes que nada: esto NO mide violencia en
// Lima. Mide con qué frecuencia el mundo se está documentando a sí mismo, y
// cuánto de eso toca a Perú. Confundir una cosa con la otra sería inventar un
// dato, que es lo único que este proyecto tiene prohibido.
//
// Por qué existe igual. El 20 de agosto de 2026 se comprobó que ninguna fuente
// oficial peruana se puede leer desde un navegador —datosabiertos.gob.pe
// responde 418, el INEI redirige, el Ministerio Público da 403, ninguna manda
// CORS— y que GDELT, que sí indexa cobertura de noticias por país, tampoco.
// Lo único vivo y alcanzable es el flujo de ediciones de Wikimedia.
//
// Y midiéndolo apareció algo: en veinte segundos el mundo hizo 557 ediciones
// y Perú ninguna. La señal se muere cuanto más te acercás. Eso no es un
// defecto de la medición: es la medición.
//
// Tres salidas, para que el instrumento las toque:
//   mundo     qué tan denso late el registro global (0-1)
//   aqui      un golpe cada vez que aparece algo de Perú (raro)
//   silencio  segundos desde el último, creciendo (0-1 sobre una hora)

const FUENTE = 'https://stream.wikimedia.org/v2/stream/recentchange';
const VENTANA = 20000;        // ms sobre los que se promedia el pulso global
const TECHO = 40;             // eventos/s que se consideran "lleno"
const SILENCIO_TECHO = 3600;  // una hora sin nada = 1

// Qué cuenta como "de acá". Términos, no una lista de artículos: se busca en
// el título de la edición, en cualquier idioma.
const AQUI = /\b(per[uú]|lima|callao|arequipa|cusco|trujillo|chiclayo|fujimori|ayacucho|puno|piura)\b/i;

let fuente = null;
let sellos = [];              // marcas de tiempo del pulso global
let ultimoAqui = 0;
let totalAqui = 0;
let totalMundo = 0;
let arranque = 0;
let ultimoTitulo = null;
let alAqui = () => {};
let alEstado = () => {};

export const escuchandoAqui = fn => { alAqui = fn; };
export const escuchandoEstado = fn => { alEstado = fn; };
export const corriendo = () => !!fuente;

export function iniciar() {
  if (fuente) return;
  arranque = Date.now();
  ultimoAqui = 0;
  fuente = new EventSource(FUENTE);

  fuente.onmessage = e => {
    let d;
    try { d = JSON.parse(e.data); } catch { return; }
    const ahora = Date.now();

    totalMundo++;
    sellos.push(ahora);
    // la ventana se poda sola: solo importan los últimos segundos
    const corte = ahora - VENTANA;
    while (sellos.length && sellos[0] < corte) sellos.shift();

    const titulo = d.title || '';
    if (AQUI.test(titulo)) {
      totalAqui++;
      ultimoAqui = ahora;
      ultimoTitulo = { titulo, wiki: d.wiki, cuando: ahora };
      alAqui(ultimoTitulo);
    }
  };

  fuente.onerror = () => alEstado({ error: 'el flujo se cortó — reconectando solo' });
}

export function detener() {
  if (!fuente) return;
  fuente.close();
  fuente = null;
  sellos = [];
}

/** Lo que el bloque muestra y lo que los cables llevan. */
export function medidas() {
  const ahora = Date.now();
  const corte = ahora - VENTANA;
  while (sellos.length && sellos[0] < corte) sellos.shift();

  const porSegundo = sellos.length / (VENTANA / 1000);
  // si nunca hubo un evento de acá, el silencio se cuenta desde que arrancó
  const desde = ultimoAqui || arranque || ahora;
  const silencioSeg = arranque ? Math.floor((ahora - desde) / 1000) : 0;

  return {
    corriendo: !!fuente,
    porSegundo,
    mundo: Math.min(1, porSegundo / TECHO),
    silencioSeg,
    silencio: Math.min(1, silencioSeg / SILENCIO_TECHO),
    totalMundo,
    totalAqui,
    ultimoTitulo,
    minutosCorriendo: arranque ? (ahora - arranque) / 60000 : 0
  };
}

export function reloj(seg) {
  const m = Math.floor(seg / 60), s = seg % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, '0')}`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const QUE_MIDE =
  'Ediciones de Wikimedia en vivo. Mide con qué frecuencia el mundo se ' +
  'documenta a sí mismo, y cuánto de eso toca a Perú. No mide violencia: ' +
  'mide registro.';
