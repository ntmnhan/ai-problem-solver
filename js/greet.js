// Lời chào bằng giọng nói khi học sinh vừa vào app (chỉ ở màn hình bắt đầu, mỗi phiên một lần).
// Trình duyệt thường chặn tự phát tiếng khi chưa chạm vào trang: nếu bị chặn thì phát ở lần chạm đầu tiên.
import * as voice from './voice.js';

export const GREETING = 'Xin chào bạn đã đến với AI Problem Solver. Hãy nhập tên, lớp, hoặc tiếp tục với chế độ ẩn danh, rồi bấm Bắt đầu để chia sẻ câu chuyện của bạn với Cú nhé.';
const SESSION_KEY = 'aips_greeted';
const AUTO_KEY = 'aips_autoread';

const autoOn = () => { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch (e) { return true; } };
const seen = () => { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; } };
const mark = () => { try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* bỏ qua */ } };

// Nói lời chào. onState('speaking'|'stopped'|'novoice'|'error'). Trả về hủy đăng ký.
export function sayGreeting(onState) {
  return voice.speak(GREETING, onState);
}

// Tự chào khi vào trang; nếu trình duyệt chặn thì chờ lần chạm đầu tiên. Trả về hàm dọn dẹp.
export function autoGreet() {
  if (!voice.supportsTTS || seen() || !autoOn()) return () => {};
  let done = false;
  let off = () => {};
  const finish = () => { done = true; mark(); off(); };
  const wait = () => {
    const onTouch = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('button, a, input, textarea, select, label')) return; // không chen ngang khi em đang thao tác
      sayGreeting((s) => { if (s === 'speaking') finish(); });
    };
    window.addEventListener('pointerdown', onTouch);
    off = () => window.removeEventListener('pointerdown', onTouch);
  };
  let started = false;
  const ok = sayGreeting((s) => {
    if (s === 'speaking') { started = true; finish(); }
    else if (s === 'novoice') { finish(); }
    else if (s === 'stopped' && !started && !done) wait(); // bị chặn tự phát
  });
  if (!ok) { /* novoice/đang ghi âm: đã xử lý trong callback */ }
  return () => { off(); if (!started) return; voice.stopSpeaking(); };
}
