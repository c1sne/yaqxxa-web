// visualx.js — motor visual de shaders WebGL, sin dependencias.

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

export const SHADER_INICIAL = `precision mediump float;

uniform vec2  u_res;
uniform float u_t;
uniform float u_densidad;
uniform float u_peso;
uniform float u_azar;
uniform float u_capas;
uniform float u_cola;
uniform float u_golpe;
uniform float u_altura;
uniform float u_nivel;
uniform sampler2D u_tex;
uniform float u_hayTex;
uniform float u_texProp;
uniform float u_encaje;

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float freq = 3.0 + u_densidad * 30.0;
  float vida = 0.35 + u_densidad;   // se mueve aunque no haya señal
  vec2 d = vec2(
    sin(uv.y * freq + u_t * (0.4 + u_densidad)),
    cos(uv.x * freq * 0.7 - u_t * 0.6)
  ) * (0.004 + u_golpe * 0.05 + u_nivel * 0.02);

  vec3 col;
  if (u_hayTex > 0.5) {
    float propLienzo = u_res.x / u_res.y;
    vec2 escala = vec2(1.0);
    if (u_encaje < 0.5) {
      if (u_texProp > propLienzo) escala.y = propLienzo / u_texProp;
      else                        escala.x = u_texProp / propLienzo;
    } else {
      if (u_texProp > propLienzo) escala.x = u_texProp / propLienzo;
      else                        escala.y = propLienzo / u_texProp;
    }
    vec2 tuv = (uv + d - 0.5) / escala + 0.5;
    if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) {
      gl_FragColor = vec4(0.03, 0.03, 0.04, 1.0);
      return;
    }
    col = texture2D(u_tex, vec2(tuv.x, 1.0 - tuv.y)).rgb;
    float pasos = mix(24.0, 4.0, u_peso);
    col = floor(col * pasos) / pasos;
    if (u_golpe > 0.02) {
      float cr = clamp(tuv.x + u_golpe * 0.02, 0.0, 1.0);
      float cb = clamp(tuv.x - u_golpe * 0.02, 0.0, 1.0);
      col.r = texture2D(u_tex, vec2(cr, 1.0 - tuv.y)).r;
      col.b = texture2D(u_tex, vec2(cb, 1.0 - tuv.y)).b;
    }
  } else {
    col = vec3(0.03, 0.03, 0.04);
    // al menos tres franjas: con capas en 1 esto dibujaba una sola línea
    // horizontal y parecía que el motor estaba roto
    float bandas = max(3.0, u_capas);
    for (int i = 0; i < 8; i++) {
      if (float(i) >= bandas) break;
      float y = (float(i) + 0.5) / bandas;
      float onda = sin(uv.x * (freq + float(i) * 2.0) + u_t * vida * (1.0 + float(i) * 0.4))
        * 0.03 * (1.0 + u_golpe * 3.0);
      float dist = abs(uv.y - y - onda);
      float grosor = (0.012 + u_peso * 0.02) * clamp(u_res.y / 320.0, 0.5, 2.0);
      float linea = smoothstep(grosor, 0.0, dist);
      vec3 tono = mix(vec3(0.88, 0.81, 0.64), vec3(0.50, 0.83, 0.76), y);
      col += tono * linea * (0.35 + u_altura * 0.65);
    }
  }

  float v = distance(uv, vec2(0.5));
  col *= 1.0 - v * (0.9 - u_cola * 0.7) + u_nivel * 0.15;
  gl_FragColor = vec4(col, 1.0);
}`;

const UNIFORMS = [
  'u_res', 'u_t', 'u_densidad', 'u_peso', 'u_azar', 'u_capas',
  'u_cola', 'u_golpe', 'u_altura', 'u_nivel', 'u_tex', 'u_hayTex',
  'u_texProp', 'u_encaje'
];

class MotorVisual {
  constructor() {
    this.gl = null;
    this.lienzo = null;
    this.programa = null;
    this.unif = {};
    this.señal = { densidad: 0, peso: 0.5, azar: 1, capas: 1, cola: 0 };
    this.golpe = 0;
    this.altura = 0.5;
    this.nivelActual = 0;
    this.tex = null;
    this.hayTex = false;
    this.texProp = 1;
    this.encaje = 0;
    this.t0 = 0;
    this.ultimo = 0;
    this.animando = false;
    this.autoAjustar = true;
    this.fuente = SHADER_INICIAL;
    this.cuadro = this.cuadro.bind(this);
    this.ajustar = this.ajustar.bind(this);
  }

  montar(el, opciones = {}) {
    this.lienzo = el;
    this.autoAjustar = opciones.autoAjustar !== false;
    if (!this.autoAjustar) {
      this.lienzo.width = opciones.ancho || 640;
      this.lienzo.height = opciones.alto || 360;
    }
    // El mismo canvas se lee desde el contexto WebGL de A-Frame. Conservar el
    // búfer evita que el navegador lo limpie antes de copiarlo a las piezas.
    this.gl = this.lienzo.getContext('webgl', {
      antialias: false, alpha: false, preserveDrawingBuffer: true
    });
    if (!this.gl) { this.sinWebGL(); return this; }

    const quad = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, quad);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), this.gl.STATIC_DRAW);
    this.compilar(this.fuente);

    if (this.autoAjustar) {
      this.ajustar();
      if (this.lienzo.parentElement) new ResizeObserver(this.ajustar).observe(this.lienzo.parentElement);
      window.addEventListener('resize', this.ajustar);
    } else {
      this.gl.viewport(0, 0, this.lienzo.width, this.lienzo.height);
    }
    this.t0 = performance.now();
    if (!this.animando) {
      this.animando = true;
      requestAnimationFrame(this.cuadro);
    }
    return this;
  }

  compilar(fuente) {
    if (!this.gl) throw new Error('el motor visual todavía no está montado');
    const nuevo = this.enlazar(VERT, fuente);
    const anterior = this.programa;
    this.programa = nuevo;
    this.fuente = fuente;
    this.gl.useProgram(nuevo);

    const p = this.gl.getAttribLocation(nuevo, 'p');
    if (p < 0) {
      this.gl.deleteProgram(nuevo);
      this.programa = anterior;
      throw new Error('shader: falta el atributo p del vértice');
    }
    this.gl.enableVertexAttribArray(p);
    this.gl.vertexAttribPointer(p, 2, this.gl.FLOAT, false, 0, 0);
    this.unif = Object.fromEntries(UNIFORMS.map(n => [n, this.gl.getUniformLocation(nuevo, n)]));
    if (anterior) this.gl.deleteProgram(anterior);
    return true;
  }

  poner(nueva) { this.señal = { ...this.señal, ...nueva }; }
  leerSeñal() { return { ...this.señal }; }
  nivel(v) { this.nivelActual = v; }
  evento(ev) { this.golpe = 1; this.altura = ev.altura ?? 0.5; }

  textura(img) {
    if (!this.gl) return;
    if (!this.tex) this.tex = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.tex);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.texProp = (img.naturalWidth || img.videoWidth || 1) / (img.naturalHeight || img.videoHeight || 1);
    this.hayTex = true;
  }

  ponerEncaje(modo) { this.encaje = modo === 'cubrir' ? 1 : 0; }
  leerEncaje() { return this.encaje ? 'cubrir' : 'contener'; }
  vaciarTextura() { this.hayTex = false; }
  salida() { return this.lienzo; }
  leerFuente() { return this.fuente; }

  ajustar() {
    if (!this.autoAjustar || !this.lienzo?.parentElement) return;
    const r = this.lienzo.parentElement.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.lienzo.width === w && this.lienzo.height === h) return;
    this.lienzo.width = w;
    this.lienzo.height = h;
    if (this.gl) this.gl.viewport(0, 0, w, h);
  }

  cuadro(t) {
    if (!this.animando) return;
    requestAnimationFrame(this.cuadro);
    if (!this.gl || !this.programa) return;
    this.ajustar();
    const dt = Math.min(100, t - this.ultimo) / 1000;
    this.ultimo = t;
    this.golpe = Math.max(0, this.golpe - dt * 3.2);
    const g = this.gl;
    const u = this.unif;
    g.useProgram(this.programa);
    if (u.u_res) g.uniform2f(u.u_res, this.lienzo.width, this.lienzo.height);
    if (u.u_t) g.uniform1f(u.u_t, (t - this.t0) / 1000);
    if (u.u_densidad) g.uniform1f(u.u_densidad, this.señal.densidad);
    if (u.u_peso) g.uniform1f(u.u_peso, this.señal.peso);
    if (u.u_azar) g.uniform1f(u.u_azar, this.señal.azar);
    if (u.u_capas) g.uniform1f(u.u_capas, this.señal.capas);
    if (u.u_cola) g.uniform1f(u.u_cola, this.señal.cola);
    if (u.u_golpe) g.uniform1f(u.u_golpe, this.golpe);
    if (u.u_altura) g.uniform1f(u.u_altura, this.altura);
    if (u.u_nivel) g.uniform1f(u.u_nivel, this.nivelActual);
    if (u.u_hayTex) g.uniform1f(u.u_hayTex, this.hayTex ? 1 : 0);
    if (u.u_texProp) g.uniform1f(u.u_texProp, this.texProp);
    if (u.u_encaje) g.uniform1f(u.u_encaje, this.encaje);
    if (this.hayTex && u.u_tex) {
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, this.tex);
      g.uniform1i(u.u_tex, 0);
    }
    g.drawArrays(g.TRIANGLES, 0, 3);
  }

  enlazar(v, f) {
    const shaders = [];
    const compilar = (tipo, src) => {
      const s = this.gl.createShader(tipo);
      shaders.push(s);
      this.gl.shaderSource(s, src);
      this.gl.compileShader(s);
      if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + this.gl.getShaderInfoLog(s));
      }
      return s;
    };
    const p = this.gl.createProgram();
    try {
      this.gl.attachShader(p, compilar(this.gl.VERTEX_SHADER, v));
      this.gl.attachShader(p, compilar(this.gl.FRAGMENT_SHADER, f));
      this.gl.linkProgram(p);
      if (!this.gl.getProgramParameter(p, this.gl.LINK_STATUS)) {
        throw new Error('programa: ' + this.gl.getProgramInfoLog(p));
      }
      return p;
    } catch (e) {
      this.gl.deleteProgram(p);
      throw e;
    } finally {
      shaders.forEach(s => this.gl.deleteShader(s));
    }
  }

  sinWebGL() {
    const cx = this.lienzo.getContext('2d');
    cx.fillStyle = '#33333b';
    cx.font = '11px ui-monospace, Menlo, monospace';
    cx.fillText('este navegador no tiene WebGL', 12, 24);
  }
}

const principal = new MotorVisual();

export const crearMotor = (el, opciones) => new MotorVisual().montar(el, opciones);
export const montar = (el, opciones) => principal.montar(el, opciones);
export const compilar = fuente => principal.compilar(fuente);
export const poner = nueva => principal.poner(nueva);
export const leerSeñal = () => principal.leerSeñal();
export const nivel = v => principal.nivel(v);
export const evento = ev => principal.evento(ev);
export const textura = img => principal.textura(img);
export const ponerEncaje = modo => principal.ponerEncaje(modo);
export const leerEncaje = () => principal.leerEncaje();
export const vaciarTextura = () => principal.vaciarTextura();
export const salida = () => principal.salida();
export const leerFuente = () => principal.leerFuente();
