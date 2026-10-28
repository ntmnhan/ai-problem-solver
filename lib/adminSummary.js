'use strict';
// Thống kê tổng hợp cho tài khoản HỌC SINH quản trị: chỉ có con số, không có mã, tiêu đề hay nội dung của bất kỳ ca nào.
const { CATS, STATUSES } = require('./share');

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
  list.forEach((it) => {
    const st = STATUSES.includes(it.status) ? it.status : 'Mới';
    byStatus[st]++;
    byCategory[CATS.includes(it.category) ? it.category : 'Khác']++;
    if (it.risk === 'concern' && st !== 'Đã xong') concernOpen++;
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
    total: list.length, byStatus, byCategory, concernOpen, steps,
    satisfaction: { avg: satN ? Math.round((satSum / satN) * 10) / 10 : null, count: satN },
    happy: { yes: happy, no: notHappy }, last14
  };
}

module.exports = { summarize };
