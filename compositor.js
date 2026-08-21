// compositor.js — componer shaders en vez de escribirlos.
//
// Referencia analizada: el glsl-functions.js de Hydra. Lo que se toma de ahí
// es el MECANISMO, no el vocabulario: un registro de operaciones tipadas que
// se componen solas en un fragment shader. Lo que no se toma es su sintaxis
// —osc().rotate().out()— ni sus nombres, porque adoptarlos sería que el
// lenguaje de yaqxxa naciera en inglés y con la gramática de otro.
//
// Cinco tipos, y con eso alcanza para todo:
//
//   fuente   vec2 -> vec4    genera imagen de la nada
//   espacio  vec2 -> vec2    deforma DÓNDE se mira, antes de mirar
//   color    vec4 -> vec4    transforma LO QUE se vio, después
//   mezcla   vec4,vec4->vec4 junta dos imágenes
//   desvio   vec2,vec4->vec2 una imagen deforma el espacio de otra
//
// La separación espacio/color es la idea que más vale de Hydra: deformar
// dónde mirás es una operación distinta de cambiar lo que viste.
//
// SOBRE LOS NOMBRES. Son descriptivos y nada más: "gira" gira, "invierte"
// invierte. No son vocabulario situado — el vocabulario situado sigue siendo
// un hueco y entra por el banco, no por acá. Ver docs/08-lectura-critica.md.
// Andrés puede renombrar cualquiera cambiando una clave de este objeto.
//
// El shader que sale reacciona al instrumento: todas las operaciones pueden
// usar el tiempo, el nivel del audio, el golpe de cada evento y la señal
// —densidad, peso, capas, cola— además de la foto del banco.

// ── las operaciones ──────────────────────────────────────────────────────────

export const OPERACIONES = {

  // ---- fuente: de la nada sale imagen -------------------------------------
  ruido: {
    tipo: 'fuente',
    args: [['escala', 8], ['velocidad', 0.2]],
    glsl: `float n = _ruido(vec3(_st * escala, u_t * velocidad));
           return vec4(vec3(n), 1.0);`
  },
  ondas: {
    tipo: 'fuente',
    args: [['frecuencia', 12], ['velocidad', 0.3], ['desfase', 0.1]],
    glsl: `float r = sin((_st.x + u_t * velocidad) * frecuencia) * 0.5 + 0.5;
           float g = sin((_st.x + u_t * velocidad + desfase) * frecuencia) * 0.5 + 0.5;
           float b = sin((_st.x + u_t * velocidad + desfase * 2.0) * frecuencia) * 0.5 + 0.5;
           return vec4(r, g, b, 1.0);`
  },
  franjas: {
    tipo: 'fuente',
    args: [['cantidad', 6], ['grosor', 0.4], ['velocidad', 0.2]],
    glsl: `float f = fract(_st.y * cantidad + u_t * velocidad);
           float v = step(f, grosor);
           return vec4(vec3(v), 1.0);`
  },
  circulo: {
    tipo: 'fuente',
    args: [['radio', 0.3], ['borde', 0.02]],
    glsl: `float d = distance(_st, vec2(0.5));
           return vec4(vec3(smoothstep(radio + borde, radio - borde, d)), 1.0);`
  },
  degradado: {
    tipo: 'fuente',
    args: [['velocidad', 0.0]],
    glsl: `return vec4(_st.x, _st.y, fract(u_t * velocidad), 1.0);`
  },
  plano: {
    tipo: 'fuente',
    args: [['r', 0], ['g', 0], ['b', 0]],
    glsl: `return vec4(r, g, b, 1.0);`
  },
  // la foto depositada en el banco, como cualquier otra fuente
  foto: {
    tipo: 'fuente',
    args: [],
    glsl: `if (u_hayTex < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
           return texture2D(u_tex, vec2(_st.x, 1.0 - _st.y));`
  },

  // ---- espacio: deformar dónde se mira ------------------------------------
  gira: {
    tipo: 'espacio',
    args: [['angulo', 0.2], ['velocidad', 0]],
    glsl: `vec2 c = _st - 0.5;
           float a = angulo + u_t * velocidad;
           return vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a)) + 0.5;`
  },
  escala: {
    tipo: 'espacio',
    args: [['factor', 1.5]],
    glsl: `return (_st - 0.5) / max(0.001, factor) + 0.5;`
  },
  repite: {
    tipo: 'espacio',
    args: [['x', 3], ['y', 3]],
    glsl: `return fract(_st * vec2(x, y));`
  },
  pixela: {
    tipo: 'espacio',
    args: [['x', 40], ['y', 40]],
    glsl: `return floor(_st * vec2(x, y)) / vec2(x, y);`
  },
  corre: {
    tipo: 'espacio',
    args: [['x', 0.1], ['y', 0]],
    glsl: `return fract(_st + vec2(x, y) * u_t);`
  },
  espeja: {
    tipo: 'espacio',
    args: [],
    glsl: `return vec2(abs(_st.x - 0.5) + 0.5, _st.y);`
  },

  // ---- color: transformar lo que se vio -----------------------------------
  invierte: {
    tipo: 'color',
    args: [['cuanto', 1]],
    glsl: `return vec4(mix(_c0.rgb, 1.0 - _c0.rgb, cuanto), _c0.a);`
  },
  umbral: {
    tipo: 'color',
    args: [['corte', 0.5], ['suavidad', 0.02]],
    glsl: `float l = _luz(_c0.rgb);
           return vec4(vec3(smoothstep(corte - suavidad, corte + suavidad, l)), _c0.a);`
  },
  posteriza: {
    tipo: 'color',
    args: [['pasos', 4]],
    glsl: `return vec4(floor(_c0.rgb * pasos) / pasos, _c0.a);`
  },
  brillo: {
    tipo: 'color',
    args: [['cuanto', 0.2]],
    glsl: `return vec4(_c0.rgb + cuanto, _c0.a);`
  },
  contraste: {
    tipo: 'color',
    args: [['cuanto', 1.5]],
    glsl: `return vec4((_c0.rgb - 0.5) * cuanto + 0.5, _c0.a);`
  },
  gris: {
    tipo: 'color',
    args: [['cuanto', 1]],
    glsl: `return vec4(mix(_c0.rgb, vec3(_luz(_c0.rgb)), cuanto), _c0.a);`
  },
  tinte: {
    tipo: 'color',
    args: [['r', 1], ['g', 0.7], ['b', 0.4]],
    glsl: `return vec4(_c0.rgb * vec3(r, g, b), _c0.a);`
  },

  // ---- mezcla: juntar dos imágenes ----------------------------------------
  suma: {
    tipo: 'mezcla',
    args: [['cuanto', 1]],
    glsl: `return _c0 + _c1 * cuanto;`
  },
  resta: {
    tipo: 'mezcla',
    args: [['cuanto', 1]],
    glsl: `return _c0 - _c1 * cuanto;`
  },
  multiplica: {
    tipo: 'mezcla',
    args: [['cuanto', 1]],
    glsl: `return _c0 * mix(vec4(1.0), _c1, cuanto);`
  },
  encima: {
    tipo: 'mezcla',
    args: [['cuanto', 0.5]],
    glsl: `return mix(_c0, _c1, cuanto);`
  },
  diferencia: {
    tipo: 'mezcla',
    args: [],
    glsl: `return vec4(abs(_c0.rgb - _c1.rgb), _c0.a);`
  },
  recorta: {
    tipo: 'mezcla',
    args: [],
    glsl: `float a = _luz(_c1.rgb);
           return vec4(_c0.rgb * a, a * _c0.a);`
  },

  // ---- desvío: una imagen deforma el espacio de otra ----------------------
  // Es la idea más fuerte de Hydra y son dos líneas. De acá sale casi toda
  // la sensación de que la imagen está viva.
  desvia: {
    tipo: 'desvio',
    args: [['cuanto', 0.1]],
    glsl: `return _st + (_c0.xy - 0.5) * cuanto;`
  },
  desviaGiro: {
    tipo: 'desvio',
    args: [['cuanto', 1]],
    glsl: `vec2 c = _st - 0.5;
           float a = (_c0.r - 0.5) * cuanto;
           return vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a)) + 0.5;`
  },
  desviaEscala: {
    tipo: 'desvio',
    args: [['cuanto', 1]],
    glsl: `return (_st - 0.5) / max(0.05, 1.0 + (_c0.r - 0.5) * cuanto) + 0.5;`
  }
};

// firma de cada tipo: qué recibe y qué devuelve
const TIPOS = {
  fuente:  { sale: 'vec4', entra: [['vec2', '_st']] },
  espacio: { sale: 'vec2', entra: [['vec2', '_st']] },
  color:   { sale: 'vec4', entra: [['vec4', '_c0']] },
  mezcla:  { sale: 'vec4', entra: [['vec4', '_c0'], ['vec4', '_c1']] },
  desvio:  { sale: 'vec2', entra: [['vec2', '_st'], ['vec4', '_c0']] }
};

// ── el preámbulo ─────────────────────────────────────────────────────────────
// Uniforms del motor y ayudantes. u_nivel, u_golpe y la señal están acá para
// que cualquier operación pueda reaccionar al sonido: eso es lo que hace que
// esto sea un instrumento y no un editor de shaders.

const PREAMBULO = `precision mediump float;

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

float _luz(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float _azar(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float _ruido(vec3 p) {
  vec2 i = floor(p.xy);
  vec2 f = fract(p.xy);
  f = f * f * (3.0 - 2.0 * f);
  float z = floor(p.z);
  float a = mix(mix(_azar(i + z), _azar(i + vec2(1.0, 0.0) + z), f.x),
                mix(_azar(i + vec2(0.0, 1.0) + z), _azar(i + vec2(1.0, 1.0) + z), f.x), f.y);
  float b = mix(mix(_azar(i + z + 1.0), _azar(i + vec2(1.0, 0.0) + z + 1.0), f.x),
                mix(_azar(i + vec2(0.0, 1.0) + z + 1.0), _azar(i + vec2(1.0, 1.0) + z + 1.0), f.x), f.y);
  return mix(a, b, fract(p.z));
}
`;

// ── el intérprete ────────────────────────────────────────────────────────────
//
// Una línea es una operación. El shader se lee de arriba a abajo: la primera
// fuente arranca la imagen, las que siguen la transforman. No hay
// encadenamiento con puntos — eso es de Hydra — sino una línea por paso, que
// es como ya se escribe todo lo demás en yaqxxa.

// (.*) y no ([^)]*): el argumento de una mezcla es otra llamada, con sus
// propios paréntesis — multiplica(ruido(6), 0.8). Anclado al final, la
// codicia del punto agarra hasta el último cierre.
const LINEA = /^([a-záéíóúñ][a-zA-Z0-9áéíóúñ]*)\s*\((.*)\)$/;

/** Una llamada anidada como argumento: mezcla(ondas(20), 0.5) */
const ANIDADA = /^([a-záéíóúñ][a-zA-Z0-9áéíóúñ]*)\s*\((.*)\)$/;

function argumentos(op, brutos, linea) {
  const partes = brutos.split(',').map(x => x.trim()).filter(Boolean);
  return op.args.map(([nombre, def], i) => {
    const dado = partes[i];
    if (dado === undefined) return String(def.toFixed ? def.toFixed(4) : def);
    const n = parseFloat(dado);
    if (Number.isNaN(n)) {
      throw new Error(`línea ${linea}: "${nombre}" de ${op.nombre} espera un número, recibió "${dado}"`);
    }
    // GLSL no acepta enteros donde espera float
    return Number.isInteger(n) ? n.toFixed(1) : String(n);
  });
}

/** Compila el texto de un slot a un fragment shader completo. */
export function componer(texto) {
  const lineas = texto.split('\n')
    .map((l, i) => ({ n: i + 1, t: l.split('#')[0].trim() }))
    .filter(l => l.t);

  if (!lineas.length) throw new Error('no hay operaciones');

  const usadas = new Set();
  let coord = 'st';       // el espacio, que se va deformando
  let color = null;       // la imagen, una vez que hay fuente
  let contador = 0;

  const compilarFuenteSuelta = (texto, nLinea) => {
    const m = ANIDADA.exec(texto.trim());
    if (!m) throw new Error(`línea ${nLinea}: "${texto}" no es una fuente`);
    const op = OPERACIONES[m[1]];
    if (!op) throw new Error(`línea ${nLinea}: no conozco "${m[1]}"`);
    if (op.tipo !== 'fuente') throw new Error(`línea ${nLinea}: "${m[1]}" no es una fuente`);
    usadas.add(m[1]);
    const a = argumentos({ ...op, nombre: m[1] }, m[2], nLinea);
    return `${m[1]}(st${a.length ? ', ' + a.join(', ') : ''})`;
  };

  for (const { n, t } of lineas) {
    const m = LINEA.exec(t);
    if (!m) throw new Error(`línea ${n}: no entiendo "${t}" — la forma es operacion(1, 2)`);
    const nombre = m[1];
    const op = OPERACIONES[nombre];
    if (!op) {
      const cercana = Object.keys(OPERACIONES)
        .find(k => k.startsWith(nombre.slice(0, 3)));
      throw new Error(`línea ${n}: no conozco "${nombre}"` + (cercana ? ` — ¿"${cercana}"?` : ''));
    }
    usadas.add(nombre);

    if (op.tipo === 'mezcla' || op.tipo === 'desvio') {
      // el primer argumento es otra fuente
      const partes = m[2].split(/,(.+)/);
      const otra = compilarFuenteSuelta(partes[0] || '', n);
      const resto = argumentos({ ...op, nombre }, partes[1] || '', n);
      if (op.tipo === 'mezcla') {
        if (!color) throw new Error(`línea ${n}: ${nombre}() necesita una fuente antes`);
        color = `${nombre}(${color}, ${otra}${resto.length ? ', ' + resto.join(', ') : ''})`;
      } else {
        coord = `${nombre}(${coord}, ${otra}${resto.length ? ', ' + resto.join(', ') : ''})`;
      }
      continue;
    }

    const a = argumentos({ ...op, nombre }, m[2], n);
    const args = a.length ? ', ' + a.join(', ') : '';

    if (op.tipo === 'fuente') {
      if (color) throw new Error(`línea ${n}: ya hay una fuente — usá una mezcla para juntar dos`);
      color = `${nombre}(${coord}${args})`;
    } else if (op.tipo === 'espacio') {
      if (color) throw new Error(`línea ${n}: ${nombre}() deforma el espacio, va antes de la fuente`);
      coord = `${nombre}(${coord}${args})`;
    } else if (op.tipo === 'color') {
      if (!color) throw new Error(`línea ${n}: ${nombre}() necesita una fuente antes`);
      color = `${nombre}(${color}${args})`;
    }
    contador++;
  }

  if (!color) throw new Error('falta una fuente: ruido(), ondas(), foto()…');

  // solo se emiten las funciones que se usaron
  const funciones = [...usadas].map(nombre => {
    const op = OPERACIONES[nombre];
    const t = TIPOS[op.tipo];
    const entra = t.entra.map(([tipo, n]) => `${tipo} ${n}`)
      .concat(op.args.map(([n]) => `float ${n}`)).join(', ');
    return `${t.sale} ${nombre}(${entra}) {\n${op.glsl.split('\n').map(l => '  ' + l.trim()).join('\n')}\n}`;
  }).join('\n\n');

  return `${PREAMBULO}
${funciones}

void main() {
  vec2 st = gl_FragCoord.xy / u_res;
  gl_FragColor = ${color};
}
`;
}

/** ¿Este texto es una composición y no GLSL crudo? */
export const esComposicion = texto => {
  if (/gl_FragColor|void\s+main/.test(texto)) return false;
  return texto.split('\n')
    .map(l => l.split('#')[0].trim()).filter(Boolean)
    .some(l => { const m = LINEA.exec(l); return m && OPERACIONES[m[1]]; });
};

/** Para la ayuda en pantalla. */
export function porTipo() {
  const r = { fuente: [], espacio: [], color: [], mezcla: [], desvio: [] };
  for (const [nombre, op] of Object.entries(OPERACIONES)) r[op.tipo].push(nombre);
  return r;
}

export const EJEMPLO = `# el shader se lee de arriba a abajo
# espacio primero, después la fuente, después el color

gira(0.1, 0.05)
pixela(60, 60)
ruido(6, 0.3)
umbral(0.5)
tinte(1, 0.7, 0.4)`;
