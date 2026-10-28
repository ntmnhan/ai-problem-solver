// Trang quản trị (#/admin): nhóm học sinh hỗ trợ và thầy cô tư vấn xem, lọc, ghi chú, đổi trạng thái và xuất danh sách các vấn đề học sinh đã tự gửi.
import { CATEGORIES } from '../config.js';
import { adminCall } from '../api.js';
import { h, icon, btn, clear, toast, modal, confirmDialog } from '../ui.js';
import { owl, CAT_COLOR } from '../art.js';
import { downloadBackup, pickRestoreFile, deleteEverything } from '../actions.js';

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
  const cols = [['sentAt', 'Gửi lúc'], ['name', 'Họ tên'], ['cls', 'Lớp'], ['code', 'Mã học sinh'], ['category', 'Nhóm'], ['title', 'Tiêu đề'], ['problem', 'Vấn đề'], ['cause', 'Nguyên nhân'], ['goal', 'Kết quả mong muốn'], ['chosen', 'Biện pháp chọn'], ['plan', 'Kế hoạch'], ['happy', 'Hài lòng'], ['satisfaction', 'Điểm'], ['final', 'Nhận xét'], ['risk', 'Rủi ro'], ['status', 'Trạng thái'], ['note', 'Ghi chú xử lý']];
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
  let role = '';
  let summary = null;
  const f = { q: '', cat: '', risk: '', status: '' };

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
    }, owl({ size: 72, mood: 'think' }), h('h2', null, 'Khu vực quản trị'), pw, err,
      h('p', { class: 'muted small', style: 'margin:0' }, 'Mật khẩu học sinh: chỉ xem thống kê. Mật khẩu thầy cô: xem nội dung và xử lý các ca.'),
      btn('Đăng nhập', { kind: 'primary', type: 'submit', icon: 'lock' })));
    pw.focus();
  }

  async function load() {
    clear(host);
    host.appendChild(h('p', { class: 'muted ad-wait' }, 'Đang tải…'));
    try {
      const r = await adminCall(pass, { action: 'list' });
      role = r.role === 'student' ? 'student' : 'teacher';
      items = Array.isArray(r.items) ? r.items : [];
      summary = r.summary || null;
      savePass(pass);
      if (role === 'student') studentView(); else listView();
    } catch (e) {
      if (e.code === 'unauthorized') { pass = ''; savePass(''); loginView(e.message); } else if (e.code === 'not_configured' || e.code === 'locked') loginView(e.message);
      else {
        clear(host);
        host.appendChild(h('div', { class: 'banner error' }, icon('alert', 20), h('div', null, e.message || 'Có lỗi xảy ra.'), btn('Thử lại', { small: true, onClick: load })));
      }
    }
  }

  const filtered = () => items.filter((it) => {
    if (f.cat && it.category !== f.cat) return false;
    if (f.risk && (it.risk === 'concern' ? 'yes' : 'no') !== f.risk) return false;
    if (f.status && it.status !== f.status) return false;
    if (f.q) {
      const hay = [it.name, it.cls, it.code, it.title, it.problem, it.final, it.note].join(' ').toLowerCase();
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

  // Dữ liệu lưu trên thiết bị đang dùng (chỉ hiện sau khi đăng nhập Admin)
  function deviceData() {
    return h('details', { class: 'gd', id: 'ad-device' },
      h('summary', null, h('span', null, 'Dữ liệu trên thiết bị này'), icon('down', 18)),
      h('div', { class: 'gd-body' },
        h('p', { class: 'muted small', style: 'margin-top:0' }, 'Chỉ tác động đến dữ liệu của học sinh lưu trên máy đang mở trang này, không ảnh hưởng dữ liệu thống kê.'),
        h('div', { class: 'row' },
          Object.assign(btn('Tải bản sao lưu', { small: true, icon: 'download', onClick: downloadBackup }), { id: 'ad-backup' }),
          Object.assign(btn('Khôi phục từ tệp', { small: true, icon: 'upload', onClick: () => pickRestoreFile(() => {}) }), { id: 'ad-restore' }),
          Object.assign(btn('Xóa toàn bộ dữ liệu', { small: true, icon: 'trash', onClick: () => deleteEverything(() => {}) }), { id: 'ad-wipe' }))));
  }

  function listView() {
    clear(host);
    statsEl = h('div', { class: 'ad-stats' });
    listEl = h('div', { class: 'ad-list' });
    host.append(
      h('div', { class: 'row between ad-head' },
        h('h2', { style: 'margin:0' }, 'Thống kê và các ca học sinh gửi thầy cô'),
        h('div', { class: 'row' },
          btn('Tải CSV (mở bằng Excel)', { small: true, icon: 'download', onClick: () => exportCsv(filtered()) }),
          btn('Làm mới', { small: true, icon: 'refresh', onClick: load }),
          btn('Thoát', { small: true, onClick: () => { pass = ''; savePass(''); items = []; loginView(); } }))),
      h('div', { class: 'admin-note', id: 'ad-explain' },
        h('b', null, 'Thống kê và danh sách khác nhau thế nào? '),
        'Thống kê bên dưới tính MỌI lượt tư vấn đã hoàn thành Bước 6 (toàn bộ dữ liệu cũ và mới) (ẩn danh, không có nội dung). Danh sách các ca chỉ gồm những bạn TỰ NGUYỆN nhờ thầy cô đồng hành: bạn điền họ tên, lớp, tick đồng ý và bấm “Gửi cho thầy cô”. Chỉ thầy cô có mật khẩu này thấy họ tên, lớp và nội dung. Một vấn đề gửi lại nhiều lần chỉ tính 1 ca. “Lượt truy cập” ở chân trang chỉ đếm lượt mở website.'),
      statsEl,
      deviceData(),
      h('div', { class: 'ad-filters' },
        h('input', { type: 'search', class: 'input', placeholder: 'Tìm theo tên, lớp, mã, nội dung…', 'aria-label': 'Tìm kiếm', onInput: (e) => { f.q = e.target.value; drawList(); } }),
        select('Mọi nhóm', 'cat', CATEGORIES.map((c) => [c, c])),
        select('Mọi mức rủi ro', 'risk', [['yes', 'Cần chú ý'], ['no', 'Bình thường']]),
        select('Mọi trạng thái', 'status', STATUSES.map((c) => [c, c]))),
      listEl);
    drawList();
  }

  // Khối thống kê tổng hợp (chung cho học sinh và thầy cô): chỉ số liệu, không mã/họ tên/nội dung
  function statsBlock(s, opts) {
    opts = opts || {};
    s = s || { total: 0, shared: 0, byStatus: {}, byCategory: {}, steps: [], satisfaction: {}, happy: {}, last14: [] };
    const chip = (n, t, cls) => h('div', { class: 'ad-chip ' + (cls || '') }, h('b', null, String(n)), h('span', null, t));
    const bars = (label, rows, color) => {
      const max = Math.max(1, ...rows.map((r) => r[1]));
      return h('div', { class: 'ad-bars', 'aria-label': label },
        rows.map(([t, n]) => h('div', { class: 'ad-bar' }, h('span', { class: 'lbl' }, t), h('span', { class: 'track' }, h('span', { class: 'fill', style: `width:${(n / max) * 100}%;background:${color(t)}` })), h('b', null, String(n)))));
    };
    const stepsRows = (s.steps || []).map((n, i) => [i === 6 ? 'Xong 6/6 bước' : `Xong ${i}/6 bước`, n]);
    const dayRows = (s.daily || s.last14 || []).map((d) => [d.d.slice(8, 10) + '/' + d.d.slice(5, 7), d.n]);
    const w = s.window;
    const dm = (d) => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
    return h('div', { id: 'ad-stats-block' },
      w ? h('p', { class: 'muted', id: 'ad-window' }, w.limited ? `Số liệu ${w.days} ngày: từ ${dm(w.from)} đến ${dm(w.to)}.` : `Số liệu toàn bộ (dữ liệu cũ và mới). Biểu đồ theo ngày: ${w.days} ngày, từ ${dm(w.from)} đến ${dm(w.to)}.`) : null,
      h('div', { class: 'ad-stats', id: 'ad-student-stats' },
        chip(s.total || 0, 'Tổng lượt tư vấn'), chip(s.shared || 0, 'Gửi thầy cô'), chip((s.byStatus || {})['Mới'] || 0, 'Mới', 'new'), chip((s.byStatus || {})['Đang hỗ trợ'] || 0, 'Đang hỗ trợ'), chip((s.byStatus || {})['Đã xong'] || 0, 'Đã xong', 'ok'),
        chip(s.concernOpen || 0, 'Cần thầy cô chú ý', s.concernOpen ? 'risk' : ''),
        chip(s.satisfaction && s.satisfaction.avg != null ? s.satisfaction.avg + '/5' : '–', 'Điểm hài lòng trung bình'),
        chip(((s.happy || {}).yes || 0) + ' / ' + ((s.happy || {}).no || 0), 'Hài lòng / Chưa hài lòng')),
      h('h3', null, 'Số lượt theo nhóm vấn đề'), bars('Số lượt theo nhóm', Object.entries(s.byCategory || {}), (t) => CAT_COLOR[t] || '#64748b'),
      opts.noSteps ? null : h('h3', null, 'Các bạn đã làm đến đâu'), opts.noSteps ? null : bars('Tiến độ', stepsRows, () => '#3b82f6'),
      h('h3', null, `Số lượt theo ngày${w ? ` (${w.days} ngày từ ${dm(w.from)})` : ''}`), bars('Theo ngày', dayRows, () => '#10b981'));
  }

  // Quyền HỌC SINH: chỉ có số liệu tổng hợp do máy chủ tính; không có mã, tiêu đề hay nội dung của ca nào
  function studentView() {
    clear(host);
    const s = summary || { total: 0, byStatus: {}, byCategory: {}, steps: [], satisfaction: {}, happy: {}, last14: [] };
    host.append(
      h('div', { class: 'row between ad-head' },
        h('h2', { style: 'margin:0' }, 'Thống kê (quyền học sinh)'),
        h('div', { class: 'row' },
          btn('Làm mới', { small: true, icon: 'refresh', onClick: load }),
          btn('Thoát', { small: true, onClick: () => { pass = ''; savePass(''); summary = null; loginView(); } }))),
      h('div', { class: 'banner info', id: 'ad-student-note' }, icon('shield', 20),
        h('div', null, 'Bạn đang xem thống kê tổng hợp. Họ tên, lớp và nội dung các ca chỉ thầy cô hướng dẫn xem và xử lý được. Nếu thấy có ca cần thầy cô chú ý, hãy báo thầy cô tư vấn, không tìm hiểu hay bàn tán.')),
      h('div', { class: 'admin-note', id: 'ad-explain' },
        h('b', null, 'Số liệu này tính thế nào? '),
        'Mỗi lượt tư vấn được ghi nhận ẩn danh khi một bạn hoàn thành Bước 6 (không có tên, lớp hay nội dung). “Gửi thầy cô” là số bạn tự nguyện nhờ thầy cô đồng hành. “Lượt truy cập” ở chân trang chỉ đếm lượt mở website.'),
      statsBlock(s, { noSteps: true }),
      deviceData());
  }

  function drawStats() {
    clear(statsEl);
    statsEl.appendChild(statsBlock(summary));
  }

  function drawList() {
    drawStats();
    clear(listEl);
    const rows = filtered();
    if (!rows.length) {
      listEl.appendChild(h('div', { class: 'card empty' }, h('p', null, items.length ? 'Không có vấn đề nào khớp bộ lọc.' : 'Chưa có bạn nào nhờ thầy cô đồng hành.')));
      return;
    }
    rows.forEach((it) => {
      listEl.appendChild(h('button', { type: 'button', class: `ad-row ${it.risk === 'concern' ? 'risk' : ''}`, onClick: () => openCase(it) },
        h('span', { class: 'who' }, h('b', null, [it.name, it.cls].filter(Boolean).join(' · ') || it.code || 'Ẩn danh'), it.name && it.code ? h('span', { class: 'muted small' }, ' ' + it.code) : null),
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
    const note = h('textarea', { class: 'input', id: 'ad-note', rows: 3, maxlength: 1000, placeholder: 'Ghi chú xử lý (chỉ người quản trị thấy; không ghi tên, thông tin riêng tư)', 'aria-label': 'Ghi chú xử lý' });
    note.value = it.note || '';
    const line = (label, v) => (v ? h('div', { class: 'ad-field' }, h('b', null, label), h('p', null, v)) : null);
    const body = h('div', { class: 'ad-detail' },
      it.risk === 'concern' ? h('div', { class: 'banner warn' }, icon('alert', 18), h('div', null, 'Nội dung có dấu hiệu cần quan tâm. Hãy báo ngay cho thầy cô tư vấn; các bạn không tự xử lý và không kể lại cho người khác.')) : null,
      h('p', { class: 'muted small' }, [it.name, it.cls].filter(Boolean).join(' · ') + (it.name ? ' · ' : '') + (it.code || 'Ẩn danh') + ' · gửi ' + fmt(it.sentAt) + ' · đã làm ' + (it.stepsDone || 0) + '/6 bước'),
      line('Vấn đề', it.problem), line('Nguyên nhân bạn nghĩ', it.cause), line('Kết quả bạn mong muốn', it.goal),
      line('Biện pháp bạn chọn', it.chosen), line('Lý do chọn', it.reason), line('Kế hoạch thực hiện', it.plan),
      line('Bạn có hài lòng không?', it.happy), it.satisfaction ? line('Điểm bạn cho', it.satisfaction + '/5') : null,
      line('Nhận xét của bạn', it.final),
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
