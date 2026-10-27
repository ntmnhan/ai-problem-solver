'use strict';
// Chuẩn hóa bản ghi "vấn đề em gửi cho thầy cô". Mọi giới hạn độ dài và mức rủi ro đều tính lại ở máy chủ.
const { detectRisk } = require('./safety');

const CATS = ['Học tập', 'Gia đình', 'Tình bạn', 'Đời sống hằng ngày', 'Khác'];
const STATUSES = ['Mới', 'Đang hỗ trợ', 'Đã xong'];
const clip = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);

function buildRecord(b) {
  if (!b || typeof b !== 'object') return null;
  const id = clip(b.id, 40);
  if (!/^[\w-]{4,40}$/.test(id)) return null;
  const r = {
    id,
    name: clip(b.name, 60),
    cls: clip(b.cls, 20),
    school: clip(b.school, 80),
    category: CATS.includes(b.category) ? b.category : 'Khác',
    title: clip(b.title, 100),
    problem: clip(b.problem, 1500),
    cause: clip(b.cause, 1500),
    goal: clip(b.goal, 1500),
    chosen: clip(b.chosen, 200),
    reason: clip(b.reason, 1500),
    plan: clip(b.plan, 3000),
    happy: b.happy === 'yes' ? 'Hài lòng' : b.happy === 'no' ? 'Chưa hài lòng' : '',
    final: clip(b.final, 1500),
    satisfaction: Math.max(0, Math.min(5, Math.round(Number(b.satisfaction) || 0))),
    stepsDone: Math.max(0, Math.min(6, Math.round(Number(b.stepsDone) || 0)))
  };
  if (!r.problem) return null;
  const all = [r.problem, r.cause, r.goal, r.reason, r.plan, r.final].join(' \n ');
  r.risk = detectRisk(all) ? 'concern' : 'none';
  return r;
}

module.exports = { buildRecord, STATUSES, CATS, clip };
