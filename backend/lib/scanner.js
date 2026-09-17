'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');

const LISTEN_STATE = '0A';

function hexToIpv4(hex) {
  const parts = [];
  for (let i = hex.length - 2; i >= 0; i -= 2) parts.push(parseInt(hex.substr(i, 2), 16));
  return parts.join('.');
}

function hexToIpv6(hex) {
  const groups = [];
  for (let g = 0; g < 4; g++) {
    const chunk = hex.substr(g * 8, 8);
    let reversed = '';
    for (let i = chunk.length - 2; i >= 0; i -= 2) reversed += chunk.substr(i, 2);
    groups.push(parseInt(reversed, 16).toString(16));
  }
  return groups.join(':');
}

function parseProcNet(file) {
  const entries = [];
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return entries;
  }
  for (const line of content.split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10) continue;
    const local = parts[1].split(':');
    if (local.length !== 2) continue;
    entries.push({ addrHex: local[0], portHex: local[1], state: parts[3], inode: parts[9] });
  }
  return entries;
}

function getListeningSockets() {
  const out = [];
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    const isV6 = file.endsWith('tcp6');
    for (const e of parseProcNet(file)) {
      if (e.state !== LISTEN_STATE) continue;
      let ip;
      try {
        ip = isV6 ? hexToIpv6(e.addrHex) : hexToIpv4(e.addrHex);
      } catch (err) {
        continue;
      }
      out.push({ ip, port: parseInt(e.portHex, 16), inode: e.inode });
    }
  }
  return out;
}

function mapInodeToProcess() {
  const map = {};
  let pids;
  try {
    pids = fs.readdirSync('/proc');
  } catch (e) {
    return map;
  }
  for (const pid of pids) {
    if (!/^\d+$/.test(pid)) continue;
    const fdDir = `/proc/${pid}/fd`;
    let fds;
    try {
      fds = fs.readdirSync(fdDir);
    } catch (e) {
      continue;
    }
    let name = '';
    try {
      name = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
    } catch (e) { /* ignore */ }
    for (const fd of fds) {
      let target;
      try {
        target = fs.readlinkSync(`${fdDir}/${fd}`);
      } catch (e) {
        continue;
      }
      const m = /^socket:\[(\d+)\]$/.exec(target);
      if (m) map[m[1]] = { pid: Number(pid), name };
    }
  }
  return map;
}

function extractTitle(html) {
  if (!html) return null;
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].trim().replace(/\s+/g, ' ') : null;
}

function rawProbe(url, timeoutMs) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    let settled = false;
    const done = (result) => {
      if (!settled) { settled = true; resolve(result); }
    };
    let req;
    try {
      req = lib.get(
        url,
        {
          timeout: timeoutMs,
          rejectUnauthorized: false,
          headers: {
            'User-Agent': 'PortalHub/1.0',
            Accept: 'text/html,application/json,*/*'
          }
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk.toString('utf8');
            if (body.length > 30000) req.destroy();
          });
          res.on('end', () => done({ status: res.statusCode, body }));
          res.on('error', () => done({ status: res.statusCode, body }));
        }
      );
    } catch (e) {
      return done({ error: e.code || e.message });
    }
    req.on('timeout', () => { req.destroy(); done({ error: 'timeout' }); });
    req.on('error', (e) => done({ error: e.code || e.message }));
  });
}

function formatHost(ip) {
  const loopback = ['0.0.0.0', '127.0.0.1', '::', '::1', '0:0:0:0', '0:0:0:1'];
  if (loopback.includes(ip)) return '127.0.0.1';
  return ip;
}

async function probeWeb(host, port, timeoutMs) {
  const hostPart = host.includes(':') ? `[${host}]` : host;
  const base = `${hostPart}:${port}`;

  const httpResult = await rawProbe(`http://${base}/`, timeoutMs);
  if (httpResult.status) {
    return { url: `http://${base}`, status: httpResult.status, title: extractTitle(httpResult.body) };
  }

  const httpsResult = await rawProbe(`https://${base}/`, timeoutMs);
  if (httpsResult.status) {
    return { url: `https://${base}`, status: httpsResult.status, title: extractTitle(httpsResult.body) };
  }

  return null;
}

function isPortOpen(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

async function tcpScan(range, settings) {
  const [startRaw, endRaw] = Array.isArray(range) ? range : [1, 65535];
  const start = Math.max(1, Math.min(Number(startRaw) || 1, 65535));
  const end = Math.max(1, Math.min(Number(endRaw) || 65535, 65535));
  const timeout = settings.probeTimeoutMs || 2500;
  const sockets = [];
  const concurrency = 256;
  const host = '127.0.0.1';
  let next = start;

  async function worker() {
    while (next <= end) {
      const port = next++;
      if (await isPortOpen(host, port, Math.min(timeout, 300))) {
        sockets.push({ ip: host, port });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return sockets;
}

async function scan(config) {
  const settings = config.settings || {};
  const timeout = settings.probeTimeoutMs || 2500;

  let sockets = getListeningSockets();
  let byProc = {};
  let haveProc = false;

  if (sockets.length) {
    byProc = mapInodeToProcess();
    haveProc = true;
  } else {
    sockets = await tcpScan(settings.portRange, settings);
  }

  const byPort = new Map();
  for (const s of sockets) {
    if (s.port <= 0 || s.port > 65535) continue;
    if (!byPort.has(s.port)) byPort.set(s.port, s);
  }

  const entries = Array.from(byPort.entries());
  const concurrency = Math.max(1, Number(process.env.PORTAL_SCAN_CONCURRENCY) || 25);
  let next = 0;
  const results = [];

  async function worker() {
    while (next < entries.length) {
      const [port, s] = entries[next++];
      const host = formatHost(s.ip);
      const web = await probeWeb(host, port, timeout);
      if (!web) continue;
      const proc = haveProc && s.inode && byProc[s.inode] ? byProc[s.inode].name : null;
      results.push({
        port,
        url: web.url,
        status: web.status,
        title: web.title || null,
        process: proc || null
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));
  return results;
}

module.exports = { scan };
