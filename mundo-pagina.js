// mundo-pagina.js — el mundo solo, a pantalla completa, en su propia pestaña.
//
// No tiene tablero ni bloques: es el mismo mundo de mundo.js escuchando por el
// puente lo que pasa en la pestaña del instrumento. Sirve para tocar con dos
// pantallas: el patcher en la laptop, esto en el proyector.

import * as mundo from './mundo.js';
import * as puente from './puente.js';

const $ = s => document.querySelector(s);

async function inicio() {
  await mundo.montar($('#escena'));
  mundo.activarTeclado(true);   // acá el mundo es lo único: el teclado es suyo

  // presentarse y pedir el estado que ya tenga el instrumento
  puente.emitir('hola', { desde: 'mundo' });
  puente.emitir('pedir', null);

  puente.escuchar('parametro', ({ nombre, valor }) => mundo.poner(nombre, valor));

  puente.escuchar('textura', async ({ palabra, letra, n, id }) => {
    try {
      await mundo.traer(palabra, letra, n);
      avisar(`~${palabra}.${letra}(${n}) · ${id || ''}`);
    } catch (e) { avisar(e.message); }
  });

  puente.escuchar('vaciar', () => mundo.vaciar());

  puente.escuchar('hola', ({ desde }) => {
    if (desde === 'instrumento') avisar('conectado al instrumento');
  });

  puente.escuchar('adios', ({ desde }) => {
    if (desde === 'instrumento') avisar('el instrumento se cerró — el mundo sigue');
  });

  avisar(puente.disponible() ? 'conectado al instrumento' : 'sin puente: este navegador no tiene BroadcastChannel');

  const vr = await mundo.soportaVR();
  $('#entrar-vr').hidden = !vr;
  $('#vr-nota').textContent = vr ? '' : (navigator.xr ? 'sin visor conectado' : 'este navegador no tiene WebXR');
  $('#entrar-vr').addEventListener('click', () => {
    try { mundo.entrarVR(); } catch (e) { $('#vr-nota').textContent = e.message; }
  });

  $('#pantalla-completa').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  esconderFranja();
  window.addEventListener('beforeunload', () => puente.emitir('adios', { desde: 'mundo' }));
}

function avisar(t) { $('#estado-puente').textContent = t; }

/** La franja se va sola: en una proyección no debe quedar nada encima. */
function esconderFranja() {
  let reloj = null;
  const despertar = () => {
    document.body.classList.remove('quieto');
    clearTimeout(reloj);
    reloj = setTimeout(() => document.body.classList.add('quieto'), 2600);
  };
  for (const ev of ['pointermove', 'keydown', 'pointerdown']) {
    window.addEventListener(ev, despertar);
  }
  despertar();
}

inicio();
