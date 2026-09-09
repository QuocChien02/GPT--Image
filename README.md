# GPT Image Studio (bản đầy đủ, có bảo mật)

Web tạo ảnh AI bằng model **gpt-image-2** của OpenAI — đầy đủ tính năng + các lớp bảo mật cơ bản cho việc deploy công khai.

## Tính năng
- Text → Ảnh và Ảnh → Ảnh (tối đa 4 ảnh tham chiếu/lượt)
- 11 preset phong cách dựng sẵn (ảnh thực, anime, điện ảnh, 3D render, sản phẩm studio...)
- Chọn tỉ lệ khung hình / chất lượng / định dạng file / số ảnh đầu ra
- Ước tính chi phí trước khi tạo (số liệu tham khảo — xem lưu ý bên dưới)
- Gallery kết quả, tải ảnh, và nút "dùng làm ảnh tham chiếu" để tạo tiếp từ ảnh vừa tạo
- Giao diện tiếng Việt, dark theme

## Các lớp bảo mật đã tích hợp

| Lớp bảo mật | Mô tả |
|---|---|
| **Đăng nhập bằng mật khẩu** | Bật qua biến `APP_PASSWORD`. So sánh mật khẩu bằng `timingSafeEqual` để chống timing attack. Phiên đăng nhập lưu qua cookie `httpOnly + sameSite=strict` (không đọc được từ JS, chống XSS lấy cắp session). |
| **Chống brute-force mật khẩu** | `/api/login` giới hạn 10 lần thử/15 phút mỗi IP. |
| **Rate limit API tạo ảnh** | Tối đa 12 lượt gọi/phút mỗi IP — chống spam gọi API tốn tiền. |
| **Whitelist tham số** | `size`, `quality`, `format` chỉ nhận giá trị định nghĩa sẵn trong `config.js` — client không thể tự gửi giá trị lạ vào OpenAI. |
| **Giới hạn upload** | Ảnh tham chiếu: tối đa 4 ảnh, ≤10MB/ảnh, chỉ nhận PNG/JPEG/WEBP (kiểm tra MIME type). |
| **Giới hạn độ dài prompt** | Cắt ở 4000 ký tự, loại bỏ ký tự điều khiển. |
| **Security headers** | Dùng `helmet` — CSP, tắt `x-powered-by`, chặn embed trong iframe (`frameAncestors: none`). |
| **Không lộ API key** | `OPENAI_API_KEY` chỉ tồn tại phía server, không bao giờ trả về client. `/api/config` chỉ trả dữ liệu không nhạy cảm. |
| **Không lộ lỗi nội bộ** | Lỗi chi tiết chỉ log ở server (console), client chỉ nhận thông báo chung chung. |
| **Dọn file tạm** | Ảnh upload tạm bị xoá ngay sau khi xử lý xong (kể cả khi lỗi). |

### Những điều BẠN cần tự làm thêm khi deploy công khai
- **Luôn bật `APP_PASSWORD`** — không để trống khi deploy ra internet.
- **Đặt `SESSION_SECRET`** cố định, ngẫu nhiên, dài (không dùng giá trị mẫu). Nếu không đặt, session sẽ bị mất mỗi khi server restart (không nghiêm trọng nhưng bất tiện).
- **Đặt `NODE_ENV=production`** khi deploy — bật cookie `secure` (chỉ gửi qua HTTPS).
- **Dùng HTTPS** (Render/Railway/Fly.io đều tự cấp SSL miễn phí) — cookie phiên đăng nhập sẽ vô nghĩa nếu chạy HTTP.
- **Theo dõi usage trên dashboard OpenAI** định kỳ — rate limit ở đây chỉ chặn spam cơ bản, không thay thế việc theo dõi chi phí thực tế.
- **Không commit file `.env`** lên Git (thêm vào `.gitignore`).

### Về bảng giá ước tính
Số liệu trong `config.js` (`PRICE_PER_IMAGE_USD`) là **giá tham khảo mình đặt tạm** để bạn có con số ước lượng trên UI — mình không có quyền truy cập giá real-time từ OpenAI nên **không đảm bảo chính xác**. Hãy tự kiểm tra và cập nhật lại theo trang giá chính thức https://openai.com/api/pricing trước khi dùng để tính chi phí thật.

## Cài đặt

```bash
npm install
```

## Cấu hình

1. Đổi tên `.env.example` thành `.env`
2. Điền `OPENAI_API_KEY`
3. Đặt `APP_PASSWORD` (khuyến nghị bắt buộc nếu deploy public)
4. Tạo `SESSION_SECRET` ngẫu nhiên:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   rồi dán vào `.env`

## Chạy

```bash
npm start
```

Mở `http://localhost:3000`.

## Deploy
Khuyến nghị **Render / Railway / Fly.io** (cần server Node chạy liên tục — Vercel yêu cầu chuyển sang serverless function nên không phù hợp với cấu trúc hiện tại).

Nhớ set đầy đủ biến môi trường (`OPENAI_API_KEY`, `APP_PASSWORD`, `SESSION_SECRET`, `NODE_ENV=production`) trên nền tảng deploy.

## Cấu trúc project
```
gpt-image-studio/
├── server.js           # Backend: proxy OpenAI + toàn bộ lớp bảo mật
├── config.js            # Whitelist tham số, bảng giá ước tính, preset phong cách
├── package.json
├── .env.example
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── README.md
```
