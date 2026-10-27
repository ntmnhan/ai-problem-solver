import { CONFIG, STEPS } from '../config.js';
import * as store from '../store.js';
import { h, icon, btn, toast } from '../ui.js';
import { pickRestoreFile } from '../actions.js';
import { owl, badge, STEP_ICON, STEP_COLOR } from '../art.js';
import * as voice from '../voice.js';
import { autoGreet, sayGreeting } from '../greet.js';

export function render(root) {
  if (store.getProfile()) {
    location.replace('#/home');
    return;
  }
  const name = h('input', { type: 'text', class: 'input', maxlength: 60, placeholder: 'Họ và tên', 'aria-label': 'Họ và tên', autocomplete: 'off', id: 'f-name' });
  const cls = h('input', { type: 'text', class: 'input', maxlength: 20, placeholder: 'Lớp (6/6)', 'aria-label': 'Lớp', autocomplete: 'off', id: 'f-cls' });
  const stopGreet = autoGreet();
  const go = () => { stopGreet(); voice.stopSpeaking(); location.hash = '#/home'; };
  const listen = voice.supportsTTS ? h('button', { type: 'button', class: 'btn btn-small listen-btn', id: 'greet-btn', 'aria-label': 'Nghe lời chào' }, icon('volume', 16), h('span', { class: 'lt' }, 'Nghe lời chào')) : null;
  if (listen) listen.addEventListener('click', () => { sayGreeting((s) => { if (s === 'novoice') toast('Máy này chưa có giọng đọc tiếng Việt. Em thêm giọng Tiếng Việt trong Cài đặt > Ngôn ngữ nhé.', 'info', 7000); }); });

  root.appendChild(
    h('div', { class: 'start' },
      h('section', { class: 'hero' },
        h('div', { class: 'hero-art' },
          owl({ size: 132, mood: 'wave', label: 'Chú cú đồng hành đang vẫy chào' }),
          h('span', { class: 'float f1' }, badge('bulb', '#f59e0b', 38)),
          h('span', { class: 'float f2' }, badge('heart', '#ec4899', 34)),
          h('span', { class: 'float f3' }, badge('book', '#3b82f6', 34))),
        h('div', { class: 'hero-bubble' }, 'Chào em! Có chuyện gì làm em rối không? Mình cùng gỡ từng bước nhé.'),
        h('h1', null, CONFIG.name),
        h('p', { class: 'sub' }, CONFIG.tagline),
        listen
      ),
      h('section', { class: 'card start-card' },
        h('form', {
          onSubmit: (e) => {
            e.preventDefault();
            if (!name.value.trim()) {
              toast('Em hãy nhập họ tên, hoặc chọn “Tiếp tục ở chế độ ẩn danh”.', 'error');
              name.focus();
              return;
            }
            store.setProfile({ name: name.value, cls: cls.value, anonymous: false });
            go();
          }
        },
          h('div', { class: 'start-fields' }, name, cls),
          btn('Bắt đầu', { kind: 'primary', type: 'submit', icon: 'right' }),
          h('p', { class: 'muted small', style: 'margin:0;text-align:center' }, 'Bấm “Bắt đầu” để chia sẻ câu chuyện của em với Cú nhé!'),
          btn('Tiếp tục ở chế độ ẩn danh', { kind: 'quiet', onClick: () => { store.setProfile({ anonymous: true }); go(); } })
        )
      ),
      h('ol', { class: 'steps-preview', 'aria-label': 'Sáu bước' },
        STEPS.map((s) => h('li', null, badge(STEP_ICON[s.n - 1], STEP_COLOR[s.n - 1], 40), h('span', null, s.short)))),
      h('p', { class: 'start-note' }, icon('shield', 16),
        h('span', null, 'Dữ liệu lưu trên máy em; chỉ gửi cho thầy cô khi em đồng ý. Khi trò chuyện với AI, em đừng ghi họ tên, số điện thoại hay địa chỉ nhé.')),
      h('div', { class: 'start-links' },
        h('button', { type: 'button', class: 'link-btn', onClick: () => pickRestoreFile(() => { if (store.getProfile()) go(); else toast('Tệp không có thông tin hồ sơ, em hãy nhập thông tin ở trên nhé.'); }) }, 'Khôi phục từ tệp sao lưu'),
        h('a', { href: '#/guide' }, 'Hướng dẫn sử dụng'),
        h('a', { href: 'tel:111' }, 'Cần giúp đỡ? Gọi 111'))
    )
  );
}
