/**
 * Conexión a base de datos.
 * - Producción (Heroku): Postgres vía DATABASE_URL
 * - Local: archivo SQLite en ./data/panel.sqlite
 */
const path = require('path');
const fs = require('fs');

const usefulPg = !!process.env.DATABASE_URL;

let config;
if (usefulPg) {
  config = {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    },
    pool: { min: 0, max: 10 }
  };
} else {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  config = {
    client: 'better-sqlite3',
    connection: { filename: path.join(dataDir, 'panel.sqlite') },
    useNullAsDefault: true
  };
}

const knex = require('knex')(config);
knex.__isPg = usefulPg;

module.exports = knex;
