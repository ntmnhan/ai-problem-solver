// Voice Mode: nhận diện giọng nói (STT) và đọc phản hồi (TTS) bằng Web Speech API của trình duyệt.
// Chỉ xin quyền micro khi người dùng chủ động bật; không nghe liên tục.
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const supportsSTT = !!SR;
export const supportsTTS = typeof window !== 'undefined' && !!window.speechSynthesis && 'SpeechSynthesisUtterance' in window;

let rec = null;
let listening = false;

// onText(finalText, interimText), onState('listening'|'processing'|'stopped'|'error', info)
export function startListening({ onText, onState }) {
  if (!SR) {
    onState('error', { reason: 'unsupported' });
    return false;
  }
  stopListening(true);
  const r = new SR();
  rec = r;
  rec.lang = 'vi-VN';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  rec.onstart = () => {
    if (rec !== r) return;
    listening = true;
    onState('listening');
  };
  rec.onresult = (ev) => {
    if (rec !== r) return;
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    onText(finalText, interim);
  };
  rec.onerror = (ev) => {
    listening = false;
    r._errored = true;
    if (rec !== r) return;
    const reason = ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'denied' : ev.error === 'no-speech' ? 'no-speech' : ev.error === 'aborted' ? 'aborted' : 'error';
    if (reason !== 'aborted') onState('error', { reason });
  };
  rec.onend = () => {
    const was = listening;
    listening = false;
    // Sau một lỗi (vd từ chối micro) không ghi đè thông báo lỗi bằng "Đã dừng".
    if (rec === r && !r._cancelled && !r._errored) {
      onState('processing');
      setTimeout(() => onState('stopped'), 250);
    }
    void was;
  };
  try {
    rec.start();
    return true;
  } catch (e) {
    onState('error', { reason: 'error' });
    return false;
  }
}

export function stopListening(cancel = false) {
  if (rec) {
    rec._cancelled = cancel;
    try {
      if (cancel) rec.abort();
      else rec.stop();
    } catch (e) { /* bỏ qua */ }
    if (cancel) rec = null;
  }
  listening = false;
}

export function isListening() {
  return listening;
}

// ----- Cài đặt giọng đọc: tốc độ và giọng nam/nữ (lưu trên máy) -----
const RATE_KEY = 'aips_tts_rate';
const GENDER_KEY = 'aips_tts_gender'; // 'f' (nữ) | 'm' (nam) | '' (mặc định)
const NAME_KEY = 'aips_tts_voice';    // tên giọng cụ thể (nếu bạn chọn)
export const RATES = [['0.8', 'Chậm'], ['1', 'Vừa'], ['1.25', 'Nhanh']];
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } };
export const getRate = () => { const r = lsGet(RATE_KEY, '1'); return RATES.some(([k]) => k === r) ? r : '1'; };
export const setRate = (r) => lsSet(RATE_KEY, String(r));
export const getGender = () => { const g = lsGet(GENDER_KEY, ''); return g === 'f' || g === 'm' ? g : ''; };
export const setGender = (g) => { lsSet(GENDER_KEY, g || ''); lsSet(NAME_KEY, ''); };
export const getVoiceName = () => lsGet(NAME_KEY, '');
export const setVoiceName = (n) => lsSet(NAME_KEY, n || '');

const isVi = (v) => /^vi([-_]|$)/i.test(v.lang || '') || /vietnam|tiếng việt/i.test(v.name || '');
// Trình duyệt không cho biết giới tính của giọng: đoán theo tên giọng phổ biến (Microsoft, Google, Apple, Android).
export function voiceGender(v) {
  const n = String(v.name || '').toLowerCase();
  if (/female|nữ|hoaimy|hoài my|linh|\bvif\b|-vif-|vie-vnm-x-vif|thu\b|lan\b/.test(n)) return 'f';
  if (/\bmale\b|namminh|nam minh|\bvic\b|-vic-|\bvid\b|-vid-|\ban\b|minh\b|nam\b/.test(n)) return 'm';
  return '';
}
export function viVoices() {
  let all = [];
  try { all = window.speechSynthesis.getVoices() || []; } catch (e) { all = []; }
  return all.filter(isVi);
}
const quality = (v) => (/natural|online/i.test(v.name) ? 2 : /google/i.test(v.name) ? 1 : 0);
function pickVoice() {
  const vi = viVoices();
  if (!vi.length) return null;
  const byName = getVoiceName();
  if (byName) { const f = vi.find((v) => v.name === byName); if (f) return f; }
  const g = getGender();
  let pool = vi;
  if (g) { const m = vi.filter((v) => voiceGender(v) === g); if (m.length) pool = m; }
  return pool.slice().sort((a, b) => quality(b) - quality(a))[0];
}
export function hasViVoice() {
  let voices = [];
  try { voices = window.speechSynthesis.getVoices() || []; } catch (e) { voices = []; }
  return voices.length === 0 ? null : voices.some(isVi); // null: chưa biết (danh sách giọng chưa tải)
}

// onState('speaking'|'stopped'|'novoice'|'error')
export function speak(text, onState) {
  if (!supportsTTS) {
    onState && onState('error');
    return false;
  }
  if (listening) { onState && onState('stopped'); return false; } // đang ghi âm thì không đọc, tránh tự thu tiếng loa
  if (hasViVoice() === false) { onState && onState('novoice'); return false; } // không đọc bằng giọng tiếng Anh
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(String(text).slice(0, 1500));
  u.lang = 'vi-VN';
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = parseFloat(getRate()) || 1;
  u.onstart = () => onState && onState('speaking');
  u.onend = () => onState && onState('stopped');
  u.onerror = () => onState && onState('stopped');
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if (supportsTTS) {
    try { window.speechSynthesis.cancel(); } catch (e) { /* bỏ qua */ }
  }
}

export function stopAll() {
  stopListening(true);
  stopSpeaking();
}

if (supportsTTS) {
  try {
    window.speechSynthesis.onvoiceschanged = () => { /* danh sách giọng đã tải */ };
  } catch (e) { /* bỏ qua */ }
}
