// sinte.js — motor de síntesis de audio. Propio, WebAudio, cero dependencias.
//
// Heredado de los prototipos 001/002 del repositorio privado: un programador
// con anticipación decide cuándo hay evento; cada evento es ruido filtrado más
// una parte tonal. Lee una SEÑAL de parámetros con nombres deliberadamente
// sosos —los mismos siete del prototipo 002— y no sabe nada de la interfaz.
//
//   densidad  eventos por unidad de tiempo (0-1)
//   peso      dureza del ataque, cuerpo (0-1)
//   pulso     bpm y cuánto se corre (jitter 0-1)
//   azar      probabilidad de que el evento previsto ocurra (0-1)
//   capas     copias simultáneas apiladas en altura (1-8)
//   cola      cuánto queda después (0-0.95)
//
// Limitación declarada, igual que en los prototipos: esto modula a nivel de
// control, no de señal. Ver docs del repo privado, 02-arquitectura §4.

const MIRA_ADELANTE = 0.15;
const INTERVALO = 25;
const ESCALA = [0, 3, 5, 7, 10];

export function señalInicial() {
  return { densidad: 0, peso: 0.5, pulso: { bpm: 110, jitter: 0 }, azar: 1, capas: 1, cola: 0 };
}

let ctx = null, maestro = null, analizador = null, retardo = null, ruido = null;
let señal = señalInicial();
let prox = 0, valor = 0.5;
let reloj = null, corriendo = false;
let alEvento = () => {};   // el bus: VISUAL se entera de cada golpe por acá

export const estaCorriendo = () => corriendo;
export const escucharEventos = fn => { alEvento = fn; };

export function poner(nueva) { señal = { ...señal, ...nueva }; }
export function leerSeñal() { return { ...señal }; }

export async function iniciar() {
  if (!ctx) construir();
  if (ctx.state === 'suspended') await ctx.resume();
  if (!corriendo) { corriendo = true; prox = ctx.currentTime; reloj = setInterval(programar, INTERVALO); }
}

export function detener() {
  corriendo = false;
  if (reloj) { clearInterval(reloj); reloj = null; }
}

export function nivel() {
  if (!analizador) return 0;
  const buf = new Float32Array(analizador.fftSize);
  analizador.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.min(1, Math.sqrt(s / buf.length) * 3);
}

function construir() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  maestro = ctx.createGain(); maestro.gain.value = 0.75;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.15;
  analizador = ctx.createAnalyser(); analizador.fftSize = 1024;
  retardo = ctx.createDelay(2.0); retardo.delayTime.value = 0.33;
  const retro = ctx.createGain(); retro.gain.value = 0.55;
  retardo.connect(retro).connect(retardo);
  retardo.connect(maestro);
  maestro.connect(comp).connect(analizador).connect(ctx.destination);
  const largo = ctx.sampleRate * 2;
  ruido = ctx.createBuffer(1, largo, ctx.sampleRate);
  const c = ruido.getChannelData(0);
  for (let i = 0; i < largo; i++) c[i] = Math.random() * 2 - 1;
}

function programar() {
  if (!ctx || señal.densidad <= 0.001) { prox = ctx ? ctx.currentTime : 0; return; }
  const limite = ctx.currentTime + MIRA_ADELANTE;
  const base = (60 / señal.pulso.bpm) / (1 + Math.round(señal.densidad * 15));
  if (prox < ctx.currentTime) prox = ctx.currentTime;

  let guardia = 0;
  while (prox < limite && guardia++ < 64) {
    valor += (Math.random() - 0.5) * 0.15;
    if (valor < 0) valor = -valor;
    if (valor > 1) valor = 2 - valor;
    if (Math.random() <= señal.azar) {
      sonar(prox);
      const retraso = Math.max(0, (prox - ctx.currentTime) * 1000);
      const carga = { energia: señal.peso, altura: valor, capas: señal.capas, cola: señal.cola, densidad: señal.densidad };
      setTimeout(() => alEvento(carga), retraso);
    }
    const desvio = 1 + (Math.random() - 0.5) * 2 * señal.pulso.jitter * 0.6;
    prox += base * Math.max(0.15, desvio);
  }
}

function sonar(t0) {
  const gananciaBase = 0.22 * (0.35 + señal.peso * 0.65) / Math.sqrt(señal.capas);
  for (let c = 0; c < señal.capas; c++) {
    const grado = ESCALA[Math.floor(valor * ESCALA.length) % ESCALA.length];
    const freq = 110 * Math.pow(2, (grado + 12 * c) / 12) * (1 + valor * 0.5);
    const t = t0 + c * 0.012;
    const caida = 0.04 + (1 - señal.peso) * 0.45;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gananciaBase, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0008, t + caida);

    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.setValueAtTime(Math.min(12000, freq * 2), t);
    filtro.Q.value = 1 + (1 - señal.peso) * 8;

    const fr = ctx.createBufferSource();
    fr.buffer = ruido; fr.loop = true; fr.playbackRate.value = 0.5 + valor;
    const gr = ctx.createGain(); gr.gain.value = 0.25 + señal.peso * 0.75;
    fr.connect(gr).connect(filtro);

    const osc = ctx.createOscillator();
    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t);
    const go = ctx.createGain(); go.gain.value = 0.9 - señal.peso * 0.6;
    osc.connect(go).connect(filtro);

    filtro.connect(env).connect(maestro);
    if (señal.cola > 0) {
      const envio = ctx.createGain(); envio.gain.value = señal.cola * 0.8;
      env.connect(envio).connect(retardo);
    }
    fr.start(t); osc.start(t);
    fr.stop(t + caida + 0.05); osc.stop(t + caida + 0.05);
  }
}
