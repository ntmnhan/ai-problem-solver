'use strict';
// GET  /api/stats  -> { configured, visits, ratingCount, ratingAvg }
// POST /api/stats  -> ghi 1 lượt truy cập hợp lệ (client tự chống đếm trùng theo phiên)
const { callScript, json } = require('../lib/script');

module.exports = async function handler(req, res) {
  if (!process.env.APPS_SCRIPT_URL) {
    return json(res, 200, { configured: false });
  }
  try {
    if (req.method === 'POST') {
      const r = await callScript('POST', { action: 'visit' });
      return json(res, 200, { configured: true, ...r });
    }
    if (req.method === 'GET') {
      const r = await callScript('GET');
      return json(res, 200, { configured: true, ...r });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    return json(res, 200, { configured: true, error: 'unavailable' });
  }
};
