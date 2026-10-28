// Các thao tác dùng chung: sao lưu, khôi phục, hồ sơ, xóa dữ liệu, tải tệp.
import * as store from './store.js';
import { h, modal, toast, confirmDialog } from './ui.js';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function dateStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function downloadBackup() {
  store.flush();
  const data = JSON.stringify(store.exportAll(), null, 2);
  downloadBlob(new Blob([data], { type: 'application/json' }), `ai-problem-solver-sao-luu-${dateStamp()}.json`);
  toast('Đã tạo tệp sao lưu. Bạn hãy cất tệp ở nơi an toàn nhé.', 'ok');
}

export function pickRestoreFile(onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast('Tệp quá lớn (tối đa 8 MB).', 'error');
      return;
    }
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      const r = store.importAll(obj);
      toast(`Đã khôi phục: thêm ${r.added} vấn đề, cập nhật ${r.updated} vấn đề.`, 'ok');
      if (onDone) onDone();
    } catch (e) {
      toast(e && e.message && !/JSON/.test(e.message) ? e.message : 'Không đọc được tệp sao lưu.', 'error');
    }
  });
  input.click();
}

export function openProfileModal(onSaved) {
  const prof = store.getProfile() || {};
  modal({
    title: 'Mã của bạn',
    body: h('div', null,
      h('p', { style: 'font-size:1.4rem;font-weight:800;margin:4px 0' }, prof.code || '(chưa có)'),
      h('p', { class: 'muted small' }, 'App không hỏi họ tên, lớp khi bạn dùng. Đây là mã ngẫu nhiên, lưu trên thiết bị này và dùng để thống kê ẩn danh. Chỉ khi bạn chọn nhờ thầy cô đồng hành và điền họ tên, lớp thì thầy cô hướng dẫn mới biết bạn là ai.')),
    actions: [{ label: 'Đóng', kind: 'primary', onClick: () => { if (onSaved) onSaved(); } }]
  });
}

export async function deleteEverything(onDone) {
  const ok = await confirmDialog({
    title: 'Xóa toàn bộ dữ liệu?',
    text: 'Tất cả vấn đề và thông tin của bạn trên thiết bị này sẽ bị xóa và không thể khôi phục (trừ khi bạn đã tải bản sao lưu). Bạn chắc chắn chứ?',
    okLabel: 'Xóa hết',
    danger: true
  });
  if (!ok) return;
  store.clearAll();
  toast('Đã xóa dữ liệu trên thiết bị này.', 'ok');
  if (onDone) onDone();
}
