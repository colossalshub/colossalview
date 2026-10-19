import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createCache } from './cache';
import { loadEnvFile } from './env';
import { createLimiter } from './limit';
import { dispatch } from './router';

loadEnvFile();

const host = process.env.HOST?.trim() || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
const cache = createCache();
const limiter = createLimiter();
const distRoot = path.resolve('dist');

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendFile(res: http.ServerResponse, filePath: string): void {
  const extension = path.extname(filePath);
  const headers: Record<string, string> = {
    'Content-Type': types[extension] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  };
  if (path.basename(filePath) === 'index.html') headers['Cache-Control'] = 'no-cache';
  else if (filePath.includes(`${path.sep}assets${path.sep}`)) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const method = req.method ?? 'GET';
  const raw = req.url ?? '/';
  const pathname = new URL(raw, 'http://127.0.0.1').pathname;
  if (pathname.startsWith('/api/')) {
    void dispatch(method, raw, { env: process.env, fetchImpl: fetch, cache, limiter })
      .then((result) => {
        console.log(`${method} ${pathname} ${result.status}`);
        sendJson(res, result.status, result.body);
      })
      .catch((error: unknown) => {
        console.log(`${method} ${pathname} 500`);
        console.error(error instanceof Error ? error.name : 'error');
        sendJson(res, 500, { error: { code: 'INTERNAL', message: 'Request failed.' } });
      });
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log(`${method} ${pathname} 404`);
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found.' } });
    return;
  }
  const requested = path.normalize(path.join(distRoot, pathname));
  if (!requested.startsWith(distRoot)) {
    console.log(`${method} ${pathname} 403`);
    sendJson(res, 403, { error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
    return;
  }
  const file = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(distRoot, 'index.html');
  if (!fs.existsSync(file)) {
    console.log(`${method} ${pathname} 404`);
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Build output was not found.' } });
    return;
  }
  console.log(`${method} ${pathname} 200`);
  sendFile(res, file);
});

server.listen(port, host, () => {
  console.log(`colossalview server http://${host}:${port}`);
});
