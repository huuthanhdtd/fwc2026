Xây dựng một webapp đơn giản, tương tác với google script để quản lý đặt dự đoán tỉ số dùng cho nội bộ team chơi để tăng tính tương tác các trận đấu trong fifa world cup 2026 với các chức năng sau:



- gọi thực tế từ api của fifa với link sau: https://api.fifa.com/api/v3/calendar/matches?from=2026-06-11T00%3A00%3A00Z&to=2026-07-21T14%3A59%3A59Z&language=en&count=500&idCompetition=17
để hiện danh sách trận đấu, lọc mặc định là ngày truy cập

- mỗi trận đấu dự đoán mặc định là 90', nếu có hiệp phụ hoặc penalty thì tạo 1 trận dự đoán mới.
- bấm vào trận đấu, nhập tỉ số (1 ô textbox) đặt dự đoán thứ tự đội chủ nhà - đội khách, ví dụ: 2-1 (home-away), bấm OK hoặc enter sẽ gọi google script để lưu vào google sheet

- hiển thị lịch sử đặt dự đoán của người dùng trên một tab riêng, có thể lọc theo trận đấu hoặc ngày đặt dự đoán.

- yêu cầu đăng nhập bằng google email

- giao diện thân thiện và dễ sử dụng

- hiển thị lịch sử đặt dự đoán từng trận trực quan ngay trên card từng trận


1.Đăng ký:  `/do #mãtrận n1-n1 [n2-n2],...`
(Tỉ số chủ nhà trước)
2.Sửa tỉ số:  `/change #mãtrận n-ncũ n-nmới`
3.🩸Khô máu:  /khomau #mãtrận n1-n1 [n2-n2],...
　(Đăng ký sau khi hết hiệp 1)
4.⭐Hiệp phụ:  /hp #mãtrận n1-n1 [n2-n2],...
5.Xem lịch: /today,
　Ngày khác: /M/d
　Sắp tới: /upcoming
6.Xem đăng ký: /me [all/#mãtrận/M/d]
　(với M/d là ngày đăng ký)
7.Xem top: /top [do/win/lost/khomau/hp]
8.Xem tài khoản: /bet [all]
9.Đăng ký đội chung kết, bán kết: /do #mã đội 1, đội 2,...
10.Thay đổi đội chung kết, bán kết: /change #mã đội cũ, đội mới
