const express = require('express');
const { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } = require('fs');
const https = require('https');
const path = require('path');
const initSqlJs = require('sql.js');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const PORT = process.env.PORT || 8088;
const CERT_DIR = '/etc/letsencrypt';
const API_KEY = '2c9cc956eedb2f75ecbbfc6b16a3b403d9d0e13f';

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

let db;

function saveDb() {
  writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function syncOrders() {
  try {
    const stmt = db.prepare('SELECT value FROM meta WHERE key = ?');
    stmt.bind(['lastSyncTime']);
    let lastSync = '';
    if (stmt.step()) lastSync = stmt.getAsObject().value;
    stmt.free();

    const data = await httpsGetJson(`https://pilometr.ru/endpoint.php?key=${API_KEY}&mode=orderslist&modified_since=${encodeURIComponent(lastSync)}&start=0&length=99999&draw=0`);
    const orders = data && data.data;
    if (orders && Array.isArray(orders) && orders.length > 0) {
      const now = Date.now();
      const upsert = db.prepare('INSERT INTO orders (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
      for (const o of orders) {
        if (o.id != null) upsert.run([o.id, JSON.stringify(o), now]);
      }
      upsert.free();
      saveDb();
    }

    const nowStr = new Date().toISOString();
    db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['lastSyncTime', nowStr]);
    saveDb();

    httpsGetJson(`https://pilometr.ru/endpoint.php?key=${API_KEY}&mode=auto_notify`).catch(() => {});
  } catch (e) {
    console.error('Sync error:', e.message);
  }
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
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  saveDb();
}

const app = express();

app.use('/endpoint.php', (req, res) => {
  const path = req.originalUrl;
  const headers = { ...req.headers, Host: 'pilometr.ru' };
  headers['X-Real-IP'] = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  headers['X-Forwarded-Proto'] = 'https';
  for (const h of ['sec-fetch-site','sec-fetch-mode','sec-fetch-dest','sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform']) {
    delete headers[h];
  }
  const opts = {
    hostname: 'pilometr.ru',
    port: 443,
    path,
    method: req.method,
    headers,
    rejectUnauthorized: false,
  };
  if (req.method !== 'POST') {
    delete opts.headers['content-length'];
    delete opts.headers['content-type'];
    delete opts.headers['transfer-encoding'];
  }
  const proxyReq = https.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    res.status(500).send('Proxy error: ' + err.message);
  });
  if (req.method === 'POST') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
});

app.use(express.json({ limit: '10mb' }));

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

app.get('/api/orders', (req, res) => {
  const since = req.query.since ? new Date(req.query.since).getTime() : 0;
  let stmt;
  if (since > 0) {
    stmt = db.prepare('SELECT data FROM orders WHERE updated_at > ?');
    stmt.bind([since]);
  } else {
    stmt = db.prepare('SELECT data FROM orders');
  }
  const orders = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    try { orders.push(JSON.parse(row.data)); } catch {}
  }
  stmt.free();
  const ms = db.prepare('SELECT value FROM meta WHERE key = ?');
  ms.bind(['lastSyncTime']);
  let lastSyncTime = '';
  if (ms.step()) lastSyncTime = ms.getAsObject().value;
  ms.free();
  res.json({ data: orders, lastSyncTime });
});

app.post('/api/orders/sync', async (_req, res) => {
  await syncOrders();
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*path', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

(async () => {
  await initDb();
  syncOrders();
  setInterval(syncOrders, 30000);
  const liveDir = path.join(CERT_DIR, 'live');
  let certPath = '';
  if (existsSync(liveDir)) {
    const dirs = readdirSync(liveDir).filter(d => d.startsWith('npm-'));
    certPath = dirs.length > 0 ? path.join(liveDir, dirs[0]) : '';
  }
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
