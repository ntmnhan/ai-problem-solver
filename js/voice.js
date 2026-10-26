// Voice Mode: nhận diện giọng nói (STT) và đọc phản hồi (TTS) bằng Web Speech API của trình duyệt.
// Chỉ xin quyền micro khi người dùng chủ động bật; không nghe liên tục.
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const supportsSTT = !!SR;
export const supportsTTS = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

let rec = null;
let listening = false;

// onText(finalText, interimText), onState('listening'|'processing'|'stopped'|'error', info)
export function startListening({ onText, onState }) {
  if (!SR) {
    onState('error', { reason: 'unsupported' });
    return false;
  }
  stopListening(true);
  rec = new SR();
  rec.lang = 'vi-VN';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  rec.onstart = () => {
    listening = true;
    onState('listening');
  };
  rec.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onText(finalText, interim);
  };
  rec.onerror = (ev) => {
    listening = false;
    if (rec) rec._errored = true;
    const reason = ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'denied' : ev.error === 'no-speech' ? 'no-speech' : ev.error === 'aborted' ? 'aborted' : 'error';
    if (reason !== 'aborted') onState('error', { reason });
  };
  rec.onend = () => {
    const was = listening;
    listening = false;
    // Sau một lỗi (vd từ chối micro) không ghi đè thông báo lỗi bằng "Đã dừng".
    if (rec && !rec._cancelled && !rec._errored) {
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

let voiceCache = null;
function pickVoice() {
  if (voiceCache) return voiceCache;
  const voices = window.speechSynthesis.getVoices() || [];
  voiceCache = voices.find((v) => /^vi/i.test(v.lang)) || null;
  return voiceCache;
}

// onState('speaking'|'stopped')
export function speak(text, onState) {
  if (!supportsTTS) {
    onState && onState('error');
    return false;
  }
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(String(text).slice(0, 1500));
  u.lang = 'vi-VN';
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = 1;
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
    window.speechSynthesis.onvoiceschanged = () => { voiceCache = null; };
  } catch (e) { /* bỏ qua */ }
}
