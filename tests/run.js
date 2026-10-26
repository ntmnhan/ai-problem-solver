'use strict';
// Kiểm thử phía máy chủ (không cần mạng): node tests/run.js
const assert = require('assert');
const { detectRisk } = require('../lib/safety');

const results = [];
async function t(id, name, fn) {
  try {
    await fn();
    results.push({ id, name, ok: true });
  } catch (e) {
    results.push({ id, name, ok: false, err: e.message });
  }
}

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: '' };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = (b) => { r.body = b; };
  Object.defineProperty(r, 'json', { get() { return r.body ? JSON.parse(r.body) : null; } });
  return r;
}
function mockReq(body, method = 'POST') {
  return { method, body, headers: { 'x-forwarded-for': '1.2.3.' + Math.floor(Math.random() * 250) }, socket: {} };
}
function gemini(obj, extra = {}) {
  return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }], ...extra }) };
}

(async () => {
  await t('S-01', 'Phát hiện từ khóa nguy cơ (có dấu và không dấu)', () => {
    assert(detectRisk('Em bị bạo lực ở nhà'));
    assert(detectRisk('em muon chet'));
    assert(detectRisk('Mình bị ba đánh đập'));
    assert(detectRisk('bi xam hai'));
    assert(!detectRisk('Em bị điểm kém môn toán'));
    assert(!detectRisk('Hai bạn cãi nhau vì mượn bút'));
    assert(!detectRisk('bí danh của em là Sóc'));
  });

  const chat = require('../api/chat');
  const origFetch = global.fetch;

  await t('A-01', '/api/chat khi chưa có GEMINI_API_KEY trả 503 trung thực', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = mockRes();
    await chat(mockReq({ step: 1, messages: [{ role: 'user', text: 'hi' }] }), res);
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.json.error, 'not_configured');
  });

  await t('A-02', '/api/chat từ chối phương thức GET', async () => {
    process.env.GEMINI_API_KEY = 'test';
    const res = mockRes();
    await chat(mockReq({}, 'GET'), res);
    assert.strictEqual(res.statusCode, 405);
  });

  await t('A-03', 'Trả lời bình thường, key gửi qua header và không lộ ra phản hồi', async () => {
    process.env.GEMINI_API_KEY = 'SECRET-KEY';
    let seen;
    global.fetch = async (url, init) => { seen = { url, init }; return gemini({ reply: 'Chào em! Chuyện gì đang xảy ra vậy?', risk: 'none' }); };
    const res = mockRes();
    await chat(mockReq({ step: 1, context: { problem: 'Em cãi nhau với bạn' }, messages: [{ role: 'user', text: 'Em cãi nhau với bạn thân' }] }), res);
    assert.strictEqual(res.statusCode, 200);
    assert(res.json.reply.includes('Chào em'));
    assert(!res.body.includes('SECRET-KEY'));
    assert.strictEqual(seen.init.headers['x-goog-api-key'], 'SECRET-KEY');
    assert(!seen.url.includes('SECRET-KEY'), 'key không được nằm trong URL');
    const sent = JSON.parse(seen.init.body);
    assert(sent.systemInstruction.parts[0].text.includes('Bước 1'));
    assert(sent.systemInstruction.parts[0].text.includes('KHÔNG quyết định thay học sinh'));
    assert.strictEqual(sent.contents[sent.contents.length - 1].role, 'user');
  });

  await t('A-04', 'Che số điện thoại và email trước khi gửi cho AI', async () => {
    let sent;
    global.fetch = async (u, init) => { sent = JSON.parse(init.body); return gemini({ reply: 'ok', risk: 'none' }); };
    const res = mockRes();
    await chat(mockReq({ step: 1, messages: [{ role: 'user', text: 'Số em là 0901234567 và email an@gmail.com' }] }), res);
    const txt = JSON.stringify(sent.contents);
    assert(!txt.includes('0901234567'));
    assert(!txt.includes('an@gmail.com'));
    assert(txt.includes('[số điện thoại]') && txt.includes('[email]'));
  });

  await t('A-05', 'Từ khóa nguy cơ nâng risk lên concern dù AI trả none', async () => {
    global.fetch = async () => gemini({ reply: 'Mình ở đây nghe em.', risk: 'none' });
    const res = mockRes();
    await chat(mockReq({ step: 1, messages: [{ role: 'user', text: 'Em bị bạo lực ở nhà' }] }), res);
    assert.strictEqual(res.json.risk, 'concern');
  });

  await t('A-06', 'AI bị chặn an toàn: trả lời dự phòng khuyến khích tìm người lớn', async () => {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) });
    const res = mockRes();
    await chat(mockReq({ step: 1, messages: [{ role: 'user', text: 'abc' }] }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.risk, 'concern');
    assert(/người lớn/.test(res.json.reply));
  });

  await t('A-07', 'Hết hạn mức (429) trả thông báo thân thiện', async () => {
    global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    const res = mockRes();
    await chat(mockReq({ step: 1, messages: [{ role: 'user', text: 'abc' }] }), res);
    assert.strictEqual(res.statusCode, 429);
    assert(res.json.message);
  });

  await t('A-08', 'Model không còn tồn tại (404) tự chuyển sang model dự phòng', async () => {
    process.env.GEMINI_MODEL = 'gemini-old-gone';
    const calls = [];
    global.fetch = async (url) => { calls.push(url); return calls.length === 1 ? { ok: false, status: 404, json: async () => ({}) } : gemini({ reply: 'ok', risk: 'none' }); };
    const res = mockRes();
    await chat(mockReq({ step: 1, messages: [{ role: 'user', text: 'abc' }] }), res);
    delete process.env.GEMINI_MODEL;
    assert.strictEqual(res.statusCode, 200);
    assert(calls.length >= 2 && calls[0].includes('gemini-old-gone'));
  });

  await t('A-09', 'Lỗi mạng tới AI trả 502, không đánh lừa là thành công', async () => {
    global.fetch = async () => { throw new TypeError('network'); };
    const res = mockRes();
    await chat(mockReq({ step: 1, messages: [{ role: 'user', text: 'abc' }] }), res);
    assert.strictEqual(res.statusCode, 502);
  });

  await t('A-10', 'Giới hạn kích thước và tần suất', async () => {
    global.fetch = async () => gemini({ reply: 'ok', risk: 'none' });
    let res = mockRes();
    await chat(mockReq({ step: 1, messages: [{ role: 'user', text: 'x'.repeat(50000) }] }), res);
    assert.strictEqual(res.statusCode, 413);
    const req = mockReq({ step: 1, messages: [{ role: 'user', text: 'abc' }] });
    req.headers['x-forwarded-for'] = '9.9.9.9';
    let limited = 0;
    for (let i = 0; i < 25; i++) { const r = mockRes(); await chat(req, r); if (r.statusCode === 429) limited++; }
    assert(limited >= 4, 'phải bị giới hạn sau 20 lượt/phút');
  });

  await t('A-11', 'Tác vụ gợi ý phương án: yêu cầu không xếp hạng, loại trừ phương án đã có', async () => {
    let sent;
    global.fetch = async (u, init) => { sent = JSON.parse(init.body); return gemini({ intro: 'Gợi ý thôi nhé', options: ['Nói chuyện với bạn'], risk: 'none' }); };
    const res = mockRes();
    await chat(mockReq({ step: 3, task: 'suggest_options', payload: { existing: ['Xin lỗi bạn'] }, messages: [] }), res);
    assert.strictEqual(res.statusCode, 200);
    assert(Array.isArray(res.json.options));
    const last = sent.contents[sent.contents.length - 1].parts[0].text;
    assert(last.includes('Xin lỗi bạn') && /Không xếp hạng/.test(last));
  });

  await t('A-12', 'Tác vụ phân tích: dặn AI không chọn thay học sinh', async () => {
    let sent;
    global.fetch = async (u, init) => { sent = JSON.parse(init.body); return gemini({ note: 'n', items: [{ solution: 'a', pros: ['x'], cons: ['y'], consequences: 'z' }], risk: 'none' }); };
    const res = mockRes();
    await chat(mockReq({ step: 4, task: 'analyze', payload: { solutions: ['a'] }, messages: [] }), res);
    assert.strictEqual(res.statusCode, 200);
    assert(sent.contents[sent.contents.length - 1].parts[0].text.includes('KHÔNG chọn phương án'));
  });

  global.fetch = origFetch;
  const stats = require('../api/stats');
  const fb = require('../api/feedback');
  await t('B-01', '/api/stats khi chưa cấu hình trả configured:false (không bịa số)', async () => {
    delete process.env.APPS_SCRIPT_URL;
    const res = mockRes();
    await stats(mockReq({}, 'GET'), res);
    assert.strictEqual(res.json.configured, false);
    assert(res.json.visits === undefined);
  });

  await t('B-02', '/api/feedback khi chưa cấu hình trả 503', async () => {
    const res = mockRes();
    await fb(mockReq({ rating: 5 }), res);
    assert.strictEqual(res.statusCode, 503);
  });

  await t('B-03', 'Bộ đếm/đánh giá gọi Apps Script kèm token; xác thực đầu vào', async () => {
    process.env.APPS_SCRIPT_URL = 'https://script.example/exec';
    process.env.APPS_SCRIPT_TOKEN = 'tok';
    const calls = [];
    global.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ ok: true, visits: 7, ratingCount: 2, ratingAvg: 4.5 }) }; };
    let res = mockRes();
    await stats(mockReq({}, 'POST'), res);
    assert.strictEqual(res.json.visits, 7);
    assert.strictEqual(JSON.parse(calls[0].init.body).token, 'tok');
    assert.strictEqual(JSON.parse(calls[0].init.body).action, 'visit');
    res = mockRes();
    await fb(mockReq({ rating: 9 }), res);
    assert.strictEqual(res.statusCode, 400);
    res = mockRes();
    await fb(mockReq({ kind: 'idea', comment: '   ' }), res);
    assert.strictEqual(res.statusCode, 400);
    res = mockRes();
    await fb(mockReq({ rating: 5, comment: 'Hay quá' }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(JSON.parse(calls[calls.length - 1].init.body).rating, 5);
  });

  await t('B-04', 'Lỗi từ Apps Script: feedback báo lưu thất bại, không báo thành công giả', async () => {
    global.fetch = async () => { throw new Error('down'); };
    const res = mockRes();
    await fb(mockReq({ rating: 4, comment: 'x' }), res);
    assert.strictEqual(res.statusCode, 502);
  });

  global.fetch = origFetch;
  let failed = 0;
  results.forEach((r) => { console.log(`${r.ok ? 'ĐẠT      ' : 'KHÔNG ĐẠT'}  ${r.id}  ${r.name}${r.ok ? '' : '  -> ' + r.err}`); if (!r.ok) failed++; });
  console.log(`\n${results.length - failed}/${results.length} đạt`);
  require('fs').writeFileSync(__dirname + '/server-results.json', JSON.stringify(results, null, 2));
  process.exit(failed ? 1 : 0);
})();
