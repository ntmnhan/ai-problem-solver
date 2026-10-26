# Báo cáo kiểm thử – AI Problem Solver v1.0.0

Ngày chạy: 26/10/2026. Môi trường: Chromium (Playwright) + máy chủ thử nghiệm cục bộ, /api/* giả lập (mock) Gemini và Apps Script.

- Kiểm thử máy chủ (Node): 17/17 đạt
- Kiểm thử giao diện (E2E): 35/35 đạt

## 1. Kiểm thử máy chủ

| Mã | Nội dung | Kết quả |
|---|---|---|
| S-01 | Phát hiện từ khóa nguy cơ (có dấu và không dấu) | Đạt |
| A-01 | /api/chat khi chưa có GEMINI_API_KEY trả 503 trung thực | Đạt |
| A-02 | /api/chat từ chối phương thức GET | Đạt |
| A-03 | Trả lời bình thường, key gửi qua header và không lộ ra phản hồi | Đạt |
| A-04 | Che số điện thoại và email trước khi gửi cho AI | Đạt |
| A-05 | Từ khóa nguy cơ nâng risk lên concern dù AI trả none | Đạt |
| A-06 | AI bị chặn an toàn: trả lời dự phòng khuyến khích tìm người lớn | Đạt |
| A-07 | Hết hạn mức (429) trả thông báo thân thiện | Đạt |
| A-08 | Model không còn tồn tại (404) tự chuyển sang model dự phòng | Đạt |
| A-09 | Lỗi mạng tới AI trả 502, không đánh lừa là thành công | Đạt |
| A-10 | Giới hạn kích thước và tần suất | Đạt |
| A-11 | Tác vụ gợi ý phương án: yêu cầu không xếp hạng, loại trừ phương án đã có | Đạt |
| A-12 | Tác vụ phân tích: dặn AI không chọn thay học sinh | Đạt |
| B-01 | /api/stats khi chưa cấu hình trả configured:false (không bịa số) | Đạt |
| B-02 | /api/feedback khi chưa cấu hình trả 503 | Đạt |
| B-03 | Bộ đếm/đánh giá gọi Apps Script kèm token; xác thực đầu vào | Đạt |
| B-04 | Lỗi từ Apps Script: feedback báo lưu thất bại, không báo thành công giả | Đạt |

## 2. Kiểm thử giao diện / luồng

| Mã | Nội dung (điều kiện, thao tác, kết quả mong đợi) | Kết quả thực tế | Bằng chứng |
|---|---|---|---|
| UI-01 | Màn hình bắt đầu: logo, tên, slogan, ô họ tên/lớp, 2 nút, không tràn ngang (360px) | Đạt | tests/e2e-results.json, tests/screens/ |
| PR-01 | Bắt đầu có tên: bắt buộc nhập tên (nếu không ẩn danh), vào trang chủ với tên | Đạt | tests/e2e-results.json, tests/screens/ |
| PR-02 | Ẩn danh: mã ngẫu nhiên HS-xxxxx, không gán tên/lớp, tải lại không tạo hồ sơ mới | Đạt | tests/e2e-results.json, tests/screens/ |
| FL-01 | Luôn thấy đủ 6 bước; bước sau bị khóa; lời gợi ý Bước 1 đúng đặc tả; trạng thái "Chưa bắt đầu" | Đạt | tests/e2e-results.json, tests/screens/ |
| FL-02 | Chat Bước 1: AI trả lời theo ngữ cảnh, tự điền ô vấn đề (sửa được), KHÔNG tự hoàn thành bước | Đạt | tests/e2e-results.json, tests/screens/ |
| FL-03 | Hoàn thành bước cần nội dung + hộp xác nhận; hủy thì không hoàn thành; xác nhận mới sang Bước 2 | Đạt | tests/e2e-results.json, tests/screens/ |
| FL-04 | Đi hết 6 bước: AI không tự thêm/chọn/hoàn thành; việc nhỏ mặc định "Chưa làm"; trang kết quả đủ nội dung | Đạt | tests/e2e-results.json, tests/screens/ |
| FL-05 | Sửa bước trước: bước đó phải xác nhận lại, bước sau hiện cảnh báo "cần xem lại"; tải lại vẫn còn dữ liệu | Đạt | tests/e2e-results.json, tests/screens/ |
| FL-06 | Gõ thẳng URL bước chưa mở thì bị đưa về bước hợp lệ (không bỏ bước) | Đạt | tests/e2e-results.json, tests/screens/ |
| FL-07 | Xóa phương án đã chọn: bỏ lựa chọn, bước sau cảnh báo, không giữ kết luận lỗi thời | Đạt | tests/e2e-results.json, tests/screens/ |
| AI-01 | Nội dung nguy hiểm: luôn hiện thẻ an toàn (111/113/115) ngay cả khi AI/máy chủ lỗi | Đạt | tests/e2e-results.json, tests/screens/ |
| AI-02 | AI báo risk=danger thì giao diện hiện thẻ an toàn mức nguy hiểm | Đạt | tests/e2e-results.json, tests/screens/ |
| AI-03 | Lỗi AI: báo lỗi rõ ràng + nút Thử lại, không nhân đôi tin nhắn của học sinh | Đạt | tests/e2e-results.json, tests/screens/ |
| AI-04 | Sang bước mới, ngữ cảnh các bước trước (vấn đề, câu trả lời) được gửi kèm; không bắt đầu lại từ đầu | Đạt | tests/e2e-results.json, tests/screens/ |
| UI-02 | Nền sáng/tối: nút ở header và chân trang hoạt động, lựa chọn được ghi nhớ khi tải lại | Đạt | tests/e2e-results.json, tests/screens/ |
| UI-03 | Tự theo hệ thống tối khi chưa chọn; chụp ảnh kiểm tra tương phản | Đạt | tests/e2e-results.json, tests/screens/ |
| UI-04 | Không tràn ngang, nút gửi đủ lớn (≥40px) ở 360/414/768/1280px trên mọi bước, trang chủ và kết quả | Đạt | tests/e2e-results.json, tests/screens/ |
| EX-01 | Xuất DOCX là tệp thật, đúng nội dung; chế độ in ẩn menu/chân trang, tạo được PDF | Đạt | tests/e2e-results.json, tests/screens/ |
| EX-02 | Báo cáo: có thể ẩn họ tên/lớp (không đưa thông tin cá nhân không cần thiết) | Đạt | tests/e2e-results.json, tests/screens/ |
| DT-01 | Sao lưu → xóa toàn bộ → khôi phục từ tệp: dữ liệu quay lại đúng; tệp sai bị từ chối | Đạt | tests/e2e-results.json, tests/screens/ |
| DT-02 | Khôi phục từ tệp không hợp lệ: báo lỗi rõ ràng, không làm hỏng dữ liệu | Đạt | tests/e2e-results.json, tests/screens/ |
| DT-03 | Dữ liệu cục bộ bị hỏng: không sập app, giữ lại bản gốc để cứu | Đạt | tests/e2e-results.json, tests/screens/ |
| DT-04 | Lưu thất bại (bộ nhớ đầy/bị chặn): hiện "Lưu thất bại", không báo thành công giả | Đạt | tests/e2e-results.json, tests/screens/ |
| CT-01 | Bộ đếm: tăng đúng 1 lần/phiên, không tăng khi chuyển bước/tải lại; "Chưa có dữ liệu đánh giá" khi rỗng; có phiên bản + ngày | Đạt | tests/e2e-results.json, tests/screens/ |
| CT-02 | Chưa cấu hình lưu trữ: nói rõ "Bộ đếm chưa được cấu hình", không hiện số giả, vô hiệu hóa nút đánh giá | Đạt | tests/e2e-results.json, tests/screens/ |
| CT-03 | Đánh giá và góp ý: kiểm tra đầu vào, gửi đúng dữ liệu, chân trang cập nhật từ máy chủ | Đạt | tests/e2e-results.json, tests/screens/ |
| QR-01 | Trên localhost: "Chưa có địa chỉ triển khai để tạo QR chính thức", không tạo QR giả | Đạt | tests/e2e-results.json, tests/screens/ |
| QR-02 | Trên địa chỉ https thật: tạo QR từ URL đó, tải được PNG, hiển thị URL | Đạt | tests/e2e-results.json, tests/screens/ |
| LB-01 | Kho tài liệu: chỉ hiện tệp thật đang tồn tại; tệp thiếu thì không hiển thị | Đạt | tests/e2e-results.json, tests/screens/ |
| VO-01 | Voice Mode: 1 điểm truy cập; nghe→chữ hiện trong ô để sửa trước khi gửi; đọc phản hồi; có Dừng đọc/Quay lại văn bản; hiển thị đủ trạng thái | Đạt | tests/e2e-results.json, tests/screens/ |
| VO-02 | Trình duyệt không hỗ trợ giọng nói: thông báo rõ, vẫn dùng bằng văn bản | Đạt | tests/e2e-results.json, tests/screens/ |
| VO-03 | Từ chối quyền micro: thông báo rõ, vẫn dùng được bằng văn bản | Đạt | tests/e2e-results.json, tests/screens/ |
| VO-04 | Không bật micro khi người dùng chưa chủ động | Đạt | tests/e2e-results.json, tests/screens/ |
| PR-03 | Trang quyền riêng tư nêu rõ dữ liệu lưu ở đâu, gửi gì cho AI, bộ đếm định nghĩa thế nào, cách xóa/xuất | Đạt | tests/e2e-results.json, tests/screens/ |
| DT-05 | Khởi tạo sạch: không có học sinh/vấn đề/số liệu mẫu | Đạt | tests/e2e-results.json, tests/screens/ |

## 3. Chưa thể kiểm tra trong môi trường này

- Gọi Gemini thật (cần khóa API thật trên Vercel): chất lượng và độ trễ câu trả lời.
- Apps Script thật (bộ đếm, đánh giá, góp ý): cần triển khai và đặt TOKEN.
- Vercel HTTPS thật và QR trên địa chỉ chính thức.
- Micro và đọc giọng nói trên điện thoại/trình duyệt thật (Web Speech API khác nhau theo thiết bị).
- Tải thật với nhiều học sinh cùng lúc; giới hạn tốc độ của gói miễn phí Gemini.
