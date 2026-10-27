import { CONFIG, STEPS } from '../config.js';
import { h, icon, btn } from '../ui.js';
import { downloadBackup, deleteEverything } from '../actions.js';
import { owl, badge, STEP_ICON, STEP_COLOR } from '../art.js';

const HOW = [
  'Em kể vấn đề của mình bằng vài câu (gõ chữ hoặc bấm micro để nói).',
  'Em cho biết nguyên nhân em nghĩ tới và kết quả em mong muốn.',
  'Trợ lý gợi ý khoảng 3 biện pháp. Em chọn cách em thấy hợp, hoặc tự thêm cách của em.',
  'Em xem ưu điểm, hạn chế của từng cách rồi tự quyết định chọn một cách.',
  'Trợ lý hướng dẫn các việc cần làm theo thứ tự. Làm xong việc nào, em đánh dấu việc đó.',
  'Em cho biết có hài lòng không (chưa hài lòng thì quay lại Bước 3), cho điểm và viết nhận xét. Em có thể nhờ thầy cô đồng hành thêm nếu em muốn.'
];

export function renderGuide(root) {
  root.appendChild(
    h('div', { class: 'guide' },
      h('div', { class: 'hero', style: 'padding-top:4px' },
        h('img', { class: 'hero-logo', src: '/assets/logo.svg', alt: 'Logo AI Problem Solver' }),
        h('h1', null, 'Hướng dẫn sử dụng'), h('p', { class: 'sub' }, `${CONFIG.name} · ${CONFIG.tagline}`), h('p', { class: 'slogan' }, `“${CONFIG.slogan}”`)),
      h('section', { class: 'card' },
        h('h2', null, 'Em dùng thế nào? (6 bước)'),
        h('ol', { class: 'how' }, STEPS.map((st, i) => h('li', null, badge(STEP_ICON[i], STEP_COLOR[i], 34), h('div', null, h('strong', null, `Bước ${st.n}. ${st.name}`), h('p', null, HOW[i]))))),
        h('p', null, 'Em là người quyết định. Trợ lý AI chỉ gợi ý; mình không tự chọn thay em và không tự đánh dấu hoàn thành thay em.')
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Mẹo nhỏ'),
        h('ul', null,
          h('li', null, 'Mỗi bước là một màn hình. Bấm “Tiếp” để sang câu kế, “Xong bước này” khi em đã hài lòng với bước đó.'),
          h('li', null, 'Cần hỏi thêm? Bấm “Hỏi trợ lý” (từ Bước 2) để trò chuyện. Em có thể bấm micro để nói.'),
          h('li', null, 'Em có thể quay lại sửa bước trước; các bước sau sẽ nhắc em xem lại.'),
          h('li', null, 'Dữ liệu lưu ngay trên máy em. Nên tải bản sao lưu ở menu để không bị mất khi đổi máy.'))
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Quyền riêng tư: dữ liệu của em nằm ở đâu?'),
        h('ul', null,
          h('li', null, 'Hồ sơ (họ tên, lớp nếu em nhập hoặc mã ẩn danh), các vấn đề, câu trả lời và hội thoại được lưu ', h('strong', null, 'ngay trên thiết bị của em'), ' (trình duyệt).'),
          h('li', null, 'Website ', h('strong', null, 'không có tài khoản, mật khẩu'), ' và ', h('strong', null, 'không tự lưu hồ sơ của em trên máy chủ'), '.'),
          h('li', null, 'Vì vậy chỉ em (hoặc người dùng chung thiết bị) xem được lịch sử. Không ai khác xem được chỉ bằng cách biết tên em.'),
          h('li', null, 'Nếu xóa dữ liệu trình duyệt hoặc đổi máy, em sẽ mất lịch sử, trừ khi em đã tải bản sao lưu.'))
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Điều gì được gửi cho trợ lý AI?'),
        h('ul', null,
          h('li', null, 'Khi em gửi tin nhắn hoặc bấm nút nhờ AI gợi ý, nội dung tin nhắn gần đây và phần tóm tắt vấn đề của em được gửi qua máy chủ của website tới dịch vụ AI (Google Gemini) để tạo câu trả lời.'),
          h('li', null, 'Máy chủ của website không lưu những nội dung này. Số điện thoại và email nếu có sẽ được tự động che trước khi gửi.'),
          h('li', null, 'Website dùng gói miễn phí của dịch vụ AI. Theo điều khoản của gói miễn phí, nhà cung cấp có thể dùng nội dung gửi tới để cải thiện sản phẩm của họ. ', h('strong', null, 'Em đừng ghi họ tên thật, số điện thoại, địa chỉ, mật khẩu hay thông tin riêng tư của em và người khác.'))
        )
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Gửi vấn đề cho thầy cô (tùy chọn)'),
        h('ul', null,
          h('li', null, 'Ở trang cuối của Bước 6, em có thể chọn gửi vấn đề cho thầy cô. ', h('strong', null, 'Chỉ khi em tick đồng ý và bấm “Gửi cho thầy cô”'), ' thì nội dung mới rời khỏi thiết bị của em.'),
          h('li', null, 'Nội dung gửi gồm: vấn đề, mục tiêu, cách em chọn, kết quả, kết luận và họ tên, lớp, trường nếu em nhập (có thể bỏ trống để ẩn danh). ', h('strong', null, 'Không gửi'), ' cuộc trò chuyện với AI.'),
          h('li', null, 'Thông tin được lưu vào bảng tính của nhà trường và chỉ thầy cô có mật khẩu quản trị mới xem được, để hỗ trợ em. Em có thể nhờ thầy cô xóa.'))
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Bộ đếm lượt truy cập, đánh giá và góp ý'),
        h('ul', null,
          h('li', null, h('strong', null, 'Số ca thầy cô nhận được'), ' chỉ gồm những vấn đề em chủ động gửi ở trang cuối (có tick đồng ý). Em dùng nhưng không gửi thì thầy cô không nhận được gì, nên số ca luôn ít hơn số em đã dùng.'),
          h('li', null, h('strong', null, 'Lượt truy cập'), ' = một lần mở website trong một phiên trình duyệt, cách lần đếm trước trên cùng thiết bị ít nhất 30 phút. Chuyển bước, mở lịch sử hay xem kết quả không làm tăng số đếm. Đây là số lượt, không phải số người.'),
          h('li', null, 'Bộ đếm chỉ lưu một con số tổng, không lưu họ tên, lớp hay nội dung của em.'),
          h('li', null, 'Khi em gửi đánh giá hoặc góp ý, nội dung đó (số sao và lời nhắn em tự viết, không kèm tên) được lưu vào bảng tính của chủ dự án để cải thiện website.'))
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Em có thể làm gì với dữ liệu của mình?'),
        h('div', { class: 'row' },
          btn('Tải bản sao lưu', { icon: 'download', onClick: downloadBackup }),
          btn('Xóa toàn bộ dữ liệu', { icon: 'trash', onClick: () => deleteEverything(() => { location.hash = '#/start'; }) })),
        h('p', { class: 'muted small', style: 'margin-top:10px' }, 'Xóa dữ liệu chỉ xóa trên thiết bị này. Dữ liệu không được giữ ở đâu khác.')
      ),
      h('section', { class: 'card' },
        h('h2', null, 'An toàn của em'),
        h('p', null, 'Nếu em bị bạo lực, xâm hại hoặc cảm thấy không an toàn, hãy nói với ba mẹ, thầy cô hoặc người lớn em tin tưởng và gọi ', h('a', { href: 'tel:111' }, '111'), ' (Tổng đài quốc gia bảo vệ trẻ em). Nguy hiểm ngay lúc này: ', h('a', { href: 'tel:113' }, '113'), ' (Công an), ', h('a', { href: 'tel:115' }, '115'), ' (Cấp cứu).')
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Cơ sở tham khảo'),
        h('p', { class: 'muted small' }, 'Trợ lý tư vấn dựa trên các tài liệu sau:'),
        h('ol', null,
          h('li', null, 'Bộ Quy tắc ứng xử về bảo vệ trẻ em trên môi trường mạng (Bộ Thông tin và Truyền thông).'),
          h('li', null, 'Tài liệu Kỹ năng giải quyết vấn đề và ra quyết định (quy trình 6 bước).'),
          h('li', null, 'Chương trình giáo dục phổ thông - Chương trình tổng thể (Thông tư 32/2018/TT-BGDĐT).'),
          h('li', null, 'UNESCO (2024), AI Competency Framework for Students.'))
      ),
      h('section', { class: 'card' },
        h('h2', null, 'Lưu ý'),
        h('ul', null,
          h('li', null, 'AI có thể nhầm. Em hãy tự kiểm chứng thông tin và hỏi ý kiến người lớn đáng tin cậy.'),
          h('li', null, 'Trợ lý không thay thế thầy cô, ba mẹ hay chuyên gia, và không chẩn đoán sức khỏe tâm thần.'),
          h('li', null, 'Logo là bản dựng mới (la bàn trắng trong vòng tròn xanh dương), chưa phải tệp logo gốc.'))
      ),
      h('section', { class: 'card' },
        h('p', { class: 'muted small', style: 'margin:0 0 4px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--primary)' }, CONFIG.authorsHeading),
        h('h2', null, 'Thông tin tác giả'),
        h('div', { class: 'authors' }, CONFIG.authors.map((a) =>
          h('div', { class: 'author' + (a.teacher ? ' teacher' : '') },
            h('small', null, a.role + ':'), h('strong', null, a.name), h('span', null, a.sub))))
      ),
      h('section', { class: 'card card-soft' },
        h('p', { class: 'muted small', style: 'margin:0' }, `Phiên bản ${CONFIG.version} · Cập nhật ${CONFIG.releaseDate}`, CONFIG.teamName ? ` · ${CONFIG.teamName}` : '')
      )
    )
  );
}
