/**
 * AI Problem Solver — Bộ đếm lượt truy cập + Đánh giá/Góp ý
 * Gắn vào một Google Sheet (Tiện ích mở rộng > Apps Script), dán mã này, rồi Triển khai > Ứng dụng web.
 *
 * Trước khi triển khai: Project Settings > Script properties > thêm  TOKEN = <chuỗi bí mật tự đặt>
 * (Dùng đúng chuỗi này làm APPS_SCRIPT_TOKEN trên Vercel.)
 *
 * Không lưu họ tên, lớp hay nội dung hội thoại của học sinh. Chỉ lưu:
 *  - tổng số lượt truy cập (một con số),
 *  - đánh giá sao và góp ý do học sinh tự viết trong hộp "Đánh giá & góp ý".
 */

var SHEET_NAME = 'GopY';

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
    return json_({ ok: false, error: 'unknown_action' });
  } finally {
    lock.releaseLock();
  }
}
