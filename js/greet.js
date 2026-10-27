// Lời chào bằng giọng nói khi học sinh vừa vào app (chỉ ở màn hình bắt đầu, mỗi phiên một lần).
// Dùng tệp âm thanh tiếng Việt thu sẵn (assets/greeting.mp3) nên không phụ thuộc giọng đọc của trình duyệt
// (nhiều máy Windows/Chrome không có giọng tiếng Việt). Trình duyệt thường chặn tự phát khi em chưa chạm vào trang:
// nếu bị chặn thì phát ở lần chạm / bấm phím đầu tiên.
export const GREETING_TEXT = 'Xin chào bạn đã đến với AI Problem Solver. Hãy nhập tên, lớp, hoặc tiếp tục với chế độ ẩn danh, rồi bấm Bắt đầu để chia sẻ câu chuyện của bạn với Cú nhé.';
const SRC = 'assets/greeting.mp3';
const SESSION_KEY = 'aips_greeted';
const AUTO_KEY = 'aips_autoread';

const autoOn = () => { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch (e) { return true; } };
const seen = () => { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; } };
const mark = () => { try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* bỏ qua */ } };

let audio = null;
function get() {
  if (!audio) { audio = new Audio(SRC); audio.preload = 'auto'; }
  return audio;
}

export function isPlaying() { return !!audio && !audio.paused && !audio.ended; }

export function stopGreeting() {
  if (audio) { try { audio.pause(); audio.currentTime = 0; } catch (e) { /* bỏ qua */ } }
}

// Phát lời chào; trả về Promise<boolean> (true nếu phát được).
export async function playGreeting() {
  try {
    const a = get();
    a.currentTime = 0;
    await a.play();
    return true;
  } catch (e) {
    return false;
  }
}

// Tự chào khi vào trang; nếu bị chặn thì chờ lần tương tác đầu tiên. Trả về hàm dọn dẹp.
export function autoGreet() {
  if (seen() || !autoOn()) return () => {};
  let off = () => {};
  playGreeting().then((ok) => {
    if (ok) { mark(); return; }
    const onTouch = () => {
      off();
      playGreeting().then((p) => { if (p) mark(); });
    };
    window.addEventListener('pointerdown', onTouch, true);
    window.addEventListener('keydown', onTouch, true);
    off = () => { window.removeEventListener('pointerdown', onTouch, true); window.removeEventListener('keydown', onTouch, true); };
  });
  return () => { off(); stopGreeting(); };
}
