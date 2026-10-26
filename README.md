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
| `GEMINI_MODEL` | (không bắt buộc) tên model, mặc định `gemini-2.5-flash`. Nếu Google đổi tên/ngừng model, chỉ cần sửa biến này. |
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
