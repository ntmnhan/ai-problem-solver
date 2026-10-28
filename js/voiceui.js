// Nút micro dùng chung (Voice Mode): nói → chữ hiện trong ô để bạn xem lại và sửa; không tự gửi.
import * as voice from './voice.js';
import { h, icon, btn, clear } from './ui.js';

export const V_LABEL = {
  listening: 'Đang nghe…', processing: 'Đang xử lý…', stopped: 'Đã dừng', speaking: 'Đang phát âm thanh…',
  denied: 'Chưa được phép dùng micro', unsupported: 'Trình duyệt chưa hỗ trợ nhận diện giọng nói',
  'no-speech': 'Mình chưa nghe thấy gì', error: 'Có lỗi khi nghe',
  waiting: 'Đang chờ micro… (nếu trình duyệt hỏi, bạn bấm Cho phép)'
};

let current = null; // chỉ một ô được nghe tại một thời điểm

export function voiceInput({ ta, hint = 'Bạn xem lại chữ, sửa nếu cần nhé.' }) {
  const strip = h('div', { class: 'voice-strip hidden', role: 'status' });
  const micBtn = h('button', { type: 'button', class: 'icon-btn mic', 'aria-label': 'Bật Voice Mode (nói thay vì gõ)', 'aria-pressed': 'false', title: 'Nói thay vì gõ' }, icon('mic', 20));
  let state = 'idle';
  let base = '';
  let watch = null;

  const api = { btn: micBtn, strip, setSpeaking, reset, used: false, get state() { return state; } };

  function setState(s) { state = s; draw(); }

  function draw() {
    clear(strip);
    const active = state === 'listening' || state === 'processing' || state === 'waiting';
    micBtn.classList.toggle('on', active);
    micBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    micBtn.setAttribute('aria-label', active ? 'Dừng nghe' : 'Bật Voice Mode (nói thay vì gõ)');
    if (state === 'idle') { strip.classList.add('hidden'); return; }
    strip.classList.remove('hidden');
    const note = state === 'denied' ? 'Bạn có thể bật lại quyền micro trong cài đặt trình duyệt, hoặc cứ gõ chữ nhé.'
      : state === 'unsupported' ? 'Bạn vẫn gõ chữ bình thường được.'
      : state === 'error' ? 'Bạn kiểm tra micro và mạng Internet, mở app bằng Chrome/Safari (không mở trong Zalo, Facebook), hoặc cứ gõ chữ nhé.'
      : state === 'stopped' ? hint : '';
    const kids = [
      h('span', { class: `voice-state ${state}` }, h('span', { class: 'dotlive' }), V_LABEL[state] || ''),
      active ? btn('Dừng nghe', { small: true, icon: 'stop', onClick: () => voice.stopListening(false) }) : null,
      active ? btn('Hủy', { small: true, icon: 'x', onClick: cancel }) : null,
      state === 'speaking' ? btn('Dừng đọc', { small: true, icon: 'stop', onClick: () => { voice.stopSpeaking(); setState('idle'); } }) : null,
      !active && state !== 'speaking' && state !== 'unsupported' ? btn('Nói tiếp', { small: true, icon: 'mic', onClick: start }) : null,
      h('button', { type: 'button', class: 'icon-btn mini', 'aria-label': 'Quay lại nhập văn bản', title: 'Quay lại nhập văn bản', onClick: () => { voice.stopAll(); setState('idle'); ta.focus(); } }, icon('x', 16)),
      note ? h('span', { class: 'voice-note' }, note) : null
    ];
    strip.append(...kids.filter(Boolean)); // append(null) sẽ in chữ "null"
  }

  function cancel() { voice.stopListening(true); ta.value = base.trimEnd(); ta.dispatchEvent(new Event('input')); setState('stopped'); }

  function start() {
    if (!voice.supportsSTT) { setState('unsupported'); return; }
    if (current && current !== api) current.reset();
    current = api;
    api.used = true;
    voice.stopSpeaking();
    base = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
    clearTimeout(watch);
    setState('waiting'); // phản hồi ngay khi bấm, không để bạn tưởng nút hỏng
    watch = setTimeout(() => { if (state === 'waiting') { voice.stopListening(true); setState('error'); } }, 8000);
    const ok = voice.startListening({
      onText: (f, i) => { clearTimeout(watch); ta.value = base + f + i; ta.dispatchEvent(new Event('input')); },
      onState: (s, info) => {
        clearTimeout(watch);
        if (s === 'error') setState(info && info.reason === 'denied' ? 'denied' : info && info.reason === 'no-speech' ? 'no-speech' : info && info.reason === 'unsupported' ? 'unsupported' : 'error');
        else setState(s);
      }
    });
    if (!ok && state === 'waiting') setState('error');
  }

  function reset() { clearTimeout(watch); setState('idle'); }
  function setSpeaking(on) { if (on) setState('speaking'); else if (state === 'speaking') setState('idle'); }

  micBtn.addEventListener('click', () => {
    if (state === 'listening' || state === 'processing') voice.stopListening(false);
    else start();
  });
  return api;
}
