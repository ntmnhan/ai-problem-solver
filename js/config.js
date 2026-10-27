// Cấu hình tập trung. Phiên bản và ngày cập nhật chỉ sửa ở đây.
export const CONFIG = {
  name: 'AI Problem Solver',
  tagline: 'Trợ lý giải quyết vấn đề thực tiễn',
  slogan: 'AI hỗ trợ tư duy, không thay thế quyết định của học sinh.',
  version: '12',
  releaseDate: '27/10/2026',
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
    short: 'Nguyên nhân',
    name: 'Tìm hiểu nguyên nhân và mục tiêu',
    title: 'Mình cùng tìm hiểu kỹ hơn',
    intro: 'Em cho mình biết nguyên nhân em nghĩ tới và kết quả em mong muốn nhé.'
  },
  {
    n: 3,
    short: 'Biện pháp',
    name: 'Đề xuất biện pháp',
    title: 'Em chọn biện pháp nào?',
    intro: 'Mình gợi ý vài biện pháp. Em chọn cách em thấy hợp, hoặc tự thêm cách của em.'
  },
  {
    n: 4,
    short: 'Lựa chọn',
    name: 'Phân tích và lựa chọn',
    title: 'So sánh và chọn cách phù hợp',
    intro: 'Mình cùng xem ưu điểm, hạn chế của từng cách. Em là người quyết định.'
  },
  {
    n: 5,
    short: 'Thực hiện',
    name: 'Hướng dẫn thực hiện',
    title: 'Mình cùng làm từng việc',
    intro: 'Mình hướng dẫn các việc cần làm theo thứ tự. Em làm xong việc nào thì đánh dấu việc đó.'
  },
  {
    n: 6,
    short: 'Đánh giá',
    name: 'Đánh giá và nhận xét',
    title: 'Em thấy cách này thế nào?',
    intro: 'Em cho mình biết em có hài lòng không. Nếu chưa, mình quay lại chọn cách khác.'
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
