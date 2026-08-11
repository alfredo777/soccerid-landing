/**
 * Subida de imágenes.
 * - Si hay S3 configurado (env), sube a Amazon S3 y devuelve la URL pública.
 * - Si no, guarda en /uploads/panel local (útil en desarrollo).
 * Nota: en Heroku el disco es efímero, por eso en producción se debe usar S3.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_PUBLIC_BASE = process.env.S3_PUBLIC_BASE; // opcional (CloudFront o dominio propio)

const s3Enabled = !!(S3_BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

let s3Client = null;
function getS3() {
  if (s3Client) return s3Client;
  const { S3Client } = require('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
  return s3Client;
}

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

function makeKey(file) {
  const ext = ALLOWED[file.mimetype] || (file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const rand = crypto.randomBytes(8).toString('hex');
  return `panel/${Date.now()}-${rand}.${ext}`;
}

/**
 * Sube un archivo (multer memoryStorage: { buffer, mimetype, originalname }).
 * Devuelve { url } o lanza error.
 */
async function uploadImage(file) {
  if (!file || !file.buffer) throw new Error('Archivo inválido');
  if (!ALLOWED[file.mimetype]) throw new Error('Formato no permitido (usa JPG, PNG, WEBP o GIF)');

  const key = makeKey(file);

  if (s3Enabled) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await getS3().send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      CacheControl: 'public, max-age=31536000'
    }));
    const url = S3_PUBLIC_BASE
      ? `${S3_PUBLIC_BASE.replace(/\/$/, '')}/${key}`
      : `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    return { url, storage: 's3' };
  }

  // Fallback local
  const dir = path.join(__dirname, '..', 'uploads', 'panel');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = key.split('/').pop();
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return { url: `/uploads/panel/${filename}`, storage: 'local' };
}

module.exports = { uploadImage, s3Enabled };
