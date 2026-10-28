// Cấu hình tập trung. Phiên bản và ngày cập nhật chỉ sửa ở đây.
export const CONFIG = {
  name: 'AI Problem Solver',
  tagline: 'Trợ lý giải quyết vấn đề thực tiễn',
  slogan: 'AI hỗ trợ tư duy, không thay thế quyết định của học sinh.',
  version: '37',
  releaseDate: '27/10/2026',
  // Điền địa chỉ chính thức (https://...) nếu muốn cố định URL của mã QR.
  // Để trống: dùng địa chỉ đang mở nếu là https và không phải localhost.
  siteUrl: '',
  // Tên nhóm thực hiện (chỉ hiển thị khi chủ dự án xác nhận). Để trống thì ẩn.
  teamName: '',
  schoolName: 'Trường THCS Gò Vấp',
  creditNames: 'Nguyễn Trần Hoàng Phúc và Nguyễn Chí Phong',
  // Thông tin tác giả (hiển thị ở trang Giới thiệu).
  authorsHeading: 'Dự án nghiên cứu khoa học dành cho học sinh THCS',
  authors: [
    { role: 'Học sinh thực hiện', name: 'Nguyễn Trần Hoàng Phúc', sub: 'Học sinh Trường THCS Gò Vấp' },
    { role: 'Học sinh thực hiện', name: 'Nguyễn Chí Phong', sub: 'Học sinh Trường THCS Gò Vấp' },
    { role: 'Giáo viên hướng dẫn', name: 'Nguyễn Thị Phương Lan', sub: 'Cố vấn sư phạm & nghiên cứu', teacher: true }
  ],
  hotline: { children: '111', police: '113', ambulance: '115' }
};

export const STEPS = [
  {
    n: 1,
    short: 'Nhận diện',
    name: 'Nhận diện vấn đề',
    title: 'Vấn đề bạn đang gặp phải là…',
    intro:
      'Chào bạn! Hiện tại bạn đang gặp vấn đề gì trong học tập, gia đình, tình bạn hoặc cuộc sống hằng ngày? Bạn hãy chia sẻ cho mình biết nha!'
  },
  {
    n: 2,
    short: 'Nguyên nhân',
    name: 'Tìm hiểu nguyên nhân và mục tiêu',
    title: 'Mình cùng tìm hiểu kỹ hơn',
    intro: 'Bạn cho mình biết nguyên nhân bạn nghĩ tới và kết quả bạn mong muốn nhé.'
  },
  {
    n: 3,
    short: 'Biện pháp',
    name: 'Đề xuất biện pháp',
    title: 'Bạn chọn biện pháp nào?',
    intro: 'Mình gợi ý vài biện pháp. Bạn chọn cách bạn thấy hợp, hoặc tự thêm cách của bạn.'
  },
  {
    n: 4,
    short: 'Lựa chọn',
    name: 'Phân tích và lựa chọn',
    title: 'So sánh và chọn cách phù hợp',
    intro: 'Mình cùng xem ưu điểm, hạn chế của từng cách. Bạn là người quyết định.'
  },
  {
    n: 5,
    short: 'Thực hiện',
    name: 'Hướng dẫn thực hiện',
    title: 'Mình cùng làm từng việc',
    intro: 'Mình hướng dẫn các việc cần làm theo thứ tự. Bạn làm xong việc nào thì đánh dấu việc đó.'
  },
  {
    n: 6,
    short: 'Đánh giá',
    name: 'Đánh giá và nhận xét',
    title: 'Bạn thấy cách này thế nào?',
    intro: 'Bạn cho mình biết bạn có hài lòng không. Nếu chưa, mình quay lại chọn cách khác.'
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
