/**
 * Configuración editable del dashboard del inversionista.
 *
 * Los valores por defecto se leen de los archivos de contenido
 * (panel_config.json y cup_project_2027.json). Los valores que el admin
 * modifica se guardan en la tabla `app_settings` (clave `dashboard_config`)
 * porque en Heroku el sistema de archivos es efímero y editar los JSON en
 * runtime no persistiría entre despliegues.
 *
 * Además calcula el retorno proyectado de cada inversionista según su
 * tipo de inversión, replicando la lógica de la calculadora pública:
 *   - fijo:   monto × (1 + fixedRate/100)
 *   - riesgo: participación efectiva = (monto / projectCost) × investorSplit/100
 *             utilidad = utilidad del proyecto × participación efectiva
 *             (utilidad del proyecto = referenceAttendance × ticketPrice − projectCost)
 */
const path = require('path');
const fs = require('fs');
const knex = require('../db/knex');

const SETTINGS_KEY = 'dashboard_config';

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contents', file), 'utf8')); }
  catch (_) { return {}; }
}

// Valores por defecto a partir de los archivos de contenido
function fileDefaults() {
  const pc = readJson('panel_config.json');
  const cup = readJson('cup_project_2027.json');
  const calc = ((cup.es || {}).calculator) || {};
  const usd = (calc.currencies || []).find(c => c.id === 'usd') || {};
  return {
    advisor: pc.advisor || { name: '', role: '', phone: '', whatsapp: '', initials: '' },
    sharedFolder: pc.sharedFolder || null,
    eventDate: pc.eventDate || '2027-03-27',
    eventLabel: pc.eventLabel || '',
    eventTime: '19:00',
    // Parámetros de inversión (defaults tomados de la calculadora pública)
    fixedRate: calc.fixedRate != null ? calc.fixedRate : 25,
    investorSplit: calc.investorSplit != null ? calc.investorSplit : 50,
    projectCost: usd.projectCost != null ? usd.projectCost : 1000000,
    ticketPrice: usd.ticketPrice != null ? usd.ticketPrice : 100,
    capacity: calc.capacity != null ? calc.capacity : 21800,
    // Escenario ilustrativo para proyectar la participación a riesgo (default: estadio lleno)
    referenceAttendance: calc.capacity != null ? calc.capacity : 21800
  };
}

async function getDashboardConfig() {
  const defaults = fileDefaults();
  let saved = {};
  try {
    const row = await knex('app_settings').where({ key: SETTINGS_KEY }).first();
    if (row && row.value) saved = JSON.parse(row.value) || {};
  } catch (_) {}
  // Mezcla superficial; advisor y sharedFolder se mezclan a nivel de objeto
  const cfg = Object.assign({}, defaults, saved);
  cfg.advisor = Object.assign({}, defaults.advisor, saved.advisor || {});
  if (saved.sharedFolder !== undefined) cfg.sharedFolder = saved.sharedFolder;
  // Deriva iniciales del asesor si no se dieron
  if (cfg.advisor && !cfg.advisor.initials && cfg.advisor.name) {
    const p = cfg.advisor.name.trim().split(/\s+/);
    cfg.advisor.initials = ((p[0] || '')[0] || '').concat((p[1] || '')[0] || '').toUpperCase();
  }
  return cfg;
}

async function saveDashboardConfig(patch) {
  const current = await getRawSaved();
  const next = Object.assign({}, current, patch);
  if (patch.advisor) next.advisor = Object.assign({}, current.advisor || {}, patch.advisor);
  const value = JSON.stringify(next);
  const ex = await knex('app_settings').where({ key: SETTINGS_KEY }).first();
  if (ex) await knex('app_settings').where({ key: SETTINGS_KEY }).update({ value });
  else await knex('app_settings').insert({ key: SETTINGS_KEY, value });
  return next;
}

async function getRawSaved() {
  try {
    const row = await knex('app_settings').where({ key: SETTINGS_KEY }).first();
    if (row && row.value) return JSON.parse(row.value) || {};
  } catch (_) {}
  return {};
}

function formatUSD(n) {
  return 'USD $' + Number(n || 0).toLocaleString('en-US');
}
function pct(n) {
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? r : r.toFixed(1)) + '%';
}

/**
 * Calcula el bloque de retorno del dashboard para un usuario.
 * Devuelve etiquetas ya formateadas listas para la vista.
 */
function computeReturn(user, cfg) {
  const amount = Number(user.amount) || 0;
  const type = user.investment_type === 'riesgo' ? 'riesgo' : 'fijo';

  if (type === 'fijo') {
    const rate = Number(cfg.fixedRate) || 0;
    const profit = Math.round(amount * rate / 100);
    return {
      type: 'fijo',
      typeLabel: 'Retorno fijo',
      projectedReturn: formatUSD(amount + profit),
      profit: formatUSD(profit),
      returnPct: 'Hasta ' + pct(rate),
      returnMetaLabel: 'Rendimiento',
      isRisk: false
    };
  }

  // Participación a riesgo (50/50)
  const projectCost = Number(cfg.projectCost) || 0;
  const split = Number(cfg.investorSplit) || 0;
  const ticket = Number(cfg.ticketPrice) || 0;
  const attendance = Number(cfg.referenceAttendance) || 0;
  const effectiveShare = projectCost > 0 ? (amount / projectCost) * (split / 100) : 0; // fracción
  const projectProfit = attendance * ticket - projectCost;
  const yourProfit = Math.round(projectProfit * effectiveShare);
  const yieldPct = amount > 0 ? (yourProfit / amount) * 100 : 0;
  return {
    type: 'riesgo',
    typeLabel: 'Participación a riesgo',
    projectedReturn: formatUSD(amount + yourProfit),
    profit: formatUSD(yourProfit),
    returnPct: 'Hasta ' + pct(yieldPct),
    returnMetaLabel: 'Rendimiento ilustrativo',
    effectiveSharePct: pct(effectiveShare * 100),
    isRisk: true
  };
}

module.exports = { getDashboardConfig, saveDashboardConfig, computeReturn, SETTINGS_KEY };
