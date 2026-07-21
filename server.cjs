const express = require('express');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');
const https = require('https');
const path = require('path');
const initSqlJs = require('sql.js');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const PORT = process.env.PORT || 8088;
const CERT_DIR = '/etc/letsencrypt';

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

let db;

function saveDb() {
  writeFileSync(DB_PATH, Buffer.from(db.export()));
}

async function initDb() {
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    db = new SQL.Database(readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS notes (
    order_id INTEGER PRIMARY KEY,
    note TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL DEFAULT 0
  )`);
  saveDb();
}

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use('/endpoint.php', createProxyMiddleware({
  target: 'https://pilometr.ru',
  changeOrigin: true,
  headers: { Host: 'pilometr.ru' },
}));

app.get('/api/notes/:orderId', (req, res) => {
  const stmt = db.prepare('SELECT note, updated_at FROM notes WHERE order_id = ?');
  stmt.bind([Number(req.params.orderId)]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    res.json(row);
  } else {
    res.json({ note: '', updated_at: 0 });
  }
  stmt.free();
});

app.post('/api/notes/:orderId', (req, res) => {
  const { note } = req.body;
  if (typeof note !== 'string') return res.status(400).json({ error: 'note required' });
  const orderId = Number(req.params.orderId);
  const now = Date.now();
  db.run(
    'INSERT INTO notes (order_id, note, updated_at) VALUES (?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at',
    [orderId, note, now]
  );
  saveDb();
  res.json({ ok: true });
});

app.get('/api/cache/:key', (req, res) => {
  const stmt = db.prepare('SELECT value, expires_at FROM cache WHERE key = ? AND (expires_at = 0 OR expires_at > ?)');
  stmt.bind([req.params.key, Date.now()]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    try { row.value = JSON.parse(row.value); } catch {}
    res.json(row);
  } else {
    res.json(null);
  }
  stmt.free();
});

app.post('/api/cache/:key', (req, res) => {
  const { value, ttl } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value required' });
  const expires = ttl ? Date.now() + ttl * 1000 : 0;
  db.run(
    'INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at',
    [req.params.key, JSON.stringify(value), expires]
  );
  saveDb();
  res.json({ ok: true });
});

app.post('/api/cache/clear', (_req, res) => {
  db.run('DELETE FROM cache');
  saveDb();
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*path', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

(async () => {
  await initDb();
  const certPath = path.join(CERT_DIR, 'live', 'npm-1');
  const hasCerts = existsSync(path.join(certPath, 'fullchain.pem'));
  if (hasCerts) {
    https.createServer({
      key: readFileSync(path.join(certPath, 'privkey.pem')),
      cert: readFileSync(path.join(certPath, 'fullchain.pem')),
    }, app).listen(PORT, () => console.log('HTTPS server on port ' + PORT));
  } else {
    app.listen(PORT, () => console.log('HTTP server on port ' + PORT));
  }
})();
