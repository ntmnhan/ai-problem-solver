// Tiện ích giao diện: tạo phần tử an toàn (không dùng innerHTML với dữ liệu người dùng), icon, hộp thoại, thông báo.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const ICONS = {
  menu: 'M3 12h18M3 6h18M3 18h18',
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8',
  send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z',
  settings: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  volume: 'M11 5L6 9H2v6h4l5 4V5z M19.07 4.93a10 10 0 0 1 0 14.14 M15.54 8.46a5 5 0 0 1 0 7.07',
  stop: 'M6 6h12v12H6z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6',
  edit: 'M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  check: 'M20 6L9 17l-5-5',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  down: 'M6 9l6 6 6-6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  left: 'M19 12H5 M12 19l-7-7 7-7',
  right: 'M5 12h14 M12 5l7 7-7 7',
  print: 'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  qr: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M20 14v7h-3 M14 20h1',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  x: 'M18 6L6 18 M6 6l12 12',
  alert: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  bulb: 'M9 18h6 M10 22h4 M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  scale: 'M12 3v18 M6 21h12 M3 7l9-3 9 3 M5 8l-3 7a4 4 0 0 0 6 0L5 8z M19 8l-3 7a4 4 0 0 0 6 0l-3-7z',
  rocket: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0 M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
  trophy: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0V4z M17 5h3v2a3 3 0 0 1-3 3 M7 5H4v2a3 3 0 0 0 3 3',
  heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  circle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  more: 'M12 12h.01 M19 12h.01 M5 12h.01',
  chevleft: 'M15 18l-6-6 6-6',
  chevright: 'M9 18l6-6-6-6'
};

export function icon(name, size = 20) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.setAttribute('aria-hidden', 'true');
  const d = ICONS[name] || '';
  const fill = name === 'star' ? 'currentColor' : 'none';
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  return span;
}

export function btn(label, opts = {}) {
  const { kind = '', icon: ic, onClick, type = 'button', disabled, title, small, aria } = opts;
  const b = h(
    'button',
    {
      type,
      class: `btn ${kind ? 'btn-' + kind : ''} ${small ? 'btn-sm' : ''}`.trim(),
      disabled,
      title,
      'aria-label': aria
    },
    ic ? icon(ic, small ? 16 : 18) : null,
    label ? h('span', null, label) : null
  );
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function autoGrow(ta, max = 180) {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, max) + 'px';
  };
  ta.addEventListener('input', fit);
  setTimeout(fit, 0);
  return fit;
}

// ---------- Thông báo ----------
export function toast(message, kind = 'info', ms = 3200) {
  let root = document.getElementById('toasts');
  if (!root) return;
  const t = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  root.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

// ---------- Hộp thoại ----------
let activeModal = null;
export function modal({ title, body, actions = [], wide = false, onClose, variant = '', headExtra = null, titleIcon = null }) {
  closeModal();
  const root = document.getElementById('modal-root');
  const prevFocus = document.activeElement;
  const close = () => {
    if (!activeModal || activeModal.el !== overlay) return;
    overlay.remove();
    document.body.classList.remove('modal-open');
    activeModal = null;
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose();
  };
  const dialog = h(
    'div',
    { class: `modal ${wide ? 'modal-wide' : ''} ${variant === 'sheet' ? 'modal-sheet' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: variant === 'sheet' ? '-1' : null },
    h(
      'div',
      { class: 'modal-head' },
      h('h2', null, titleIcon, title),
      h('span', { class: 'head-spacer' }),
      headExtra,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Đóng', onClick: close }, icon('x'))
    ),
    h('div', { class: `modal-body ${variant === 'sheet' ? 'sheet-body' : ''}` }, body),
    actions.length
      ? h(
          'div',
          { class: 'modal-actions' },
          actions.map((a) =>
            btn(a.label, {
              kind: a.kind,
              onClick: async () => {
                if (a.onClick) {
                  const r = await a.onClick();
                  if (r === false) return;
                }
                close();
              }
            })
          )
        )
      : null
  );
  const overlay = h('div', { class: `overlay ${variant === 'sheet' ? 'overlay-sheet' : ''}` }, dialog);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  root.appendChild(overlay);
  document.body.classList.add('modal-open');
  activeModal = { el: overlay, close };
  const first = variant === 'sheet' ? dialog : dialog.querySelector('textarea, input, select') || dialog.querySelector('.modal-actions button') || dialog.querySelector('button');
  setTimeout(() => first && first.focus(), 30);
  return close;
}

export function closeModal() {
  if (activeModal) activeModal.close();
}

export function confirmDialog({ title, text, okLabel = 'Đồng ý', cancelLabel = 'Quay lại', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title,
      body: h('p', null, text),
      actions: [
        { label: cancelLabel, kind: 'ghost', onClick: () => { answered = true; resolve(false); } },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true); } }
      ],
      onClose: () => {
        if (!answered) resolve(false);
      }
    });
  });
}

export function promptDialog({ title, label, value = '', okLabel = 'Lưu', maxLength = 100 }) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', class: 'input', value, maxlength: maxLength, 'aria-label': label });
    let answered = false;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const ok = overlayBtn();
        if (ok) ok.click();
      }
    });
    const overlayBtn = () => document.querySelector('.modal-actions .btn-primary');
    modal({
      title,
      body: h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input),
      actions: [
        { label: 'Hủy', kind: 'ghost', onClick: () => { answered = true; resolve(null); } },
        { label: okLabel, kind: 'primary', onClick: () => { answered = true; resolve(input.value.trim()); } }
      ],
      onClose: () => {
        if (!answered) resolve(null);
      }
    });
  });
}

// ---------- Thẻ an toàn cố định (không phụ thuộc AI) ----------
export function safetyCard(level = 'concern') {
  return h(
    'div',
    { class: `safety-card ${level === 'danger' ? 'danger' : ''}`, role: 'note' },
    h('div', { class: 'safety-head' }, icon('shield', 20), h('strong', null, 'Sự an toàn của bạn là quan trọng nhất')),
    h(
      'p',
      null,
      'Bạn hãy nói với ba mẹ, thầy cô hoặc một người lớn bạn tin tưởng. Bạn không cần kể chi tiết nếu bạn chưa sẵn sàng.'
    ),
    h(
      'ul',
      null,
      h('li', null, 'Bị bạo lực hoặc xâm hại: gọi ', h('a', { href: 'tel:111' }, '111'), ' (Tổng đài quốc gia bảo vệ trẻ em).'),
      h(
        'li',
        null,
        'Nguy hiểm ngay lúc này: đến nơi an toàn gần nhất (cổng trường, nhà hàng xóm, cửa hàng đông người) và gọi ',
        h('a', { href: 'tel:113' }, '113'),
        ' (Công an) hoặc ',
        h('a', { href: 'tel:115' }, '115'),
        ' (Cấp cứu).'
      )
    )
  );
}

export function formatDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return '';
  }
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = (...a) => {
    clearTimeout(t);
    fn(...a);
  };
  return d;
}
