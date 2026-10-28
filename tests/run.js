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
    assert(detectRisk('Bạn bị bạo lực ở nhà'));
    assert(detectRisk('bạn muon chet'));
    assert(detectRisk('Mình bị ba đánh đập'));
    assert(detectRisk('bi xam hai'));
    assert(!detectRisk('Bạn bị điểm kém môn toán'));
    assert(!detectRisk('Hai bạn cãi nhau vì mượn bút'));
    assert(!detectRisk('bí danh của bạn là Sóc'));
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
    global.fetch = async (url, init) => { seen = { url, init }; return gemini({ reply: 'Chào bạn! Chuyện gì đang xảy ra vậy?', risk: 'none' }); };
    const res = mockRes();
    await chat(mockReq({ step: 1, context: { problem: 'Bạn cãi nhau với bạn' }, messages: [{ role: 'user', text: 'Bạn cãi nhau với bạn thân' }] }), res);
    assert.strictEqual(res.statusCode, 200);
    assert(res.json.reply.includes('Chào bạn'));
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
    await chat(mockReq({ step: 1, messages: [{ role: 'user', text: 'Số bạn là 0901234567 và email an@gmail.com' }] }), res);
    const txt = JSON.stringify(sent.contents);
    assert(!txt.includes('0901234567'));
    assert(!txt.includes('an@gmail.com'));
    assert(txt.includes('[số điện thoại]') && txt.includes('[email]'));
  });

  await t('A-05', 'Từ khóa nguy cơ nâng risk lên concern dù AI trả none', async () => {
    global.fetch = async () => gemini({ reply: 'Mình ở đây nghe bạn.', risk: 'none' });
    const res = mockRes();
    await chat(mockReq({ step: 1, messages: [{ role: 'user', text: 'Bạn bị bạo lực ở nhà' }] }), res);
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

  await t('A-20', 'Gợi ý đúng 5 biện pháp khác hướng; kế hoạch yêu cầu các việc khác hẳn nhau, có kết quả mong đợi và phương án dự phòng', async () => {
    let sent;
    global.fetch = async (u, init) => { sent = JSON.parse(init.body); return gemini({ intro: 'x', options: ['a'], note: 'n', items: [], risk: 'none' }); };
    let res = mockRes();
    await chat(mockReq({ step: 3, task: 'suggest_options', payload: { existing: [] }, messages: [] }), res);
    assert(/ĐÚNG 5/.test(sent.contents[sent.contents.length - 1].parts[0].text));
    res = mockRes();
    await chat(mockReq({ step: 5, task: 'breakdown', payload: { chosen: 'Xin lỗi bạn' }, messages: [] }), res);
    const t5 = sent.contents[sent.contents.length - 1].parts[0].text;
    assert(/KHÁC HẲN/.test(t5) && /expect/.test(t5) && /backup/.test(t5) && /SMART/.test(t5));
    assert(JSON.stringify(sent.generationConfig.responseSchema).includes('"backup"'));
  });

  await t('A-12', 'Tác vụ phân tích: dặn AI không chọn thay học sinh', async () => {
    let sent;
    global.fetch = async (u, init) => { sent = JSON.parse(init.body); return gemini({ note: 'n', items: [{ solution: 'a', pros: ['x'], cons: ['y'], consequences: 'z' }], risk: 'none' }); };
    const res = mockRes();
    await chat(mockReq({ step: 4, task: 'analyze', payload: { solutions: ['a'] }, messages: [] }), res);
    assert.strictEqual(res.statusCode, 200);
    assert(sent.contents[sent.contents.length - 1].parts[0].text.includes('KHÔNG chọn biện pháp'));
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

  const ask = async (extra) => { const res = mockRes(); await chat(mockReq(Object.assign({ step: 1, messages: [{ role: 'user', text: 'abc' }] }, extra || {})), res); return res; };
  const txt = (o) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: o }] } }] }) });

  await t('A-13', 'Lỗi 400 (thinkingConfig/schema không hỗ trợ) tự thử lại với cấu hình đơn giản hơn', async () => {
    chat._cool.clear();
    const bodies = [];
    global.fetch = async (url, init) => {
      const b = JSON.parse(init.body); bodies.push(b);
      return b.generationConfig.thinkingConfig ? { ok: false, status: 400, text: async () => 'bad', json: async () => ({}) } : gemini({ reply: 'ổn', risk: 'none' });
    };
    const res = await ask();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.reply, 'ổn');
    assert(bodies[0].generationConfig.thinkingConfig && !bodies[1].generationConfig.thinkingConfig);
  });

  await t('A-14', 'AI trả JSON bọc ```json hoặc kèm chữ thừa vẫn đọc được', async () => {
    chat._cool.clear();
    global.fetch = async () => txt('Đây nhé:\n```json\n{"reply":"xin chào","risk":"none"}\n```');
    const res = await ask();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.reply, 'xin chào');
  });

  await t('A-15', 'Chat: AI trả văn bản thường (không JSON) vẫn dùng làm câu trả lời', async () => {
    chat._cool.clear();
    global.fetch = async () => txt('Mình nghe bạn đây, bạn kể thêm nhé.');
    const res = await ask();
    assert.strictEqual(res.statusCode, 200);
    assert(/nghe bạn/.test(res.json.reply));
  });

  await t('A-16', 'Model lỗi 503 được tạm bỏ qua ở lượt sau', async () => {
    chat._cool.clear();
    let calls = [];
    global.fetch = async (url) => { calls.push(url); return /3\.5-flash-lite/.test(url) ? { ok: false, status: 503, text: async () => '', json: async () => ({}) } : gemini({ reply: 'ok', risk: 'none' }); };
    await ask();
    calls = [];
    await ask();
    assert(!calls.some((u) => /3\.5-flash-lite/.test(u)));
  });

  await t('A-17', 'Gemini hỏng hết → chuyển sang dịch vụ dự phòng (FALLBACK_API_KEY)', async () => {
    chat._cool.clear();
    process.env.FALLBACK_API_KEY = 'fb';
    let usedFb = false;
    global.fetch = async (url) => {
      if (/groq/.test(url)) { usedFb = true; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"reply":"từ dự phòng","risk":"none"}' } }] }) }; }
      return { ok: false, status: 503, text: async () => '', json: async () => ({}) };
    };
    const res = await ask();
    delete process.env.FALLBACK_API_KEY;
    assert(usedFb && res.statusCode === 200 && res.json.reply === 'từ dự phòng');
  });

  await t('A-18', '/api/health báo từng model, không lộ khóa', async () => {
    chat._cool.clear();
    const health = require('../api/health');
    health._reset();
    process.env.GEMINI_API_KEY = 'SECRET-KEY';
    global.fetch = async (url) => (/3\.8-flash/.test(url) ? { ok: true, status: 200 } : { ok: false, status: 404 });
    const res = mockRes();
    await health({ method: 'GET', headers: {} }, res);
    assert.strictEqual(res.json.status, 'ok');
    assert(res.json.models.length >= 4);
    assert(!res.body.includes('SECRET-KEY'));
  });

  await t('C-01', '/api/share: gửi thầy cô cần đồng ý + họ tên + lớp, lưu họ tên/lớp/nội dung, tự tính rủi ro; chế độ thống kê ẩn danh không cần đồng ý và KHÔNG lưu nội dung/họ tên/lớp', async () => {
    process.env.APPS_SCRIPT_URL = 'https://script.example/x';
    process.env.APPS_SCRIPT_TOKEN = 'tok';
    const share = require('../api/share');
    const sent = [];
    global.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
    let res = mockRes();
    await share(mockReq({ id: 'pb_abc123', problem: 'x', name: 'A', cls: '6/6' }), res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.json.error, 'no_consent');
    res = mockRes();
    await share(mockReq({ consent: true, id: 'pb_abc123', problem: 'x' }), res);
    assert.strictEqual(res.statusCode, 400, 'thiếu họ tên/lớp thì không gửi');
    res = mockRes();
    await share(mockReq({ consent: true, id: 'pb_abc123', name: 'Nguyễn Văn A', cls: '6/6', code: 'hs-ab2cd', category: 'Bậy', problem: 'Bạn bị bạo lực ở nhà', satisfaction: 9 }), res);
    assert.strictEqual(res.statusCode, 200);
    let rec = sent[0].record;
    assert.strictEqual(sent[0].action, 'share');
    assert.strictEqual(rec.risk, 'concern');
    assert.strictEqual(rec.code, 'HS-AB2CD');
    assert.strictEqual(rec.name, 'Nguyễn Văn A'); assert.strictEqual(rec.cls, '6/6'); assert.strictEqual(rec.shared, 'Có');
    assert.strictEqual(rec.category, 'Khác');
    assert.strictEqual(rec.satisfaction, 5);
    // thống kê ẩn danh
    sent.length = 0;
    res = mockRes();
    await share(mockReq({ mode: 'stat', id: 'pb_abc123', code: 'HS-AB2CD', name: 'Lén', cls: '9/9', category: 'Học tập', title: 'T', problem: 'Bạn bị bạo lực ở nhà', cause: 'c', happy: 'yes', satisfaction: 4, stepsDone: 6 }), res);
    assert.strictEqual(res.statusCode, 200);
    rec = sent[0].record;
    assert.strictEqual(rec.mode, 'stat');
    assert.strictEqual(rec.risk, 'concern', 'rủi ro vẫn được tính từ nội dung');
    ['title', 'problem', 'cause', 'goal', 'chosen', 'reason', 'plan', 'final', 'name', 'cls'].forEach((k) => assert.strictEqual(rec[k], '', 'không được lưu ' + k));
    assert.strictEqual(rec.happy, 'Hài lòng'); assert.strictEqual(rec.stepsDone, 6); assert.strictEqual(rec.shared, '');
    res = mockRes();
    await share(mockReq({ mode: 'stat', id: 'pb_abc123' }), res);
    assert.strictEqual(res.statusCode, 400, 'thống kê cần mã');
    res = mockRes();
    await share(mockReq({ consent: true, id: '../x', problem: 'a', name: 'A', cls: '6' }), res);
    assert.strictEqual(res.statusCode, 400);
  });

  await t('C-02', '/api/share: kho lưu trữ lỗi thì báo 502, không báo đã gửi', async () => {
    const share = require('../api/share');
    global.fetch = async () => { throw new Error('down'); };
    const res = mockRes();
    await share(mockReq({ consent: true, id: 'pb_abc123', problem: 'a', name: 'A', cls: '6/1' }), res);
    assert.strictEqual(res.statusCode, 502);
  });

  await t('C-03', '/api/admin: sai mật khẩu 401, đúng thì list/update/delete; thiếu cấu hình 503; khóa khi sai nhiều', async () => {
    const admin = require('../api/admin');
    const call = async (pw, body, ip) => { const r = mockReq(body); r.headers['x-admin-password'] = pw; if (ip) r.headers['x-forwarded-for'] = ip; const res = mockRes(); await admin(r, res); return res; };
    delete process.env.ADMIN_PASSWORD;
    assert.strictEqual((await call('x', { action: 'list' })).statusCode, 503);
    process.env.ADMIN_PASSWORD = 'matkhau';
    const bodies = [];
    global.fetch = async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ ok: true, items: [{ id: 'pb_abc123', code: 'HS-AB2CD', name: 'Tên HS', cls: '6/1', shared: 'Có', problem: 'p' }, { id: 'pb_stat1', code: 'HS-ZZZZZ', shared: '', problem: '' }] }) }; };
    assert.strictEqual((await call('sai', { action: 'list' }, '9.9.9.1')).statusCode, 401);
    assert.strictEqual(bodies.length, 0);
    const lr = await call('matkhau', { action: 'list' }, '9.9.9.2');
    assert.strictEqual(lr.statusCode, 200);
    assert.strictEqual(lr.json.items.length, 1, 'danh sách chỉ gồm ca học sinh đã gửi thầy cô');
    assert.strictEqual(lr.json.items[0].name, 'Tên HS', 'thầy cô thấy họ tên');
    assert.strictEqual(lr.json.summary.total, 2, 'thống kê tính mọi lượt tư vấn');
    assert.strictEqual(lr.json.summary.shared, 1);
    assert.strictEqual((await call('matkhau', { action: 'update', id: 'pb_abc123', status: 'Đang hỗ trợ', note: 'ok' }, '9.9.9.2')).statusCode, 200);
    assert.strictEqual(bodies[1].action, 'adminUpdate');
    assert.strictEqual((await call('matkhau', { action: 'update', id: 'pb_abc123', status: 'Lạ' }, '9.9.9.2')).statusCode, 400);
    assert.strictEqual((await call('matkhau', { action: 'delete', id: 'pb_abc123' }, '9.9.9.2')).statusCode, 200);
    for (let i = 0; i < 8; i++) await call('sai', { action: 'list' }, '9.9.9.3');
    assert.strictEqual((await call('matkhau', { action: 'list' }, '9.9.9.3')).statusCode, 429);
    delete process.env.ADMIN_PASSWORD;
  });

  await t('C-04', '/api/admin: mật khẩu học sinh chỉ nhận thống kê tổng hợp (không mã, không nội dung), không sửa/xóa được; chưa đặt thì không đăng nhập được', async () => {
    const admin = require('../api/admin');
    const call = async (pw, body, ip) => { const r = mockReq(body); r.headers['x-admin-password'] = pw; r.headers['x-forwarded-for'] = ip; const res = mockRes(); await admin(r, res); return res; };
    process.env.ADMIN_PASSWORD = 'thayco'; delete process.env.STUDENT_PASSWORD;
    const rows = [{ id: 'pb_x1', code: 'HS-AAAAA', title: 'Tiêu đề bí mật', problem: 'Nội dung bí mật', category: 'Học tập', status: 'Mới', risk: 'concern', stepsDone: 6, satisfaction: 4, happy: 'Hài lòng', shared: 'Có', name: 'Họ Tên Bí Mật', cls: '9/9', sentAt: Date.now() }, { id: 'pb_x2', code: 'HS-BBBBB', category: 'Tình bạn', status: 'Mới', risk: 'none', stepsDone: 6, satisfaction: 5, happy: 'Hài lòng', shared: '', problem: '', sentAt: Date.now() }];
    const bodies = [];
    global.fetch = async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ ok: true, items: rows }) }; };
    assert.strictEqual((await call('hs', { action: 'list' }, '8.8.8.1')).statusCode, 401, 'chưa đặt STUDENT_PASSWORD thì không vào được');
    process.env.STUDENT_PASSWORD = 'hs';
    assert.strictEqual((await call('hs', { action: 'login' }, '8.8.8.2')).json.role, 'student');
    assert.strictEqual((await call('thayco', { action: 'login' }, '8.8.8.2')).json.role, 'teacher');
    const lr = await call('hs', { action: 'list' }, '8.8.8.2');
    assert.strictEqual(lr.statusCode, 200);
    assert.strictEqual(lr.json.role, 'student');
    assert.ok(!('items' in lr.json), 'học sinh không nhận danh sách ca');
    const dump = JSON.stringify(lr.json);
    ['Tiêu đề bí mật', 'Nội dung bí mật', 'HS-AAAAA', 'pb_x1', 'Họ Tên Bí Mật', '9/9'].forEach((x) => assert.ok(!dump.includes(x), 'rò rỉ: ' + x));
    assert.strictEqual(lr.json.summary.total, 2);
    assert.strictEqual(lr.json.summary.shared, 1);
    assert.strictEqual(lr.json.summary.concernOpen, 1);
    assert.strictEqual(lr.json.summary.byCategory['Học tập'], 1);
    const n0 = bodies.length;
    assert.strictEqual((await call('hs', { action: 'update', id: 'pb_x1', status: 'Đã xong', note: 'x' }, '8.8.8.2')).statusCode, 403);
    assert.strictEqual((await call('hs', { action: 'delete', id: 'pb_x1' }, '8.8.8.2')).statusCode, 403);
    assert.strictEqual(bodies.length, n0, 'không được gọi kho dữ liệu khi bị từ chối');
    const tl = await call('thayco', { action: 'list' }, '8.8.8.2');
    assert.strictEqual(tl.json.role, 'teacher');
    assert.strictEqual(tl.json.items.length, 1);
    assert.strictEqual(tl.json.items[0].problem, 'Nội dung bí mật');
    assert.strictEqual(tl.json.items[0].name, 'Họ Tên Bí Mật');
    delete process.env.ADMIN_PASSWORD; delete process.env.STUDENT_PASSWORD;
  });

  await t('A-19', 'Lời nhắc hệ thống có cơ sở tham khảo: 6 bước, tiêu chí chọn giải pháp, VN-COP/111, UNESCO', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const sent = [];
    global.fetch = async (u, init) => { sent.push(JSON.parse(init.body)); return gemini({ reply: 'ok', risk: 'none' }); };
    const res = mockRes();
    await chat(mockReq({ step: 4, messages: [{ role: 'user', text: 'abc' }] }), res);
    const sys = sent[0].systemInstruction.parts[0].text;
    assert(/5 Tại sao/.test(sys) && /nguồn lực, thời gian/.test(sys) && /VN-COP/.test(sys) && /UNESCO/.test(sys) && /Chương trình giáo dục phổ thông/.test(sys));
    assert(/Phân tích và lựa chọn/.test(sys));
  });

  global.fetch = origFetch;
  let failed = 0;
  results.forEach((r) => { console.log(`${r.ok ? 'ĐẠT      ' : 'KHÔNG ĐẠT'}  ${r.id}  ${r.name}${r.ok ? '' : '  -> ' + r.err}`); if (!r.ok) failed++; });
  console.log(`\n${results.length - failed}/${results.length} đạt`);
  require('fs').writeFileSync(__dirname + '/server-results.json', JSON.stringify(results, null, 2));
  process.exit(failed ? 1 : 0);
})();
