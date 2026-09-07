// Prueba end-to-end de subida: sube una imagen, confirma que su URL pública es
// visible (es lo que hace que aparezca en el panel), y la borra.
(async () => {
  const up = require('../lib/uploads');
  if (!up.s3Enabled) { console.log('S3 no configurado'); process.exit(0); }
  // PNG rojo 2x2 (visible, no un pixel transparente)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8Dwn4EIwDiqEAAj4wf9lE0nHwAAAABJRU5ErkJggg==', 'base64');
  const r = await up.uploadImage({ buffer: png, mimetype: 'image/png', originalname: 'appear-test.png' });
  console.log('URL:', r.url);
  // Consulta la URL pública como lo haría el navegador del inversionista
  const res = await fetch(r.url);
  const tipo = res.headers.get('content-type');
  const bytes = (await res.arrayBuffer()).byteLength;
  console.log('HTTP:', res.status, '· content-type:', tipo, '· bytes:', bytes);
  console.log('RESULTADO:', (res.ok && /image/.test(tipo || '') && bytes > 0) ? 'LA IMAGEN APARECE (pública y visible)' : 'NO se pudo ver la imagen');
  // Limpieza
  try {
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const key = r.url.split('.amazonaws.com/')[1];
    await new S3Client({ region: process.env.AWS_REGION }).send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    console.log('objeto de prueba borrado:', key);
  } catch (e) { console.log('no se pudo borrar:', e.message); }
  process.exit(0);
})();
