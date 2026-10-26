import { CONFIG } from '../config.js';
import { h, icon, btn, toast } from '../ui.js';
import { downloadBlob } from '../actions.js';

// URL triển khai thật: cấu hình CONFIG.siteUrl, hoặc địa chỉ đang mở nếu là https và không phải localhost.
export function deployUrl() {
  const c = (CONFIG.siteUrl || '').trim();
  if (c) return /^https:\/\//i.test(c) ? c : null;
  const { protocol, hostname, origin } = window.location;
  if (protocol !== 'https:') return null;
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|\[::1\])/.test(hostname) || hostname.endsWith('.local')) return null;
  return origin + '/';
}

function drawQR(canvas, url) {
  const qr = window.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const count = qr.getModuleCount();
  const scale = 10;
  const margin = 4;
  const size = (count + margin * 2) * scale;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0b2a5b';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
    }
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}

export function render(root) {
  const url = deployUrl();
  const wrap = h('div', null, h('h1', null, 'Mã QR chia sẻ'), h('p', { class: 'muted' }, 'Quét mã để mở màn hình bắt đầu của website.'));
  if (!url) {
    wrap.appendChild(h('div', { class: 'banner' }, icon('alert', 20), h('div', null, 'Chưa có địa chỉ triển khai để tạo QR chính thức. Mã QR chỉ được tạo khi website đã chạy trên địa chỉ https thật (không dùng localhost hay địa chỉ giả).')));
  } else if (!window.qrcode) {
    wrap.appendChild(h('div', { class: 'banner error' }, icon('alert', 20), h('div', null, 'Không nạp được thư viện tạo QR.')));
  } else {
    const canvas = h('canvas', { role: 'img', 'aria-label': `Mã QR dẫn tới ${url}` });
    drawQR(canvas, url);
    wrap.appendChild(
      h('div', { class: 'card qr-box' },
        canvas,
        h('div', { class: 'url-box' }, url),
        h('div', { class: 'row', style: 'justify-content:center' },
          btn('Tải QR (PNG)', { kind: 'primary', icon: 'download', onClick: () => canvas.toBlob((b) => b && downloadBlob(b, 'ai-problem-solver-qr.png'), 'image/png') }),
          btn('Sao chép địa chỉ', { icon: 'copy', onClick: async () => toast((await copyText(url)) ? 'Đã sao chép địa chỉ.' : 'Không sao chép được, em chọn và sao chép thủ công nhé.', 'ok') })
        )
      )
    );
  }
  root.appendChild(wrap);
}
