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

// Detección por FIRMA (magic bytes): no se confía en el mimetype declarado por
// el cliente (que se puede falsear). Devuelve una familia canónica o null.
// Así un HTML/SVG/ejecutable disfrazado de "image/png" se rechaza.
function sniff(buf) {
  if (!buf || buf.length < 4) return null;
  const b = buf;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';                       // %PDF
  if (b[0] === 0x50 && b[1] === 0x4B && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) return 'zip';   // OOXML (docx/xlsx) o zip
  if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return 'ole';                       // doc/xls antiguos
  return null;
}
const IMG_EXT = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp' };
const IMG_CT = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

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
  const real = sniff(file.buffer);
  if (!real || !IMG_EXT[real]) throw new Error('El archivo no es una imagen válida (JPG, PNG, WEBP o GIF)');
  const key = `panel/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${IMG_EXT[real]}`;
  // contentType DETECTADO (no el del cliente): evita servir algo como HTML.
  return store(file.buffer, key, IMG_CT[real]);
}

async function uploadDocument(file) {
  if (!file || !file.buffer) throw new Error('Archivo inválido');
  const real = sniff(file.buffer);
  if (!real) throw new Error('El archivo no coincide con un PDF, Word, Excel o imagen válidos');
  let ext, contentType;
  if (IMG_EXT[real]) { ext = IMG_EXT[real]; contentType = IMG_CT[real]; }
  else if (real === 'pdf') { ext = 'pdf'; contentType = 'application/pdf'; }
  else if (real === 'zip') {
    // OOXML (docx/xlsx) son ZIP por dentro; se conserva la extensión SOLO si el
    // cliente declaró un OOXML válido, si no queda como zip genérico.
    const declared = DOC_TYPES[file.mimetype];
    ext = (declared === 'docx' || declared === 'xlsx') ? declared : 'zip';
    contentType = (ext === 'docx' || ext === 'xlsx') ? file.mimetype : 'application/zip';
  } else if (real === 'ole') {
    const declared = DOC_TYPES[file.mimetype];
    ext = (declared === 'doc' || declared === 'xls') ? declared : 'bin';
    contentType = (ext === 'doc' || ext === 'xls') ? file.mimetype : 'application/octet-stream';
  } else {
    throw new Error('Formato no permitido (usa PDF, Word, Excel o imagen)');
  }
  const key = `panel/docs/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const res = await store(file.buffer, key, contentType);
  return { ...res, ext, meta: `${ext.toUpperCase()} · ${formatBytes(file.size)}` };
}

module.exports = { uploadImage, uploadDocument, formatBytes, s3Enabled };
