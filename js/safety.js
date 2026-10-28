// Phát hiện tín hiệu nguy cơ phía trình duyệt (dự phòng, không phụ thuộc AI/mạng).
// Giữ đồng bộ với lib/safety.js.
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

const PATTERNS = [
  /\btu (tu|sat|tuong)\b/,
  /\bmuon chet\b/,
  /\b(khong|het|chang) muon song\b/,
  /\bket thuc (cuoc song|cuoc doi|tat ca)\b/,
  /\btu (lam )?(dau|hai|gay thuong tich)\b/,
  /\bcat (tay|co tay)\b/,
  /\bbi (danh dap|bao luc|bao hanh|xam hai|xam pham|so mo|hiep|cuong buc|bat coc|doa giet|ep buoc)\b/,
  /\bbi (ba|me|bo|cha|anh|chi|chu|bac|di|duong|thay|co|ban|nguoi ta|nhom ban) (danh|dam|da|doa|bat nat)\b/,
  /\b(danh|dam|da) (em|ban|toi|minh) (rat )?(dau|chay mau|bam tim)\b/,
  /\bxam hai\b/,
  /\bhiep dam\b/,
  /\bdoa giet\b/,
  /\bgiet (nguoi|ban|minh|ba|me|bo)\b/,
  /\b(co|mang|cam) (dao|vu khi|sung)\b/,
  /\bma tuy\b/,
  /\bbo nha (ra )?di\b/,
  /\bkhong (con )?(an toan|dam ve nha)\b/
];

export function detectRisk(text) {
  const t = normalize(text);
  return PATTERNS.some((re) => re.test(t));
}
