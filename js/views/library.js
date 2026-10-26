import { h, icon, clear } from '../ui.js';

export function render(root) {
  const list = h('div', { class: 'doc-list' }, h('p', { class: 'loading' }, 'Đang tải danh sách tài liệu…'));
  root.appendChild(
    h('div', null,
      h('h1', null, 'Kho tài liệu'),
      h('p', { class: 'muted' }, 'Các tài liệu giúp em hiểu cách giải quyết vấn đề và biết tìm ai giúp đỡ.'),
      list)
  );

  (async () => {
    try {
      const res = await fetch('/docs/index.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('no_index');
      const items = await res.json();
      // Chỉ hiển thị tệp thật đang tồn tại.
      const checked = await Promise.all(
        (Array.isArray(items) ? items : []).map(async (it) => {
          try {
            const r = await fetch(it.file, { method: 'HEAD' });
            return r.ok ? it : null;
          } catch (e) {
            return null;
          }
        })
      );
      const ok = checked.filter(Boolean);
      clear(list);
      if (!ok.length) {
        list.appendChild(h('div', { class: 'card empty' }, icon('book', 34), h('p', null, 'Chưa có tài liệu nào.')));
        return;
      }
      ok.forEach((it) =>
        list.appendChild(
          h('a', { class: 'card doc-item', href: it.file, target: '_blank', rel: 'noopener' },
            icon('file', 26),
            h('div', null, h('h3', { style: 'margin:0' }, it.title), h('p', { class: 'muted small', style: 'margin:2px 0 0' }, it.description || '')))
        )
      );
    } catch (e) {
      clear(list);
      list.appendChild(h('div', { class: 'banner error' }, icon('alert', 20), h('div', null, 'Chưa tải được danh sách tài liệu. Em thử lại sau nhé.')));
    }
  })();
}
