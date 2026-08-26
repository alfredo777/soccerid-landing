/**
 * Envío de correos del panel (invitaciones) vía Mailgun SMTP.
 * Reutiliza las variables SMTP_* ya usadas en el proyecto.
 * Si no hay SMTP configurado, registra el enlace en consola (útil en local).
 */
const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mailgun.org',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

function inviteHtml({ name, activateUrl, categoryLabel, roleLabel }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f2f8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f8;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ecebf2;">
  <tr><td style="background:#6C3CE0;padding:30px 40px;text-align:center;">
    <img src="https://soccerid.co/assets/images/soccerid.png" alt="SOCCER iD" height="34" style="display:inline-block;">
  </td></tr>
  <tr><td style="padding:40px;">
    <p style="color:#6C3CE0;font-size:12px;font-weight:800;letter-spacing:1.5px;margin:0 0 8px;text-transform:uppercase;">Investor Hub</p>
    <h1 style="color:#14141b;font-size:24px;margin:0 0 16px;">Hola ${name},</h1>
    <p style="color:#55505f;font-size:15px;line-height:1.6;margin:0 0 8px;">Has sido invitado al portal privado de <strong>SOCCER iD CUP 2027</strong>${categoryLabel ? ` como <strong>${roleLabel} ${categoryLabel}</strong>` : ''}.</p>
    <p style="color:#55505f;font-size:15px;line-height:1.6;margin:0 0 28px;">Crea tu contraseña para activar tu acceso y ver tu panel, beneficios, noticias y calendario del evento.</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;"><tr><td style="border-radius:12px;background:#6C3CE0;">
      <a href="${activateUrl}" style="display:inline-block;padding:15px 32px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;border-radius:12px;">Activar mi acceso</a>
    </td></tr></table>
    <p style="color:#a6a2b3;font-size:12px;line-height:1.6;margin:0;">O copia este enlace en tu navegador:<br><span style="color:#6C3CE0;word-break:break-all;">${activateUrl}</span></p>
    <p style="color:#a6a2b3;font-size:12px;line-height:1.6;margin:20px 0 0;">Este enlace expira en 7 días. Si no esperabas esta invitación, ignora este correo.</p>
  </td></tr>
  <tr><td style="background:#14141b;padding:20px 40px;text-align:center;">
    <span style="color:rgba(255,255,255,0.4);font-size:11px;">&copy; ${new Date().getFullYear()} SOCCER iD — Confidencial</span>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendInvite({ to, name, activateUrl, categoryLabel, roleLabel }) {
  console.log(`  → Invitación para ${to}: ${activateUrl}`);
  const transporter = getTransporter();
  if (!transporter) {
    console.log('  ⚠ SMTP no configurado — enlace mostrado arriba (no se envió email).');
    return { sent: false, url: activateUrl };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"SOCCER iD" <socceridco@soccerid.co>',
      to,
      subject: 'Tu acceso al portal SOCCER iD CUP 2027',
      html: inviteHtml({ name, activateUrl, categoryLabel, roleLabel }),
      text: `Hola ${name}, activa tu acceso al portal SOCCER iD CUP 2027:\n${activateUrl}\n(El enlace expira en 7 días.)`
    });
    return { sent: true, url: activateUrl };
  } catch (err) {
    console.error('  ✗ Error enviando invitación:', err.message);
    return { sent: false, url: activateUrl, error: err.message };
  }
}

function notifyHtml({ name, title, body }) {
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
    <p style="color:#6C3CE0;font-size:12px;font-weight:800;letter-spacing:1.5px;margin:0 0 10px;text-transform:uppercase;">Nueva notificación</p>
    <h1 style="color:#14141b;font-size:22px;margin:0 0 14px;">${title}</h1>
    <p style="color:#55505f;font-size:15px;line-height:1.65;margin:0 0 24px;white-space:pre-line;">${body || ''}</p>
    <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:#6C3CE0;">
      <a href="https://soccerid.co/panel" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:800;text-decoration:none;border-radius:12px;">Ver en el portal</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#14141b;padding:18px 40px;text-align:center;">
    <span style="color:rgba(255,255,255,0.4);font-size:11px;">&copy; ${new Date().getFullYear()} SOCCER iD — Confidencial</span>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendNotification({ to, name, title, body }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`  ⚠ SMTP no configurado — notificación "${title}" no enviada a ${to}`);
    return { sent: false };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"SOCCER iD" <socceridco@soccerid.co>',
      to,
      subject: `SOCCER iD CUP 2027 — ${title}`,
      html: notifyHtml({ name, title, body }),
      text: `${title}\n\n${body || ''}\n\nVer en el portal: https://soccerid.co/panel`
    });
    return { sent: true };
  } catch (err) {
    console.error(`  ✗ Error notificando a ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendInvite, sendNotification };
