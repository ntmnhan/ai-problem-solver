import { CONFIG, STEPS } from '../config.js';
import { h, icon, btn } from '../ui.js';
import { downloadBackup, deleteEverything } from '../actions.js';

export function renderPrivacy(root) {
  root.appendChild(
    h('div', null,
      h('h1', null, 'Quyền riêng tư và dữ liệu'),
      h('p', { class: 'muted' }, 'Trình bày đơn giản để em và thầy cô, ba mẹ cùng hiểu.'),
      h('section', { class: 'card' },
        h('h2', null, 'Dữ liệu của em nằm ở đâu?'),
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
      )
    )
  );
}

export function renderAbout(root) {
  root.appendChild(
    h('div', null,
      h('div', { class: 'hero', style: 'padding-top:4px' },
        h('img', { class: 'hero-logo', src: '/assets/logo.svg', alt: 'Logo AI Problem Solver' }),
        h('h1', null, CONFIG.name), h('p', { class: 'sub' }, CONFIG.tagline), h('p', { class: 'slogan' }, `“${CONFIG.slogan}”`)),
      h('section', { class: 'card' },
        h('h2', null, 'Website này giúp gì?'),
        h('p', null, 'Giúp học sinh THCS suy nghĩ có trình tự khi gặp vấn đề trong học tập, gia đình, tình bạn và cuộc sống hằng ngày, theo 6 bước:'),
        h('ol', null, STEPS.map((s) => h('li', null, h('strong', null, s.name)))),
        h('p', null, 'Em là người quyết định. Trợ lý AI chỉ đặt câu hỏi gợi mở và giúp em cân nhắc; mình không tự chọn phương án và không tự đánh dấu hoàn thành thay em.')
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
