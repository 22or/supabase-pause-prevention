const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DEFAULT_TABLE = '_keepalive';
const SQL_PATH = path.join(__dirname, 'sql', 'keepalive.sql');

function projectRefFromUrl(url) {
  return new URL(url).hostname.split('.')[0];
}

function loadSql() {
  return fs.readFileSync(SQL_PATH, 'utf8');
}

async function ensureKeepaliveTable(url, databasePassword) {
  const projectRef = projectRefFromUrl(url);
  const client = new Client({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: databasePassword,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();

  try {
    await client.query(loadSql());
  } finally {
    await client.end();
  }
}

module.exports = {
  DEFAULT_TABLE,
  ensureKeepaliveTable,
  projectRefFromUrl,
  loadSql,
};
