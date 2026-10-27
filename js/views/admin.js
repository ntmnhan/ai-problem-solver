// Trang quản trị (#/admin): thầy cô xem, lọc, ghi chú, đổi trạng thái và xuất danh sách các vấn đề học sinh đã tự gửi.
import { CATEGORIES } from '../config.js';
import { adminCall } from '../api.js';
import { h, icon, btn, clear, toast, modal, confirmDialog } from '../ui.js';
import { owl, CAT_COLOR } from '../art.js';

const STATUSES = ['Mới', 'Đang hỗ trợ', 'Đã xong'];
const KEY = 'aips:admin-pass';

function savedPass() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
function savePass(v) { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch (e) { /* bỏ qua */ } }
const fmt = (t) => (t ? new Date(Number(t)).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '');

function csvCell(v) {
  let s = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function exportCsv(items) {
  const cols = [['sentAt', 'Gửi lúc'], ['name', 'Họ tên'], ['cls', 'Lớp'], ['school', 'Trường'], ['category', 'Nhóm'], ['title', 'Tiêu đề'], ['problem', 'Vấn đề'], ['cause', 'Nguyên nhân'], ['goal', 'Kết quả mong muốn'], ['chosen', 'Biện pháp chọn'], ['plan', 'Kế hoạch'], ['happy', 'Hài lòng'], ['satisfaction', 'Điểm'], ['final', 'Nhận xét'], ['risk', 'Rủi ro'], ['status', 'Trạng thái'], ['note', 'Ghi chú xử lý']];
  const lines = [cols.map((c) => csvCell(c[1])).join(',')];
  items.forEach((it) => lines.push(cols.map(([k]) => csvCell(k === 'sentAt' ? fmt(it[k]) : k === 'risk' ? (it[k] === 'concern' ? 'Cần chú ý' : '') : it[k])).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'van-de-hoc-sinh-' + new Date().toISOString().slice(0, 10) + '.csv' });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function render(root) {
  let pass = savedPass();
  let items = [];
  const f = { q: '', cls: '', cat: '', risk: '', status: '' };

  const host = h('div', { class: 'admin' });
  root.appendChild(host);

  function loginView(msg) {
    clear(host);
    const pw = h('input', { type: 'password', class: 'input', id: 'ad-pass', placeholder: 'Mật khẩu quản trị', 'aria-label': 'Mật khẩu quản trị', autocomplete: 'current-password' });
    const err = h('p', { class: 'ad-err', role: 'alert' }, msg || '');
    host.appendChild(h('form', {
      class: 'card ad-login',
      onSubmit: async (e) => {
        e.preventDefault();
        pass = pw.value;
        err.textContent = '';
        await load();
      }
    }, owl({ size: 72, mood: 'think' }), h('h2', null, 'Khu vực dành cho thầy cô'), pw, err, btn('Đăng nhập', { kind: 'primary', type: 'submit', icon: 'lock' })));
    pw.focus();
  }

  async function load() {
    clear(host);
    host.appendChild(h('p', { class: 'muted ad-wait' }, 'Đang tải…'));
    try {
      const r = await adminCall(pass, { action: 'list' });
      items = Array.isArray(r.items) ? r.items : [];
      savePass(pass);
      listView();
    } catch (e) {
      if (e.code === 'unauthorized') { pass = ''; savePass(''); loginView(e.message); } else if (e.code === 'not_configured' || e.code === 'locked') loginView(e.message);
      else {
        clear(host);
        host.appendChild(h('div', { class: 'banner error' }, icon('alert', 20), h('div', null, e.message || 'Có lỗi xảy ra.'), btn('Thử lại', { small: true, onClick: load })));
      }
    }
  }

  const filtered = () => items.filter((it) => {
    if (f.cls && String(it.cls || '').trim().toLowerCase() !== f.cls) return false;
    if (f.cat && it.category !== f.cat) return false;
    if (f.risk && (it.risk === 'concern' ? 'yes' : 'no') !== f.risk) return false;
    if (f.status && it.status !== f.status) return false;
    if (f.q) {
      const hay = [it.name, it.cls, it.school, it.title, it.problem, it.final, it.note].join(' ').toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  });

  function select(label, key, opts) {
    const s = h('select', { class: 'input', 'aria-label': label, onChange: (e) => { f[key] = e.target.value; drawList(); } },
      h('option', { value: '' }, label), ...opts.map(([v, t]) => h('option', { value: v, selected: f[key] === v }, t)));
    return s;
  }

  let listEl;
  let statsEl;

  function listView() {
    clear(host);
    const classes = [...new Set(items.map((i) => String(i.cls || '').trim()).filter(Boolean))].sort();
    statsEl = h('div', { class: 'ad-stats' });
    listEl = h('div', { class: 'ad-list' });
    host.append(
      h('div', { class: 'row between ad-head' },
        h('h2', { style: 'margin:0' }, 'Vấn đề học sinh đã gửi'),
        h('div', { class: 'row' },
          btn('Tải CSV (mở bằng Excel)', { small: true, icon: 'download', onClick: () => exportCsv(filtered()) }),
          btn('Làm mới', { small: true, icon: 'refresh', onClick: load }),
          btn('Thoát', { small: true, onClick: () => { pass = ''; savePass(''); items = []; loginView(); } }))),
      h('div', { class: 'admin-note', id: 'ad-explain' },
        h('b', null, 'Vì sao số ca ở đây ít hơn số học sinh đã dùng? '),
        'Mỗi dòng là một vấn đề mà học sinh TỰ NGUYỆN gửi: các em phải làm đến trang cuối của Bước 6, tick “Em đồng ý gửi” rồi bấm Gửi. Những trường hợp KHÔNG có trong danh sách: em chỉ dùng thử hoặc dừng giữa chừng; em không tick đồng ý hoặc chọn “Xong bước này” mà không gửi; em gửi nhưng mất mạng hoặc gặp lỗi (app có báo lỗi để em thử lại); em dùng trình duyệt ẩn danh hoặc xóa dữ liệu trước khi gửi. Một vấn đề gửi lại nhiều lần chỉ tính 1 ca (được cập nhật). “Lượt truy cập” ở chân trang chỉ đếm lượt mở website, không phải số ca.'),
      statsEl,
      h('div', { class: 'ad-filters' },
        h('input', { type: 'search', class: 'input', placeholder: 'Tìm theo tên, lớp, nội dung…', 'aria-label': 'Tìm kiếm', onInput: (e) => { f.q = e.target.value; drawList(); } }),
        select('Mọi lớp', 'cls', classes.map((c) => [c.toLowerCase(), c])),
        select('Mọi nhóm', 'cat', CATEGORIES.map((c) => [c, c])),
        select('Mọi mức rủi ro', 'risk', [['yes', 'Cần chú ý'], ['no', 'Bình thường']]),
        select('Mọi trạng thái', 'status', STATUSES.map((c) => [c, c]))),
      listEl);
    drawList();
  }

  function drawStats() {
    clear(statsEl);
    const total = items.length;
    const by = (s) => items.filter((i) => i.status === s).length;
    const risk = items.filter((i) => i.risk === 'concern' && i.status !== 'Đã xong').length;
    const chip = (n, t, cls) => h('div', { class: 'ad-chip ' + (cls || '') }, h('b', null, String(n)), h('span', null, t));
    statsEl.append(chip(total, 'Tổng số'), chip(by('Mới'), 'Mới', 'new'), chip(by('Đang hỗ trợ'), 'Đang hỗ trợ'), chip(by('Đã xong'), 'Đã xong', 'ok'), chip(risk, 'Cần chú ý', risk ? 'risk' : ''));
    const max = Math.max(1, ...CATEGORIES.map((c) => items.filter((i) => i.category === c).length));
    statsEl.appendChild(h('div', { class: 'ad-bars', 'aria-label': 'Số ca theo nhóm vấn đề' },
      CATEGORIES.map((c) => {
        const n = items.filter((i) => i.category === c).length;
        return h('div', { class: 'ad-bar' }, h('span', { class: 'lbl' }, c), h('span', { class: 'track' }, h('span', { class: 'fill', style: `width:${(n / max) * 100}%;background:${CAT_COLOR[c]}` })), h('b', null, String(n)));
      })));
  }

  function drawList() {
    drawStats();
    clear(listEl);
    const rows = filtered();
    if (!rows.length) {
      listEl.appendChild(h('div', { class: 'card empty' }, h('p', null, items.length ? 'Không có vấn đề nào khớp bộ lọc.' : 'Chưa có học sinh nào gửi vấn đề.')));
      return;
    }
    rows.forEach((it) => {
      listEl.appendChild(h('button', { type: 'button', class: `ad-row ${it.risk === 'concern' ? 'risk' : ''}`, onClick: () => openCase(it) },
        h('span', { class: 'who' }, h('b', null, it.name || 'Ẩn danh'), h('span', { class: 'muted small' }, [it.cls, it.school].filter(Boolean).join(' · '))),
        h('span', { class: 'ttl' }, it.title || it.problem),
        h('span', { class: 'meta' },
          h('span', { class: 'tag', style: `--c:${CAT_COLOR[it.category] || '#64748b'}` }, it.category || 'Khác'),
          it.risk === 'concern' ? h('span', { class: 'tag danger' }, 'Cần chú ý') : null,
          h('span', { class: `tag st-${STATUSES.indexOf(it.status)}` }, it.status || 'Mới'),
          h('span', { class: 'muted small' }, fmt(it.updatedAt || it.sentAt)))));
    });
  }

  function openCase(it) {
    const sel = h('select', { class: 'input', id: 'ad-status', 'aria-label': 'Trạng thái' }, STATUSES.map((s) => h('option', { value: s, selected: (it.status || 'Mới') === s }, s)));
    const note = h('textarea', { class: 'input', id: 'ad-note', rows: 3, maxlength: 1000, placeholder: 'Ghi chú xử lý (chỉ thầy cô thấy)', 'aria-label': 'Ghi chú xử lý' });
    note.value = it.note || '';
    const line = (label, v) => (v ? h('div', { class: 'ad-field' }, h('b', null, label), h('p', null, v)) : null);
    const body = h('div', { class: 'ad-detail' },
      it.risk === 'concern' ? h('div', { class: 'banner warn' }, icon('alert', 18), h('div', null, 'Nội dung có dấu hiệu cần quan tâm. Thầy cô nên trò chuyện trực tiếp với em.')) : null,
      h('p', { class: 'muted small' }, [it.name || 'Ẩn danh', it.cls, it.school].filter(Boolean).join(' · ') + ' · gửi ' + fmt(it.sentAt) + ' · đã làm ' + (it.stepsDone || 0) + '/6 bước'),
      line('Vấn đề', it.problem), line('Nguyên nhân em nghĩ', it.cause), line('Kết quả em mong muốn', it.goal),
      line('Biện pháp em chọn', it.chosen), line('Lý do chọn', it.reason), line('Kế hoạch thực hiện', it.plan),
      line('Em có hài lòng không?', it.happy), it.satisfaction ? line('Điểm em cho', it.satisfaction + '/5') : null,
      line('Nhận xét của em', it.final),
      h('label', { class: 'fld-cap', for: 'ad-status' }, 'Trạng thái'), sel, h('label', { class: 'fld-cap', for: 'ad-note' }, 'Ghi chú xử lý'), note);
    modal({
      title: it.title || 'Vấn đề của học sinh', body, wide: true,
      actions: [
        { label: 'Xóa', kind: 'danger', onClick: async () => {
          const ok = await confirmDialog({ title: 'Xóa vấn đề này?', text: 'Dữ liệu sẽ bị xóa khỏi bảng tính, không khôi phục được.', okLabel: 'Xóa', danger: true });
          if (!ok) return false;
          try { await adminCall(pass, { action: 'delete', id: it.id }); items = items.filter((x) => x.id !== it.id); toast('Đã xóa.', 'ok'); drawList(); } catch (e) { toast(e.message, 'error', 5000); }
          return false;
        } },
        { label: 'Đóng' },
        { label: 'Lưu', kind: 'primary', onClick: async () => {
          try {
            await adminCall(pass, { action: 'update', id: it.id, status: sel.value, note: note.value });
            it.status = sel.value; it.note = note.value; it.updatedAt = Date.now();
            toast('Đã lưu.', 'ok');
            drawList();
          } catch (e) { toast(e.message, 'error', 5000); return false; }
        } }
      ]
    });
  }

  if (pass) load(); else loginView();
}
