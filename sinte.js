// sinte.js — motor de audio sobre Tone.js.
//
// Decisión de Andrés (20 ago 2026): audio con Tone.js. Es una biblioteca de
// instrumentación —sintes, transport, efectos— y no un lenguaje: no trae
// mini-notation ni un modelo de tiempo que pueda volverse el nuestro sin
// decidirlo. Ver vendor/README.md.
//
// La interfaz del bloque es la nuestra y no cambió: poner(señal) / iniciar()
// / detener() / nivel() / escucharEventos(). Cambiar de motor es cambiar este
// archivo. La señal sigue siendo los siete nombres sosos del prototipo 002:
//
//   densidad  eventos por unidad de tiempo (0-1)
//   peso      dureza del ataque, cuerpo (0-1)
//   pulso     bpm y cuánto se corre (jitter 0-1)
//   azar      probabilidad de que el evento previsto ocurra (0-1)
//   capas     copias simultáneas apiladas en altura (1-8)
//   cola      cuánto queda después (0-0.95)
//
// Tone.js pesa 345 KB y NO se descarga al abrir la página: se carga la primera
// vez que el sinte arranca.

const ESCALA = [0, 3, 5, 7, 10];

export function señalInicial() {
  return { densidad: 0, peso: 0.5, pulso: { bpm: 110, jitter: 0 }, azar: 1, capas: 1, cola: 0 };
}

let Tone = null;
let cargando = null;
let señal = señalInicial();
let valor = 0.5;
let corriendo = false;
let alEvento = () => {};

let fm = null, ruido = null, retardo = null, medidor = null, bucle = null;

export const estaCorriendo = () => corriendo;
export const escucharEventos = fn => { alEvento = fn; };
export const leerSeñal = () => ({ ...señal });

export function poner(nueva) {
  señal = { ...señal, ...nueva };
  if (!Tone) return;
  Tone.getTransport().bpm.value = señal.pulso.bpm;
  if (retardo) retardo.wet.value = señal.cola * 0.6;
  if (bucle) bucle.interval = intervalo();
}

// densidad como en los prototipos: subdivisiones del pulso
const intervalo = () => (60 / señal.pulso.bpm) / (1 + Math.round(señal.densidad * 15));

function cargarTone() {
  if (window.Tone) { Tone = window.Tone; return Promise.resolve(); }
  if (cargando) return cargando;
  cargando = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/tone.min.js';
    s.onload = () => { Tone = window.Tone; res(); };
    s.onerror = () => rej(new Error('no pude cargar Tone.js desde vendor/'));
    document.head.append(s);
  });
  return cargando;
}

export async function iniciar() {
  await cargarTone();
  await Tone.start();
  if (!fm) construir();
  poner({});                      // volcar la señal actual al transport
  if (!corriendo) {
    Tone.getTransport().start();
    bucle.start(0);
    corriendo = true;
  }
}

export function detener() {
  if (!Tone || !corriendo) { corriendo = false; return; }
  bucle.stop();
  Tone.getTransport().stop();
  corriendo = false;
}

export function nivel() {
  if (!medidor) return 0;
  const db = medidor.getValue();
  const v = typeof db === 'number' ? db : Math.max(...db);
  return Math.min(1, Math.max(0, Math.pow(10, v / 20) * 3));
}

function construir() {
  const compresor = new Tone.Compressor({ threshold: -18, ratio: 6, attack: 0.004, release: 0.15 });
  medidor = new Tone.Meter({ smoothing: 0.6 });
  retardo = new Tone.FeedbackDelay({ delayTime: 0.33, feedback: 0.55, wet: 0 });

  fm = new Tone.PolySynth(Tone.FMSynth, {
    maxPolyphony: 16,
    options: {
      harmonicity: 2.5,
      modulationIndex: 8,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.004, decay: 0.15, sustain: 0, release: 0.08 },
      modulation: { type: 'square' },
      modulationEnvelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.05 }
    }
  });

  ruido = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.002, decay: 0.06, sustain: 0, release: 0.03 }
  });

  fm.connect(retardo);
  ruido.connect(retardo);
  retardo.connect(compresor);
  compresor.toDestination();
  compresor.connect(medidor);

  bucle = new Tone.Loop(golpe, intervalo());
  bucle.humanize = false;
}

function golpe(t) {
  if (señal.densidad <= 0.001) return;

  // pulso.jitter: el evento se corre respecto de la grilla
  const corrido = t + Math.random() * señal.pulso.jitter * intervalo() * 0.6;

  // el valor deriva solo, como en los prototipos
  valor += (Math.random() - 0.5) * 0.15;
  if (valor < 0) valor = -valor;
  if (valor > 1) valor = 2 - valor;

  if (Math.random() > señal.azar) return;   // esquina: puede que no cruce

  const dur = 0.04 + (1 - señal.peso) * 0.4;
  const velTonal = (0.25 + (1 - señal.peso) * 0.5) / Math.sqrt(señal.capas);
  const velRuido = 0.08 + señal.peso * 0.5;

  for (let c = 0; c < señal.capas; c++) {
    const grado = ESCALA[Math.floor(valor * ESCALA.length) % ESCALA.length];
    const freq = 110 * Math.pow(2, (grado + 12 * c) / 12) * (1 + valor * 0.5);
    fm.triggerAttackRelease(freq, dur, corrido + c * 0.012, velTonal);
  }
  ruido.triggerAttackRelease(dur * 0.6, corrido, velRuido);

  // el bus: el visual se entera en el momento audible, no en el programado
  const carga = { energia: señal.peso, altura: valor, capas: señal.capas, cola: señal.cola, densidad: señal.densidad };
  Tone.getDraw().schedule(() => alEvento(carga), corrido);
}
