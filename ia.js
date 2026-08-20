// ia.js — cliente de archive.org.
//
// Todo lo que yaqxxa sabe hacer con el banco pasa por acá: buscar, resolver,
// subir. No hay servidor de yaqxxa en ninguna parte de este archivo: el
// navegador le habla directo a archive.org.
//
// Endpoints y por qué:
//   archive.org/metadata/<id>      leer la ficha de un depósito. Da CORS.
//   archive.org/cors/<id>/<arch>   leer los BYTES. Es el único que da CORS;
//                                  /download/ y /serve/ no. Sin esto no se
//                                  pueden leer píxeles ni decodificar audio.
//   archive.org/advancedsearch.php buscar. Da CORS.
//   s3.us.archive.org              subir (IAS3). Da CORS para PUT.

const META   = 'https://archive.org/metadata/';
const CORS   = 'https://archive.org/cors/';
const BUSCAR = 'https://archive.org/advancedsearch.php';
const S3     = 'https://s3.us.archive.org/';

export const ETIQUETA = 'yaqxxa';   // lo que delimita el banco
export const PREFIJO  = 'yaqxxa-';  // lo que delimita el espacio de nombres

// tipo de medio → letra del lenguaje
export const LETRAS = { image: 'f', audio: 's', video: 'v' };
export const NOMBRES = { f: 'foto', s: 'sonido', v: 'video' };

// ── identificadores ──────────────────────────────────────────────────────────

/** La palabra se guarda tal cual; el identificador es un slug de la palabra.
 *  La restricción técnica no debe deformar la palabra. */
export function slug(palabra) {
  return palabra
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const identificador = (palabra, n) => `${PREFIJO}${slug(palabra)}-${n}`;
export const urlBytes  = (id, archivo) => CORS + id + '/' + encodeURIComponent(archivo);
export const urlPagina = id => 'https://archive.org/details/' + id;

// ── lectura ──────────────────────────────────────────────────────────────────

export async function ficha(id) {
  const r = await fetch(META + id);
  const j = await r.json();
  return Object.keys(j).length ? j : null;   // {} = no existe. Es un hueco.
}

/** Resuelve ~palabra.letra(n) a una URL de bytes que el navegador puede leer. */
export async function resolver(palabra, letra, n) {
  const id = identificador(palabra, n);
  const f = await ficha(id);
  if (!f) return { error: `~${palabra}(${n}) no existe`, id };

  const archivos = (f.files || []).filter(a => a.source !== 'metadata');
  const buscado = archivos.find(a => a.name.startsWith(NOMBRES[letra] + '.'));
  if (!buscado) {
    const hay = archivos.map(a => a.name.split('.')[0]).filter(x => x !== 'ficha');
    return {
      error: `~${palabra}(${n}) existe pero no tiene ${NOMBRES[letra]}` +
             (hay.length ? ` — tiene: ${[...new Set(hay)].join(', ')}` : ''),
      id
    };
  }
  return {
    id, archivo: buscado.name,
    url: urlBytes(id, buscado.name),
    bytes: Number(buscado.size) || 0,
    meta: f.metadata
  };
}

/** Qué números existen para una palabra. El índice es una consulta, no un archivo. */
export async function indice(palabra) {
  const q = `identifier:${PREFIJO}${slug(palabra)}-*`;
  const u = `${BUSCAR}?q=${encodeURIComponent(q)}&fl%5B%5D=identifier&rows=500&output=json`;
  const j = await (await fetch(u)).json();
  return (j.response?.docs || [])
    .map(d => Number(d.identifier.slice((PREFIJO + slug(palabra) + '-').length)))
    .filter(n => Number.isInteger(n))
    .sort((a, b) => a - b);
}

/** Todas las palabras del banco. */
export async function palabras() {
  const u = `${BUSCAR}?q=${encodeURIComponent('subject:"' + ETIQUETA + '"')}` +
            `&fl%5B%5D=identifier&rows=500&output=json`;
  const j = await (await fetch(u)).json();
  const cuenta = {};
  for (const d of j.response?.docs || []) {
    const m = d.identifier.match(new RegExp('^' + PREFIJO + '(.+)-(\\d+)$'));
    if (m) cuenta[m[1]] = (cuenta[m[1]] || 0) + 1;
  }
  return cuenta;
}

// ── credenciales ─────────────────────────────────────────────────────────────
//
// Las llaves S3 de archive.org son de cuenta completa. Viven solo en este
// navegador y solo se envían a archive.org. yaqxxa no tiene servidor al que
// mandarlas aunque quisiera. Se rotan en archive.org/account/s3.php

const CLAVE = 'yaqxxa.ia';

export const credenciales = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || null; } catch { return null; }
};
export const guardarCredenciales = (acceso, secreto) =>
  localStorage.setItem(CLAVE, JSON.stringify({ acceso: acceso.trim(), secreto: secreto.trim() }));
export const olvidarCredenciales = () => localStorage.removeItem(CLAVE);

// ── subida ───────────────────────────────────────────────────────────────────

/** Cabeceras de metadatos. Los valores no ASCII van en uri(...) según IAS3. */
function meta(clave, valor) {
  const v = String(valor);
  return [clave, /[^\x00-\x7F]/.test(v) ? `uri(${encodeURIComponent(v)})` : v];
}

/**
 * Sube un depósito: un ítem de archive.org con uno o más archivos.
 *
 * El número no se guarda en ninguna base de datos: va en el identificador.
 * Si `yaqxxa-alarako-0` ya existe, archive.org rechaza la creación y probamos
 * con el 1. Eso convierte la unicidad global de identificadores en un contador
 * atómico: dos personas subiendo a la vez desde ciudades distintas no se pisan.
 */
/** Extrae el <Code> y el <Message> del XML de error de IAS3. */
function errorIA(xml) {
  const codigo = (xml.match(/<Code>([^<]*)<\/Code>/) || [])[1] || '';
  const mensaje = (xml.match(/<Message>([^<]*)<\/Message>/) || [])[1] || xml.slice(0, 200);
  return { codigo, mensaje };
}

const EN_CASTELLANO = {
  InvalidAccessKeyId: 'la access key no existe en archive.org — revisá que la copiaste completa',
  SignatureDoesNotMatch: 'la secret key no coincide con la access key',
  AccessDenied: 'archive.org no autorizó la subida con esas llaves',
  BucketAlreadyExists: 'ese número ya está tomado'
};

/** true si el error significa "ese identificador ya existe", que es nuestro contador. */
const numeroTomado = e =>
  e.codigo === 'BucketAlreadyExists' || /bucket .*already|already .*exists/i.test(e.mensaje);

/**
 * Sube un depósito: un ítem de archive.org con uno o más archivos.
 *
 * El número no vive en ninguna base de datos: va en el identificador. Si
 * `yaqxxa-alarako-0` ya existe, archive.org rechaza la creación y probamos con
 * el 1. Eso convierte la unicidad global de identificadores en un contador
 * atómico: dos personas subiendo a la vez desde ciudades distintas no se pisan.
 */
export async function subir({ palabra, piezas, fichaDatos, alAvanzar = () => {} }) {
  const cred = credenciales();
  if (!cred) throw new Error('faltan las llaves de archive.org');

  const auth = `LOW ${cred.acceso}:${cred.secreto}`;
  const existentes = await indice(palabra);
  let n = existentes.length ? Math.max(...existentes) + 1 : 0;

  const cuerpoFicha = new Blob(
    [JSON.stringify({ ...fichaDatos, palabra, subido: new Date().toISOString() }, null, 2)],
    { type: 'application/json' }
  );

  for (let intento = 0; intento < 12; intento++, n++) {
    const id = identificador(palabra, n);

    // Comprobar antes de subir: así el camino normal no depende de interpretar
    // un mensaje de error, y el error queda solo como red de seguridad ante
    // una carrera entre dos personas subiendo a la vez.
    alAvanzar(`probando ${id}…`);
    if (await ficha(id)) continue;

    const primera = piezas[0];
    alAvanzar(`subiendo ${primera.nombre}…`);
    const r = await fetch(S3 + id + '/' + primera.nombre, {
      method: 'PUT',
      headers: Object.fromEntries([
        ['authorization', auth],
        ['x-amz-auto-make-bucket', '1'],
        meta('x-archive-meta-mediatype', 'data'),
        meta('x-archive-meta-title', `${palabra} (${n})`),
        meta('x-archive-meta-description', fichaDatos.que || `Depósito ${n} de la palabra ${palabra} en yaqxxa.`),
        meta('x-archive-meta01-subject', ETIQUETA),
        meta('x-archive-meta02-subject', palabra),
        meta('x-archive-meta-yaqxxa-palabra', palabra),
        meta('x-archive-meta-yaqxxa-numero', String(n)),
        ...(fichaDatos.quien ? [meta('x-archive-meta-creator', fichaDatos.quien)] : [])
      ]),
      body: primera.archivo
    });

    if (!r.ok) {
      const e = errorIA(await r.text());
      if (numeroTomado(e)) continue;                     // carrera: probar el siguiente
      throw new Error(EN_CASTELLANO[e.codigo] || `archive.org respondió ${r.status}: ${e.mensaje}`);
    }

    // el número quedó nuestro: el resto entra al mismo ítem
    for (const p of piezas.slice(1)) {
      alAvanzar(`subiendo ${p.nombre}…`);
      const r2 = await fetch(S3 + id + '/' + p.nombre, {
        method: 'PUT',
        headers: { authorization: auth, 'x-archive-ignore-preexisting-bucket': '1' },
        body: p.archivo
      });
      if (!r2.ok) {
        const e = errorIA(await r2.text());
        throw new Error(`el depósito ${id} se creó pero falló ${p.nombre}: ${e.mensaje}`);
      }
    }

    // La procedencia va como archivo, no solo como metadato: viaja con el
    // depósito y sobrevive aunque archive.org desaparezca.
    alAvanzar('subiendo ficha.json…');
    await fetch(S3 + id + '/ficha.json', {
      method: 'PUT',
      headers: { authorization: auth, 'x-archive-ignore-preexisting-bucket': '1' },
      body: cuerpoFicha
    });

    return { id, n, url: urlPagina(id) };
  }
  throw new Error('no encontré un número libre después de 12 intentos');
}
