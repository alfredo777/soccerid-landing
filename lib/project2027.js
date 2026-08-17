/**
 * Notificaciones y correos de la propuesta SOCCER iD CUP 2027.
 * Los destinatarios de las alertas de acceso se configuran desde el admin
 * (tabla app_settings, clave notify_emails).
 */
const nodemailer = require('nodemailer');
const knex = require('../db/knex');

function transporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mailgun.org',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function getNotifyEmails() {
  try {
    const r = await knex('app_settings').where({ key: 'notify_emails' }).first();
    if (r && r.value && r.value.trim()) return r.value.trim();
  } catch (_) {}
  return process.env.NOTIFY_EMAILS || 'info@soccerid.co';
}

function accessHtml({ code, cdmxTime, ip, userAgent, name, email, newDevice }) {
  const row = (label, value) => `<tr>
    <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);font-size:12px;font-weight:700;letter-spacing:1px;width:170px;">${label}</td>
    <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);color:#fff;font-size:15px;">${value || '—'}</td>
  </tr>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#000;padding:32px 40px;text-align:center;"><img src="https://soccerid.co/assets/images/soccerid.png" alt="SOCCER iD" height="36"></td></tr>
  <tr><td style="padding:40px;">
    <table width="100%" style="background:rgba(212,175,55,0.1);border-left:4px solid #d4af37;border-radius:8px;padding:16px 20px;margin-bottom:28px;"><tr><td style="color:#d4af37;font-size:14px;font-weight:700;letter-spacing:1px;">ALERTA DE ACCESO — PROJECT 2027</td></tr></table>
    <p style="color:rgba(255,255,255,0.7);font-size:14px;margin:0 0 24px;">${newDevice ? 'Nuevo prospecto registrado y acceso a' : 'Nuevo acceso a'} la propuesta SOCCER iD CUP 2027.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      ${row('NOMBRE', name)}
      ${row('EMAIL', email)}
      ${row('CÓDIGO', code)}
      ${row('DISPOSITIVO', newDevice ? 'Nuevo (primer acceso)' : 'Recurrente')}
      ${row('FECHA (CDMX)', cdmxTime)}
      ${row('IP', ip)}
      ${row('NAVEGADOR', userAgent)}
    </table>
    <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;">Correo automático de SOCCER iD. No responder.</p>
  </td></tr>
  <tr><td style="background:#0a0a0a;padding:20px 40px;text-align:center;"><span style="color:rgba(255,255,255,0.3);font-size:11px;">&copy; ${new Date().getFullYear()} SOCCER iD — Confidencial</span></td></tr>
</table></td></tr></table></body></html>`;
}

async function sendAccessNotification({ code, ip, userAgent, name, email, newDevice }) {
  const tx = transporter();
  if (!tx) { console.log(`  ⚠ SMTP no configurado — acceso 2027 (código ${code}) no notificado por email`); return { sent: false }; }
  const to = await getNotifyEmails();
  const cdmxTime = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  try {
    await tx.sendMail({
      from: process.env.SMTP_FROM || '"SOCCER iD" <socceridco@soccerid.co>',
      to,
      subject: `[SOCCER iD] Acceso Project 2027 — ${name || email || code}`,
      html: accessHtml({ code, cdmxTime, ip, userAgent, name, email, newDevice }),
      text: `Acceso Project 2027\n\nNombre: ${name || '—'}\nEmail: ${email || '—'}\nCódigo: ${code}\nDispositivo: ${newDevice ? 'Nuevo' : 'Recurrente'}\nFecha (CDMX): ${cdmxTime}\nIP: ${ip}\nNavegador: ${userAgent}`
    });
    return { sent: true };
  } catch (err) {
    console.error('Error notificando acceso 2027:', err.message);
    return { sent: false, error: err.message };
  }
}

// Plantilla de correo a prospectos — mismo diseño que el mailer del portal
// (lib/panelMailer.notifyHtml): header morado + logo, título, cuerpo, CTA y footer.
function leadHtml({ name, subject, body }) {
  const safeBody = (body || '').replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f2f8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f8;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ecebf2;">
  <tr><td style="background:#6C3CE0;padding:26px 40px;text-align:center;">
    <img src="https://soccerid.co/assets/images/soccerid.png" alt="SOCCER iD" height="30" style="display:inline-block;">
  </td></tr>
  <tr><td style="padding:38px 40px;">
    <p style="color:#6C3CE0;font-size:12px;font-weight:800;letter-spacing:1.5px;margin:0 0 10px;text-transform:uppercase;">SOCCER iD CUP 2027</p>
    <h1 style="color:#14141b;font-size:22px;margin:0 0 14px;">${subject || 'SOCCER iD CUP 2027'}</h1>
    ${name ? `<p style="color:#14141b;font-size:15px;font-weight:700;margin:0 0 12px;">Hola ${name},</p>` : ''}
    <p style="color:#55505f;font-size:15px;line-height:1.65;margin:0 0 24px;white-space:pre-line;">${safeBody}</p>
    <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:#6C3CE0;">
      <a href="https://soccerid.co/es/socceridcup2027" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:800;text-decoration:none;border-radius:12px;">Ver la propuesta</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#14141b;padding:18px 40px;text-align:center;">
    <span style="color:rgba(255,255,255,0.4);font-size:11px;">&copy; ${new Date().getFullYear()} SOCCER iD — Confidencial</span>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// Correo a un prospecto (individual o masivo)
async function sendLeadEmail({ to, name, subject, body }) {
  const tx = transporter();
  if (!tx) return { sent: false, error: 'SMTP no configurado' };
  try {
    await tx.sendMail({
      from: process.env.SMTP_FROM || '"SOCCER iD" <socceridco@soccerid.co>',
      to,
      subject: subject || 'SOCCER iD CUP 2027',
      html: leadHtml({ name, subject, body }),
      text: `${name ? 'Hola ' + name + ',\n\n' : ''}${body || ''}\n\nVer la propuesta: https://soccerid.co/es/socceridcup2027`
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

module.exports = { getNotifyEmails, sendAccessNotification, sendLeadEmail };
