// Hình minh họa thân thiện cho học sinh: chú thỏ đồng hành (nhân vật gốc) và huy hiệu bước.
import { icon } from './ui.js';

// mood: 'happy' | 'think' | 'wave' | 'cheer'
// (Tên hàm giữ là owl để không phải sửa nhiều nơi; nhân vật hiện là chú thỏ.)
export function owl({ size = 64, mood = 'happy', label = '' } = {}) {
  const px = { happy: [0, 1], think: [-3, -3], wave: [1, 1], cheer: [0, 0] }[mood] || [0, 1];
  const fur = '#f3f6ff', line = '#6f95e6', pink = '#ffb3c6';
  const armR = mood === 'wave' || mood === 'cheer'
    ? `<path d="M90 84q18-4 17-28-13 5-19 22z" fill="${fur}" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>`
    : `<path d="M90 86q12 8 6 24-12-2-14-20z" fill="${fur}" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>`;
  const armL = mood === 'cheer'
    ? `<path d="M30 84Q12 80 13 56q13 5 19 22z" fill="${fur}" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>`
    : `<path d="M30 86q-12 8-6 24 12-2 14-20z" fill="${fur}" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>`;
  const earTilt = mood === 'think' ? 'rotate(-8 40 30)' : '';
  const mouth = mood === 'cheer'
    ? '<path d="M52 72q8 9 16 0z" fill="#e0526f"/>'
    : '<path d="M54 71q6 5 12 0" fill="none" stroke="#c0405c" stroke-width="2.2" stroke-linecap="round"/>';
  const span = document.createElement('span');
  span.className = `owl owl-${mood}`;
  if (label) span.setAttribute('role', 'img');
  if (label) span.setAttribute('aria-label', label);
  else span.setAttribute('aria-hidden', 'true');
  span.style.width = size + 'px';
  span.style.height = size + 'px';
  span.innerHTML = `<svg viewBox="0 0 120 120" width="${size}" height="${size}" focusable="false">
    <ellipse cx="60" cy="113" rx="28" ry="5" fill="#0b1b3a" opacity=".12"/>
    <g transform="${earTilt}"><path d="M38 52C28 28 30 6 40 5c10-1 16 24 14 47z" fill="${fur}" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M40 46C35 30 36 16 40 14c5 2 8 18 7 32z" fill="${pink}"/></g>
    <path d="M82 52C92 28 90 6 80 5 70 4 64 29 66 52z" fill="${fur}" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M80 46C85 30 84 16 80 14c-5 2-8 18-7 32z" fill="${pink}"/>
    <ellipse cx="60" cy="92" rx="27" ry="22" fill="${fur}" stroke="${line}" stroke-width="2.4"/>
    <ellipse cx="60" cy="97" rx="15" ry="13" fill="#fff"/>
    ${armL}${armR}
    <ellipse cx="60" cy="62" rx="35" ry="30" fill="${fur}" stroke="${line}" stroke-width="2.4"/>
    <circle cx="45" cy="58" r="10" fill="#fff"/><circle cx="75" cy="58" r="10" fill="#fff"/>
    <circle class="pupil" cx="${45 + px[0]}" cy="${59 + px[1]}" r="6" fill="#11233f"/>
    <circle class="pupil" cx="${75 + px[0]}" cy="${59 + px[1]}" r="6" fill="#11233f"/>
    <circle cx="${47 + px[0]}" cy="${56.5 + px[1]}" r="2" fill="#fff"/><circle cx="${77 + px[0]}" cy="${56.5 + px[1]}" r="2" fill="#fff"/>
    <circle cx="33" cy="70" r="5" fill="${pink}" opacity=".7"/><circle cx="87" cy="70" r="5" fill="${pink}" opacity=".7"/>
    <path d="M55 66h10l-5 6z" fill="#ff8fa3"/>${mouth}
    <path d="M44 70l-12-2M44 73l-12 3M76 70l12-2M76 73l12 3" stroke="${line}" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="46" cy="112" rx="11" ry="5" fill="${fur}" stroke="${line}" stroke-width="2"/><ellipse cx="74" cy="112" rx="11" ry="5" fill="${fur}" stroke="${line}" stroke-width="2"/>
  </svg>`;
  return span;
}

// Biểu tượng của từng bước và từng lĩnh vực (nét vẽ đơn giản, đồng bộ).
export const STEP_ICON = ['target', 'search', 'bulb', 'scale', 'rocket', 'trophy'];
export const STEP_COLOR = ['#3b82f6', '#8b5cf6', '#f59e0b', '#14b8a6', '#ef4444', '#22a65b'];
export const CAT_ICON = { 'Học tập': 'book', 'Gia đình': 'home', 'Tình bạn': 'users', 'Đời sống hằng ngày': 'sun', 'Khác': 'spark' };
export const CAT_COLOR = { 'Học tập': '#3b82f6', 'Gia đình': '#f97316', 'Tình bạn': '#ec4899', 'Đời sống hằng ngày': '#14b8a6', 'Khác': '#8b5cf6' };

export function badge(name, color, size = 40) {
  const b = document.createElement('span');
  b.className = 'badge-ico';
  b.style.width = b.style.height = size + 'px';
  b.style.background = `color-mix(in srgb, ${color} 16%, transparent)`;
  b.style.color = color;
  b.appendChild(icon(name, Math.round(size * 0.52)));
  return b;
}
