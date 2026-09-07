(async () => {
  const gcal = require('../lib/googleCalendar');
  console.log('== Google Calendar ==');
  console.log('  disponible (credenciales + no apagado):', gcal.disponible());
  console.log('  callback:', gcal.callbackUrl());
  const u = new URL(gcal.authUrl('test'));
  console.log('  scope:', u.searchParams.get('scope'));

  const ical = require('../lib/ical');
  console.log('== Feed iCal ==');
  const t = ical.tokenPara(3);
  console.log('  token válido se reconoce:', ical.usuarioDe(t) === 3);
  console.log('  token manipulado rechazado:', ical.usuarioDe('3-' + '0'.repeat(24)) === null);

  const ai = require('../lib/ai');
  console.log('== Asistente IA ==');
  console.log('  disponible:', ai.disponible(), '· modelo:', ai.MODELO);
  if (ai.disponible()) {
    const r = await ai.generar({ tarea: 'faq', instruccion: 'Explica en una frase qué es la SOCCER iD CUP' });
    console.log('  llamada real ok:', r.ok, r.error || '');
    if (r.campos) console.log('  pregunta generada:', (r.campos.question || '').slice(0, 70));
    if (r.uso) console.log('  tokens:', r.uso.entrada + '+' + r.uso.salida);
  }
  process.exit(0);
})();
