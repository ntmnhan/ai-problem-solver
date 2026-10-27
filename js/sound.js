// Hiệu ứng âm thanh nhẹ khi chuyển bước (WebAudio, không cần tệp âm thanh). Người dùng có thể tắt.
const KEY = 'aips_sfx';
let ctx = null;

export function sfxOn() {
  try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; }
}
export function setSfx(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* bỏ qua */ }
}

function tone(freq, start, dur, vol = 0.07) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

// kind: 'page' (sang câu kế), 'step' (vào bước mới), 'done' (hoàn thành)
export function playSfx(kind = 'page') {
  if (!sfxOn()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    if (kind === 'step') { tone(523.25, 0, 0.18); tone(659.25, 0.1, 0.18); tone(783.99, 0.2, 0.3); }
    else if (kind === 'done') { tone(659.25, 0, 0.15); tone(783.99, 0.12, 0.15); tone(1046.5, 0.24, 0.4); }
    else { tone(587.33, 0, 0.12, 0.05); tone(880, 0.07, 0.16, 0.05); }
  } catch (e) { /* bỏ qua */ }
}
