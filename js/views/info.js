import { CONFIG, STEPS } from '../config.js';
import { h, icon, btn, modal } from '../ui.js';
import { downloadBackup, deleteEverything } from '../actions.js';
import { owl, badge, STEP_ICON, STEP_COLOR } from '../art.js';

const HOW = [
  'Kể vấn đề bằng vài câu (gõ chữ hoặc bấm micro).',
  'Nêu nguyên nhân em nghĩ tới và kết quả mong muốn.',
  'Chọn một hay nhiều biện pháp AI gợi ý, hoặc tự thêm cách của em.',
  'Xem ưu điểm, hạn chế rồi tự quyết định chọn cách nào.',
  'Làm theo các việc cần làm; xong việc nào thì đánh dấu việc đó.',
  'Nhìn lại kết quả, cho điểm, viết nhận xét; có thể gửi thầy cô nếu em muốn.'
];

function openPoster() {
  modal({
    title: 'Poster dự án', wide: true,
    body: h('div', { class: 'poster-full' },
      h('img', { src: 'assets/poster.jpg', alt: 'Poster dự án: Sử dụng AI Problem Solver trong phát triển năng lực giải quyết vấn đề thực tiễn cho học sinh trung học cơ sở' })),
    actions: [{ label: 'Đóng', kind: 'primary' }]
  });
}

export function renderGuide(root) {
  root.appendChild(
    h('div', { class: 'guide' },
      h('div', { class: 'hero', style: 'padding-top:4px' },
        h('img', { class: 'hero-logo', src: '/assets/logo.svg', alt: 'Logo AI Problem Solver' }),
        h('h1', null, 'Hướng dẫn sử dụng'), h('p', { class: 'sub' }, `${CONFIG.name} · ${CONFIG.tagline}`), h('p', { class: 'slogan' }, `“${CONFIG.slogan}”`)),
      h('section', { class: 'card poster-card' },
        h('h2', null, 'Poster dự án'),
        h('button', { type: 'button', class: 'poster-btn', id: 'poster-open', 'aria-label': 'Xem poster dự án phóng to', onClick: openPoster },
          h('img', { src: 'assets/poster.jpg', alt: 'Poster dự án: Sử dụng AI Problem Solver trong phát triển năng lực giải quyết vấn đề thực tiễn cho học sinh trung học cơ sở', loading: 'lazy', width: 900, height: 1200 })),
        h('p', { class: 'muted small', style: 'margin:8px 0 0' }, 'Bấm vào poster để xem lớn.')
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Em dùng thế nào? (6 bước)'),
        h('ol', { class: 'how' }, STEPS.map((st, i) => h('li', null, badge(STEP_ICON[i], STEP_COLOR[i], 34), h('div', null, h('strong', null, `Bước ${st.n}. ${st.name}`), h('p', null, HOW[i]))))),
        h('p', null, 'Em là người quyết định. AI chỉ gợi ý, không chọn hay đánh dấu thay em.')
      ),
      h('section', { class: 'card', id: 'guide-voice' },
        h('h2', null, 'Nghe AI đọc'),
        h('ul', null,
          h('li', null, 'AI chỉ đọc khi em bấm nút ', h('strong', null, 'Nghe'), '. Bấm nút cài đặt giọng để chọn tốc độ (Chậm/Vừa/Nhanh) và giọng nam/nữ.'),
          h('li', null, h('strong', null, 'Không nghe được hoặc báo “chưa có giọng tiếng Việt”?'), ' App chỉ đọc bằng giọng tiếng Việt có sẵn trong máy:')),
        h('ul', { class: 'fix' },
          h('li', null, h('strong', null, 'Máy tính Windows (dễ nhất): '), 'mở app bằng ', h('strong', null, 'Microsoft Edge'), ' (có giọng HoaiMy nữ, NamMinh nam; cần mạng).'),
          h('li', null, h('strong', null, 'Dùng Chrome: '), 'Settings → Time & language → Speech → Add voices → chọn Vietnamese → Add. Tắt hẳn Chrome, mở lại.'),
          h('li', null, h('strong', null, 'iPhone: '), 'Cài đặt → Trợ năng → Nội dung đọc → Giọng nói → Tiếng Việt → tải giọng “Linh”.'),
          h('li', null, h('strong', null, 'Android: '), 'Cài đặt → Quản lý chung → Ngôn ngữ → Chuyển văn bản thành giọng nói → cài dữ liệu tiếng Việt.'),
          h('li', null, 'Máy chỉ có một giọng thì nút giọng còn lại sẽ mờ. Cài xong, bấm “Nghe thử” trong phần cài đặt giọng.'))
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Mẹo nhỏ'),
        h('ul', null,
          h('li', null, 'Bấm “Tiếp” để sang câu kế, “Xong bước này” khi em hài lòng. Em có thể quay lại sửa bước trước.'),
          h('li', null, 'Cần hỏi thêm? Bấm “Hỏi trợ lý” (từ Bước 2); có thể bấm micro để nói.'),
          h('li', null, 'Dữ liệu lưu trên máy em. Nên tải bản sao lưu để không mất khi đổi máy.'))
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Quyền riêng tư: dữ liệu của em nằm ở đâu?'),
        h('ul', null,
          h('li', null, 'Hồ sơ, vấn đề và hội thoại lưu ', h('strong', null, 'ngay trên thiết bị của em'), '. Website ', h('strong', null, 'không có tài khoản, mật khẩu'), ' và không lưu hồ sơ em trên máy chủ.'),
          h('li', null, 'Xóa dữ liệu trình duyệt hoặc đổi máy sẽ mất lịch sử, trừ khi em đã tải bản sao lưu.'),
          h('li', null, 'Khi em nhờ AI, nội dung gần đây được gửi qua máy chủ tới Google Gemini để tạo câu trả lời. Máy chủ website không lưu; số điện thoại, email được che. Gói miễn phí có thể được nhà cung cấp dùng để cải thiện sản phẩm, nên ', h('strong', null, 'em đừng ghi họ tên thật, số điện thoại, địa chỉ, mật khẩu hay thông tin riêng tư.'))
        )
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Gửi thầy cô, đếm lượt và góp ý'),
        h('ul', null,
          h('li', null, h('strong', null, 'Gửi vấn đề cho thầy cô là tùy chọn:'), ' chỉ khi em tick đồng ý và bấm “Gửi cho thầy cô” thì nội dung (vấn đề, mục tiêu, cách chọn, kết quả, tên/lớp nếu em nhập) mới được gửi. Không gửi cuộc trò chuyện với AI. Chỉ thầy cô có mật khẩu quản trị xem được; em có thể nhờ xóa.'),
          h('li', null, h('strong', null, 'Số ca thầy cô nhận'), ' chỉ gồm các vấn đề em chủ động gửi, nên luôn ít hơn số em đã dùng.'),
          h('li', null, h('strong', null, 'Lượt truy cập'), ' là số lần mở website (cách nhau ít nhất 30 phút trên cùng máy), không phải số người; không lưu tên hay nội dung.'),
          h('li', null, 'Đánh giá, góp ý (số sao, lời nhắn, không kèm tên) được lưu để cải thiện website.'))
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Dữ liệu của em'),
        h('div', { class: 'row' },
          btn('Tải bản sao lưu', { icon: 'download', onClick: downloadBackup }),
          btn('Xóa toàn bộ dữ liệu', { icon: 'trash', onClick: () => deleteEverything(() => { location.hash = '#/start'; }) })),
        h('p', { class: 'muted small', style: 'margin-top:10px' }, 'Xóa chỉ xóa trên thiết bị này.')
      ),
      h('section', { class: 'card' },
        h('h2', null, 'An toàn của em'),
        h('p', null, 'Nếu em bị bạo lực, xâm hại hoặc không an toàn, hãy nói với ba mẹ, thầy cô hoặc người lớn em tin tưởng và gọi ', h('a', { href: 'tel:111' }, '111'), ' (bảo vệ trẻ em). Nguy hiểm ngay: ', h('a', { href: 'tel:113' }, '113'), ' (Công an), ', h('a', { href: 'tel:115' }, '115'), ' (Cấp cứu).')
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Cơ sở tham khảo'),
        h('ol', null,
          h('li', null, 'Bộ Quy tắc ứng xử về bảo vệ trẻ em trên môi trường mạng.'),
          h('li', null, 'Tài liệu Kỹ năng giải quyết vấn đề và ra quyết định (quy trình 6 bước).'),
          h('li', null, 'Chương trình giáo dục phổ thông - Chương trình tổng thể (TT 32/2018/TT-BGDĐT).'),
          h('li', null, 'UNESCO (2024), AI Competency Framework for Students.'))
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Lưu ý'),
        h('ul', null,
          h('li', null, 'AI có thể nhầm; em hãy tự kiểm chứng và hỏi người lớn đáng tin cậy. Trợ lý không thay thế thầy cô, ba mẹ hay chuyên gia.'),
          h('li', null, 'Giọng lời chào: Piper (vais1000, dữ liệu VAIS-1000, CC BY 4.0). Logo là bản dựng mới, chưa phải logo gốc.'))
      ),
      h('section', { class: 'card' },
        h('p', { class: 'muted small', style: 'margin:0 0 4px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--primary)' }, CONFIG.authorsHeading),
        h('h2', null, 'Thông tin tác giả'),
        h('div', { class: 'authors' }, CONFIG.authors.map((a) =>
          h('div', { class: 'author' + (a.teacher ? ' teacher' : '') },
            h('small', null, a.role + ':'), h('strong', null, a.name), h('span', null, a.sub))))
      )
    )
  );
}
