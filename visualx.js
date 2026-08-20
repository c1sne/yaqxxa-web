// visualx.js — motor visual. Propio, Canvas 2D, cero dependencias.
//
// No sabe nada del motor de audio: los dos leen la misma señal, y éste además
// escucha sus eventos por el bus. Por eso densidad(0.8) sube el sonido y la
// imagen a la vez sin que exista un cable entre los motores — hay estado
// compartido. Es la tesis de los prototipos, ahora como bloque.
//
// Canvas 2D a propósito: tiene que correr en la laptop que haya.

let lienzo = null, cx = null;
let marcas = [];
let señal = { densidad: 0, cola: 0 };
let animando = false, ultimo = 0;

export function montar(el) {
  lienzo = el;
  cx = lienzo.getContext('2d', { alpha: false });
  ajustar();
  new ResizeObserver(ajustar).observe(lienzo.parentElement);
  if (!animando) { animando = true; requestAnimationFrame(cuadro); }
}

export function poner(nueva) { señal = { ...señal, ...nueva }; }

/** Un golpe del sinte entra como marca. */
export function evento(ev) {
  if (!lienzo) return;
  const w = lienzo.clientWidth, h = lienzo.clientHeight;
  for (let c = 0; c < (ev.capas || 1); c++) {
    const dispersion = (Math.random() - 0.5) * h * 0.35 * (ev.densidad ?? 0);
    marcas.push({
      x: Math.random() * w,
      y: h - (ev.altura * h * 0.6) - (c * h * 0.07) - h * 0.12 + dispersion,
      r: 2 + ev.energia * 22,
      vida: 1,
      caida: 0.02 + (1 - (ev.cola ?? 0)) * 0.06,
      grosor: 1 + ev.energia * 3
    });
  }
  if (marcas.length > 700) marcas.splice(0, marcas.length - 700);
}

function ajustar() {
  if (!lienzo || !lienzo.parentElement) return;
  const r = lienzo.parentElement.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  lienzo.width = Math.max(1, Math.floor(r.width * dpr));
  lienzo.height = Math.max(1, Math.floor(r.height * dpr));
  lienzo.style.width = r.width + 'px';
  lienzo.style.height = r.height + 'px';
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.fillStyle = '#08080a';
  cx.fillRect(0, 0, r.width, r.height);
}

function cuadro(t) {
  requestAnimationFrame(cuadro);
  if (!cx) return;
  const dt = Math.min(60, t - ultimo) / 16.67;
  ultimo = t;
  const w = lienzo.clientWidth, h = lienzo.clientHeight;

  // cola: el cuadro no se borra del todo, queda estela
  cx.fillStyle = `rgba(8,8,10,${0.10 + (1 - (señal.cola || 0)) * 0.5})`;
  cx.fillRect(0, 0, w, h);

  for (let i = marcas.length - 1; i >= 0; i--) {
    const m = marcas[i];
    m.vida -= m.caida * dt;
    if (m.vida <= 0) { marcas.splice(i, 1); continue; }
    cx.globalAlpha = Math.max(0, m.vida);
    cx.strokeStyle = '#e0cfa4';
    cx.lineWidth = m.grosor;
    cx.beginPath();
    cx.arc(m.x, m.y, m.r * (1.6 - m.vida * 0.6), 0, Math.PI * 2);
    cx.stroke();
  }
  cx.globalAlpha = 1;

  if (!marcas.length) {
    cx.fillStyle = '#33333b';
    cx.font = '11px ui-monospace, Menlo, monospace';
    cx.textAlign = 'center';
    cx.fillText('esperando eventos del sinte', w / 2, h / 2);
    cx.textAlign = 'left';
  }
}
