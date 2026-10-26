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
  toast('Đã tạo tệp sao lưu. Em hãy cất tệp ở nơi an toàn nhé.', 'ok');
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
  const prof = store.getProfile() || { name: '', cls: '', anonymous: true, code: '' };
  const name = h('input', { type: 'text', class: 'input', maxlength: 60, value: prof.name || '', placeholder: 'Ví dụ: Nguyễn Văn An', autocomplete: 'off' });
  const cls = h('input', { type: 'text', class: 'input', maxlength: 20, value: prof.cls || '', placeholder: 'Ví dụ: 6/6', autocomplete: 'off' });
  const anon = h('input', { type: 'checkbox', checked: !!prof.anonymous });
  const sync = () => {
    name.disabled = cls.disabled = anon.checked;
  };
  anon.addEventListener('change', sync);
  sync();
  modal({
    title: 'Thông tin của em',
    body: h(
      'div',
      null,
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Họ và tên'), name),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Lớp'), cls),
      h('label', { class: 'check' }, anon, h('span', null, 'Dùng chế độ ẩn danh (không ghi tên, lớp)')),
      prof.code ? h('p', { class: 'muted small' }, `Mã ẩn danh của em: ${prof.code}`) : null,
      h('p', { class: 'muted small' }, 'Thông tin này chỉ lưu trên thiết bị của em, không gửi lên máy chủ.')
    ),
    actions: [
      { label: 'Hủy', kind: 'ghost' },
      {
        label: 'Lưu',
        kind: 'primary',
        onClick: () => {
          if (!anon.checked && !name.value.trim()) {
            toast('Em hãy nhập họ tên hoặc chọn chế độ ẩn danh.', 'error');
            return false;
          }
          store.setProfile({ name: name.value, cls: cls.value, anonymous: anon.checked });
          toast('Đã lưu thông tin.', 'ok');
          if (onSaved) onSaved();
        }
      }
    ]
  });
}

export async function deleteEverything(onDone) {
  const ok = await confirmDialog({
    title: 'Xóa toàn bộ dữ liệu?',
    text: 'Tất cả vấn đề và thông tin của em trên thiết bị này sẽ bị xóa và không thể khôi phục (trừ khi em đã tải bản sao lưu). Em chắc chắn chứ?',
    okLabel: 'Xóa hết',
    danger: true
  });
  if (!ok) return;
  store.clearAll();
  toast('Đã xóa dữ liệu trên thiết bị này.', 'ok');
  if (onDone) onDone();
}
