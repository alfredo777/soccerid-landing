/**
 * Asistente de contenidos del admin — Anthropic Claude Haiku 4.5.
 *
 * La IA **propone**, el admin **revisa y guarda**. Nada de lo que sale de aquí
 * se escribe solo en la base: siempre pasa por el formulario del admin, que es
 * lo que pidió el usuario y lo que evita que un texto inventado llegue al
 * inversionista sin que nadie lo lea.
 *
 * Modelo: `claude-haiku-4-5` (decisión del usuario). Es un modelo previo a la
 * familia 4.6, así que **no** lleva `effort` ni thinking adaptativo: esos
 * parámetros devuelven error aquí.
 *
 * Sin `ANTHROPIC_API_KEY` el asistente no aparece en el admin. No truena: los
 * botones simplemente no se dibujan.
 */
const AnthropicPkg = require('@anthropic-ai/sdk');
const Anthropic = AnthropicPkg.default || AnthropicPkg;

const MODELO = 'claude-haiku-4-5';
const MAX_TOKENS = 8000;

function disponible() {
  return !!(process.env.ANTHROPIC_API_KEY || '').trim();
}

let cliente = null;
function getCliente() {
  if (!disponible()) return null;
  if (!cliente) cliente = new Anthropic();
  return cliente;
}

// Reglas que valen para todo lo que escriba el asistente.
const VOZ = `Escribes contenidos para SOCCER iD, organizadora de la SOCCER iD CUP:
partidos amistosos internacionales en ventana FIFA. El público son inversionistas
y patrocinadores del evento, gente de negocios.

Cómo escribes:
- En español de México, claro y directo. Sin superlativos vacíos ni relleno.
- Frases cortas. Nada de "en el marco de", "cabe destacar", "sin lugar a dudas".
- Tono profesional pero humano, como quien le explica algo a un socio.

Lo que NUNCA haces:
- **No inventas cifras, fechas, nombres ni resultados.** Si te falta un dato,
  lo dejas indicado entre corchetes, por ejemplo [monto por confirmar]. Es
  información financiera de gente real: un número inventado es un problema serio.
- No prometes rendimientos ni usas lenguaje de venta agresiva.
- No firmas ni te presentas como IA en el texto.`;

/** Cada tarea del asistente: qué le pide al modelo y qué devuelve. */
const TAREAS = {
  noticia: {
    label: 'Noticia',
    campos: ['title', 'excerpt', 'content'],
    instruccion: `Escribe una noticia para el portal de inversionistas.
Devuelve SOLO un objeto JSON con estas claves, sin texto alrededor y sin markdown:
{"title": "titular de 8 a 12 palabras",
 "excerpt": "resumen de 1 o 2 frases, máximo 200 caracteres",
 "content": "cuerpo de 3 a 5 párrafos separados por dos saltos de línea"}`
  },
  faq: {
    label: 'Pregunta frecuente',
    campos: ['question', 'answer'],
    instruccion: `Escribe una pregunta frecuente con su respuesta.
Devuelve SOLO un objeto JSON, sin texto alrededor y sin markdown:
{"question": "la pregunta tal como la haría un inversionista",
 "answer": "respuesta de 2 a 4 frases, concreta"}`
  },
  presentacion: {
    label: 'Presentación de la edición',
    campos: ['texto'],
    instruccion: `Escribe la presentación de una edición para el panel del inversionista.
Usa este formato de texto plano: "## " para los títulos de sección, "- " para las
viñetas, y una línea en blanco entre párrafos. De 3 a 5 secciones.
Devuelve SOLO el texto, sin JSON y sin explicaciones.`
  },
  comunicado: {
    label: 'Comunicación',
    campos: ['title', 'body'],
    instruccion: `Escribe una comunicación oficial para los inversionistas.
Devuelve SOLO un objeto JSON, sin texto alrededor y sin markdown:
{"title": "asunto breve", "body": "mensaje de 1 a 3 párrafos"}`
  },
  mejorar: {
    label: 'Mejorar el texto',
    campos: ['texto'],
    instruccion: `Reescribe el texto que te doy: más claro y mejor redactado, **sin
cambiar los hechos, las cifras ni el significado**. Misma longitud aproximada.
Devuelve SOLO el texto corregido, sin comentarios.`
  },
  acortar: {
    label: 'Acortar',
    campos: ['texto'],
    instruccion: `Acorta el texto a más o menos la mitad, conservando lo importante y
todas las cifras. Devuelve SOLO el texto, sin comentarios.`
  },
  traducir_en: {
    label: 'Traducir al inglés',
    campos: ['texto'],
    instruccion: `Traduce el texto al inglés de negocios, natural, no literal.
Conserva las cifras y los nombres propios tal cual. Devuelve SOLO la traducción.`
  },
  traducir_es: {
    label: 'Traducir al español',
    campos: ['texto'],
    instruccion: `Traduce el texto al español de México, natural, no literal.
Conserva las cifras y los nombres propios tal cual. Devuelve SOLO la traducción.`
  }
};

/** El JSON puede venir envuelto en ```json …```; se limpia antes de parsear. */
function parseJson(texto) {
  let t = String(texto || '').trim();
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (cerca) t = cerca[1].trim();
  const ini = t.indexOf('{'), fin = t.lastIndexOf('}');
  if (ini === -1 || fin === -1) return null;
  try { return JSON.parse(t.slice(ini, fin + 1)); } catch (_) { return null; }
}

/**
 * Genera una propuesta.
 * @returns {{ok:boolean, tarea:string, campos?:object, texto?:string, error?:string, uso?:object}}
 */
async function generar({ tarea, instruccion, actual, contexto, fuente }) {
  const t = TAREAS[tarea];
  if (!t) return { ok: false, error: 'Esa tarea no existe' };
  const client = getCliente();
  if (!client) return { ok: false, error: 'Falta la llave de Anthropic (ANTHROPIC_API_KEY)' };

  const pedido = String(instruccion || '').trim();
  const base = String(actual || '').trim();
  const src = String(fuente || '').trim();
  if (!pedido && !base && !src) return { ok: false, error: 'Escribe qué quieres que redacte (o pega una URL de la nota)' };

  const partes = [t.instruccion];
  if (contexto) partes.push(`Contexto del evento:\n${String(contexto).slice(0, 4000)}`);
  if (src) partes.push(`Nota original de la que debes partir (resúmela y reescríbela con la voz de SOCCER iD; NO la copies textual y NO inventes datos que no estén ahí):\n"""\n${src.slice(0, 10000)}\n"""`);
  if (base) partes.push(`Texto actual:\n"""\n${base.slice(0, 12000)}\n"""`);
  if (pedido) partes.push(`Lo que pide el organizador:\n${pedido.slice(0, 4000)}`);

  try {
    const res = await client.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: VOZ,
      messages: [{ role: 'user', content: partes.join('\n\n') }]
    });

    const texto = res.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    const uso = {
      entrada: res.usage ? res.usage.input_tokens : 0,
      salida: res.usage ? res.usage.output_tokens : 0
    };

    // Las tareas de un solo campo devuelven texto plano; las demás, JSON.
    if (t.campos.length === 1 && t.campos[0] === 'texto') {
      return { ok: true, tarea, texto, uso };
    }
    const obj = parseJson(texto);
    if (!obj) {
      // Antes de dar un error seco: el texto sirve, aunque no venga estructurado
      return { ok: true, tarea, texto, campos: null, aviso: 'La respuesta no vino separada por campos; se muestra tal cual.', uso };
    }
    const campos = {};
    t.campos.forEach(k => { campos[k] = String(obj[k] == null ? '' : obj[k]).trim(); });
    return { ok: true, tarea, campos, uso };
  } catch (e) {
    // Mensajes útiles según el tipo de fallo, no un "error" a secas
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: 'La llave de Anthropic no es válida' };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: 'Demasiadas peticiones seguidas: espera unos segundos' };
    if (e instanceof Anthropic.BadRequestError) return { ok: false, error: `Petición rechazada: ${e.message}` };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `Error de la API (${e.status}): ${e.message}` };
    return { ok: false, error: e.message || 'No se pudo generar' };
  }
}

module.exports = {
  disponible, generar, MODELO,
  tareas: Object.keys(TAREAS).map(k => ({ key: k, label: TAREAS[k].label, campos: TAREAS[k].campos }))
};
