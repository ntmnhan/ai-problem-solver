import { STEPS } from '../config.js';
import * as store from '../store.js';
import { h, icon, btn, formatDate, promptDialog, confirmDialog, toast, clear } from '../ui.js';
import { owl, badge, CAT_ICON, CAT_COLOR } from '../art.js';

function nextStep(p) {
  for (let i = 1; i <= 6; i++) if (p.steps[i].status !== 'done') return i;
  return 6;
}

export function render(root) {
  const prof = store.getProfile();
  const list = h('div', { class: 'pb-list' });

  const draw = () => {
    clear(list);
    const items = store.listProblems();
    if (!items.length) {
      list.appendChild(h('div', { class: 'card empty' }, owl({ size: 96, mood: 'think' }),
        h('h3', null, 'Em chưa có vấn đề nào'),
        h('p', null, 'Bấm “Vấn đề mới” để bắt đầu. Mình sẽ đi cùng em qua từng bước.')));
      return;
    }
    items.forEach((p) => {
      const done = store.stepsDone(p);
      const ns = nextStep(p);
      const cat = p.data.category;
      list.appendChild(
        h('article', { class: 'card pb' },
          h('div', { class: 'pb-head' },
            badge(CAT_ICON[cat] || 'chat', CAT_COLOR[cat] || '#3b82f6', 44),
            h('div', { class: 'pb-info' },
              h('h3', null, p.title),
              h('p', { class: 'muted small' }, `${cat ? cat + ' · ' : ''}Cập nhật ${formatDate(p.updatedAt)}`))),
          h('div', { class: 'pb-prog' },
            h('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 6, 'aria-valuenow': done, 'aria-label': 'Tiến trình' }, h('i', { style: `width:${(done / 6) * 100}%` })),
            h('span', { class: `chip ${done === 6 ? 'ok' : ''}` }, `${done}/6 bước đã hoàn thành`)),
          h('div', { class: 'pb-actions' },
            h('a', { class: 'btn btn-primary', href: `#/problem/${p.id}/${ns}` }, icon(done === 6 ? 'check' : 'right', 18), h('span', null, done === 6 ? 'Xem lại' : `Tiếp tục bước ${ns}`)),
            h('a', { class: 'icon-btn', href: `#/result/${p.id}`, 'aria-label': 'Kết quả', title: 'Kết quả' }, icon('file', 18)),
            h('button', {
              type: 'button', class: 'icon-btn', 'aria-label': 'Đổi tên', title: 'Đổi tên',
              onClick: async () => {
                const v = await promptDialog({ title: 'Đổi tên vấn đề', label: 'Tên vấn đề', value: p.title });
                if (v) { store.renameProblem(p.id, v); draw(); }
              }
            }, icon('edit', 18)),
            h('button', {
              type: 'button', class: 'icon-btn', 'aria-label': 'Xóa', title: 'Xóa',
              onClick: async () => {
                const ok = await confirmDialog({
                  title: 'Xóa vấn đề này?',
                  text: `“${p.title}” sẽ bị xóa khỏi thiết bị và không thể khôi phục (trừ khi em có bản sao lưu).`,
                  okLabel: 'Xóa', danger: true
                });
                if (ok) { store.deleteProblem(p.id); toast('Đã xóa vấn đề.', 'ok'); draw(); }
              }
            }, icon('trash', 18))))
      );
    });
  };

  const greet = prof && prof.name ? `Chào ${prof.name}!` : 'Chào em!';
  root.appendChild(
    h('div', { class: 'home' },
      h('div', { class: 'home-hero' },
        owl({ size: 84, mood: 'wave' }),
        h('div', { class: 'home-hello' },
          h('h1', null, greet),
          h('p', { class: 'muted' }, prof && prof.anonymous ? `Chế độ ẩn danh · mã của em: ${prof.code}` : (prof && prof.cls ? `Lớp ${prof.cls} · Hôm nay em muốn gỡ rối chuyện gì?` : 'Hôm nay em muốn gỡ rối chuyện gì?'))),
        h('button', {
          type: 'button', class: 'btn btn-primary', id: 'new-problem',
          onClick: () => { const p = store.createProblem(); location.hash = `#/problem/${p.id}/1`; }
        }, icon('plus', 18), h('span', null, 'Vấn đề mới'))),
      list
    )
  );
  draw();
}
