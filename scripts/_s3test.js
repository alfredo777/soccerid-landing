// Prueba de S3 en el dyno de producción. Sube un PNG 1x1, confirma la URL y borra.
(async () => {
  const up = require('../lib/uploads');
  console.log('s3Enabled:', up.s3Enabled);
  if (!up.s3Enabled) { console.log('RESULTADO: S3 NO configurado'); process.exit(0); }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const r = await up.uploadImage({ buffer: png, mimetype: 'image/png', originalname: 's3test.png' });
  console.log('URL:', r.url);
  console.log('storage:', r.storage);
  const esS3 = /amazonaws\.com|s3/.test(r.url) && r.storage === 's3';
  console.log('RESULTADO:', esS3 ? 'S3 FUNCIONA' : 'NO llegó a S3');
  // Borrar el objeto de prueba
  try {
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const key = r.url.split('.amazonaws.com/')[1] || r.url.split('/').slice(3).join('/');
    const c = new S3Client({ region: process.env.AWS_REGION });
    await c.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    console.log('objeto de prueba borrado:', key);
  } catch (e) { console.log('no se pudo borrar (revisar manual):', e.message); }
  process.exit(0);
})();
