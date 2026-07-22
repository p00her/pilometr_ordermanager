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
const syncProgress = { synced: 0, total: 0, active: false };

function saveDb() {
  writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function httpsGetJson(url, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function getMeta(key) {
  const stmt = db.prepare('SELECT value FROM meta WHERE key = ?');
  stmt.bind([key]);
  let val = '';
  if (stmt.step()) val = stmt.getAsObject().value;
  stmt.free();
  return val;
}

function setMeta(key, value) {
  db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

function upsertOrders(orders) {
  const now = Date.now();
  const upsert = db.prepare('INSERT INTO orders (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
  for (const o of orders) {
    if (o.id != null) upsert.run([o.id, JSON.stringify(o), now]);
  }
  upsert.free();
  saveDb();
}

async function fullSync(clear = false) {
  syncProgress.active = true;
  syncProgress.synced = 0;
  syncProgress.total = 0;
  try {
    if (clear) {
      db.run('DELETE FROM orders');
      db.run('DELETE FROM meta WHERE key IN (?, ?)', ['fullSyncDone', 'lastSyncTime']);
      saveDb();
      console.log('Full sync: orders table cleared');
    }

    const info = await httpsGetJson(`https://pilometr.ru/endpoint.php?key=${API_KEY}&mode=orderslist&start=0&length=1&draw=0`);
    const total = info ? info.recordsTotal : 0;
    if (!total) { console.log('Full sync: no orders found'); return; }

    syncProgress.total = total;
    const BATCH = 500;
    let synced = 0;
    for (let start = 0; start < total; start += BATCH) {
      try {
        const data = await httpsGetJson(`https://pilometr.ru/endpoint.php?key=${API_KEY}&mode=orderslist&start=${start}&length=${BATCH}&draw=0`);
        const orders = data && data.data;
        if (orders && Array.isArray(orders) && orders.length > 0) {
          upsertOrders(orders);
          synced += orders.length;
          syncProgress.synced = synced;
        }
      } catch (e) {
        console.error(`Full sync batch ${start} error:`, e.message);
      }
    }

    try {
      const ref = await httpsGetJson(`https://pilometr.ru/endpoint.php?key=${API_KEY}&mode=getallnames4statuses`);
      if (ref) {
        db.run('INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)', ['reference_data', JSON.stringify(ref), 0]);
      }
    } catch (e) {
      console.error('Full sync: failed to fetch reference data:', e.message);
    }

    const nowStr = new Date().toISOString();
    setMeta('lastSyncTime', nowStr);
    setMeta('fullSyncDone', '1');
    saveDb();
    console.log(`Full sync completed: ${synced}/${total} orders`);
  } catch (e) {
    console.error('Full sync error:', e.message);
  } finally {
    syncProgress.active = false;
  }
}

async function syncOrders() {
  try {
    if (getMeta('fullSyncDone') !== '1') return;

    const lastSync = getMeta('lastSyncTime');
    const data = await httpsGetJson(`https://pilometr.ru/endpoint.php?key=${API_KEY}&mode=orderslist&modified_since=${encodeURIComponent(lastSync)}&start=0&length=99999&draw=0`);
    const orders = data && data.data;
    if (orders && Array.isArray(orders) && orders.length > 0) {
      upsertOrders(orders);
    }

    setMeta('lastSyncTime', new Date().toISOString());
    saveDb();

    httpsGetJson(`https://pilometr.ru/endpoint.php?key=${API_KEY}&mode=getallnames4statuses`).then(ref => {
      if (ref) db.run('INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)', ['reference_data', JSON.stringify(ref), 0]);
    }).catch(() => {});
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

app.get('/api/reference', async (_req, res) => {
  const stmt = db.prepare('SELECT value FROM cache WHERE key = ?');
  stmt.bind(['reference_data']);
  if (stmt.step()) {
    const val = stmt.getAsObject().value;
    stmt.free();
    res.json(JSON.parse(val));
  } else {
    stmt.free();
    try {
      const ref = await httpsGetJson(`https://pilometr.ru/endpoint.php?key=${API_KEY}&mode=getallnames4statuses`);
      if (ref) {
        db.run('INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)', ['reference_data', JSON.stringify(ref), 0]);
        saveDb();
        res.json(ref);
      } else {
        res.json({ o_statuses: {}, d_methods: {}, d_statuses: {}, p_methods: {}, p_statuses: {} });
      }
    } catch {
      res.json({ o_statuses: {}, d_methods: {}, d_statuses: {}, p_methods: {}, p_statuses: {} });
    }
  }
});

app.get('/api/debug/count', (_req, res) => {
  const c = db.prepare('SELECT count(*) as cnt FROM orders');
  c.step();
  const cnt = c.getAsObject().cnt;
  c.free();
  res.json({
    count: cnt,
    fullSyncDone: getMeta('fullSyncDone') === '1',
    lastSyncTime: getMeta('lastSyncTime'),
  });
});

app.get('/api/debug/sync-progress', (_req, res) => {
  res.json(syncProgress);
});

app.post('/api/orders/full-sync', (req, res) => {
  const clear = req.query.clear === '1' || req.query.clear === 'true';
  if (!clear) {
    db.run('DELETE FROM meta WHERE key IN (?, ?)', ['fullSyncDone', 'lastSyncTime']);
    saveDb();
  }
  fullSync(clear).catch(e => console.error('Full sync error:', e.message));
  res.json({ ok: true, message: `Full sync started${clear ? ' with clear' : ''}` });
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*path', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

(async () => {
  await initDb();
  if (getMeta('fullSyncDone') !== '1') {
    fullSync().then(() => {
      syncOrders().catch(() => {});
    }).catch(e => console.error('Full sync error:', e.message));
  } else {
    syncOrders().catch(() => {});
  }
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
