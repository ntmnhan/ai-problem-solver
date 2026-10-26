// Cấu hình tập trung. Phiên bản và ngày cập nhật chỉ sửa ở đây.
export const CONFIG = {
  name: 'AI Problem Solver',
  tagline: 'Trợ lý giải quyết vấn đề thực tiễn',
  slogan: 'AI hỗ trợ tư duy, không thay thế quyết định của học sinh.',
  version: '1.0.0',
  releaseDate: '26/10/2026',
  // Điền địa chỉ chính thức (https://...) nếu muốn cố định URL của mã QR.
  // Để trống: dùng địa chỉ đang mở nếu là https và không phải localhost.
  siteUrl: '',
  // Tên nhóm thực hiện (chỉ hiển thị khi chủ dự án xác nhận). Để trống thì ẩn.
  teamName: '',
  // Thông tin tác giả (hiển thị ở trang Giới thiệu).
  authorsHeading: 'Dự án nghiên cứu khoa học dành cho học sinh THCS',
  authors: [
    { role: 'Học sinh thực hiện', name: 'Nguyễn Trần Hoàng Phúc', sub: 'Học sinh THCS' },
    { role: 'Học sinh thực hiện', name: 'Nguyễn Chí Phong', sub: 'Học sinh THCS' },
    { role: 'Giáo viên hướng dẫn', name: 'Nguyễn Thị Phương Lan', sub: 'Cố vấn sư phạm & nghiên cứu', teacher: true }
  ],
  hotline: { children: '111', police: '113', ambulance: '115' }
};

export const STEPS = [
  {
    n: 1,
    short: 'Nhận diện',
    name: 'Nhận diện vấn đề',
    title: 'Vấn đề em đang gặp phải là…',
    intro:
      'Chào em! Hiện tại em đang gặp vấn đề gì trong học tập, gia đình, tình bạn hoặc cuộc sống hằng ngày? Em hãy chia sẻ cho mình biết nha!'
  },
  {
    n: 2,
    short: 'Phân tích',
    name: 'Tìm hiểu và phân tích',
    title: 'Mình cùng tìm hiểu kỹ hơn',
    intro:
      'Mình cùng làm rõ nguyên nhân nhé. Em hãy kể thêm: chuyện này bắt đầu khi nào, và điều gì em đã chắc chắn, điều gì em mới chỉ đoán?'
  },
  {
    n: 3,
    short: 'Giải pháp',
    name: 'Đề xuất giải pháp',
    title: 'Em có thể làm gì?',
    intro:
      'Em hãy tự nghĩ ra vài cách giải quyết trước nhé, nghĩ gì ghi nấy, chưa cần hoàn hảo. Sau đó mình sẽ cùng gợi mở thêm.'
  },
  {
    n: 4,
    short: 'Lựa chọn',
    name: 'Phân tích và lựa chọn',
    title: 'So sánh và chọn cách phù hợp',
    intro:
      'Mình cùng xem ưu điểm, hạn chế và hậu quả của từng cách. Em là người chọn, mình chỉ giúp em nghĩ kỹ hơn.'
  },
  {
    n: 5,
    short: 'Thực hiện',
    name: 'Thực hiện giải pháp',
    title: 'Chia nhỏ thành từng việc',
    intro:
      'Em hãy chia cách đã chọn thành các việc nhỏ, ghi thời gian và ai/cái gì có thể giúp em. Làm xong việc nào em tự đánh dấu việc đó nhé.'
  },
  {
    n: 6,
    short: 'Đánh giá',
    name: 'Đánh giá và điều chỉnh',
    title: 'Kết quả thế nào rồi?',
    intro:
      'Em đã thử làm như thế nào và kết quả ra sao? Mình cùng đối chiếu với mục tiêu ban đầu và rút kinh nghiệm nhé.'
  }
];

export const CATEGORIES = ['Học tập', 'Gia đình', 'Tình bạn', 'Đời sống hằng ngày', 'Khác'];

export const STATUS_LABEL = {
  not_started: 'Chưa bắt đầu',
  in_progress: 'Đang thực hiện',
  done: 'Hoàn thành'
};

export const TASK_STATUS = {
  todo: 'Chưa làm',
  doing: 'Đang làm',
  done: 'Đã xong'
};
