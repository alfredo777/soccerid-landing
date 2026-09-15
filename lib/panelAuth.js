/**
 * Autenticación del panel de inversionistas.
 * Sesión sin estado mediante JWT en cookie httpOnly (sobrevive reinicios de dyno).
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const knex = require('../db/knex');

const JWT_SECRET = process.env.PANEL_JWT_SECRET || process.env.SESSION_SECRET || 'panel-dev-secret-change-me';
const COOKIE_NAME = 'sid_panel';
const isProduction = process.env.NODE_ENV === 'production';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}
function verifyPassword(plain, hash) {
  if (!hash) return false;
  try { return bcrypt.compareSync(plain, hash); } catch (_) { return false; }
}

function makeInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Contraseña generada por el admin para una cuenta.
// Aleatoria de verdad (`crypto.randomInt`, no `Math.random`), sin los caracteres
// que se confunden al leerla o dictarla (0/O, 1/l/I) y en grupos de cuatro, que
// es como se acaba compartiendo: por mensaje o en voz alta.
const PWD_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generatePassword(grupos = 3, largo = 4) {
  const partes = [];
  for (let g = 0; g < grupos; g++) {
    let s = '';
    for (let i = 0; i < largo; i++) s += PWD_ALPHABET[crypto.randomInt(PWD_ALPHABET.length)];
    partes.push(s);
  }
  return partes.join('-');
}

function issueSession(res, user) {
  const token = jwt.sign({ uid: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

async function getUserFromRequest(req) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await knex('users').where({ id: payload.uid }).first();
    if (!user || user.status !== 'active') return null;
    return user;
  } catch (_) {
    return null;
  }
}

// Middleware: requiere sesión válida; adjunta req.panelUser
function requireAuth(req, res, next) {
  getUserFromRequest(req).then((user) => {
    if (!user) return res.redirect('/panel/login');
    req.panelUser = user;
    next();
  }).catch(next);
}

// Middleware: requiere rol admin
function requireAdmin(req, res, next) {
  getUserFromRequest(req).then((user) => {
    if (!user) return res.redirect('/panel/login');
    if (user.role !== 'admin') return res.status(403).redirect('/panel');
    req.panelUser = user;
    next();
  }).catch(next);
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  makeInviteToken,
  generatePassword,
  issueSession,
  clearSession,
  getUserFromRequest,
  requireAuth,
  requireAdmin
};
