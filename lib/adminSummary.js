'use strict';
// Thống kê tổng hợp (mọi lượt tư vấn đã xong Bước 6, ẩn danh) cho cả học sinh và thầy cô: chỉ có con số, không có mã, tiêu đề, họ tên hay nội dung.
// Trạng thái Mới / Đang hỗ trợ / Đã xong chỉ tính các ca học sinh đã gửi thầy cô.
const { CATS, STATUSES } = require('./share');

// Ca "đã gửi thầy cô": có cờ Gửi thầy cô, hoặc dòng của phiên bản trước đã có nội dung.
const isSharedCase = (it) => it.shared === 'Có' || (it.shared == null || it.shared === '') && !!String(it.problem || '').trim();

const DAY = 86400000;
const VN = 7 * 3600000; // giờ Việt Nam (UTC+7)
const dayKey = (t) => new Date(Number(t) + VN).toISOString().slice(0, 10);

function summarize(items, now = Date.now()) {
  const list = Array.isArray(items) ? items : [];
  const byStatus = {}; STATUSES.forEach((s) => { byStatus[s] = 0; });
  const byCategory = {}; CATS.forEach((c) => { byCategory[c] = 0; });
  const steps = [0, 0, 0, 0, 0, 0, 0];
  let concernOpen = 0; let satSum = 0; let satN = 0; let happy = 0; let notHappy = 0;
  const perDay = {};
  let shared = 0;
  list.forEach((it) => {
    const st = STATUSES.includes(it.status) ? it.status : 'Mới';
    const isShared = isSharedCase(it);
    if (isShared) { shared++; byStatus[st]++; }
    byCategory[CATS.includes(it.category) ? it.category : 'Khác']++;
    if (it.risk === 'concern' && !(isShared && st === 'Đã xong')) concernOpen++;
    const sd = Math.max(0, Math.min(6, Math.round(Number(it.stepsDone) || 0)));
    steps[sd]++;
    const sat = Number(it.satisfaction) || 0;
    if (sat > 0) { satSum += sat; satN++; }
    if (it.happy === 'Hài lòng') happy++; else if (it.happy === 'Chưa hài lòng') notHappy++;
    if (it.sentAt) { const k = dayKey(it.sentAt); perDay[k] = (perDay[k] || 0) + 1; }
  });
  const last14 = [];
  for (let i = 13; i >= 0; i--) { const k = dayKey(now - i * DAY); last14.push({ d: k, n: perDay[k] || 0 }); }
  return {
    total: list.length, shared, byStatus, byCategory, concernOpen, steps,
    satisfaction: { avg: satN ? Math.round((satSum / satN) * 10) / 10 : null, count: satN },
    happy: { yes: happy, no: notHappy }, last14
  };
}

module.exports = { summarize, isSharedCase };
