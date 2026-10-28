// Lời chào bằng giọng nói khi học sinh vừa vào app (chỉ ở màn hình bắt đầu, mỗi phiên một lần).
// Dùng tệp âm thanh tiếng Việt thu sẵn (assets/greeting.mp3) nên không phụ thuộc giọng đọc của trình duyệt
// (nhiều máy Windows/Chrome không có giọng tiếng Việt). Trình duyệt thường chặn tự phát khi bạn chưa chạm vào trang:
// nếu bị chặn thì phát ở lần chạm / bấm phím đầu tiên.
export const GREETING_TEXT = 'Xin chào bạn đã đến với AI Problem Solver. Bạn không cần nhập tên hay lớp. Hãy bấm Bắt đầu để chia sẻ câu chuyện của bạn với Cú nhé.';
const SRC = 'assets/greeting.mp3';
import * as voice from './voice.js';

let audio = null;
function get() {
  if (!audio) { audio = new Audio(SRC); audio.preload = 'auto'; }
  try { audio.playbackRate = parseFloat(voice.getRate()) || 1; } catch (e) { /* bỏ qua */ }
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

// Không tự phát: lời chào chỉ vang lên khi bạn bấm nút "Nghe lời chào". Giữ hàm để tương thích.
export function autoGreet() {
  return () => { stopGreeting(); };
}
