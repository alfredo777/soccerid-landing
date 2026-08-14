/**
 * Subida de archivos (imágenes y documentos).
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

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const DOC_TYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  ...IMAGE_TYPES
};

function extFor(file, allowed) {
  return allowed[file.mimetype] || (file.originalname.split('.').pop() || 'bin').toLowerCase();
}

function formatBytes(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

async function store(buffer, key, contentType) {
  if (s3Enabled) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await getS3().send(new PutObjectCommand({
      Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: contentType,
      CacheControl: 'public, max-age=31536000'
    }));
    const url = S3_PUBLIC_BASE
      ? `${S3_PUBLIC_BASE.replace(/\/$/, '')}/${key}`
      : `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    return { url, storage: 's3' };
  }
  const dir = path.join(__dirname, '..', 'uploads', 'panel');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = key.split('/').pop();
  fs.writeFileSync(path.join(dir, filename), buffer);
  return { url: `/uploads/panel/${filename}`, storage: 'local' };
}

async function uploadImage(file) {
  if (!file || !file.buffer) throw new Error('Archivo inválido');
  if (!IMAGE_TYPES[file.mimetype]) throw new Error('Formato no permitido (usa JPG, PNG, WEBP o GIF)');
  const key = `panel/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${extFor(file, IMAGE_TYPES)}`;
  return store(file.buffer, key, file.mimetype);
}

async function uploadDocument(file) {
  if (!file || !file.buffer) throw new Error('Archivo inválido');
  if (!DOC_TYPES[file.mimetype]) throw new Error('Formato no permitido (usa PDF, Word, Excel o imagen)');
  const ext = extFor(file, DOC_TYPES);
  const key = `panel/docs/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const res = await store(file.buffer, key, file.mimetype);
  return { ...res, ext, meta: `${ext.toUpperCase()} · ${formatBytes(file.size)}` };
}

module.exports = { uploadImage, uploadDocument, formatBytes, s3Enabled };
