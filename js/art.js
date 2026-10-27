// Hình minh họa thân thiện cho học sinh: chú cú đồng hành (nhân vật gốc) và huy hiệu bước.
import { icon } from './ui.js';

// mood: 'happy' | 'think' | 'wave' | 'cheer'
export function owl({ size = 64, mood = 'happy', label = '' } = {}) {
  const px = { happy: [0, 1], think: [-3, -3], wave: [1, 1], cheer: [0, 0] }[mood] || [0, 1];
  const wingR = mood === 'wave' || mood === 'cheer'
    ? '<path d="M94 62q18-4 16-30-15 6-19 26z" fill="#1d4ed8"/>'
    : '<path d="M96 66q12 14 2 34-14-6-14-26z" fill="#1d4ed8"/>';
  const wingL = mood === 'cheer'
    ? '<path d="M26 62Q8 58 10 32q15 6 19 26z" fill="#1d4ed8"/>'
    : '<path d="M24 66Q12 80 22 100q14-6 14-26z" fill="#1d4ed8"/>';
  const mouth = mood === 'cheer' ? '<path d="M52 72q8 8 16 0z" fill="#fff"/>' : '';
  const span = document.createElement('span');
  span.className = `owl owl-${mood}`;
  if (label) span.setAttribute('role', 'img');
  if (label) span.setAttribute('aria-label', label);
  else span.setAttribute('aria-hidden', 'true');
  span.style.width = size + 'px';
  span.style.height = size + 'px';
  span.innerHTML = `<svg viewBox="0 0 120 120" width="${size}" height="${size}" focusable="false">
    <ellipse cx="60" cy="112" rx="26" ry="5" fill="#0b1b3a" opacity=".12"/>
    <path d="M28 44L34 14 54 34z" fill="#2563eb"/><path d="M92 44L86 14 66 34z" fill="#2563eb"/>
    <path d="M32 40L36 22 48 34z" fill="#ffb703"/><path d="M88 40L84 22 72 34z" fill="#ffb703"/>
    <ellipse cx="60" cy="68" rx="40" ry="42" fill="#3b82f6"/>
    ${wingL}${wingR}
    <ellipse cx="60" cy="84" rx="25" ry="25" fill="#e6f0ff"/>
    <path d="M47 76q6 6 13 0 6 6 13 0M45 88q7 6 15 0 8 6 15 0M50 99q5 5 10 0 5 5 10 0" fill="none" stroke="#a9c8ff" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="44" cy="54" r="16" fill="#fff"/><circle cx="76" cy="54" r="16" fill="#fff"/>
    <circle class="pupil" cx="${44 + px[0]}" cy="${55 + px[1]}" r="8" fill="#11233f"/>
    <circle class="pupil" cx="${76 + px[0]}" cy="${55 + px[1]}" r="8" fill="#11233f"/>
    <circle cx="${46 + px[0]}" cy="${52 + px[1]}" r="2.6" fill="#fff"/><circle cx="${78 + px[0]}" cy="${52 + px[1]}" r="2.6" fill="#fff"/>
    <circle cx="31" cy="68" r="5" fill="#ff8fa3" opacity=".55"/><circle cx="89" cy="68" r="5" fill="#ff8fa3" opacity=".55"/>
    <path d="M53 62h14l-7 13z" fill="#ffb703"/>${mouth}
    <ellipse cx="50" cy="111" rx="9" ry="4" fill="#ffb703"/><ellipse cx="70" cy="111" rx="9" ry="4" fill="#ffb703"/>
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
