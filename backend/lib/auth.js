'use strict';

const crypto = require('crypto');

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function ensurePassword(cfg) {
  if (!cfg.passwordHash || !cfg.passwordSalt) {
    const initial = process.env.PORTAL_ADMIN_PASSWORD || 'admin';
    cfg.passwordSalt = crypto.randomBytes(16).toString('hex');
    cfg.passwordHash = hashPassword(initial, cfg.passwordSalt);
    cfg.isDefaultPassword = !process.env.PORTAL_ADMIN_PASSWORD;
  }
  return cfg;
}

function verifyPassword(cfg, password) {
  if (!cfg.passwordHash || !cfg.passwordSalt) return false;
  const hash = Buffer.from(hashPassword(password, cfg.passwordSalt), 'hex');
  const stored = Buffer.from(cfg.passwordHash, 'hex');
  return hash.length === stored.length && crypto.timingSafeEqual(hash, stored);
}

function setPassword(cfg, password) {
  cfg.passwordSalt = crypto.randomBytes(16).toString('hex');
  cfg.passwordHash = hashPassword(password, cfg.passwordSalt);
  cfg.isDefaultPassword = false;
  return cfg;
}

module.exports = { hashPassword, ensurePassword, verifyPassword, setPassword };
