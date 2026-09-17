'use strict';

const fs = require('fs');
const path = require('path');
const { ensurePassword } = require('./auth');

const DATA_DIR = process.env.PORTAL_DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULT_SETTINGS = {
  siteTitle: 'Device Portals',
  siteSubtitle: 'Web interfaces running on this device',
  scanIntervalMs: 30000,
  probeTimeoutMs: 2500,
  portRange: [1, 65535],
  showAutoDiscovered: true
};

function defaultConfig() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    services: [],
    passwordSalt: null,
    passwordHash: null,
    isDefaultPassword: false,
    createdAt: new Date().toISOString()
  };
}

function load() {
  let cfg = defaultConfig();

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      cfg = {
        ...cfg,
        ...raw,
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) }
      };
    } catch (e) {
      console.error('[config] failed to read config.json:', e.message);
    }
  }

  ensurePassword(cfg);
  if (!fs.existsSync(CONFIG_PATH)) save(cfg);
  return cfg;
}

function save(cfg) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = CONFIG_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    fs.renameSync(tmp, CONFIG_PATH);
  } catch (e) {
    console.error('[config] failed to save config.json:', e.message);
  }
}

module.exports = { load, save, DEFAULT_SETTINGS, CONFIG_PATH, DATA_DIR };
