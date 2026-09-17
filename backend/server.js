'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

const config = require('./lib/config');
const auth = require('./lib/auth');
const scanner = require('./lib/scanner');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORTAL_PORT || process.env.PORT || 3100);

let cfg = config.load();
let discovered = [];
let scanTime = null;
let scanning = false;

const tokens = new Map();
const TOKEN_TTL = 12 * 60 * 60 * 1000; // 12 hours

function newToken() {
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, Date.now() + TOKEN_TTL);
  return token;
}

function isValidToken(token) {
  const expires = tokens.get(token);
  if (!expires) return false;
  if (Date.now() > expires) {
    tokens.delete(token);
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (isValidToken(token)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

const PALETTE = [
  'primary', 'secondary', 'accent', 'positive', 'info', 'warning',
  'teal', 'purple', 'orange', 'indigo', 'pink', 'cyan',
  'deep-orange', 'light-blue', 'green', 'amber', 'brown', 'blue-grey'
];

function paletteForPort(port) {
  return PALETTE[port % PALETTE.length];
}

function buildServices() {
  const services = [];
  const storedMap = new Map();
  for (const s of cfg.services) storedMap.set(s.key, s);

  if (cfg.settings.showAutoDiscovered !== false) {
    const seen = new Set();
    for (const d of discovered) {
      const key = `port:${d.port}`;
      seen.add(key);
      const stored = storedMap.get(key);
      if (stored && stored.hidden) continue;
      const isSelf = d.port === PORT;
      services.push({
        id: stored ? stored.id : key,
        key,
        manual: false,
        name: (stored && stored.name) || (isSelf ? 'Portal Hub' : (d.title || d.process || `Port ${d.port}`)),
        url: (stored && stored.url) || d.url,
        icon: (stored && stored.icon) || (isSelf ? 'apps' : 'public'),
        color: (stored && stored.color) || paletteForPort(d.port),
        order: stored && typeof stored.order === 'number' ? stored.order : 100000 + d.port,
        hidden: false,
        port: d.port,
        title: d.title || null,
        process: d.process || null,
        online: true
      });
    }
    for (const s of cfg.services) {
      if (s.manual || s.hidden || seen.has(s.key)) continue;
      services.push({ ...s, online: false, manual: false });
    }
  }

  for (const s of cfg.services) {
    if (!s.manual || s.hidden) continue;
    services.push({ ...s, online: null });
  }

  services.sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : 1e9;
    const bo = typeof b.order === 'number' ? b.order : 1e9;
    if (ao !== bo) return ao - bo;
    return String(a.name).localeCompare(String(b.name));
  });

  return services;
}

function findStoredById(id) {
  return cfg.services.find((s) => s.id === id || s.key === id);
}

async function runScan() {
  if (scanning) return;
  scanning = true;
  try {
    discovered = await scanner.scan(cfg);
    scanTime = new Date().toISOString();
  } catch (e) {
    console.error('[portal-hub] scan error:', e.message);
  } finally {
    scanning = false;
  }
}

// ---- API ----

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/services', (req, res) => {
  res.json({ services: buildServices(), lastScan: scanTime, scanning });
});

app.post('/api/scan', requireAuth, async (req, res) => {
  await runScan();
  res.json({ ok: true, lastScan: scanTime, scanning, services: buildServices() });
});

app.get('/api/settings', (req, res) => {
  res.json({ settings: cfg.settings, isDefaultPassword: !!cfg.isDefaultPassword });
});

app.put('/api/settings', requireAuth, (req, res) => {
  const allowed = ['siteTitle', 'siteSubtitle', 'scanIntervalMs', 'probeTimeoutMs', 'portRange', 'showAutoDiscovered'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) cfg.settings[key] = req.body[key];
  }
  config.save(cfg);
  res.json({ settings: cfg.settings });
});

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || !auth.verifyPassword(cfg, password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  res.json({ token: newToken() });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  tokens.delete(token);
  res.json({ ok: true });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!current || !auth.verifyPassword(cfg, current)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (!next || String(next).length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }
  auth.setPassword(cfg, next);
  config.save(cfg);
  res.json({ ok: true });
});

function upsertService(data) {
  const key = data.key || (data.port ? `port:${data.port}` : `manual:${crypto.randomUUID()}`);
  let service = cfg.services.find((s) => s.id === data.id || s.key === key);
  if (!service) {
    service = {
      id: crypto.randomUUID(),
      key,
      manual: data.manual !== undefined ? !!data.manual : !key.startsWith('port:')
    };
    cfg.services.push(service);
  }
  for (const field of ['name', 'url', 'icon', 'color', 'order', 'hidden', 'manual']) {
    if (data[field] !== undefined) service[field] = data[field];
  }
  if (data.port !== undefined) service.key = `port:${data.port}`;
  config.save(cfg);
  return service;
}

app.post('/api/services', requireAuth, (req, res) => {
  const service = upsertService({ ...(req.body || {}), manual: true });
  res.status(201).json({ service });
});

app.put('/api/services/:id', requireAuth, (req, res) => {
  const existing = findStoredById(req.params.id);
  if (!existing) {
    const auto = buildServices().find((s) => s.id === req.params.id || s.key === req.params.id);
    if (auto && auto.key && auto.key.startsWith('port:')) {
      const service = upsertService({ ...auto, ...(req.body || {}), id: auto.id, key: auto.key, manual: false });
      return res.json({ service });
    }
    return res.status(404).json({ error: 'Service not found' });
  }
  const service = upsertService({ ...(req.body || {}), id: existing.id });
  res.json({ service });
});

app.delete('/api/services/:id', requireAuth, (req, res) => {
  const service = findStoredById(req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found' });
  if (service.manual) {
    cfg.services = cfg.services.filter((s) => s.id !== service.id && s.key !== service.key);
  } else {
    service.hidden = true;
  }
  config.save(cfg);
  res.json({ ok: true });
});

app.post('/api/services/reorder', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const built = buildServices();
  ids.forEach((id, index) => {
    let service = findStoredById(id);
    if (!service) {
      const auto = built.find((s) => s.id === id || s.key === id);
      if (auto) {
        service = {
          id: crypto.randomUUID(),
          key: auto.key,
          manual: false,
          name: auto.name,
          url: auto.url,
          icon: auto.icon,
          color: auto.color,
          hidden: false,
          order: index
        };
        cfg.services.push(service);
      }
    } else {
      service.order = index;
    }
  });
  config.save(cfg);
  res.json({ ok: true });
});

// ---- static frontend (production) ----

const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

function start() {
  const interval = Math.max(5000, Number(cfg.settings.scanIntervalMs) || 30000);
  setInterval(runScan, interval);
  const server = app.listen(PORT, () => {
    console.log(`[portal-hub] listening on http://0.0.0.0:${PORT}`);
    console.log(`[portal-hub] admin password: ${cfg.isDefaultPassword ? 'admin (default - change it in the UI)' : '(set)'}`);
  });
  server.on('error', (err) => {
    console.error(`[portal-hub] failed to listen on port ${PORT}: ${err.message}`);
    process.exit(1);
  });
  runScan();
}

start();
