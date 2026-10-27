'use strict';
// GET /api/health — kiểm tra nhanh trợ lý AI (không lộ khóa). Kết quả được nhớ 60 giây.
let cache = null;

function models() {
  return [process.env.GEMINI_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']
    .filter(Boolean).filter((m, i, a) => a.indexOf(m) === i);
}

async function ping(model, key) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  const t0 = Date.now();
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Trả lời đúng một chữ: ok' }] }], generationConfig: { maxOutputTokens: 20 } }),
      signal: ctrl.signal
    });
    return { model, ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { model, ok: false, status: e && e.name === 'AbortError' ? 504 : 0, ms: Date.now() - t0 };
  } finally { clearTimeout(t); }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (cache && Date.now() - cache.at < 60000) { res.statusCode = 200; return res.end(JSON.stringify(cache.body)); }
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].join(',').split(',').map((k) => k.trim()).filter(Boolean);
  const body = {
    keys: keys.length,
    fallback: !!process.env.FALLBACK_API_KEY,
    checkedAt: new Date().toISOString()
  };
  if (!keys.length) {
    body.status = 'not_configured';
    body.hint = 'Chưa có GEMINI_API_KEY trong Vercel → Settings → Environment Variables, rồi Redeploy.';
  } else {
    body.models = await Promise.all(models().map((m) => ping(m, keys[0])));
    const okN = body.models.filter((x) => x.ok).length;
    body.status = okN ? 'ok' : 'down';
    if (!okN) body.hint = 'Không model nào chạy được. Mã 404 = model đã bị gỡ; 403/400 = khóa sai hoặc bị khóa; 429 = hết lượt; 503 = Google quá tải.';
  }
  cache = { at: Date.now(), body };
  res.statusCode = 200;
  res.end(JSON.stringify(body));
};
module.exports._reset = () => { cache = null; };
