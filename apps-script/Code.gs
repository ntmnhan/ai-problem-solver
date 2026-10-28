/**
 * AI Problem Solver — Bộ đếm lượt truy cập + Đánh giá/Góp ý
 * Gắn vào một Google Sheet (Tiện ích mở rộng > Apps Script), dán mã này, rồi Triển khai > Ứng dụng web.
 *
 * Trước khi triển khai: Project Settings > Script properties > thêm  TOKEN = <chuỗi bí mật tự đặt>
 * (Dùng đúng chuỗi này làm APPS_SCRIPT_TOKEN trên Vercel.)
 *
 * Lưu:
 *  - tổng số lượt truy cập (một con số),
 *  - đánh giá sao và góp ý do học sinh tự viết (trang tính "GopY"),
 *  - các vấn đề mà học sinh TỰ CHỌN gửi cho thầy cô ở bước cuối (trang tính "VanDe", chỉ kèm MÃ ẨN DANH ngẫu nhiên, không có họ tên/lớp/trường).
 * Không bao giờ lưu hội thoại với AI. Sau khi sửa mã: Triển khai > Quản lý bản triển khai > Chỉnh sửa > Phiên bản mới.
 */

var SHEET_NAME = 'GopY';
var CASE_SHEET = 'VanDe';
var CASE_COLS = ['Mã vấn đề', 'Gửi lúc', 'Cập nhật', 'Mã học sinh', 'Nhóm', 'Tiêu đề', 'Vấn đề', 'Nguyên nhân', 'Kết quả mong muốn', 'Biện pháp bạn chọn', 'Lý do', 'Kế hoạch thực hiện', 'Hài lòng', 'Điểm', 'Nhận xét', 'Số bước xong', 'Rủi ro', 'Trạng thái', 'Ghi chú xử lý'];
var KEYS = ['id', 'sentAt', 'updatedAt', 'code', 'category', 'title', 'problem', 'cause', 'goal', 'chosen', 'reason', 'plan', 'happy', 'satisfaction', 'final', 'stepsDone', 'risk', 'status', 'note'];

function safe_(v) {
  v = String(v == null ? '' : v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function caseSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CASE_SHEET);
  // Trang tính cũ (phiên bản trước, còn cột họ tên/lớp/trường) không khớp cột mới: đổi tên để giữ dữ liệu cũ, tạo trang mới.
  if (sh && sh.getLastRow() > 0) {
    var head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
    var same = head.length >= CASE_COLS.length;
    for (var i = 0; same && i < CASE_COLS.length; i++) if (String(head[i]) !== CASE_COLS[i]) same = false;
    if (!same) {
      sh.setName(CASE_SHEET + '_cu_' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd_HHmmss'));
      sh = null;
    }
  }
  if (!sh) sh = ss.insertSheet(CASE_SHEET);
  if (sh.getLastRow() === 0) { sh.appendRow(CASE_COLS); sh.setFrozenRows(1); }
  return sh;
}

function findRow_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function stats_() {
  var p = props_();
  var count = Number(p.getProperty('ratingCount') || 0);
  var sum = Number(p.getProperty('ratingSum') || 0);
  return {
    visits: Number(p.getProperty('visits') || 0),
    ratingCount: count,
    ratingAvg: count > 0 ? Math.round((sum / count) * 10) / 10 : null
  };
}

function doGet() {
  return json_(stats_());
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  var expected = props_().getProperty('TOKEN');
  if (!expected || data.token !== expected) {
    return json_({ ok: false, error: 'unauthorized' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000); // cập nhật nguyên tử khi nhiều lượt đồng thời
  try {
    var p = props_();
    if (data.action === 'visit') {
      p.setProperty('visits', String(Number(p.getProperty('visits') || 0) + 1));
      return json_(Object.assign({ ok: true }, stats_()));
    }
    if (data.action === 'feedback') {
      var rating = Math.round(Number(data.rating) || 0);
      var kind = data.kind === 'idea' ? 'idea' : 'rating';
      var comment = String(data.comment || '').slice(0, 500);
      // Chống chèn công thức vào Google Sheet
      if (/^[=+\-@]/.test(comment)) comment = "'" + comment;
      if (kind === 'rating' && (rating < 1 || rating > 5)) return json_({ ok: false, error: 'bad_rating' });

      var ss = SpreadsheetApp.getActive();
      var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
      if (sh.getLastRow() === 0) sh.appendRow(['Thời gian', 'Loại', 'Số sao', 'Nội dung']);
      sh.appendRow([new Date(), kind === 'idea' ? 'Góp ý' : 'Đánh giá', kind === 'rating' ? rating : '', comment]);

      if (kind === 'rating') {
        p.setProperty('ratingCount', String(Number(p.getProperty('ratingCount') || 0) + 1));
        p.setProperty('ratingSum', String(Number(p.getProperty('ratingSum') || 0) + rating));
      }
      return json_(Object.assign({ ok: true }, stats_()));
    }
    if (data.action === 'share') {
      var r = data.record || {};
      var sh = caseSheet_();
      var row = findRow_(sh, String(r.id));
      var now = new Date();
      var prev = row ? sh.getRange(row, 1, 1, KEYS.length).getValues()[0] : null;
      var vals = KEYS.map(function (k, i) {
        if (k === 'sentAt') return prev ? prev[i] : now;
        if (k === 'updatedAt') return now;
        if (k === 'status') return prev && prev[i] ? prev[i] : 'Mới';
        if (k === 'note') return prev ? prev[i] : '';
        if (k === 'satisfaction' || k === 'stepsDone') return Number(r[k]) || 0;
        return safe_(r[k]);
      });
      if (row) sh.getRange(row, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
      return json_({ ok: true });
    }
    if (data.action === 'adminList') {
      var sh2 = caseSheet_();
      var n = sh2.getLastRow() - 1;
      var items = [];
      if (n > 0) {
        var rows = sh2.getRange(2, 1, n, KEYS.length).getValues();
        rows.forEach(function (rw) {
          var o = {};
          KEYS.forEach(function (k, i) {
            var v = rw[i];
            o[k] = v instanceof Date ? v.getTime() : v;
          });
          items.push(o);
        });
      }
      items.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      return json_({ ok: true, items: items.slice(0, 1000) });
    }
    if (data.action === 'adminUpdate') {
      var sh3 = caseSheet_();
      var r3 = findRow_(sh3, String(data.id));
      if (!r3) return json_({ ok: false, error: 'not_found' });
      sh3.getRange(r3, KEYS.indexOf('status') + 1).setValue(String(data.status));
      sh3.getRange(r3, KEYS.indexOf('note') + 1).setValue(safe_(data.note));
      sh3.getRange(r3, KEYS.indexOf('updatedAt') + 1).setValue(new Date());
      return json_({ ok: true });
    }
    if (data.action === 'adminDelete') {
      var sh4 = caseSheet_();
      var r4 = findRow_(sh4, String(data.id));
      if (!r4) return json_({ ok: false, error: 'not_found' });
      sh4.deleteRow(r4);
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'unknown_action' });
  } finally {
    lock.releaseLock();
  }
}
