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
| `GEMINI_MODEL` | (không bắt buộc) tên model, đặt lên đầu danh sách; app luôn tự thử tiếp `gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-3.6-flash`, các bí danh `-latest`, rồi model 2.5. Nếu tất cả đều 404, app tự hỏi Google (ListModels) để chọn model flash mới nhất khóa của bạn dùng được. Lưu ý: Google chỉ còn cho tài khoản cũ dùng gemini-2.5; khóa mới sẽ báo 404 với các model này. Nếu Google đổi tên/ngừng model, chỉ cần sửa biến này. |
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
- Giao diện mới: mỗi bước một màn hình, không cuộn trang; chú thỏ thông thái; chat và gợi ý AI mở dạng khung trượt; micro dùng chung ở mọi ô nhập.
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

## Phiên bản 30 — Phân quyền quản trị
- Hai mật khẩu trên Vercel (Settings → Environment Variables, rồi Redeploy):
  - `ADMIN_PASSWORD`: thầy cô — xem nội dung các ca, đổi trạng thái, ghi chú, xóa, xuất CSV.
  - `STUDENT_PASSWORD` (tùy chọn): học sinh quản trị — CHỈ xem thống kê tổng hợp (tổng số ca, theo nhóm, tiến độ, 14 ngày gần đây, số ca cần thầy cô chú ý). Không đặt thì học sinh không đăng nhập được. Hai mật khẩu phải khác nhau.
- Phân quyền được kiểm tra ở máy chủ: tài khoản học sinh không nhận mã, tiêu đề hay nội dung của ca nào, và bị từ chối (403) khi sửa/xóa. Test C-04, AD-02.

## Phiên bản 29 — Xưng hô "bạn", góc nhìn học sinh
- Toàn bộ giao diện, hướng dẫn, thông báo, lời nhắc cho AI, báo cáo xuất ra và trang tài liệu đổi cách xưng hô từ "em" sang "bạn" (giữ nguyên "trẻ em").
- Góc nhìn: học sinh làm app để hỗ trợ thầy cô tư vấn các bạn trong trường. Trang quản trị ghi rõ dành cho nhóm học sinh hỗ trợ và thầy cô tư vấn; ca "Cần chú ý" phải báo ngay thầy cô tư vấn, không tự xử lý. Thêm mục "Về dự án" ở trang Hướng dẫn.

## Phiên bản 28 — Chat giới hạn
- Nút "Hỏi trợ lý" chỉ còn ở Bước 2, tối đa 8 lượt hỏi mỗi vấn đề (hết lượt thì khóa ô nhập, nhắc nói chuyện với thầy cô/người lớn). Bước 3-6 AI vẫn tự gợi ý nhưng không còn khung chat. Test CH-01.

## Phiên bản 27 — An toàn cho trẻ em: không thu thập họ tên/lớp/trường
- App không còn hỏi họ tên, lớp, trường. Chỉ có mã ẩn danh ngẫu nhiên (HS-xxxxx) lưu trên thiết bị. Hồ sơ cũ có họ tên bị xóa khỏi thiết bị khi mở bản mới.
- Gửi cho thầy cô (tùy chọn, cần tick đồng ý): chỉ gửi nội dung vấn đề kèm mã ẩn danh. Trang quản trị chỉ hiện mã; máy chủ còn loại bỏ họ tên/lớp/trường nếu kho dữ liệu cũ còn lưu.
- Gắn nhãn "do AI tạo ra": giọng chào (Piper), logo, mã nguồn, trợ lý Gemini (màn hình bắt đầu và Hướng dẫn sử dụng). Lời chào ghi âm lại cho khớp (không còn bảo nhập tên/lớp).
- **Bắt buộc khi nâng cấp:** (1) dán lại `apps-script/Code.gs` mới và triển khai lại; (2) XÓA hoặc đổi tên trang tính `VanDe` cũ (cột đã đổi: bỏ Họ tên/Lớp/Trường, thêm Mã học sinh) và nên xóa dữ liệu cũ có họ tên.

## Phiên bản 26 — Bỏ khóa cứng một màn hình
- Mọi thiết bị (điện thoại, máy tính) cuộn trang tự nhiên; ô nhập tự giãn theo nội dung nên hiện đủ các dòng; không còn khung cuộn nhỏ bên trong. Nút Quay lại/Tiếp luôn dính ở đáy màn hình. Test LY-02.

## Phiên bản 25 — Hướng dẫn sử dụng gọn hơn
- Trang Hướng dẫn rút gọn; thêm mục "Nghe AI đọc" (cách khắc phục khi máy chưa có giọng tiếng Việt: Edge, Windows, iPhone, Android). Thông báo thiếu giọng trỏ tới mục này.

## Phiên bản 24 — Chỉ đọc khi bấm Nghe; chọn tốc độ và giọng
- Bỏ hoàn toàn tự đọc (bước 3-5, phản hồi trong khung chat, lời chào). AI chỉ nói khi bấm nút Nghe (mỗi tin nhắn của trợ lý có nút Nghe riêng).
- Nút cài đặt giọng: tốc độ Chậm/Vừa/Nhanh, giọng Mặc định/Nữ/Nam, chọn giọng cụ thể, Nghe thử. Lưu trên máy. Giọng nam/nữ phụ thuộc giọng tiếng Việt cài sẵn trong máy (Edge có HoaiMy nữ, NamMinh nam).
- Gồm cả bản 23: sửa chồng chữ trên điện thoại, tương thích trình duyệt khác Safari/Chrome (dvh, color-mix, inset).

## Phiên bản 22 — Lời chào bằng tệp âm thanh
- Lời chào dùng tệp assets/greeting.mp3 (giọng Piper vais1000, CC BY 4.0) nên nghe được trên mọi máy, kể cả máy không có giọng tiếng Việt.

## Phiên bản 21
- Bỏ dòng "Phiên bản · Cập nhật" lặp trong trang Hướng dẫn (đã có ở chân trang).

## Phiên bản 20 — Cập nhật theo Update_01
- Poster dự án trong trang Hướng dẫn; bấm vào xem lớn.
- Sửa icon Hướng dẫn/Admin bị mất ở màn hình nhỏ.
- Lời chào bằng giọng nói khi vào app (bị trình duyệt chặn thì chào ở lần chạm đầu); nút "Nghe lời chào".

## Phiên bản 19 — Tư vấn sâu hơn
- Bước 3: gợi ý 5 biện pháp khác hướng, nhắc chọn nhiều cách; loại ý trùng.
- Bước 4: lý do chọn không bắt buộc.
- Bước 5: 4-6 việc khác nhau, có kết quả mong đợi và phương án dự phòng (theo tài liệu KN giải quyết vấn đề).
- Bước 6: nhìn lại kế hoạch, đạt mục tiêu chưa, cái gì đã tốt / cần tốt hơn, điểm.
- Admin: giải thích số ca; nới giới hạn gửi theo IP (trường dùng chung mạng).

## Phiên bản 18 — Giao diện máy tính
- Màn hình ≥900px: không khóa cứng chiều cao; nội dung dài cuộn trang, nút điều hướng dính đáy; chữ lớn, rộng hơn (tối đa 980px).
- Sửa nút Nghe bị lặp chữ.

## Phiên bản 13 — Ghi danh tác giả
- Dòng "Tạo bởi" ở trang kết quả/tệp xuất: tên 2 học sinh - Trường THCS Gò Vấp.
- Thông tin tác giả ghi thêm tên trường.

## Phiên bản 12 — Nghe đọc nội dung và âm thanh
- Bước 3, 4, 5: có nút Nghe/Dừng để nghe nội dung (giọng tiếng Việt của trình duyệt); app KHÔNG tự đọc (từ v24).
- Âm thanh nhẹ khi chuyển câu/bước; nút bật/tắt ở thanh trên cùng.

## Phiên bản 11 — Hướng dẫn sử dụng gộp, Admin lên góc phải
- Gộp Giới thiệu + Quyền riêng tư thành trang "Hướng dẫn sử dụng"; liên kết Hướng dẫn và Admin nằm cạnh nút Mục lục.
- Chân trang hiển thị phiên bản là số tự nhiên (11, 12, 13…).

## Phiên bản 1.3.1 — Tư vấn theo tài liệu tham khảo
- Lời nhắc hệ thống của trợ lý (`lib/prompt.js`) đưa vào 4 tài liệu: Bộ Quy tắc bảo vệ trẻ em trên môi trường mạng, Kỹ năng giải quyết vấn đề (6 bước, 5 Tại sao, tiêu chí lựa chọn, kế hoạch + dự phòng), Chương trình GDPT 2018 (năng lực giải quyết vấn đề và sáng tạo, giao tiếp - hợp tác), UNESCO AI Competency Framework for Students (2024).
- Trang "Giới thiệu" có mục "Cơ sở tham khảo".

### v37
- Thống kê Admin gộp TOÀN BỘ dữ liệu cũ (các tab `VanDe_cu_...`, đọc trực tiếp) và mới, không lọc ngày; biểu đồ theo ngày hiện 7 ngày gần nhất. Muốn giới hạn khoảng ngày thì đặt biến Vercel `STATS_FROM` (vd 2026-10-26) và `STATS_DAYS`.
- Ca cũ muốn sửa trạng thái/ghi chú thì chạy hàm `khoiPhucDuLieuCu()` một lần để đưa về tab `VanDe`.

### v36
- Thống kê Admin chỉ tính 7 ngày bắt đầu từ 26/10/2026 (đổi bằng biến Vercel `STATS_FROM` dạng 2026-10-26, `STATS_DAYS`); hiển thị khoảng ngày và biểu đồ theo từng ngày.
- Code.gs: thêm hàm `khoiPhucDuLieuCu()` (chạy một lần trong Apps Script) đưa dữ liệu từ trang `VanDe_cu_...` về trang `VanDe`.

### v35
- Xong Bước 6 (bấm "Xong bước này") thì app tự ghi một lượt tư vấn ẩn danh vào Google Sheet (mã, nhóm, số bước, hài lòng, điểm, mức rủi ro); KHÔNG có nút Gửi, KHÔNG lưu nội dung, họ tên, lớp. Máy chủ chỉ dùng nội dung để tính mức rủi ro rồi bỏ đi.
- Trang cuối Bước 6: Thỏ cảm ơn và chúc; tùy chọn nhờ thầy cô đồng hành: điền họ tên, lớp, tick đồng ý, bấm "Gửi cho thầy cô". Chỉ ca này mới lưu họ tên, lớp và nội dung.
- Phân quyền: mật khẩu học sinh chỉ thấy thống kê (mọi lượt tư vấn); mật khẩu thầy cô thấy thống kê + danh sách các ca đã gửi (họ tên, lớp, nội dung), đổi trạng thái, xuất CSV.
- Apps Script: tự thêm 3 cột cuối (Họ tên, Lớp, Gửi thầy cô) vào trang `VanDe`, giữ dữ liệu. Phải dán lại Code.gs và triển khai phiên bản mới.

### v34
- Bổ sung 4 tài liệu tham khảo (phòng ngừa bắt nạt học đường; giáo trình Kỹ năng giải quyết vấn đề, ra quyết định; kỹ năng ứng phó stress; phòng chống bạo lực gia đình) vào lời nhắc của Thỏ (lib/prompt.js) và mục "Cơ sở tham khảo" trong Hướng dẫn.
- Apps Script: tự đổi tên trang tính `VanDe` cũ (khác cột) thành `VanDe_cu_<ngày giờ>` và tạo trang mới, tránh lỗi không xem được thống kê. Cần dán lại Code.gs và triển khai phiên bản mới.
- /api/admin báo rõ hơn khi Apps Script trả lời sai định dạng.

### v33
- Đổi nhân vật đồng hành từ chú cú sang **chú thỏ** (js/art.js); lời chào đọc "với Thỏ nhé" (assets/greeting.mp3 làm lại); mã QR tự lấy địa chỉ thật (thothongthai.vercel.app) khi mở trên web.
- v32: báo đúng lỗi hết lượt (429) thay vì 404; không gọi lặp khi hết lượt.
- v31: thêm model dự phòng và tự dò model Gemini khả dụng khi gặp 404.
