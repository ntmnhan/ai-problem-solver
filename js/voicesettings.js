// Cài đặt giọng đọc: tốc độ, giọng nam/nữ, nghe thử. Chỉ đọc khi bạn bấm nút Nghe.
import * as voice from './voice.js';
import { h, icon, btn, modal } from './ui.js';

const SAMPLE = 'Xin chào bạn, mình là Cú. Đây là giọng đọc bạn đã chọn.';

export function openVoiceSettings() {
  const body = h('div', { class: 'vs' });
  const draw = () => {
    body.textContent = '';
    const vi = voice.viVoices();
    const hasF = vi.some((v) => voice.voiceGender(v) === 'f');
    const hasM = vi.some((v) => voice.voiceGender(v) === 'm');
    const seg = (items, cur, on, label) => {
      const w = h('div', { class: 'seg', role: 'group', 'aria-label': label });
      items.forEach(([k, t, dis]) => w.appendChild(h('button', { type: 'button', class: cur === k ? 'on' : '', 'aria-pressed': cur === k ? 'true' : 'false', disabled: dis ? true : null, onClick: () => { on(k); draw(); } }, t)));
      return w;
    };
    body.append(
      h('p', { class: 'muted small', style: 'margin:0 0 8px' }, 'Trợ lý chỉ đọc khi bạn bấm nút “Nghe”. Bạn chọn tốc độ và giọng cho thoải mái nhé.'),
      h('div', { class: 'fld-cap' }, 'Tốc độ nói'),
      seg(voice.RATES, voice.getRate(), (k) => voice.setRate(k), 'Tốc độ nói'),
      h('div', { class: 'fld-cap', style: 'margin-top:12px' }, 'Giọng đọc'),
      seg([['', 'Mặc định'], ['f', 'Giọng nữ', vi.length && !hasF], ['m', 'Giọng nam', vi.length && !hasM]], voice.getGender(), (k) => voice.setGender(k), 'Giọng nam hay nữ')
    );
    if (!voice.supportsTTS) body.appendChild(h('p', { class: 'banner info' }, 'Trình duyệt này chưa hỗ trợ đọc to.'));
    else if (vi.length === 0) {
      body.appendChild(h('p', { class: 'banner info', id: 'vs-none' }, 'Máy này chưa có giọng đọc tiếng Việt nên mình chưa đọc to được. Bạn thử mở bằng Microsoft Edge (có giọng “HoaiMy” nữ, “NamMinh” nam) hoặc thêm giọng Tiếng Việt cho máy (xem Hướng dẫn sử dụng → Nghe AI đọc).'));
    } else {
      if (!hasF || !hasM) body.appendChild(h('p', { class: 'muted small', style: 'margin:8px 0 0' }, `Máy này chỉ có giọng ${hasF ? 'nữ' : hasM ? 'nam' : 'mặc định'} tiếng Việt. Muốn có đủ nam và nữ, bạn dùng Microsoft Edge hoặc cài thêm giọng Tiếng Việt trong Cài đặt máy.`));
      if (vi.length > 1) {
        const sel = h('select', { class: 'input', 'aria-label': 'Chọn giọng cụ thể', id: 'vs-voice' }, h('option', { value: '' }, 'Tự chọn theo lựa chọn ở trên'));
        vi.forEach((v) => { const o = h('option', { value: v.name }, `${v.name}${voice.voiceGender(v) === 'f' ? ' (nữ)' : voice.voiceGender(v) === 'm' ? ' (nam)' : ''}`); sel.appendChild(o); });
        sel.value = voice.getVoiceName();
        sel.addEventListener('change', () => voice.setVoiceName(sel.value));
        body.append(h('div', { class: 'fld-cap', style: 'margin-top:12px' }, 'Chọn giọng cụ thể (không bắt buộc)'), sel);
      }
      body.appendChild(h('div', { style: 'margin-top:14px' }, (() => { const t = btn('Nghe thử', { icon: 'volume', onClick: () => voice.speak(SAMPLE, () => {}) }); t.id = 'vs-test'; return t; })()));
    }
  };
  draw();
  modal({ title: 'Giọng đọc và tốc độ', body, actions: [{ label: 'Xong', kind: 'primary' }], onClose: () => voice.stopSpeaking() });
}

// Nút nhỏ mở cài đặt giọng (đặt cạnh nút Nghe)
export function settingsButton() {
  return h('button', { type: 'button', class: 'icon-btn mini vs-btn', id: 'voice-settings', 'aria-label': 'Cài đặt giọng đọc và tốc độ', title: 'Giọng đọc và tốc độ', onClick: openVoiceSettings }, icon('settings', 16));
}
