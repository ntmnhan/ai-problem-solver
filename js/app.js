// Điểm vào: router theo hash, thanh đầu trang + menu, chân trang (bộ đếm, đánh giá, sáng/tối).
import { CONFIG } from './config.js';
import * as store from './store.js';
import * as voice from './voice.js';
import { getStats, postVisit, sendFeedback } from './api.js';
import { h, clear, icon, btn, toast, modal, closeModal } from './ui.js';
import { downloadBackup, pickRestoreFile, openProfileModal, deleteEverything } from './actions.js';
import * as start from './views/start.js';
import * as home from './views/home.js';
import * as problem from './views/problem.js';
import * as result from './views/result.js';
import * as library from './views/library.js';
import * as qr from './views/qr.js';
import * as info from './views/info.js';

store.load();

const headerEl = document.getElementById('header');
const footerEl = document.getElementById('footer');
const appEl = document.getElementById('app');

let cleanup = null;
let menuOpen = false;
let stats = { loading: true };
let currentPath = '';

// ---------- Giao diện sáng/tối ----------
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('aips:theme', next); } catch (e) { /* không lưu được */ }
  renderHeader();
  renderFooter();
}

// ---------- Header + menu ----------
function closeMenu() {
  if (menuOpen) {
    menuOpen = false;
    renderHeader();
  }
}

function menuItem(label, ic, onClick, extra = {}) {
  return h(extra.href ? 'a' : 'button', Object.assign({ type: extra.href ? null : 'button', role: 'menuitem', class: extra.cls || '', href: extra.href || null }, { onClick: (e) => { menuOpen = false; renderHeader(); if (onClick) onClick(e); } }), icon(ic, 20), h('span', null, label));
}

function saveChip() {
  const s = store.getStatus();
  if (s === 'idle') return null;
  const label = s === 'saving' ? 'Đang lưu…' : s === 'saved' ? 'Đã lưu' : 'Lưu thất bại';
  const chip = h('button', {
    type: 'button', id: 'save-chip', class: `save-chip ${s}`, role: 'status',
    title: s === 'failed' ? 'Không lưu được vào thiết bị. Bấm để tải bản sao lưu.' : label,
    onClick: s === 'failed' ? downloadBackup : null
  }, h('span', { class: 'sd' }), h('span', { class: 't' }, s === 'failed' ? 'Lưu thất bại. Tải sao lưu' : label));
  chip.style.cursor = s === 'failed' ? 'pointer' : 'default';
  return chip;
}

function renderHeader() {
  const hasProfile = !!store.getProfile();
  clear(headerEl);
  const menu = h('div', { class: 'menu', role: 'menu', id: 'main-menu' },
    menuItem('Vấn đề của em', 'home', null, { href: '#/home', cls: currentPath === 'home' ? 'active' : '' }),
    menuItem('Kho tài liệu', 'book', null, { href: '#/library', cls: currentPath === 'library' ? 'active' : '' }),
    menuItem('Mã QR chia sẻ', 'qr', null, { href: '#/qr', cls: currentPath === 'qr' ? 'active' : '' }),
    hasProfile ? menuItem('Thông tin của em', 'user', () => openProfileModal(() => route())) : null,
    h('hr'),
    hasProfile ? menuItem('Tải bản sao lưu', 'download', downloadBackup) : null,
    menuItem('Khôi phục từ tệp', 'upload', () => pickRestoreFile(() => route())),
    h('hr'),
    menuItem('Quyền riêng tư và dữ liệu', 'shield', null, { href: '#/privacy', cls: currentPath === 'privacy' ? 'active' : '' }),
    menuItem('Giới thiệu', 'info', null, { href: '#/about', cls: currentPath === 'about' ? 'active' : '' }),
    hasProfile ? h('hr') : null,
    hasProfile ? menuItem('Xóa toàn bộ dữ liệu', 'trash', () => deleteEverything(() => { location.hash = '#/start'; route(); }), { cls: 'danger' }) : null
  );
  headerEl.appendChild(
    h('div', { class: 'header-in' },
      h('a', { class: 'brand', href: hasProfile ? '#/home' : '#/start', 'aria-label': `${CONFIG.name} - trang chủ` },
        h('img', { src: '/assets/logo.svg', alt: '' }), h('span', null, CONFIG.name)),
      h('span', { class: 'header-spacer' }),
      saveChip(),
      h('button', { type: 'button', class: 'icon-btn', id: 'theme-btn', 'aria-label': currentTheme() === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối', title: 'Sáng / tối', onClick: toggleTheme }, icon(currentTheme() === 'dark' ? 'sun' : 'moon', 20)),
      h('div', { class: 'menu-wrap' },
        h('button', {
          type: 'button', class: 'icon-btn', id: 'menu-btn', 'aria-label': 'Mở menu', 'aria-haspopup': 'menu', 'aria-expanded': menuOpen ? 'true' : 'false', 'aria-controls': 'main-menu',
          onClick: (e) => { e.stopPropagation(); menuOpen = !menuOpen; renderHeader(); if (menuOpen) { const f = headerEl.querySelector('.menu a, .menu button'); f && f.focus(); } }
        }, icon(menuOpen ? 'x' : 'menu', 22)),
        menuOpen ? menu : null)
    )
  );
}

document.addEventListener('click', (e) => {
  if (menuOpen && !e.target.closest('.menu-wrap')) closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuOpen) {
    closeMenu();
    const b = document.getElementById('menu-btn');
    b && b.focus();
  }
});

store.onStatus(() => {
  const chip = document.getElementById('save-chip');
  const s = store.getStatus();
  if (s === 'failed') toast('Không lưu được vào thiết bị (bộ nhớ đầy hoặc bị chặn). Em hãy tải bản sao lưu.', 'error', 6000);
  if (chip || s !== 'idle') renderHeader();
});

// ---------- Footer: bộ đếm, đánh giá, sáng/tối ----------
function stars(avg) {
  const full = Math.round(avg);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

function renderFooter() {
  clear(footerEl);
  let counter;
  let rating;
  if (stats.loading) {
    counter = h('span', { class: 'stat' }, 'Đang tải số liệu…');
    rating = null;
  } else if (stats.configured === false) {
    counter = h('span', { class: 'stat', title: 'Cần cấu hình Google Apps Script để đếm bền vững' }, 'Bộ đếm chưa được cấu hình');
    rating = h('span', { class: 'stat' }, 'Chưa có dữ liệu đánh giá');
  } else if (stats.error) {
    counter = h('span', { class: 'stat' }, 'Chưa tải được bộ đếm');
    rating = null;
  } else {
    counter = h('span', { class: 'stat' }, icon('user', 16), 'Lượt truy cập: ', h('b', { id: 'visit-count' }, Number(stats.visits || 0).toLocaleString('vi-VN')));
    rating = stats.ratingCount > 0
      ? h('span', { class: 'stat', id: 'rating-summary' }, h('span', { class: 'stars', 'aria-hidden': 'true' }, stars(stats.ratingAvg)), h('b', null, String(stats.ratingAvg).replace('.', ',')), `/5 (${stats.ratingCount} đánh giá)`)
      : h('span', { class: 'stat', id: 'rating-summary' }, 'Chưa có dữ liệu đánh giá');
  }
  const canFeedback = !stats.loading && stats.configured !== false;
  footerEl.appendChild(
    h('div', { class: 'footer-in' },
      h('div', { class: 'footer-row' }, counter, rating),
      h('div', { class: 'footer-row' },
        btn('Đánh giá và góp ý', { small: true, icon: 'star', disabled: !canFeedback, title: canFeedback ? '' : 'Chức năng này chưa được cấu hình', onClick: openFeedback }),
        btn(currentTheme() === 'dark' ? 'Nền sáng' : 'Nền tối', { small: true, icon: currentTheme() === 'dark' ? 'sun' : 'moon', onClick: toggleTheme })),
      h('div', { class: 'footer-row muted small' },
        h('span', null, `${CONFIG.name} · Phiên bản ${CONFIG.version} · Cập nhật ${CONFIG.releaseDate}`, CONFIG.teamName ? ` · ${CONFIG.teamName}` : ''),
        h('span', null, h('a', { href: '#/privacy' }, 'Quyền riêng tư'), ' · ', h('a', { href: '#/about' }, 'Giới thiệu'))),
      h('div', { class: 'muted small' }, CONFIG.slogan)
    )
  );
}

function openFeedback() {
  let rating = 0;
  const starsEl = h('div', { class: 'star-pick', role: 'group', 'aria-label': 'Chọn số sao' });
  const draw = () => {
    clear(starsEl);
    for (let i = 1; i <= 5; i++) {
      starsEl.appendChild(h('button', { type: 'button', class: i <= rating ? 'on' : '', 'aria-label': `${i} sao`, 'aria-pressed': i === rating ? 'true' : 'false', onClick: () => { rating = rating === i ? 0 : i; draw(); } }, icon('star', 30)));
    }
  };
  draw();
  const ta = h('textarea', { rows: 4, maxlength: 500, placeholder: 'Em thấy website thế nào? Em muốn thêm hoặc sửa điều gì?', 'aria-label': 'Góp ý của em' });
  modal({
    title: 'Đánh giá và góp ý',
    body: h('div', null,
      h('p', { class: 'muted small' }, 'Em không cần ghi tên. Em đừng ghi số điện thoại hay địa chỉ nhé.'),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Em chấm mấy sao?'), starsEl),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Ý kiến của em'), ta)),
    actions: [
      { label: 'Hủy', kind: 'ghost' },
      {
        label: 'Gửi',
        kind: 'primary',
        onClick: async () => {
          const comment = ta.value.trim();
          if (!rating && !comment) { toast('Em hãy chọn số sao hoặc viết ý kiến.', 'error'); return false; }
          const last = Number(sessionStorage.getItem('aips:lastfb') || 0);
          if (Date.now() - last < 15000) { toast('Em vừa gửi xong, chờ một chút nhé.', 'error'); return false; }
          try {
            const r = await sendFeedback({ kind: rating ? 'rating' : 'idea', rating, comment });
            try { sessionStorage.setItem('aips:lastfb', String(Date.now())); } catch (e) { /* bỏ qua */ }
            if (r && typeof r.ratingCount === 'number') stats = Object.assign({}, stats, { ratingCount: r.ratingCount, ratingAvg: r.ratingAvg, visits: r.visits != null ? r.visits : stats.visits });
            renderFooter();
            toast('Cảm ơn em đã gửi ý kiến!', 'ok');
          } catch (e) {
            toast(e.message || 'Chưa gửi được. Em thử lại sau nhé.', 'error', 5000);
            return false;
          }
        }
      }
    ]
  });
}

// Bộ đếm: chỉ tăng 1 lần / phiên trình duyệt và cách lần trước >= 30 phút.
function shouldCountVisit() {
  try {
    if (sessionStorage.getItem('aips:counted')) return false;
    const last = Number(localStorage.getItem('aips:lastvisit') || 0);
    return Date.now() - last > 30 * 60 * 1000;
  } catch (e) {
    return false;
  }
}
function markCounted() {
  try {
    sessionStorage.setItem('aips:counted', '1');
    localStorage.setItem('aips:lastvisit', String(Date.now()));
  } catch (e) { /* bỏ qua */ }
}

async function initStats() {
  try {
    const s = await getStats();
    stats = s || { error: true };
    if (stats.configured && !stats.error && shouldCountVisit()) {
      try {
        const r = await postVisit();
        markCounted();
        if (r && typeof r.visits === 'number') stats = Object.assign({}, stats, r);
      } catch (e) { /* lần sau thử lại */ }
    }
  } catch (e) {
    stats = e && (e.status === 404 || e.code === 'http_404') ? { configured: false } : { configured: true, error: true };
  }
  renderFooter();
}

// ---------- Router ----------
function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  return raw.split('/').filter(Boolean).map((x) => decodeURIComponent(x));
}

function route() {
  if (cleanup) { try { cleanup(); } catch (e) { /* bỏ qua */ } cleanup = null; }
  voice.stopAll();
  closeModal();
  menuOpen = false;
  const parts = parse();
  const page = parts[0] || '';
  const hasProfile = !!store.getProfile();
  const publicPages = ['start', 'privacy', 'about'];

  if (!page) { location.replace(hasProfile ? '#/home' : '#/start'); return; }
  if (!hasProfile && !publicPages.includes(page)) { location.replace('#/start'); return; }

  currentPath = page;
  clear(appEl);
  let res;
  try {
    if (page === 'start') res = start.render(appEl);
    else if (page === 'home') res = home.render(appEl);
    else if (page === 'problem') res = problem.render(appEl, { id: parts[1], step: parts[2] });
    else if (page === 'result') res = result.render(appEl, { id: parts[1] });
    else if (page === 'library') res = library.render(appEl);
    else if (page === 'qr') res = qr.render(appEl);
    else if (page === 'privacy') res = info.renderPrivacy(appEl);
    else if (page === 'about') res = info.renderAbout(appEl);
    else appEl.appendChild(h('div', { class: 'card empty' }, icon('alert', 32), h('h2', null, 'Không tìm thấy trang'), h('a', { class: 'btn btn-primary', href: '#/home' }, 'Về trang chủ')));
  } catch (e) {
    console.error(e);
    clear(appEl);
    appEl.appendChild(h('div', { class: 'banner error' }, icon('alert', 20), h('div', null, h('strong', null, 'Có lỗi khi hiển thị trang. '), 'Em tải lại trang giúp mình nhé. Dữ liệu của em vẫn an toàn trên thiết bị.')));
  }
  if (typeof res === 'function') cleanup = res;
  renderHeader();
  window.scrollTo(0, 0);
  try { appEl.focus({ preventScroll: true }); } catch (e) { /* bỏ qua */ }
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', () => store.flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush(); });

renderHeader();
renderFooter();
route();
initStats();
