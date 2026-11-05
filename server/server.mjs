/**
 * Minimal static file server for the PP-MD web UI. No dependencies, no
 * persistence, no uploads and no outbound connections.
 *
 * PPMD_MODE=production  -> no logging and nothing written to stdout/stderr.
 * PPMD_MODE=development -> request and lifecycle logging to stdout.
 */
import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const production = (process.env.PPMD_MODE || 'production').toLowerCase() === 'production';
const port = Number.parseInt(process.env.PORT || '8080', 10);
const root = path.resolve(process.env.PPMD_WEB_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist'));

const log = production ? () => undefined : (...args) => console.log(new Date().toISOString(), ...args);

if (production) {
  // Belt and braces: silence anything that might write to the console.
  for (const m of ['log', 'info', 'warn', 'error', 'debug', 'trace']) console[m] = () => undefined;
  process.on('uncaughtException', () => undefined);
  process.on('unhandledRejection', () => undefined);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'Cache-Control': 'no-store, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    }
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });

    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad Request'); }
    if (rel.includes('\0')) return send(res, 400, 'Bad Request');
    if (rel === '/') rel = '/index.html';

    const candidate = path.resolve(root, '.' + path.posix.normalize(rel));
    let file;
    try {
      file = await realpath(candidate);
    } catch {
      return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain' });
    }
    if (file !== root && !file.startsWith(root + path.sep)) return send(res, 403, 'Forbidden');
    const ext = path.extname(file).toLowerCase();
    if (ext === '.map' || !TYPES[ext]) return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain' });

    const data = await readFile(file);
    log(req.method, url.pathname, 200);
    send(res, 200, req.method === 'HEAD' ? undefined : data, { 'Content-Type': TYPES[ext], 'Content-Length': data.length });
  } catch {
    send(res, 500, 'Internal Server Error', { 'Content-Type': 'text/plain' });
  }
});

server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, '0.0.0.0', () => log(`PP-MD listening on :${port} (development mode)`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
