import { CONFIG, STEPS } from '../config.js';
import * as store from '../store.js';
import { h, icon, btn, toast } from '../ui.js';
import { owl, badge, STEP_ICON, STEP_COLOR } from '../art.js';
import { autoGreet, playGreeting, stopGreeting, isPlaying } from '../greet.js';

export function render(root) {
  if (store.getProfile()) {
    location.replace('#/home');
    return;
  }
  const stopGreet = autoGreet();
  const go = () => { stopGreet(); stopGreeting(); location.hash = '#/home'; };
  const listen = h('button', { type: 'button', class: 'btn btn-small listen-btn', id: 'greet-btn', 'aria-label': 'Nghe lời chào' }, icon('volume', 16), h('span', { class: 'lt' }, 'Nghe lời chào'));
  listen.addEventListener('click', async () => {
    if (isPlaying()) { stopGreeting(); return; }
    const ok = await playGreeting();
    if (!ok) toast('Chưa phát được âm thanh. Bạn kiểm tra loa hoặc âm lượng nhé.', 'error', 5000);
  });

  root.appendChild(
    h('div', { class: 'start' },
      h('section', { class: 'hero' },
        h('div', { class: 'hero-art' },
          owl({ size: 132, mood: 'wave', label: 'Chú thỏ đồng hành đang vẫy chào' }),
          h('span', { class: 'float f1' }, badge('bulb', '#f59e0b', 38)),
          h('span', { class: 'float f2' }, badge('heart', '#ec4899', 34)),
          h('span', { class: 'float f3' }, badge('book', '#3b82f6', 34))),
        h('div', { class: 'hero-bubble' }, 'Chào bạn! Có chuyện gì làm bạn rối không? Mình cùng gỡ từng bước nhé.'),
        h('h1', null, CONFIG.name),
        h('p', { class: 'sub' }, CONFIG.tagline),
        listen,
        h('p', { class: 'muted small ai-tag', style: 'margin:2px 0 0' }, 'Giọng chào do AI tạo ra (Piper TTS).')
      ),
      h('section', { class: 'card start-card' },
        h('div', { class: 'start-form' },
          btn('Bắt đầu', { kind: 'primary', icon: 'right', onClick: () => { store.setProfile(); go(); } }),
          h('p', { class: 'muted small', style: 'margin:0;text-align:center' }, 'Bấm “Bắt đầu” để chia sẻ câu chuyện của bạn với Thỏ nhé!'))
      ),
      h('ol', { class: 'steps-preview', 'aria-label': 'Sáu bước' },
        STEPS.map((s) => h('li', null, badge(STEP_ICON[s.n - 1], STEP_COLOR[s.n - 1], 40), h('span', null, s.short)))),
      h('p', { class: 'start-note' }, icon('shield', 16),
        h('span', null, 'App không hỏi tên, lớp của bạn khi dùng. Nội dung lưu trên máy bạn; chỉ khi bạn chọn nhờ thầy cô đồng hành ở cuối Bước 6 và đồng ý thì họ tên, lớp và nội dung mới được gửi cho thầy cô. Bạn đừng ghi họ tên, số điện thoại hay địa chỉ vào nội dung nhé.')),
      h('div', { class: 'start-links' },
        h('a', { href: '#/guide' }, 'Hướng dẫn sử dụng'),
        h('a', { href: 'tel:111' }, 'Cần giúp đỡ? Gọi 111'))
    )
  );
}
