'use strict';
// POST /api/chat — gọi Gemini ở phía máy chủ. API key chỉ nằm ở biến môi trường GEMINI_API_KEY.
const { SCHEMAS, buildSystem, taskInstruction, clip } = require('../lib/prompt');
const { detectRisk } = require('../lib/safety');

const MAX_BODY = 40000;
const MAX_MSG = 1500;
const MAX_HISTORY = 14;
const RATE_LIMIT = 20; // lượt / phút / IP (ước lượng, bộ nhớ tạm của máy chủ)
const buckets = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const b = (buckets.get(ip) || []).filter((t) => now - t < 60000);
  if (b.length >= RATE_LIMIT) {
    buckets.set(ip, b);
    return true;
  }
  b.push(now);
  buckets.set(ip, b);
  if (buckets.size > 5000) buckets.clear();
  return false;
}

// Che số điện thoại và email trước khi gửi cho dịch vụ AI.
function scrub(text) {
  return String(text || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/(\+?84|0)[\s.-]?\d(?:[\s.-]?\d){8,9}/g, '[số điện thoại]');
}

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function buildContents(messages, task, payload) {
  const contents = [];
  const push = (role, text) => {
    if (!text) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += '\n' + text;
    else contents.push({ role, parts: [{ text }] });
  };
  (Array.isArray(messages) ? messages : []).slice(-MAX_HISTORY).forEach((m) => {
    if (!m || typeof m.text !== 'string') return;
    const text = scrub(clip(m.text, MAX_MSG)).trim();
    if (!text) return;
    push(m.role === 'ai' ? 'model' : 'user', text);
  });
  while (contents.length && contents[0].role !== 'user') contents.shift();
  const instr = taskInstruction(task, payload);
  if (instr) push('user', '[Yêu cầu hệ thống cho trợ lý] ' + instr);
  if (!contents.length) push('user', 'Em muốn bắt đầu.');
  if (contents[contents.length - 1].role !== 'user') {
    push('user', 'Mình xin tiếp tục nhé.');
  }
  return contents;
}

async function callGemini(model, key, body, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return json(res, 503, {
      error: 'not_configured',
      message: 'Trợ lý AI chưa được cấu hình (thiếu GEMINI_API_KEY trên máy chủ).'
    });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  if (rateLimited(ip)) {
    return json(res, 429, { error: 'rate_limited', message: 'Em gửi hơi nhanh rồi. Chờ một chút rồi thử lại nhé.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== 'object') return json(res, 400, { error: 'bad_request' });
  if (JSON.stringify(body).length > MAX_BODY) return json(res, 413, { error: 'too_large', message: 'Nội dung quá dài.' });

  const step = Math.min(6, Math.max(1, parseInt(body.step, 10) || 1));
  const task = ['chat', 'suggest_options', 'analyze', 'breakdown'].includes(body.task) ? body.task : 'chat';
  const ctx = body.context || {};
  const messages = body.messages || [];
  const payload = body.payload || {};

  const lastUser = [...(Array.isArray(messages) ? messages : [])].reverse().find((m) => m && m.role !== 'ai');
  const regexRisk = detectRisk((lastUser && lastUser.text) || '') || detectRisk(ctx.problem || '');

  const gen = {
    systemInstruction: { parts: [{ text: buildSystem(step, ctx) }] },
    contents: buildContents(messages, task, payload),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: SCHEMAS[task]
    }
  };

  const primary = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const models = [primary, 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].filter((m, i, a) => a.indexOf(m) === i);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    let r = null;
    let usedModel = null;
    for (const m of models) {
      r = await callGemini(m, key, gen, ctrl.signal);
      usedModel = m;
      if (![404, 403, 429, 500, 502, 503, 504].includes(r.status)) break; // model không có/quá tải/hết lượt: thử model dự phòng
    }
    if (r.status === 429) {
      return json(res, 429, { error: 'quota', message: 'Trợ lý đang quá tải hoặc hết lượt miễn phí. Em thử lại sau ít phút nhé.' });
    }
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.text()).slice(0, 300).replace(/AIza[\w-]+/g, '[key]'); } catch (e) { /* bỏ qua */ }
      console.error('Gemini lỗi', r.status, usedModel, detail);
      return json(res, 502, { error: 'upstream', status: r.status, message: 'Trợ lý đang gặp sự cố. Em thử lại sau nhé.' });
    }
    const data = await r.json();
    const cand = data && data.candidates && data.candidates[0];
    const blocked = (data && data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason === 'SAFETY');
    if (blocked || !cand || !cand.content) {
      return json(res, 200, {
        task,
        risk: 'concern',
        reply: 'Mình chưa thể trả lời nội dung này. Nếu em đang gặp điều gì khiến em lo lắng hay không an toàn, em hãy nói với ba mẹ, thầy cô hoặc người lớn em tin tưởng nhé.'
      });
    }
    const text = (cand.content.parts || []).map((p) => p.text || '').join('');
    let out;
    try {
      out = JSON.parse(text);
    } catch (e) {
      return json(res, 502, { error: 'bad_ai_output', message: 'Trợ lý trả lời chưa đúng định dạng. Em gửi lại giúp mình nhé.' });
    }
    let risk = ['none', 'concern', 'danger'].includes(out.risk) ? out.risk : 'none';
    if (regexRisk && risk === 'none') risk = 'concern';
    out.risk = risk;
    out.task = task;
    if (task === 'chat') out.reply = clip(out.reply || '', 2500);
    if (process.env.AIPS_DEBUG) out._model = usedModel;
    return json(res, 200, out);
  } catch (e) {
    if (e && e.name === 'AbortError') {
      return json(res, 504, { error: 'timeout', message: 'Trợ lý trả lời quá lâu. Em thử lại nhé.' });
    }
    return json(res, 502, { error: 'upstream', message: 'Không kết nối được với trợ lý. Em kiểm tra mạng rồi thử lại nhé.' });
  } finally {
    clearTimeout(timer);
  }
};

module.exports._scrub = scrub;
