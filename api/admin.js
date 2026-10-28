'use strict';
// POST /api/admin — quản trị: danh sách / cập nhật trạng thái + ghi chú / xóa. Mật khẩu: biến ADMIN_PASSWORD.
const crypto = require('crypto');
const { callScript, json } = require('../lib/script');
const { STATUSES, clip } = require('../lib/share');
const { summarize } = require('../lib/adminSummary');

const fails = new Map();
function locked(ip) {
  const now = Date.now();
  const f = (fails.get(ip) || []).filter((t) => now - t < 15 * 60000);
  fails.set(ip, f);
  if (fails.size > 2000) fails.clear();
  return f.length >= 8;
}
const noteFail = (ip) => { const f = fails.get(ip) || []; f.push(Date.now()); fails.set(ip, f); };

function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  // Hai mức quyền: ADMIN_PASSWORD = thầy cô (xem nội dung, xử lý, xóa); STUDENT_PASSWORD = học sinh quản trị (chỉ xem thống kê tổng hợp)
  const pass = process.env.ADMIN_PASSWORD;
  const spass = process.env.STUDENT_PASSWORD || '';
  if (!pass || !process.env.APPS_SCRIPT_URL) {
    return json(res, 503, { error: 'not_configured', message: 'Trang quản trị chưa được cấu hình (thiếu ADMIN_PASSWORD hoặc APPS_SCRIPT_URL trên Vercel).' });
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  if (locked(ip)) return json(res, 429, { error: 'locked', message: 'Nhập sai quá nhiều lần. Hãy thử lại sau 15 phút.' });
  const given = req.headers['x-admin-password'] || '';
  const role = sameSecret(given, pass) ? 'teacher' : (spass && sameSecret(given, spass) ? 'student' : '');
  if (!role) {
    noteFail(ip);
    return json(res, 401, { error: 'unauthorized', message: 'Mật khẩu chưa đúng.' });
  }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') return json(res, 400, { error: 'bad_request' });

  try {
    let r;
    if (b.action === 'login') {
      return json(res, 200, { ok: true, role });
    } else if (b.action === 'list') {
      r = await callScript('POST', { action: 'adminList' });
      if (r && r.ok && role === 'student') return json(res, 200, { ok: true, role, summary: summarize(r.items) }); // học sinh KHÔNG nhận nội dung các ca
    } else if (role !== 'teacher') {
      return json(res, 403, { error: 'forbidden', message: 'Chỉ thầy cô mới xem nội dung và xử lý các ca.' });
    } else if (b.action === 'update') {
      const id = clip(b.id, 40);
      if (!/^[\w-]{4,40}$/.test(id) || !STATUSES.includes(b.status)) return json(res, 400, { error: 'bad_request' });
      r = await callScript('POST', { action: 'adminUpdate', id, status: b.status, note: clip(b.note, 1000) });
    } else if (b.action === 'delete') {
      const id = clip(b.id, 40);
      if (!/^[\w-]{4,40}$/.test(id)) return json(res, 400, { error: 'bad_request' });
      r = await callScript('POST', { action: 'adminDelete', id });
    } else {
      return json(res, 400, { error: 'bad_request' });
    }
    if (r && Array.isArray(r.items)) r.items = r.items.map((it) => { const o = Object.assign({}, it); delete o.name; delete o.cls; delete o.school; return o; }); // không bao giờ trả họ tên/lớp/trường
    if (r && r.ok) return json(res, 200, Object.assign({ role }, r));
    return json(res, 502, { error: 'script_failed', message: 'Kho dữ liệu chưa trả lời đúng. Hãy kiểm tra Apps Script đã cập nhật mã mới và triển khai lại chưa.' });
  } catch (e) {
    return json(res, 502, { error: 'script_failed', message: 'Không kết nối được kho dữ liệu (Apps Script). Thử lại sau nhé.' });
  }
};
