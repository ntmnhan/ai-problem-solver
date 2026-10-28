import { CONFIG, STEPS } from '../config.js';
import { h, icon, btn, modal } from '../ui.js';
import { owl, badge, STEP_ICON, STEP_COLOR } from '../art.js';

const HOW = [
  'Kể vấn đề bằng vài câu (gõ chữ hoặc bấm micro).',
  'Nêu nguyên nhân bạn nghĩ tới và kết quả mong muốn.',
  'Chọn một hay nhiều biện pháp AI gợi ý, hoặc tự thêm cách của bạn.',
  'Xem ưu điểm, hạn chế rồi tự quyết định chọn cách nào.',
  'Làm theo các việc cần làm; xong việc nào thì đánh dấu việc đó.',
  'Nhìn lại kết quả, cho điểm, viết nhận xét; có thể gửi thầy cô nếu bạn muốn.'
];

function openPoster() {
  modal({
    title: 'Poster dự án', wide: true,
    body: h('div', { class: 'poster-full' },
      h('img', { src: 'assets/poster.jpg', alt: 'Poster dự án: Sử dụng AI Problem Solver trong phát triển năng lực giải quyết vấn đề thực tiễn cho học sinh trung học cơ sở' })),
    actions: [{ label: 'Đóng', kind: 'primary' }]
  });
}

function sec(title, body, opts = {}) {
  return h('details', { class: 'gd', id: opts.id, open: opts.open ? '' : null },
    h('summary', null, h('span', null, title), icon('down', 18)),
    h('div', { class: 'gd-body' }, body));
}

export function renderGuide(root) {
  root.appendChild(
    h('div', { class: 'guide' },
      h('div', { class: 'hero', style: 'padding-top:4px' },
        h('img', { class: 'hero-logo', src: '/assets/logo.svg', alt: 'Logo AI Problem Solver (do AI hỗ trợ dựng)' }),
        h('h1', null, 'Hướng dẫn sử dụng'), h('p', { class: 'sub' }, `${CONFIG.name} · ${CONFIG.tagline}`)),
      h('p', { class: 'muted small gd-tip' }, 'Bấm vào từng mục để mở ra, bấm lần nữa để thu gọn.'),
      sec('Về dự án', h('div', null,
        h('p', null, 'AI Problem Solver do học sinh Trường THCS Gò Vấp thực hiện, dưới sự hướng dẫn của thầy cô, để hỗ trợ các bạn tự giải quyết vấn đề của mình. Vấn đề cần tư vấn sâu sẽ có thầy cô đồng hành.'),
        h('button', { type: 'button', class: 'poster-btn', id: 'poster-open', 'aria-label': 'Xem poster dự án phóng to', onClick: openPoster },
          h('img', { src: 'assets/poster.jpg', alt: 'Poster dự án: Sử dụng AI Problem Solver trong phát triển năng lực giải quyết vấn đề thực tiễn cho học sinh trung học cơ sở', loading: 'lazy', width: 900, height: 1200 })),
        h('p', { class: 'muted small', style: 'margin:8px 0 0' }, 'Bấm vào poster để xem lớn.'))),
      sec('Bạn dùng thế nào? (6 bước)', h('div', null,
        h('ol', { class: 'how' }, STEPS.map((st, i) => h('li', null, badge(STEP_ICON[i], STEP_COLOR[i], 34), h('div', null, h('strong', null, `Bước ${st.n}. ${st.name}`), h('p', { class: 'muted small', style: 'margin:2px 0 0' }, HOW[i]))))),
        h('p', null, 'Bạn là người quyết định. AI chỉ gợi ý, không chọn hay đánh dấu thay bạn.')), { open: true }),
      sec('Nghe AI đọc và nói bằng micro', h('div', { id: 'guide-voice' },
        h('ul', null,
          h('li', null, 'AI chỉ đọc khi bạn bấm nút ', h('strong', null, 'Nghe'), '. Bấm nút cài đặt giọng để chọn tốc độ.'),
          h('li', null, h('strong', null, 'Micro không bật được?'), ' Hãy mở app bằng Chrome hoặc Safari (không mở trong Zalo, Facebook) và cho phép micro khi trình duyệt hỏi. Cứ gõ chữ cũng được.'),
          h('li', null, h('strong', null, 'Không nghe được giọng tiếng Việt?'), ' App đọc bằng giọng có sẵn trên máy bạn.')),
        h('ul', { class: 'fix' },
          h('li', null, h('strong', null, 'Máy tính Windows (dễ nhất): '), 'mở bằng ', h('strong', null, 'Microsoft Edge'), ' (có sẵn giọng HoaiMy và NamMinh).'),
          h('li', null, h('strong', null, 'Dùng Chrome: '), 'Settings → Time & language → Speech → Add voices → chọn Vietnamese → Add, rồi tắt hẳn và mở lại trình duyệt.'),
          h('li', null, h('strong', null, 'iPhone: '), 'Cài đặt → Trợ năng → Nội dung đọc → Giọng nói → Tiếng Việt, tải giọng về.'),
          h('li', null, h('strong', null, 'Android: '), 'Cài đặt → Quản lý chung → Ngôn ngữ → Chuyển văn bản thành giọng nói, cài dữ liệu tiếng Việt.')))),
      sec('Mẹo nhỏ', h('ul', null,
        h('li', null, 'Bấm “Tiếp” để sang câu kế, “Xong bước này” khi bạn hài lòng. Bạn có thể quay lại sửa bước trước.'),
        h('li', null, 'Ở Bước 2, cần hỏi thêm thì bấm “Hỏi trợ lý” (tối đa 8 lượt mỗi vấn đề).'),
        h('li', null, 'Dữ liệu lưu trên máy bạn; đổi máy hoặc xóa dữ liệu trình duyệt có thể làm mất. Cần sao lưu, bạn nhờ thầy cô.'))),
      sec('Quyền riêng tư: dữ liệu của bạn nằm ở đâu?', h('ul', null,
        h('li', null, 'Hồ sơ, vấn đề và hội thoại lưu ', h('strong', null, 'ngay trên thiết bị của bạn'), '. Website ', h('strong', null, 'không có tài khoản, mật khẩu'), ' và không lưu hồ sơ bạn trên máy chủ.'),
        h('li', null, 'Khi bạn nhờ AI, nội dung gần đây được gửi qua máy chủ tới Google Gemini để tạo câu trả lời. Máy chủ website không lưu; số điện thoại, email được che. Gói miễn phí có thể được nhà cung cấp dùng để cải thiện sản phẩm, nên ', h('strong', null, 'bạn đừng ghi họ tên thật, số điện thoại, địa chỉ, mật khẩu hay thông tin riêng tư.')),
        h('li', null, h('strong', null, 'Thống kê ẩn danh:'), ' khi bạn hoàn thành Bước 6, app ghi một lượt tư vấn gồm mã ngẫu nhiên, nhóm vấn đề, số bước, mức hài lòng và điểm. Không ghi họ tên, lớp hay nội dung.'),
        h('li', null, h('strong', null, 'Nhờ thầy cô đồng hành là tùy chọn:'), ' chỉ khi bạn điền họ tên, lớp, tick đồng ý và bấm “Gửi cho thầy cô” thì họ tên, lớp và nội dung vấn đề mới được gửi (không gửi cuộc trò chuyện với AI). Chỉ thầy cô hướng dẫn xem được. Bạn có thể nhờ xóa.'),
        h('li', null, h('strong', null, 'Lượt truy cập'), ' là số lần mở website (cách nhau ít nhất 30 phút trên cùng máy), không phải số người.'),
        h('li', null, 'Đánh giá, góp ý (số sao, lời nhắn, không kèm tên) được lưu để cải thiện website.'))),
      sec('An toàn của bạn', h('p', null, 'Nếu bạn bị bạo lực, xâm hại hoặc không an toàn, hãy nói với ba mẹ, thầy cô hoặc người lớn bạn tin tưởng và gọi ', h('a', { href: 'tel:111' }, '111'), ' (bảo vệ trẻ em). Nguy hiểm ngay: ', h('a', { href: 'tel:113' }, '113'), ' (Công an), ', h('a', { href: 'tel:115' }, '115'), ' (Cấp cứu).')),
      sec('Tài liệu tham khảo', h('ol', null,
        h('li', null, 'Bộ Quy tắc ứng xử về bảo vệ trẻ em trên môi trường mạng.'),
        h('li', null, 'Tài liệu Kỹ năng giải quyết vấn đề và ra quyết định (quy trình 6 bước).'),
        h('li', null, 'Chương trình giáo dục phổ thông - Chương trình tổng thể (TT 32/2018/TT-BGDĐT).'),
        h('li', null, 'UNESCO (2024), AI Competency Framework for Students.'),
        h('li', null, 'Tài liệu dành cho giáo viên: lồng ghép nội dung phòng chống bạo lực trên cơ sở giới tại trường học, chuyên đề “Phòng ngừa bắt nạt học đường” (Dự án Trường học An toàn, Thân thiện và Bình đẳng).'),
        h('li', null, 'Giáo trình Kỹ năng giải quyết vấn đề và ra quyết định (ĐH Công nghiệp Thực phẩm TP.HCM, 2018): phân loại 3 loại vấn đề và cách giải quyết.'),
        h('li', null, 'Nguyễn Thị Thanh Dung (2026), Lý luận về kỹ năng ứng phó với stress trong hoạt động học tập của học sinh, Tạp chí Tâm lý - Giáo dục.'),
        h('li', null, 'Tài liệu tập huấn phòng chống bạo lực gia đình dành cho giảng viên ngành hành pháp và tư pháp Việt Nam (UNODC, 2011).'))),
      sec('Nội dung do AI tạo ra / hỗ trợ', h('div', { id: 'guide-ai' }, h('ul', null,
        h('li', null, h('strong', null, 'Trợ lý trong app:'), ' câu trả lời, gợi ý, phân tích, kế hoạch do AI (Google Gemini) tạo ra; chỉ mang tính gợi ý, bạn là người quyết định.'),
        h('li', null, h('strong', null, 'Giọng lời chào:'), ' do AI tạo ra (Piper TTS, mô hình vais1000, CC BY 4.0).'),
        h('li', null, h('strong', null, 'Logo:'), ' do AI hỗ trợ dựng (SVG), chưa phải logo gốc của dự án.'),
        h('li', null, h('strong', null, 'Mã nguồn app:'), ' có phần do AI (Claude, Anthropic) hỗ trợ viết theo yêu cầu của nhóm tác giả; chi tiết trong Bảng khai báo sử dụng AI và nhật ký câu lệnh của dự án.')))),
      sec('Lưu ý', h('p', null, 'AI có thể nhầm; bạn hãy tự kiểm chứng và hỏi người lớn đáng tin cậy. Trợ lý không thay thế thầy cô, ba mẹ hay chuyên gia.'))
    )
  );
}
