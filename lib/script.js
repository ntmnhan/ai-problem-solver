'use strict';
// Gọi Google Apps Script (web app) làm nơi lưu bộ đếm + đánh giá/góp ý.
function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function callScript(method, payload) {
  const url = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN || '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const init = { method, signal: ctrl.signal, redirect: 'follow' };
    if (method === 'POST') {
      init.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      init.body = JSON.stringify({ ...payload, token });
    }
    const r = await fetch(url, init);
    if (!r.ok) throw new Error('script_http_' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { callScript, json };
