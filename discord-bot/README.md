# Hướng Dẫn Cấu Hình & Sử Dụng Bot Discord FWC 2026

Bot Discord này cho phép các thành viên trong team đặt dự đoán, sửa dự đoán, xem lịch thi đấu và dự đoán dự đoán đặc biệt trực tiếp từ Discord. Dữ liệu sẽ được đồng bộ hóa tức thời về hệ thống Google Sheets đã có của bạn.

---

## 🛠️ Bước 1: Tạo Bot trên Discord Developer Portal

1. Truy cập [Discord Developer Portal](https://discord.com/developers/applications) và đăng nhập bằng tài khoản Discord của bạn.
2. Nhấp vào nút **New Application** ở góc trên cùng bên phải.
3. Đặt tên cho ứng dụng (ví dụ: `FWC 2026 Betting Bot`) và nhấp **Create**.
4. Vào mục **Bot** ở thanh menu bên trái:
   - Click **Reset Token** và sao chép mã Token hiển thị (đây chính là `DISCORD_TOKEN` của bạn). Hãy bảo mật mã này!
   - Kéo xuống phần **Privileged Gateway Intents** và **BẮT BUỘC KÍCH HOẠT** hai quyền sau:
     - **Guild Members Intent** (Để đọc tên hiển thị của thành viên trong server).
     - **Message Content Intent** (Để đọc nội dung các lệnh dự đoán dạng `/`).
   - Nhấn **Save Changes** để lưu cấu hình.

---

## 🔗 Bước 2: Thêm Bot vào Server Discord của bạn

1. Ở menu bên trái, chọn **OAuth2** > **URL Generator**.
2. Tại bảng **Scopes**, tích chọn:
   - `bot`
3. Tại bảng **Bot Permissions** phía dưới, tích chọn các quyền:
   - `Read Messages/View Channels` (Đọc tin nhắn)
   - `Send Messages` (Gửi tin nhắn)
   - `Read Message History` (Đọc lịch sử tin nhắn)
4. Sao chép liên kết (URL) được tạo ở mục **Generated URL** ở đáy trang.
5. Dán URL này vào trình duyệt, chọn server Discord của bạn và nhấp **Phê duyệt (Authorize)** để mời bot vào server.

---

## ⚙️ Bước 3: Cấu Hình Biến Môi Trường (.env)

1. Mở thư mục `discord-bot`.
2. Tạo tệp `.env` bằng cách sao chép tệp `.env.example` hoặc tạo mới:
   ```env
   # Điền token bot Discord của bạn lấy ở Bước 1
   DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN_HERE
   ```
3. Lưu ý: Bot sẽ tự động tìm kiếm biến `VITE_GAS_WEB_APP_URL` tại tệp `.env` của thư mục cha. Nếu bạn muốn cấu hình thủ công URL Apps Script khác, bạn có thể khai báo trực tiếp trong tệp `discord-bot/.env`:
   ```env
   GAS_WEB_APP_URL=https://script.google.com/macros/s/AKfycb.../exec
   ```

---

## 🚀 Bước 4: Cài Đặt và Chạy Bot

1. Mở terminal tại máy của bạn và di chuyển vào thư mục `discord-bot`:
   ```bash
   cd discord-bot
   ```
2. Cài đặt các thư viện cần thiết (`discord.js` và `dotenv`):
   ```bash
   npm install
   ```
3. Khởi động Bot:
   ```bash
   npm start
   ```
   Nếu thành công, bạn sẽ thấy thông báo: `🤖 Bot Discord đã online! Đăng nhập thành công: <Tên_Bot>#<Số>`.

---

## 📖 Hướng Dẫn Sử Dụng Trên Discord

### 1. Liên kết tài khoản (Bắt buộc trước khi chơi)
Mỗi thành viên cần liên kết tài khoản Discord với email Gmail đã dùng trên webapp để bot ghi nhận đúng danh tính dự đoán:
- Lệnh: `/link <email của bạn>` (hoặc `/dangky <email>`, `/register <email>`)
- Ví dụ: `/link hoangtuan@gmail.com`

---

### 2. Danh sách các lệnh dự đoán & tương tác

| Chức năng | Cú pháp lệnh | Ví dụ thực tế |
| :--- | :--- | :--- |
| **Đăng ký dự đoán 90'** | `/do #<số trận> <tỷ số>` | `/do #1 2-1` hoặc nhiều tỷ số `/do #1 2-1,3-0` |
| **Sửa tỷ số dự đoán** | `/change #<số trận> <cũ> <mới>` | `/change #1 2-1 1-1` |
| **Đặt dự đoán Khô máu** | `/khomau #<số trận> <tỷ số>` | `/khomau #1 3-2` |
| **Đặt dự đoán Hiệp phụ** | `/hp #<số trận> <tỷ số>` | `/hp #1 1-0` |
| **Xem lịch đấu hôm nay** | `/today` | `/today` |
| **Xem lịch đấu ngày khác** | `/M/d` (tháng/ngày) | `/6/12` (Xem lịch ngày 12 tháng 6) |
| **Xem các trận sắp tới** | `/upcoming` | `/upcoming` |
| **Xem dự đoán của bản thân** | `/me [all / #trận / M/d]` | `/me #1` hoặc `/me 6/12` hoặc `/me all` |
| **Xem bảng xếp hạng** | `/top [do / win / lost / khomau / hp]` | `/top win` |
| **Xem thông tin tài khoản**| `/bet` | `/bet` |
| **Dự đoán 4 đội Bán kết**| `/bk <đội 1>, <đội 2>, <đội 3>, <đội 4>`| `/bk Đức, Pháp, Anh, Brazil` |
| **Dự đoán 2 đội Chung kết**| `/ck <đội 1>, <đội 2>` | `/ck Đức, Pháp` |
| **Dự đoán đội Vô địch**| `/vd <tên đội>` hoặc `/vđ <tên đội>`| `/vd Đức` |
| **Dự đoán Vua phá lưới** | `/vpl <tên cầu thủ>` | `/vpl Mbappe` |

> 💡 **Lưu ý:**
> - Các dấu gạch chéo `/` trong bảng trên là ký tự text thông thường gõ vào chat. Bạn chỉ cần gõ đúng cú pháp và gửi tin nhắn, Bot sẽ tự động phát hiện và xử lý.
> - Hạn chót khóa dự đoán đặc biệt (`/bk`, `/ck`, `/vd`, `/vpl`) tự động kiểm tra và khóa ngay khi trận khai mạc bắt đầu giống hệt trên Web.
