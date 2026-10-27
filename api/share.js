'use strict';
// POST /api/share — học sinh tự chọn gửi vấn đề cho thầy cô (đã tick đồng ý).
const { callScript, json } = require('../lib/script');
const { buildRecord } = require('../lib/share');

const buckets = new Map();
function limited(ip) {
  const now = Date.now();
  const b = (buckets.get(ip) || []).filter((t) => now - t < 3600000);
  if (b.length >= 120) { buckets.set(ip, b); return true; }
  b.push(now);
  buckets.set(ip, b);
  if (buckets.size > 5000) buckets.clear();
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!process.env.APPS_SCRIPT_URL) {
    return json(res, 503, { error: 'not_configured', message: 'Chức năng gửi cho thầy cô chưa được cấu hình.' });
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  if (limited(ip)) return json(res, 429, { error: 'rate_limited', message: 'Em đã gửi nhiều lần. Hãy thử lại sau nhé.' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') return json(res, 400, { error: 'bad_request' });
  if (b.consent !== true) return json(res, 400, { error: 'no_consent', message: 'Em cần tick đồng ý trước khi gửi.' });
  const rec = buildRecord(b);
  if (!rec) return json(res, 400, { error: 'bad_record', message: 'Chưa có nội dung vấn đề để gửi.' });
  try {
    const r = await callScript('POST', { action: 'share', record: rec });
    if (r && r.ok) return json(res, 200, { ok: true, at: Date.now() });
    return json(res, 502, { error: 'save_failed', message: 'Chưa gửi được. Em thử lại sau nhé.' });
  } catch (e) {
    return json(res, 502, { error: 'save_failed', message: 'Chưa gửi được. Em thử lại sau nhé.' });
  }
};
