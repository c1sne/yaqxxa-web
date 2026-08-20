// visualx.js — motor visual de shaders. Propio, WebGL, cero dependencias.
//
// Decisión de Andrés (20 ago 2026): video con shaders propios. Un fragment
// shader a pantalla del bloque, cuyos uniforms son la señal —los mismos siete
// nombres sosos— más el golpe del sinte y, cuando el cable CÓDIGO → VISUAL
// está puesto, una foto del banco como textura: el material depositado entra
// al sintetizador de video y se deforma con la señal.
//
// El shader de acá es un andamio: demuestra el mecanismo, no define la
// estética. Esa parte es de Andrés, no mía.

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;

uniform vec2  u_res;
uniform float u_t;
uniform float u_densidad;
uniform float u_peso;
uniform float u_azar;
uniform float u_capas;
uniform float u_cola;
uniform float u_golpe;    // 1 en cada evento del sinte, decae
uniform float u_altura;   // altura del último evento
uniform float u_nivel;    // nivel de salida del sinte
uniform sampler2D u_tex;
uniform float u_hayTex;
uniform float u_texProp;   // ancho/alto de la imagen
uniform float u_encaje;    // 0 = contener (se ve entera) · 1 = cubrir (llena y recorta)

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;

  // desplazamiento: la densidad agita el campo, el golpe lo sacude
  float freq = 3.0 + u_densidad * 30.0;
  vec2 d = vec2(
    sin(uv.y * freq + u_t * (0.4 + u_densidad)) ,
    cos(uv.x * freq * 0.7 - u_t * 0.6)
  ) * (0.004 + u_golpe * 0.05 + u_nivel * 0.02);

  vec3 col;

  if (u_hayTex > 0.5) {
    // Encaje por proporción: sin esto la imagen se estira a la forma del
    // bloque y se ve cortada. Se calcula la escala que la contiene (o la que
    // la cubre) y se centra.
    float propLienzo = u_res.x / u_res.y;
    vec2 escala = vec2(1.0);
    if (u_encaje < 0.5) {
      // contener: la imagen entera entra, con margen en el lado que sobra
      if (u_texProp > propLienzo) escala.y = propLienzo / u_texProp;
      else                        escala.x = u_texProp / propLienzo;
    } else {
      // cubrir: llena el bloque, recorta lo que sobra
      if (u_texProp > propLienzo) escala.x = u_texProp / propLienzo;
      else                        escala.y = propLienzo / u_texProp;
    }
    vec2 tuv = (uv + d - 0.5) / escala + 0.5;

    // fuera de la imagen: fondo, no estiramiento del borde
    if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) {
      gl_FragColor = vec4(0.03, 0.03, 0.04, 1.0);
      return;
    }
    col = texture2D(u_tex, vec2(tuv.x, 1.0 - tuv.y)).rgb;
    // peso: aplasta el rango — posterizado creciente
    float pasos = mix(24.0, 4.0, u_peso);
    col = floor(col * pasos) / pasos;
    // golpe: corrimiento cromático
    if (u_golpe > 0.02) {
      float cr = clamp(tuv.x + u_golpe * 0.02, 0.0, 1.0);
      float cb = clamp(tuv.x - u_golpe * 0.02, 0.0, 1.0);
      col.r = texture2D(u_tex, vec2(cr, 1.0 - tuv.y)).r;
      col.b = texture2D(u_tex, vec2(cb, 1.0 - tuv.y)).b;
    }
  } else {
    // sin foto: campo de franjas por capa, esperando material
    col = vec3(0.03, 0.03, 0.04);
    for (int i = 0; i < 8; i++) {
      if (float(i) >= u_capas) break;
      float y = (float(i) + 0.5) / u_capas;
      float onda = sin(uv.x * (freq + float(i) * 2.0) + u_t * (0.5 + float(i) * 0.2)) * 0.03 * (1.0 + u_golpe * 3.0);
      float dist = abs(uv.y - y - onda);
      // el grosor se mide en proporción del alto, así no engorda al achicar
      float grosor = (0.012 + u_peso * 0.02) * clamp(u_res.y / 320.0, 0.5, 2.0);
      float linea = smoothstep(grosor, 0.0, dist);
      // ámbar del proyecto, más frío hacia arriba
      vec3 tono = mix(vec3(0.88, 0.81, 0.64), vec3(0.50, 0.83, 0.76), y);
      col += tono * linea * (0.35 + u_altura * 0.65);
    }
  }

  // cola: viñeta que respira con el nivel — lo que queda alrededor
  float v = distance(uv, vec2(0.5));
  col *= 1.0 - v * (0.9 - u_cola * 0.7) + u_nivel * 0.15;

  gl_FragColor = vec4(col, 1.0);
}
`;

let gl = null, lienzo = null, programa = null, unif = {};
let señal = { densidad: 0, peso: 0.5, azar: 1, capas: 1, cola: 0 };
let golpe = 0, altura = 0.5, nivelActual = 0;
let tex = null, hayTex = false, texProp = 1;
let encaje = 0;   // 0 contener · 1 cubrir
let t0 = 0, ultimo = 0, animando = false;

export function montar(el) {
  lienzo = el;
  gl = lienzo.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) { sinWebGL(); return; }

  programa = enlazar(VERT, FRAG);
  gl.useProgram(programa);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(programa, 'p');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);

  for (const n of ['u_res', 'u_t', 'u_densidad', 'u_peso', 'u_azar', 'u_capas',
                   'u_cola', 'u_golpe', 'u_altura', 'u_nivel', 'u_tex', 'u_hayTex',
                   'u_texProp', 'u_encaje']) {
    unif[n] = gl.getUniformLocation(programa, n);
  }

  ajustar();
  // se observa la caja del lienzo: es la que manda el tamaño, y el canvas está
  // en absoluto adentro para no influir en la medición
  new ResizeObserver(ajustar).observe(lienzo.parentElement);
  window.addEventListener('resize', ajustar);
  t0 = performance.now();
  if (!animando) { animando = true; requestAnimationFrame(cuadro); }
}

export function poner(nueva) { señal = { ...señal, ...nueva }; }
export function nivel(v) { nivelActual = v; }

/** Un golpe del sinte sacude el shader. */
export function evento(ev) {
  golpe = 1;
  altura = ev.altura ?? 0.5;
}

/** Una foto del banco entra como material del sintetizador de video. */
export function textura(img) {
  if (!gl) return;
  if (!tex) tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  texProp = (img.naturalWidth || img.videoWidth || 1) / (img.naturalHeight || img.videoHeight || 1);
  hayTex = true;
}

/** contener: la imagen entera, con margen · cubrir: llena el bloque y recorta. */
export function ponerEncaje(modo) { encaje = modo === 'cubrir' ? 1 : 0; }
export const leerEncaje = () => (encaje ? 'cubrir' : 'contener');

export function vaciarTextura() { hayTex = false; }

function ajustar() {
  if (!lienzo || !lienzo.parentElement) return;
  const r = lienzo.parentElement.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (lienzo.width === w && lienzo.height === h) return;
  lienzo.width = w;
  lienzo.height = h;
  // el tamaño en pantalla lo pone el CSS (inset: 0), acá solo el búfer
  if (gl) gl.viewport(0, 0, w, h);
}

function cuadro(t) {
  requestAnimationFrame(cuadro);
  if (!gl) return;
  ajustar();   // barato: ajustar() sale enseguida si el tamaño no cambió
  const dt = Math.min(100, t - ultimo) / 1000;
  ultimo = t;
  golpe = Math.max(0, golpe - dt * 3.2);

  gl.uniform2f(unif.u_res, lienzo.width, lienzo.height);
  gl.uniform1f(unif.u_t, (t - t0) / 1000);
  gl.uniform1f(unif.u_densidad, señal.densidad);
  gl.uniform1f(unif.u_peso, señal.peso);
  gl.uniform1f(unif.u_azar, señal.azar);
  gl.uniform1f(unif.u_capas, señal.capas);
  gl.uniform1f(unif.u_cola, señal.cola);
  gl.uniform1f(unif.u_golpe, golpe);
  gl.uniform1f(unif.u_altura, altura);
  gl.uniform1f(unif.u_nivel, nivelActual);
  gl.uniform1f(unif.u_hayTex, hayTex ? 1 : 0);
  gl.uniform1f(unif.u_texProp, texProp);
  gl.uniform1f(unif.u_encaje, encaje);
  if (hayTex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(unif.u_tex, 0); }

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function enlazar(v, f) {
  const compilar = (tipo, src) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compilar(gl.VERTEX_SHADER, v));
  gl.attachShader(p, compilar(gl.FRAGMENT_SHADER, f));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('programa: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

function sinWebGL() {
  const cx = lienzo.getContext('2d');
  cx.fillStyle = '#33333b';
  cx.font = '11px ui-monospace, Menlo, monospace';
  cx.fillText('este navegador no tiene WebGL', 12, 24);
}
