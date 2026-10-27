# AI Problem Solver – Trợ lý giải quyết vấn đề thực tiễn

> “AI hỗ trợ tư duy, không thay thế quyết định của học sinh.”

Web app cho học sinh THCS đi qua **6 bước** giải quyết vấn đề, có trợ lý AI (Gemini), Voice Mode, lịch sử, trang kết quả (in/PDF, DOCX), kho tài liệu, mã QR, bộ đếm lượt truy cập và đánh giá/góp ý.

## Kiến trúc (không dùng cơ sở dữ liệu)

| Phần | Cách làm |
|---|---|
| Giao diện | Web tĩnh (HTML/CSS/JS thuần, không cần build). Mobile-first, sáng/tối. |
| Dữ liệu học sinh | Lưu **trên thiết bị** (localStorage). Không đăng nhập, không gửi hồ sơ lên máy chủ. Có tải/khôi phục bản sao lưu (.json). |
| AI | Hàm Vercel `/api/chat` gọi Gemini. API key chỉ ở biến môi trường. |
| Bộ đếm + đánh giá/góp ý | Hàm Vercel `/api/stats`, `/api/feedback` → Google Apps Script → Google Sheet của bạn. |

Thay đổi so với đặc tả gốc (theo yêu cầu của chủ dự án: không CSDL, không đăng nhập, không lấy dữ liệu người dùng):
- Không có tài khoản/quản trị viên, Dashboard thống kê toàn trường, nhận xét của giáo viên trên hệ thống (báo cáo có ô trống để giáo viên viết tay hoặc sửa trong DOCX), tải tệp lên kho tài liệu (tài liệu đặt trong thư mục `docs/`), liên kết Google Sheets cho kết quả học sinh.
- “Mã tiếp tục” được thay bằng tệp sao lưu; học sinh đổi máy thì tải/khôi phục tệp.

## Triển khai (khoảng 15 phút)

### 1) Đưa mã lên GitHub
Tạo repo, đẩy toàn bộ thư mục này lên. **Không** commit khóa bí mật (đã có `.gitignore`).

### 2) Tạo Google Sheet + Apps Script cho bộ đếm và đánh giá
1. Tạo một Google Sheet mới (tên tùy ý).
2. Menu **Tiện ích mở rộng → Apps Script**, xóa mã mẫu, dán toàn bộ `apps-script/Code.gs`.
3. **Cài đặt dự án (bánh răng) → Thuộc tính tập lệnh → Thêm thuộc tính**: tên `TOKEN`, giá trị là một chuỗi bí mật dài do bạn tự đặt.
4. **Triển khai → Triển khai mới → Loại: Ứng dụng web** → Thực thi bằng: *Tôi*; Ai có quyền truy cập: *Mọi người* → Triển khai, cấp quyền. Sao chép **URL ứng dụng web** (kết thúc bằng `/exec`).

### 3) Tạo khóa Gemini
Vào Google AI Studio → *Get API key* → tạo khóa (gói miễn phí).

### 4) Triển khai lên Vercel
1. Vercel → **Add New Project** → chọn repo GitHub. Framework Preset: **Other**. Không cần Build Command.
2. **Settings → Environment Variables**:

| Tên | Giá trị |
|---|---|
| `GEMINI_API_KEY` | khóa Gemini của bạn |
| `GEMINI_API_KEY_2` | (không bắt buộc, nên có) khóa Gemini thứ hai tạo ở dự án Google khác để có thêm hạn mức; app tự chuyển khi khóa đầu hết lượt hoặc quá tải. |
| `FALLBACK_API_KEY` | (không bắt buộc, nên có) khóa dịch vụ AI dự phòng miễn phí tương thích OpenAI, ví dụ Groq (console.groq.com). Kèm tùy chọn `FALLBACK_BASE_URL` (mặc định Groq) và `FALLBACK_MODEL` (mặc định `llama-3.3-70b-versatile`). |
| `GEMINI_MODEL` | (không bắt buộc) tên model, đặt lên đầu danh sách; app luôn tự thử tiếp `gemini-3.5-flash-lite`, `gemini-3.8-flash`, rồi các model 2.5. Nếu Google đổi tên/ngừng model, chỉ cần sửa biến này. |
| `APPS_SCRIPT_URL` | URL `/exec` ở bước 2 |
| `APPS_SCRIPT_TOKEN` | đúng chuỗi `TOKEN` ở bước 2 |

3. **Deploy** (hoặc Redeploy sau khi thêm biến). Mở địa chỉ `https://….vercel.app`.

### 5) Kiểm tra sau khi triển khai
- Chân trang hiện “Lượt truy cập: n” (không còn “Bộ đếm chưa được cấu hình”).
- Bắt đầu một vấn đề, gửi tin nhắn → trợ lý trả lời. Nếu báo “chưa được cấu hình”, kiểm tra `GEMINI_API_KEY` và Redeploy.
- Menu → **Mã QR chia sẻ** → tải PNG (chỉ tạo khi địa chỉ là https thật). Muốn cố định địa chỉ (ví dụ tên miền riêng) thì điền `siteUrl` trong `js/config.js`.
- Gửi thử một đánh giá, kiểm tra Google Sheet có sheet `GopY`.

## Chạy thử trên máy
```bash
node tests/dev-server.js 3000      # mở http://localhost:3000
GEMINI_API_KEY=... node tests/dev-server.js   # gọi AI thật
node tests/run.js                  # kiểm thử máy chủ (17 bài)
python3 tests/e2e.py               # kiểm thử giao diện (cần Playwright)
```

## Cập nhật phiên bản
Sửa `version` và `releaseDate` duy nhất ở `js/config.js` (chân trang lấy từ đây). Chỉ tăng phiên bản khi thật sự phát hành.
Dữ liệu học sinh nằm trên máy các em nên cập nhật web **không** xóa dữ liệu; cấu trúc dữ liệu có `schema` và hàm `migrate()` trong `js/store.js` để nâng cấp có kiểm soát.

## Thêm tài liệu vào Kho tài liệu
Đặt tệp (PDF/HTML…) vào `docs/`, thêm một dòng vào `docs/index.json`. Chỉ tệp thật đang tồn tại mới hiển thị.

## Lưu ý quan trọng về quyền riêng tư
- Nội dung học sinh gõ trong khung trò chuyện được gửi qua máy chủ của web tới Gemini. **Gói miễn phí của Google cho phép dùng nội dung gửi tới để cải thiện sản phẩm**, nên web đã nhắc học sinh không ghi họ tên/số điện thoại/địa chỉ, tự che số điện thoại và email, và nêu rõ trong trang *Quyền riêng tư*. Nếu nhà trường cần cam kết chặt hơn, hãy bật thanh toán (gói trả phí) cho dự án Gemini hoặc xin ý kiến phụ huynh/nhà trường trước khi triển khai rộng.
- Gói miễn phí giới hạn số lượt/phút; khi hết lượt, web báo “Trợ lý đang quá tải” thay vì trả lời giả.
- Học sinh dùng chung máy có thể thấy dữ liệu của nhau (không có đăng nhập). Nên dặn các em dùng máy cá nhân hoặc tải sao lưu rồi xóa dữ liệu khi dùng máy chung (Menu → Xóa toàn bộ dữ liệu).
- Trợ lý có lớp bảo vệ an toàn: từ khóa nguy cơ (bạo lực, xâm hại, tự làm đau…) luôn hiện thẻ an toàn cố định (111/113/115) ngay cả khi AI hoặc mạng lỗi.

## Cấu trúc thư mục
```
index.html          Khung trang
css/styles.css      Giao diện (sáng/tối, in)
js/                 Ứng dụng (router, store, views, voice, export)
api/                Hàm Vercel: chat, stats, feedback
lib/                Lời nhắc hệ thống, an toàn, gọi Apps Script
apps-script/Code.gs Mã Google Apps Script (bộ đếm + đánh giá)
docs/               Kho tài liệu
vendor/             Thư viện: docx (xuất DOCX), qrcode-generator (QR)
tests/              Kiểm thử + báo cáo
```


## Phiên bản 1.1.0
- Giao diện mới: mỗi bước một màn hình, không cuộn trang; chú cú thông thái; chat và gợi ý AI mở dạng khung trượt; micro dùng chung ở mọi ô nhập.
- AI ổn định hơn: nhiều khóa/model dự phòng, nhớ model đang lỗi, tự bỏ cấu hình khi gặp lỗi 400, đọc JSON dễ tính, giảm thời gian suy nghĩ, dịch vụ dự phòng tùy chọn.
- Kiểm tra AI: mở `/api/health` (liệt kê từng model: ok/mã lỗi, không lộ khóa).

## Phiên bản 1.2.0 — Gửi cho thầy cô + trang quản trị
- Trang cuối của Bước 6: học sinh có thể (không bắt buộc) nhập Họ tên, Lớp, Trường, tick đồng ý rồi "Gửi cho thầy cô". Không gửi hội thoại với AI. Để trống họ tên = ẩn danh.
- Trang quản trị: `địa-chỉ-app/#/admin` (link "Dành cho thầy cô" ở chân trang). Đăng nhập bằng mật khẩu chung; xem danh sách, lọc theo lớp/nhóm/rủi ro/trạng thái, thống kê theo nhóm, đổi trạng thái (Mới / Đang hỗ trợ / Đã xong) + ghi chú, xóa, tải CSV (mở bằng Excel).
- Mức rủi ro được máy chủ tự tính lại từ từ khóa an toàn; ca "Cần chú ý" được đánh dấu đỏ.
- Cần làm để dùng:
  1. Dán lại `apps-script/Code.gs` mới vào Apps Script → Triển khai > Quản lý bản triển khai > Chỉnh sửa > Phiên bản mới → Triển khai. (Tạo trang tính `VanDe` tự động.)
  2. Vercel → Settings → Environment Variables: thêm `ADMIN_PASSWORD` (mật khẩu admin, dài và khó đoán) rồi Redeploy. `APPS_SCRIPT_URL`/`APPS_SCRIPT_TOKEN` dùng chung với bộ đếm.
- Lưu ý bảo mật: bảng tính chứa dữ liệu học sinh, chỉ chia sẻ cho người có trách nhiệm; sai mật khẩu 8 lần sẽ bị khóa 15 phút.

## Phiên bản 1.3.0 — Luồng 6 bước mới
- Bước 1: chỉ nhập vấn đề (không có nút Hỏi trợ lý).
- Bước 2: hai câu hỏi (nguyên nhân; kết quả mong muốn).
- Bước 3: AI tự đề xuất 3 biện pháp; em chọn một hoặc nhiều cách, hoặc tự thêm; có "Gợi ý cách khác".
- Bước 4: AI tự phân tích ưu điểm/hạn chế từng cách em chọn (sửa được); em tự quyết định chọn một cách và nêu lý do.
- Bước 5: AI tự soạn các việc cần làm theo trình tự, kèm hướng dẫn cách làm; em đánh dấu tiến độ.
- Bước 6: em chọn hài lòng / chưa hài lòng (chưa → quay lại Bước 3, giữ các biện pháp cũ), cho điểm 1-5 và nhận xét; rồi tùy chọn gửi cho thầy cô.
- Bảng `VanDe` trên Google Sheets đổi cột (Nguyên nhân, Kết quả mong muốn, Biện pháp chọn, Kế hoạch, Hài lòng, Điểm, Nhận xét). Nếu đã tạo trang tính `VanDe` ở bản 1.2.0, hãy xóa trang tính đó (hoặc đổi tên) rồi dán lại `apps-script/Code.gs` mới và triển khai lại.

## Phiên bản 12 — Nghe đọc nội dung và âm thanh
- Bước 3, 4, 5: trợ lý tự đọc nội dung (giọng tiếng Việt của trình duyệt); có nút Nghe/Dừng và ô Tự đọc.
- Âm thanh nhẹ khi chuyển câu/bước; nút bật/tắt ở thanh trên cùng.

## Phiên bản 11 — Hướng dẫn sử dụng gộp, Admin lên góc phải
- Gộp Giới thiệu + Quyền riêng tư thành trang "Hướng dẫn sử dụng"; liên kết Hướng dẫn và Admin nằm cạnh nút Mục lục.
- Chân trang hiển thị phiên bản là số tự nhiên (11, 12, 13…).

## Phiên bản 1.3.1 — Tư vấn theo tài liệu tham khảo
- Lời nhắc hệ thống của trợ lý (`lib/prompt.js`) đưa vào 4 tài liệu: Bộ Quy tắc bảo vệ trẻ em trên môi trường mạng, Kỹ năng giải quyết vấn đề (6 bước, 5 Tại sao, tiêu chí lựa chọn, kế hoạch + dự phòng), Chương trình GDPT 2018 (năng lực giải quyết vấn đề và sáng tạo, giao tiếp - hợp tác), UNESCO AI Competency Framework for Students (2024).
- Trang "Giới thiệu" có mục "Cơ sở tham khảo".
