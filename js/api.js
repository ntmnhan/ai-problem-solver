// Gọi máy chủ (hàm Vercel). Không bao giờ giả vờ thành công khi máy chủ chưa xác nhận.
async function request(path, opts = {}, timeoutMs = 35000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      ...opts,
      signal: ctrl.signal,
      headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {})
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const err = new Error(((data && data.message) || 'Có lỗi xảy ra. Em thử lại sau nhé.') + (data && data.status ? ` (mã ${data.status})` : ''));
      err.code = (data && data.error) || 'http_' + res.status;
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('Kết nối quá lâu. Em kiểm tra mạng rồi thử lại nhé.');
      err.code = 'timeout';
      throw err;
    }
    if (e instanceof TypeError) {
      const err = new Error('Không có kết nối mạng. Em kiểm tra mạng rồi thử lại nhé.');
      err.code = 'network';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function askAI(body) {
  const send = () => request('/api/chat', { method: 'POST', body: JSON.stringify(body) });
  try {
    return await send();
  } catch (e) {
    // Lỗi tạm thời từ phía AI: tự thử lại một lần (cùng nội dung, không nhân đôi tin nhắn).
    if (['upstream', 'quota', 'timeout', 'bad_ai_output'].includes(e.code)) {
      await new Promise((ok) => setTimeout(ok, 1500));
      return send();
    }
    throw e;
  }
}

export function getStats() {
  return request('/api/stats', { method: 'GET' }, 10000);
}

export function postVisit() {
  return request('/api/stats', { method: 'POST', body: '{}' }, 10000);
}

export function sendFeedback(payload) {
  return request('/api/feedback', { method: 'POST', body: JSON.stringify(payload) }, 15000);
}

export function shareProblem(payload) {
  return request('/api/share', { method: 'POST', body: JSON.stringify(payload) }, 20000);
}

export function adminCall(password, body) {
  return request('/api/admin', { method: 'POST', body: JSON.stringify(body), headers: { 'x-admin-password': password } }, 25000);
}
