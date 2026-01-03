/**
 * Servidor de desarrollo para aplicaciones SPA/estáticas con Node.js
 * 
 * Este script realiza las siguientes funciones:
 * 1. Sirve archivos estáticos (CSS, JS, imágenes, etc.) si existen
 * 2. Para rutas que no corresponden a archivos, sirve index.html (SPA fallback)
 * 3. Muestra logs detallados de cada petición con colores
 * 
 * CÓMO USARLO:
 * 1. Coloca este archivo 'server.js' en la misma carpeta que tu 'index.html'
 * 2. Abre una terminal en esa carpeta
 * 3. Ejecuta: node server.js
 * 4. Abre tu navegador en http://localhost:8000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Configuración
const PORT = process.env.PORT || 8000;
const HOST = 'localhost';
const ROOT_DIR = __dirname;

// Colores para la terminal
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    
    // Colores de texto
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    
    // Colores de fondo
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgRed: '\x1b[41m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
};

// Tipos MIME comunes
const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.xml': 'application/xml',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
};

// Función para obtener timestamp formateado
function getTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString('es-MX', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
    });
}

// Función para formatear el tamaño de archivo
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Función para obtener el color según el código de estado
function getStatusColor(statusCode) {
    if (statusCode >= 200 && statusCode < 300) return colors.green;
    if (statusCode >= 300 && statusCode < 400) return colors.cyan;
    if (statusCode >= 400 && statusCode < 500) return colors.yellow;
    if (statusCode >= 500) return colors.red;
    return colors.white;
}

// Función para obtener el color según el tipo de archivo
function getFileTypeColor(ext) {
    const typeColors = {
        '.html': colors.magenta,
        '.css': colors.blue,
        '.js': colors.yellow,
        '.json': colors.green,
        '.png': colors.cyan,
        '.jpg': colors.cyan,
        '.jpeg': colors.cyan,
        '.gif': colors.cyan,
        '.svg': colors.cyan,
        '.ico': colors.cyan,
    };
    return typeColors[ext] || colors.gray;
}

// Función para loggear requests
function logRequest(req, statusCode, fileSize, responseTime, filePath, isSPA) {
    const timestamp = getTimestamp();
    const method = req.method;
    const urlPath = req.url;
    const statusColor = getStatusColor(statusCode);
    const ext = path.extname(filePath || '');
    const fileTypeColor = getFileTypeColor(ext);
    
    // Icono según el tipo
    let icon = '📄';
    if (ext === '.css') icon = '🎨';
    else if (ext === '.js') icon = '⚡';
    else if (ext === '.json') icon = '📋';
    else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp'].includes(ext)) icon = '🖼️';
    else if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext)) icon = '🔤';
    else if (['.mp4', '.webm'].includes(ext)) icon = '🎬';
    else if (['.mp3', '.wav'].includes(ext)) icon = '🎵';
    else if (ext === '.html' || isSPA) icon = '🌐';
    
    // Construir el log
    const parts = [
        `${colors.gray}[${timestamp}]${colors.reset}`,
        `${colors.bright}${method}${colors.reset}`,
        `${statusColor}${statusCode}${colors.reset}`,
        `${icon}`,
        `${fileTypeColor}${urlPath}${colors.reset}`,
    ];
    
    // Añadir información adicional
    const extras = [];
    if (fileSize > 0) {
        extras.push(`${colors.dim}${formatFileSize(fileSize)}${colors.reset}`);
    }
    extras.push(`${colors.dim}${responseTime}ms${colors.reset}`);
    
    if (isSPA) {
        extras.push(`${colors.cyan}→ index.html (SPA)${colors.reset}`);
    }
    
    console.log(parts.join(' ') + '  ' + extras.join(' │ '));
}

// Función para loggear errores
function logError(message, error) {
    const timestamp = getTimestamp();
    console.log(`${colors.gray}[${timestamp}]${colors.reset} ${colors.red}❌ ERROR: ${message}${colors.reset}`);
    if (error) {
        console.log(`${colors.dim}   ${error.message}${colors.reset}`);
    }
}

// Función para loggear información del servidor
function logServerInfo() {
    console.log('');
    console.log(`${colors.bright}${colors.green}┌─────────────────────────────────────────────────┐${colors.reset}`);
    console.log(`${colors.bright}${colors.green}│${colors.reset}  🚀 ${colors.bright}Servidor de Desarrollo Node.js${colors.reset}             ${colors.green}│${colors.reset}`);
    console.log(`${colors.bright}${colors.green}├─────────────────────────────────────────────────┤${colors.reset}`);
    console.log(`${colors.bright}${colors.green}│${colors.reset}                                                 ${colors.green}│${colors.reset}`);
    console.log(`${colors.bright}${colors.green}│${colors.reset}  ${colors.cyan}Local:${colors.reset}    http://${HOST}:${PORT}              ${colors.green}│${colors.reset}`);
    console.log(`${colors.bright}${colors.green}│${colors.reset}  ${colors.cyan}Carpeta:${colors.reset}  ${colors.dim}${ROOT_DIR.length > 30 ? '...' + ROOT_DIR.slice(-27) : ROOT_DIR}${colors.reset}${' '.repeat(Math.max(0, 30 - Math.min(ROOT_DIR.length, 30)))}   ${colors.green}│${colors.reset}`);
    console.log(`${colors.bright}${colors.green}│${colors.reset}                                                 ${colors.green}│${colors.reset}`);
    console.log(`${colors.bright}${colors.green}│${colors.reset}  ${colors.yellow}Presiona Ctrl+C para detener${colors.reset}                 ${colors.green}│${colors.reset}`);
    console.log(`${colors.bright}${colors.green}│${colors.reset}                                                 ${colors.green}│${colors.reset}`);
    console.log(`${colors.bright}${colors.green}└─────────────────────────────────────────────────┘${colors.reset}`);
    console.log('');
    console.log(`${colors.dim}─────────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.dim}  Método  Estado  Tipo   Ruta${colors.reset}`);
    console.log(`${colors.dim}─────────────────────────────────────────────────────${colors.reset}`);
}

// Crear el servidor
const server = http.createServer((req, res) => {
    const startTime = Date.now();
    
    // Parsear la URL
    const parsedUrl = url.parse(req.url, true);
    let pathname = decodeURIComponent(parsedUrl.pathname);
    
    // Prevenir directory traversal
    pathname = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    
    // Construir la ruta completa del archivo
    let filePath = path.join(ROOT_DIR, pathname);
    
    // Si es un directorio, buscar index.html
    if (pathname === '/' || pathname.endsWith('/')) {
        filePath = path.join(filePath, 'index.html');
    }
    
    // Verificar si el archivo existe
    fs.stat(filePath, (err, stats) => {
        const responseTime = Date.now() - startTime;
        
        if (!err && stats.isFile()) {
            // El archivo existe, servirlo
            const ext = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            
            fs.readFile(filePath, (readErr, content) => {
                if (readErr) {
                    // Error al leer el archivo
                    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<h1>500 - Error interno del servidor</h1>');
                    logRequest(req, 500, 0, Date.now() - startTime, filePath, false);
                    logError('No se pudo leer el archivo', readErr);
                } else {
                    // Servir el archivo
                    res.writeHead(200, {
                        'Content-Type': contentType,
                        'Content-Length': content.length,
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Access-Control-Allow-Origin': '*',
                    });
                    res.end(content);
                    logRequest(req, 200, content.length, Date.now() - startTime, filePath, false);
                }
            });
        } else {
            // El archivo no existe, servir index.html (SPA fallback)
            const indexPath = path.join(ROOT_DIR, 'index.html');
            
            fs.readFile(indexPath, (indexErr, content) => {
                if (indexErr) {
                    // No se encontró index.html
                    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`
                        <!DOCTYPE html>
                        <html lang="es">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>404 - No encontrado</title>
                            <style>
                                * { margin: 0; padding: 0; box-sizing: border-box; }
                                body {
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                                    min-height: 100vh;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    color: #fff;
                                }
                                .container {
                                    text-align: center;
                                    padding: 40px;
                                }
                                h1 {
                                    font-size: 6rem;
                                    background: linear-gradient(135deg, #667eea, #764ba2);
                                    -webkit-background-clip: text;
                                    -webkit-text-fill-color: transparent;
                                    margin-bottom: 20px;
                                }
                                p {
                                    font-size: 1.2rem;
                                    color: rgba(255,255,255,0.7);
                                    margin-bottom: 10px;
                                }
                                code {
                                    background: rgba(255,255,255,0.1);
                                    padding: 4px 12px;
                                    border-radius: 6px;
                                    font-size: 0.9rem;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <h1>404</h1>
                                <p>No se encontró el archivo <code>index.html</code></p>
                                <p style="font-size: 0.9rem;">Asegúrate de que exista en el mismo directorio que <code>server.js</code></p>
                            </div>
                        </body>
                        </html>
                    `);
                    logRequest(req, 404, 0, Date.now() - startTime, indexPath, true);
                    logError('index.html no encontrado');
                } else {
                    // Servir index.html como fallback (SPA)
                    res.writeHead(200, {
                        'Content-Type': 'text/html; charset=utf-8',
                        'Content-Length': content.length,
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Access-Control-Allow-Origin': '*',
                    });
                    res.end(content);
                    logRequest(req, 200, content.length, Date.now() - startTime, indexPath, true);
                }
            });
        }
    });
});

// Manejar errores del servidor
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log('');
        console.log(`${colors.red}❌ Error: El puerto ${PORT} ya está en uso.${colors.reset}`);
        console.log(`${colors.dim}   Prueba con otro puerto: PORT=3000 node server.js${colors.reset}`);
        console.log('');
    } else {
        logError('Error del servidor', err);
    }
    process.exit(1);
});

// Manejar cierre graceful
process.on('SIGINT', () => {
    console.log('');
    console.log(`${colors.dim}─────────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.yellow}👋 Servidor detenido${colors.reset}`);
    console.log('');
    process.exit(0);
});

// Iniciar el servidor
server.listen(PORT, HOST, () => {
    logServerInfo();
});