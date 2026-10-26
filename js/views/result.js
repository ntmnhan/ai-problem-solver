import * as store from '../store.js';
import { h, icon, btn, clear, toast } from '../ui.js';
import { buildReportModel, renderReportHTML, exportDocx } from '../export.js';
import { dateStamp } from '../actions.js';

function slug(s) {
  return String(s || 'van-de')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'van-de';
}

export function render(root, params) {
  const p = store.getProblem(params.id);
  if (!p) {
    root.appendChild(h('div', { class: 'card empty' }, icon('alert', 32), h('h2', null, 'Không tìm thấy vấn đề này'), h('a', { class: 'btn btn-primary', href: '#/home' }, 'Về danh sách vấn đề')));
    return;
  }
  const profile = store.getProfile();
  const canShowName = !!(profile && !profile.anonymous && profile.name);
  let showName = canShowName;
  const host = h('div');
  const draw = () => {
    clear(host);
    host.appendChild(renderReportHTML(buildReportModel(p, profile, { showName })));
  };

  const done = store.stepsDone(p);
  const fileBase = `ai-problem-solver-${slug(p.title)}-${dateStamp()}`;

  const pdfBtn = btn('In / Lưu PDF', {
    kind: 'primary', icon: 'print',
    onClick: () => {
      const old = document.title;
      document.title = `${fileBase}`;
      const restore = () => { document.title = old; window.removeEventListener('afterprint', restore); };
      window.addEventListener('afterprint', restore);
      window.print();
      setTimeout(restore, 4000);
    }
  });
  const docxBtn = btn('Tải DOCX', {
    icon: 'download',
    onClick: async () => {
      docxBtn.disabled = true;
      try {
        await exportDocx(buildReportModel(p, profile, { showName }), fileBase);
        toast('Đã tạo tệp DOCX.', 'ok');
      } catch (e) {
        toast(e.message || 'Không tạo được tệp DOCX.', 'error', 5000);
      } finally {
        docxBtn.disabled = false;
      }
    }
  });

  root.appendChild(
    h('div', null,
      h('div', { class: 'no-print' },
        h('div', { class: 'row between', style: 'margin-bottom:12px' },
          h('a', { class: 'btn btn-sm btn-ghost', href: `#/problem/${p.id}/${Math.min(6, Math.max(1, done + 1))}` }, icon('left', 16), h('span', null, 'Quay lại làm tiếp')),
          h('a', { class: 'btn btn-sm btn-ghost', href: '#/home' }, icon('home', 16), h('span', null, 'Vấn đề của em'))),
        done < 6 ? h('div', { class: 'banner info' }, icon('info', 20), h('div', null, `Em mới xác nhận hoàn thành ${done}/6 bước nên báo cáo chỉ có nội dung em đã nhập. Em có thể quay lại làm tiếp bất cứ lúc nào.`)) : null,
        h('div', { class: 'card' },
          h('h2', null, 'Xuất báo cáo'),
          h('div', { class: 'row' }, pdfBtn, docxBtn),
          h('p', { class: 'muted small', style: 'margin:10px 0 0' }, 'Với PDF: trong hộp thoại in, chọn “Lưu dưới dạng PDF” (hoặc “Save as PDF”). Có thể đưa tệp cho thầy cô xem.'),
          canShowName
            ? h('label', { class: 'check' },
              h('input', { type: 'checkbox', checked: true, onChange: (e) => { showName = e.target.checked; draw(); } }),
              h('span', null, 'Ghi họ tên và lớp của em trong báo cáo'))
            : null
        )
      ),
      host
    )
  );
  draw();
}
