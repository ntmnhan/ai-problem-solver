import { CONFIG, STEPS } from '../config.js';
import * as store from '../store.js';
import { h, icon, btn, toast } from '../ui.js';
import { pickRestoreFile } from '../actions.js';

export function render(root) {
  if (store.getProfile()) {
    location.replace('#/home');
    return;
  }
  const name = h('input', { type: 'text', class: 'input', maxlength: 60, placeholder: 'Ví dụ: Nguyễn Văn An', autocomplete: 'off', id: 'f-name' });
  const cls = h('input', { type: 'text', class: 'input', maxlength: 20, placeholder: 'Ví dụ: 6/6', autocomplete: 'off', id: 'f-cls' });

  const go = () => {
    location.hash = '#/home';
  };

  root.appendChild(
    h(
      'div',
      null,
      h(
        'section',
        { class: 'hero' },
        h('img', { class: 'hero-logo', src: '/assets/logo.svg', alt: 'Logo AI Problem Solver: la bàn trắng trong vòng tròn xanh dương' }),
        h('h1', null, CONFIG.name),
        h('p', { class: 'sub' }, CONFIG.tagline),
        h('p', { class: 'slogan' }, `“${CONFIG.slogan}”`)
      ),
      h(
        'section',
        { class: 'card start-card' },
        h('h2', null, 'Em sẽ làm gì ở đây?'),
        h('p', null, 'Khi gặp chuyện khó trong học tập, gia đình, tình bạn hay cuộc sống, em cùng trợ lý đi qua 6 bước để suy nghĩ có trình tự. Em là người quyết định, trợ lý chỉ gợi mở.'),
        h(
          'div',
          { class: 'steps-preview', 'aria-label': 'Sáu bước' },
          STEPS.map((s) => h('div', null, h('b', null, String(s.n)), s.short))
        )
      ),
      h(
        'section',
        { class: 'card start-card' },
        h('h2', null, 'Bắt đầu'),
        h(
          'form',
          {
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
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Họ và tên'), name),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Lớp'), cls),
          h('div', { class: 'stack' }, btn('Bắt đầu', { kind: 'primary', type: 'submit', icon: 'right' }),
            btn('Tiếp tục ở chế độ ẩn danh', {
              kind: '',
              onClick: () => {
                store.setProfile({ anonymous: true });
                go();
              }
            }))
        ),
        h(
          'p',
          { class: 'muted small', style: 'margin-top:12px' },
          'Không bắt buộc khai báo nếu em chọn ẩn danh. Em sẽ nhận một mã ngẫu nhiên, không suy đoán danh tính.'
        )
      ),
      h(
        'section',
        { class: 'card card-soft start-card' },
        h('div', { class: 'safety-note', style: 'margin-top:0' }, icon('info', 20), h('div', null,
          h('strong', null, 'Em nên biết: '),
          'Dữ liệu của em chỉ được lưu trên thiết bị này, không có tài khoản hay mật khẩu. Nội dung em gõ trong khung trò chuyện sẽ được gửi tới dịch vụ AI để trả lời, nên em đừng ghi họ tên, số điện thoại hay địa chỉ nhà nhé. Nếu mất dữ liệu trên máy, mình không thể lấy lại, vì vậy em nên tải bản sao lưu thỉnh thoảng.')),
        h('div', { class: 'row', style: 'margin-top:12px' },
          btn('Khôi phục từ tệp sao lưu', { small: true, icon: 'upload', onClick: () => pickRestoreFile(() => { if (store.getProfile()) go(); else toast('Tệp không có thông tin hồ sơ, em hãy nhập thông tin ở trên nhé.'); }) }),
          h('a', { class: 'btn btn-sm', href: '#/privacy' }, icon('shield', 16), h('span', null, 'Quyền riêng tư'))
        ),
        h('div', { class: 'safety-note' }, icon('phone', 20), h('div', null, 'Nếu em đang bị bạo lực hoặc xâm hại, hãy gọi ', h('a', { href: 'tel:111' }, '111'), ' (Tổng đài quốc gia bảo vệ trẻ em) và nói với người lớn em tin tưởng.'))
      )
    )
  );
}
