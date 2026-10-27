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

// Trí nhớ ngắn của máy chủ: model nào vừa lỗi thì tạm bỏ qua để khỏi mất thời gian.
const cool = new Map();
function coolOff(m, st) {
  const ms = st === 404 || st === 403 ? 30 * 60000 : st === 429 || st === 503 ? 20000 : 5000;
  cool.set(m, Date.now() + ms);
}
const isCool = (m) => (cool.get(m) || 0) > Date.now();

// Giảm "thời gian suy nghĩ" để trả lời nhanh và không hết token vì suy nghĩ.
function thinkingFor(model) {
  if (/^gemini-3/.test(model)) return { thinkingLevel: 'low' };
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
  return null;
}

// Đọc JSON dễ tính: bỏ rào ```, cắt lấy phần {...}.
function parseJson(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch (e) { /* thử tiếp */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* bỏ qua */ }
  }
  return null;
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
      maxOutputTokens: task === 'chat' ? 900 : 1800,
      responseMimeType: 'application/json',
      responseSchema: SCHEMAS[task]
    }
  };

  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2]
    .join(',').split(',').map((k) => k.trim()).filter(Boolean)
    .filter((k, i, a) => a.indexOf(k) === i);
  const primary = process.env.GEMINI_MODEL;
  const models = [primary, 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']
    .filter(Boolean).filter((m, i, a) => a.indexOf(m) === i);
  const RETRY = [404, 403, 429, 500, 502, 503, 504];
  const deadline = Date.now() + 26000;
  const left = () => deadline - Date.now();

  // Một lần gọi có hạn giờ riêng, để một model treo không ăn hết thời gian của các model khác.
  async function attempt(fn, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Math.max(1500, Math.min(ms, left())));
    try { return await fn(ctrl.signal); } finally { clearTimeout(t); }
  }

  // Chuẩn hóa văn bản AI thành đối tượng; chat thì chấp nhận cả văn bản thường.
  function toOut(text) {
    const o = parseJson(text);
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    if (task === 'chat' && String(text).trim().length > 3 && !/^\s*[{\[]/.test(text)) return { reply: String(text).trim(), risk: 'none' };
    return null;
  }

  // Trả về { out } | { blocked } | { fail: {status, model} }
  async function generate() {
    let last = { status: 0, model: '' };
    const live = models.filter((m) => !isCool(m));
    const order = live.length ? live : models;
    for (let pass = 0; pass < 2 && left() > 2500; pass++) {
      for (const key of keys) {
        for (const m of order) {
          if (left() < 2500) break;
          let level = 0; // 0 đủ cấu hình, 1 bỏ thinking, 2 bỏ cả schema
          for (let tries = 0; tries < 3; tries++) {
            const cfg = Object.assign({}, gen.generationConfig);
            const th = thinkingFor(m);
            if (level === 0 && th) cfg.thinkingConfig = th;
            if (level >= 2) delete cfg.responseSchema;
            let r;
            try {
              r = await attempt((sig) => callGemini(m, key, Object.assign({}, gen, { generationConfig: cfg }), sig), 11000);
            } catch (e) {
              last = { status: e && e.name === 'AbortError' ? 504 : 0, model: m };
              coolOff(m, 503);
              break;
            }
            if (r.ok) {
              let data = null;
              try { data = await r.json(); } catch (e) { last = { status: 502, model: m }; break; }
              const cand = data && data.candidates && data.candidates[0];
              const blocked = (data && data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason === 'SAFETY');
              if (blocked || !cand || !cand.content) return { blocked: true, model: m };
              const text = (cand.content.parts || []).filter((x) => !x.thought).map((x) => x.text || '').join('');
              const out = text.trim() ? toOut(text) : null;
              if (!out) { last = { status: 502, model: m }; break; } // rỗng/cụt/hỏng: thử model khác
              return { out, model: m };
            }
            let detail = '';
            try { detail = (await r.text()).slice(0, 300).replace(/AIza[\w-]+/g, '[key]'); } catch (e) { /* bỏ qua */ }
            console.error('Gemini lỗi', r.status, m, detail);
            last = { status: r.status, model: m };
            if (r.status === 400 && level < 2) { level++; continue; } // thử lại bớt cấu hình
            if (RETRY.includes(r.status)) coolOff(m, r.status);
            break;
          }
        }
      }
      if (pass === 0 && left() > 4000) await new Promise((ok) => setTimeout(ok, 900));
    }
    // Dự phòng: dịch vụ AI khác tương thích OpenAI (không bắt buộc), vd Groq/OpenRouter bản miễn phí.
    const fbKey = process.env.FALLBACK_API_KEY;
    if (fbKey && left() > 2000) {
      const base = (process.env.FALLBACK_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
      const fbModel = process.env.FALLBACK_MODEL || 'llama-3.3-70b-versatile';
      const sys = buildSystem(step, ctx) + '\n\nChỉ trả về MỘT đối tượng JSON hợp lệ, đúng cấu trúc sau (không thêm chữ nào ngoài JSON): ' + JSON.stringify(SCHEMAS[task]);
      const msgs = [{ role: 'system', content: sys }].concat(gen.contents.map((c) => ({ role: c.role === 'model' ? 'assistant' : 'user', content: c.parts[0].text })));
      try {
        const r = await attempt((sig) => fetch(base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + fbKey },
          body: JSON.stringify({ model: fbModel, messages: msgs, temperature: 0.7, max_tokens: 2048, response_format: { type: 'json_object' } }),
          signal: sig
        }), 12000);
        if (r.ok) {
          const d = await r.json();
          const text = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
          const out = text && toOut(text);
          if (out) return { out, model: 'fallback:' + fbModel };
        } else {
          console.error('Dự phòng lỗi', r.status, fbModel);
        }
      } catch (e) { console.error('Dự phòng lỗi', e && e.name); }
    }
    return { fail: last };
  }

  try {
    const g = await generate();
    if (g.fail) {
      const st = g.fail.status;
      if (st === 429) {
        return json(res, 429, { error: 'quota', status: st, message: 'Trợ lý đang quá tải hoặc hết lượt miễn phí. Em thử lại sau ít phút nhé.' });
      }
      if (st === 504) {
        return json(res, 504, { error: 'timeout', status: st, message: 'Trợ lý trả lời quá lâu. Em thử lại nhé.' });
      }
      return json(res, 502, { error: 'upstream', status: st, message: 'Trợ lý đang gặp sự cố. Em thử lại sau nhé.' });
    }
    if (g.blocked) {
      return json(res, 200, {
        task,
        risk: 'concern',
        reply: 'Mình chưa thể trả lời nội dung này. Nếu em đang gặp điều gì khiến em lo lắng hay không an toàn, em hãy nói với ba mẹ, thầy cô hoặc người lớn em tin tưởng nhé.'
      });
    }
    const out = g.out;
    let risk = ['none', 'concern', 'danger'].includes(out.risk) ? out.risk : 'none';
    if (regexRisk && risk === 'none') risk = 'concern';
    out.risk = risk;
    out.task = task;
    if (task === 'chat') out.reply = clip(out.reply || '', 2500);
    if (process.env.AIPS_DEBUG) out._model = g.model;
    return json(res, 200, out);
  } catch (e) {
    return json(res, 502, { error: 'upstream', message: 'Không kết nối được với trợ lý. Em kiểm tra mạng rồi thử lại nhé.' });
  }
};

module.exports._scrub = scrub;
module.exports._parseJson = parseJson;
module.exports._cool = cool;
