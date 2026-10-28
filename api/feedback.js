'use strict';
// POST /api/feedback — { rating: 1..5, comment?: string, kind?: 'rating'|'idea' }
const { callScript, json } = require('../lib/script');

const buckets = new Map();
function limited(ip) {
  const now = Date.now();
  const b = (buckets.get(ip) || []).filter((t) => now - t < 3600000);
  if (b.length >= 5) { buckets.set(ip, b); return true; }
  b.push(now);
  buckets.set(ip, b);
  if (buckets.size > 5000) buckets.clear();
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!process.env.APPS_SCRIPT_URL) {
    return json(res, 503, { error: 'not_configured', message: 'Chức năng đánh giá chưa được cấu hình.' });
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  if (limited(ip)) return json(res, 429, { error: 'rate_limited', message: 'Bạn đã gửi nhiều lần. Hãy thử lại sau nhé.' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') return json(res, 400, { error: 'bad_request' });

  const rating = Math.round(Number(b.rating));
  const comment = String(b.comment || '').slice(0, 500);
  const kind = b.kind === 'idea' ? 'idea' : 'rating';
  if (kind === 'rating' && !(rating >= 1 && rating <= 5)) {
    return json(res, 400, { error: 'bad_rating', message: 'Hãy chọn số sao từ 1 đến 5.' });
  }
  if (kind === 'idea' && !comment.trim()) {
    return json(res, 400, { error: 'empty', message: 'Hãy viết ý kiến của bạn.' });
  }
  try {
    const r = await callScript('POST', {
      action: 'feedback',
      kind,
      rating: kind === 'rating' ? rating : 0,
      comment
    });
    if (r && r.ok) return json(res, 200, { ok: true, ...r });
    return json(res, 502, { error: 'save_failed', message: 'Chưa lưu được. Bạn thử lại sau nhé.' });
  } catch (e) {
    return json(res, 502, { error: 'save_failed', message: 'Chưa lưu được. Bạn thử lại sau nhé.' });
  }
};
