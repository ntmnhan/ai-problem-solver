import { STEPS } from '../config.js';
import * as store from '../store.js';
import { h, icon, btn, formatDate, promptDialog, confirmDialog, toast, clear } from '../ui.js';
import { downloadBackup } from '../actions.js';

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
      list.appendChild(
        h(
          'div',
          { class: 'card empty' },
          icon('chat', 36),
          h('h3', null, 'Em chưa có vấn đề nào'),
          h('p', null, 'Bấm “Vấn đề mới” để bắt đầu. Mình sẽ đi cùng em qua từng bước.')
        )
      );
      return;
    }
    items.forEach((p) => {
      const done = store.stepsDone(p);
      const ns = nextStep(p);
      list.appendChild(
        h(
          'article',
          { class: 'card pb' },
          h('h3', null, p.title),
          h(
            'div',
            { class: 'row' },
            p.data.category ? h('span', { class: 'chip' }, p.data.category) : null,
            h('span', { class: `chip ${done === 6 ? 'ok' : ''}` }, `${done}/6 bước đã hoàn thành`)
          ),
          h('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 6, 'aria-valuenow': done, 'aria-label': 'Tiến trình' }, h('i', { style: `width:${(done / 6) * 100}%` })),
          h('p', { class: 'muted small', style: 'margin:0' }, `Tạo: ${formatDate(p.createdAt)} · Cập nhật: ${formatDate(p.updatedAt)}`),
          h(
            'div',
            { class: 'row' },
            h('a', { class: 'btn btn-primary btn-sm', href: `#/problem/${p.id}/${ns}` }, icon(done === 6 ? 'check' : 'right', 16), h('span', null, done === 6 ? 'Xem lại' : `Tiếp tục bước ${ns}: ${STEPS[ns - 1].short}`)),
            h('a', { class: 'btn btn-sm', href: `#/result/${p.id}` }, icon('file', 16), h('span', null, 'Kết quả')),
            btn('Đổi tên', {
              small: true,
              icon: 'edit',
              onClick: async () => {
                const v = await promptDialog({ title: 'Đổi tên vấn đề', label: 'Tên vấn đề', value: p.title });
                if (v) {
                  store.renameProblem(p.id, v);
                  draw();
                }
              }
            }),
            btn('Xóa', {
              small: true,
              icon: 'trash',
              onClick: async () => {
                const ok = await confirmDialog({
                  title: 'Xóa vấn đề này?',
                  text: `“${p.title}” sẽ bị xóa khỏi thiết bị và không thể khôi phục (trừ khi em có bản sao lưu).`,
                  okLabel: 'Xóa',
                  danger: true
                });
                if (ok) {
                  store.deleteProblem(p.id);
                  toast('Đã xóa vấn đề.', 'ok');
                  draw();
                }
              }
            })
          )
        )
      );
    });
  };

  const greet = prof && prof.name ? `Chào ${prof.name}!` : 'Chào em!';
  root.appendChild(
    h(
      'div',
      null,
      h('div', { class: 'row between', style: 'margin-bottom:12px' },
        h('div', null,
          h('h1', { style: 'margin:0' }, greet),
          h('p', { class: 'muted', style: 'margin:4px 0 0' }, prof && prof.anonymous ? `Chế độ ẩn danh · mã của em: ${prof.code}` : (prof && prof.cls ? `Lớp ${prof.cls}` : 'Hôm nay em muốn cùng mình giải quyết chuyện gì?'))
        ),
        h('button', {
          type: 'button',
          class: 'btn btn-primary',
          id: 'new-problem',
          onClick: () => {
            const p = store.createProblem();
            location.hash = `#/problem/${p.id}/1`;
          }
        }, icon('plus', 18), h('span', null, 'Vấn đề mới'))
      ),
      h('div', { class: 'banner info' }, icon('info', 20), h('div', null,
        'Dữ liệu của em chỉ nằm trên thiết bị này. Nếu đổi máy hoặc xóa dữ liệu trình duyệt, em sẽ mất lịch sử. ',
        h('button', { type: 'button', class: 'chip', style: 'margin-left:4px', onClick: downloadBackup }, 'Tải bản sao lưu')
      )),
      list
    )
  );
  draw();
}
