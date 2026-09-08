/**
 * Códigos de la propuesta 2027: dueño asignado y mapa de relaciones.
 *
 * Cada código se puede asignar a una persona (nombre, correo, teléfono y tags).
 * Cuando alguien entra con ese código comparamos contra el dueño para saber si
 * entró él o **otra persona** — que es justo lo interesante: significa que lo
 * reenvió, y ahí hay un referido que perseguir.
 */

function normEmail(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}
function normPhone(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-10) : ''; // últimos 10: ignora lada país / 044
}
function normName(v) {
  return String(v == null ? '' : v).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Lista de tags a partir del campo de texto. */
function parseTags(v) {
  return String(v == null ? '' : v).split(',').map(t => t.trim()).filter(Boolean).slice(0, 12);
}

/**
 * ¿Quien entró es el dueño del código?
 *   true  → coincide correo o teléfono (o el nombre exacto, si no hay más)
 *   false → hay dueño y no coincide: otra persona
 *   null  → no se puede saber (código sin dueño, o visitante sin datos)
 */
function matchOwner(code, visitor) {
  if (!code) return null;
  const oMail = normEmail(code.assignee_email);
  const oPhone = normPhone(code.assignee_phone);
  const oName = normName(code.assignee_name);
  if (!oMail && !oPhone && !oName) return null; // código sin dueño asignado

  const vMail = normEmail(visitor && visitor.email);
  const vPhone = normPhone(visitor && visitor.phone);
  const vName = normName(visitor && visitor.name);
  if (!vMail && !vPhone && !vName) return null; // no dejó nada con qué comparar

  // Coincide por CUALQUIER señal fuerte: correo, teléfono o nombre. Antes se
  // comparaba SOLO el correo cuando ambos lo tenían, así que un correo con typo
  // (jardsrubydv vs jardarubydv) marcaba "otra persona" aunque el nombre fuera
  // idéntico. Ahora una coincidencia en cualquier campo basta para el dueño.
  if (oMail && vMail && oMail === vMail) return true;
  if (oPhone && vPhone && oPhone === vPhone) return true;
  if (oName && vName && oName === vName) return true;
  // Había con qué comparar y no coincidió ninguna señal → otra persona.
  if ((oMail && vMail) || (oPhone && vPhone) || (oName && vName)) return false;
  return null;
}

/**
 * Arma el grafo para el mapa: un nodo por dueño de código y un nodo por quien
 * entró. La arista dice "el código de X lo usó Y".
 *
 * Solo entran los códigos **con dueño**: sin dueño no hay relación que mostrar.
 */
function buildRelations(codes, accesses) {
  const byCode = {};
  codes.forEach(c => { byCode[c.code] = c; });

  const owners = new Map();   // clave dueño -> nodo
  const visitors = new Map(); // clave visitante -> nodo
  const edges = [];

  const ownerKey = (c) => normEmail(c.assignee_email) || normPhone(c.assignee_phone) || normName(c.assignee_name);
  const visitorKey = (a) => normEmail(a.email) || normName(a.name) || `disp:${a.device_id || a.id}`;

  codes.forEach(c => {
    const k = ownerKey(c);
    if (!k) return;
    if (!owners.has(k)) {
      owners.set(k, {
        id: 'o:' + k, key: k, label: c.assignee_name || c.assignee_email || c.assignee_phone || '—',
        email: c.assignee_email || '', phone: c.assignee_phone || '',
        tags: parseTags(c.tags), codes: [], accesses: 0, own: 0, others: 0
      });
    }
    const o = owners.get(k);
    o.codes.push(c.code);
    parseTags(c.tags).forEach(t => { if (!o.tags.includes(t)) o.tags.push(t); });
  });

  accesses.forEach(a => {
    const c = byCode[a.code];
    if (!c) return;
    const k = ownerKey(c);
    if (!k || !owners.has(k)) return;
    const o = owners.get(k);
    o.accesses++;
    if (a.matched_owner === true || a.matched_owner === 1) { o.own++; return; }

    // Entró alguien distinto (o no se pudo confirmar): es una relación que sí importa
    const vk = visitorKey(a);
    if (vk === k) { o.own++; return; }
    o.others++;
    if (!visitors.has(vk)) {
      visitors.set(vk, {
        id: 'v:' + vk, key: vk, label: a.name || a.email || 'Anónimo',
        email: a.email || '', accesses: 0, from: new Set()
      });
    }
    const v = visitors.get(vk);
    v.accesses++;
    v.from.add(k);
    edges.push({ from: o.id, to: v.id, code: a.code, when: a.created_at, confirmed: a.matched_owner === false || a.matched_owner === 0 });
  });

  // Una arista por par dueño→visitante, con el conteo (no una por cada visita)
  const merged = new Map();
  edges.forEach(e => {
    const k = e.from + '>' + e.to;
    if (!merged.has(k)) merged.set(k, { from: e.from, to: e.to, codes: new Set(), count: 0, confirmed: false });
    const m = merged.get(k);
    m.codes.add(e.code);
    m.count++;
    if (e.confirmed) m.confirmed = true;
  });

  return {
    owners: [...owners.values()],
    visitors: [...visitors.values()].map(v => ({ id: v.id, label: v.label, email: v.email, accesses: v.accesses, fromCount: v.from.size })),
    edges: [...merged.values()].map(m => ({ from: m.from, to: m.to, codes: [...m.codes], count: m.count, confirmed: m.confirmed }))
  };
}

module.exports = { matchOwner, buildRelations, parseTags, normEmail, normPhone, normName };
