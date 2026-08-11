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
  issueSession,
  clearSession,
  getUserFromRequest,
  requireAuth,
  requireAdmin
};
