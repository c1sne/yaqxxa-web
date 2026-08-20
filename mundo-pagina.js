// mundo-pagina.js — el mundo solo, a pantalla completa, en su propia pestaña.
//
// No tiene tablero ni bloques: es el mismo mundo de mundo.js escuchando por el
// puente lo que pasa en la pestaña del instrumento. Sirve para tocar con dos
// pantallas: el patcher en la laptop, esto en el proyector.

import * as mundo from './mundo.js';
import * as puente from './puente.js';
import * as visual from './visualx.js';

const $ = s => document.querySelector(s);

async function inicio() {
  const canvasVideo = document.createElement('canvas');
  canvasVideo.hidden = true;
  document.body.append(canvasVideo);
  const visualMundo = visual.crearMotor(canvasVideo, {
    autoAjustar: false, ancho: 640, alto: 360
  });
  mundo.usarSalidaVisual(canvasVideo);

  await mundo.montar($('#escena'));
  mundo.activarTeclado(true);   // acá el mundo es lo único: el teclado es suyo

  puente.escuchar('parametro', ({ nombre, valor }) => mundo.poner(nombre, valor));

  puente.escuchar('textura', async ({ palabra, letra, n, id }) => {
    try {
      await mundo.traer(palabra, letra, n);
      avisar(`~${palabra}.${letra}(${n}) · ${id || ''}`);
    } catch (e) { avisar(e.message); }
  });

  puente.escuchar('shader', ({ fuente }) => {
    try { visualMundo.compilar(fuente); }
    catch (e) { avisar(String(e.message || e)); }
  });
  puente.escuchar('senal-video', señal => visualMundo.poner(señal));
  puente.escuchar('evento-video', evento => visualMundo.evento(evento));
  puente.escuchar('nivel-video', ({ nivel }) => visualMundo.nivel(nivel));
  puente.escuchar('encaje-video', ({ modo }) => visualMundo.ponerEncaje(modo));
  puente.escuchar('salida-video', ({ activa }) => {
    mundo.usarSalidaVisual(activa ? canvasVideo : null);
  });
  puente.escuchar('textura-video', async ({ palabra, letra, n }) => {
    try {
      const r = await mundo.traer(palabra, letra, n);
      visualMundo.textura(r.imagen);
    } catch (e) { avisar(String(e.message || e)); }
  });

  puente.escuchar('vaciar', () => {
    mundo.vaciar();
    visualMundo.vaciarTextura();
  });

  puente.escuchar('hola', ({ desde }) => {
    if (desde === 'instrumento') {
      avisar('conectado al instrumento');
      puente.emitir('pedir', null);
    }
  });

  puente.escuchar('adios', ({ desde }) => {
    if (desde === 'instrumento') avisar('el instrumento se cerró — el mundo sigue');
  });

  // Los oyentes deben existir antes de pedir: la respuesta puede llegar de
  // inmediato y BroadcastChannel no conserva mensajes pasados.
  puente.emitir('hola', { desde: 'mundo' });
  puente.emitir('pedir', null);

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
