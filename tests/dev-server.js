'use strict';
// Máy chủ chạy thử cục bộ: phục vụ tệp tĩnh và gắn các hàm /api (giống Vercel).
// Dùng: node tests/dev-server.js [port]   (đặt GEMINI_API_KEY nếu muốn gọi AI thật)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.replace('/api/', '').replace(/[^a-z]/g, '');
    const file = path.join(ROOT, 'api', name + '.js');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('{}'); }
    let body = '';
    for await (const c of req) body += c;
    try { req.body = body ? JSON.parse(body) : {}; } catch (e) { req.body = null; }
    try { return await require(file)(req, res); } catch (e) { res.statusCode = 500; return res.end(JSON.stringify({ error: String(e) })); }
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const full = path.join(ROOT, p);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(full)] || 'application/octet-stream');
  fs.createReadStream(full).pipe(res);
}).listen(PORT, () => console.log('http://localhost:' + PORT));
