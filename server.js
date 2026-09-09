import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import FormData from 'form-data';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import {
  ALLOWED_SIZES,
  ALLOWED_QUALITY,
  ALLOWED_FORMATS,
  MAX_IMAGES_PER_REQUEST,
  MAX_REFERENCE_IMAGES,
  MAX_UPLOAD_SIZE_MB,
  MAX_PROMPT_LENGTH,
  PRICE_PER_IMAGE_USD,
  STYLE_PRESETS,
} from './config.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const REQUIRES_PASSWORD = APP_PASSWORD.length > 0;
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-cua-ban'
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex'); // fallback: random mỗi lần khởi động (session sẽ mất khi restart server)
const IS_PROD = process.env.NODE_ENV === 'production';
const MODEL = 'gpt-image-2';

if (!OPENAI_API_KEY) {
  console.warn('⚠️  CẢNH BÁO: Chưa cấu hình OPENAI_API_KEY trong .env — API tạo ảnh sẽ không hoạt động.');
}
if (!REQUIRES_PASSWORD) {
  console.warn('⚠️  CẢNH BÁO: APP_PASSWORD đang để trống — web KHÔNG yêu cầu đăng nhập. Chỉ nên chạy như vậy ở localhost/nội bộ.');
}

// ===================== BẢO MẬT: HEADERS =====================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // cho phép CSS inline đơn giản trong index.html
        imgSrc: ["'self'", 'data:'],             // 'data:' để hiện ảnh base64 kết quả
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.disable('x-powered-by');

app.use(cookieParser());
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===================== UPLOAD ẢNH THAM CHIẾU =====================
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    files: MAX_REFERENCE_IMAGES,
  },
  fileFilter: (req, file, cb) => {
    const allowedMime = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedMime.includes(file.mimetype)) {
      return cb(new Error('Chỉ chấp nhận ảnh PNG, JPEG hoặc WEBP'));
    }
    cb(null, true);
  },
});

// ===================== AUTH: PHIÊN ĐĂNG NHẬP BẰNG APP_PASSWORD =====================
function makeSessionToken() {
  return crypto.createHmac('sha256', SESSION_SECRET).update('authenticated-session').digest('hex');
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // So sánh với buffer cùng độ dài để tránh lộ thông tin qua thời gian xử lý
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAuth(req, res, next) {
  if (!REQUIRES_PASSWORD) return next();
  const token = req.cookies?.session;
  if (token && timingSafeStringEqual(token, makeSessionToken())) {
    return next();
  }
  return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
}

// Giới hạn số lần thử đăng nhập để chống brute-force mật khẩu
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Thử đăng nhập quá nhiều lần, vui lòng thử lại sau ít phút' },
});

app.post('/api/login', loginLimiter, (req, res) => {
  if (!REQUIRES_PASSWORD) {
    return res.json({ ok: true, requiresPassword: false });
  }
  const { password } = req.body || {};
  if (!password || !timingSafeStringEqual(password, APP_PASSWORD)) {
    return res.status(401).json({ error: 'Sai mật khẩu' });
  }
  res.cookie('session', makeSessionToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

// ===================== CONFIG CÔNG KHAI CHO FRONTEND =====================
// Chỉ trả thông tin không nhạy cảm — KHÔNG bao giờ trả OPENAI_API_KEY hay SESSION_SECRET
app.get('/api/config', (req, res) => {
  res.json({
    requiresPassword: REQUIRES_PASSWORD,
    allowedSizes: ALLOWED_SIZES,
    allowedQuality: ALLOWED_QUALITY,
    allowedFormats: ALLOWED_FORMATS,
    maxImagesPerRequest: MAX_IMAGES_PER_REQUEST,
    maxReferenceImages: MAX_REFERENCE_IMAGES,
    pricePerImageUsd: PRICE_PER_IMAGE_USD,
    stylePresets: STYLE_PRESETS,
  });
});

app.get('/api/session-status', (req, res) => {
  if (!REQUIRES_PASSWORD) return res.json({ authenticated: true, requiresPassword: false });
  const token = req.cookies?.session;
  const authenticated = !!(token && timingSafeStringEqual(token, makeSessionToken()));
  res.json({ authenticated, requiresPassword: true });
});

// ===================== RATE LIMIT CHO API TẠO ẢNH =====================
// Bảo vệ chi phí: giới hạn 12 lượt gọi/phút cho mỗi IP
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bạn đang gửi yêu cầu quá nhanh, vui lòng chờ một chút rồi thử lại' },
});

// ===================== HÀM TIỆN ÍCH =====================
function sanitizePrompt(raw) {
  if (typeof raw !== 'string') return '';
  // Bỏ ký tự điều khiển, cắt bớt nếu quá dài
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return cleaned.slice(0, MAX_PROMPT_LENGTH);
}

function pickWhitelisted(value, allowedList, fallback) {
  return allowedList.includes(value) ? value : fallback;
}

function cleanupFiles(files) {
  if (!files) return;
  const list = Array.isArray(files) ? files : [files];
  for (const f of list) {
    if (f?.path) fs.unlink(f.path, () => {});
  }
}

// ===================== API TẠO ẢNH =====================
app.post(
  '/api/generate',
  requireAuth,
  generateLimiter,
  (req, res, next) => {
    upload.array('images', MAX_REFERENCE_IMAGES)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Lỗi upload ảnh tham chiếu' });
      }
      next();
    });
  },
  async (req, res) => {
    const files = req.files;
    try {
      if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: 'Server chưa cấu hình OPENAI_API_KEY' });
      }

      const prompt = sanitizePrompt(req.body.prompt);
      if (!prompt) {
        cleanupFiles(files);
        return res.status(400).json({ error: 'Thiếu prompt hoặc prompt không hợp lệ' });
      }

      const size = pickWhitelisted(req.body.size, ALLOWED_SIZES, 'auto');
      const quality = pickWhitelisted(req.body.quality, ALLOWED_QUALITY, 'auto');
      const outputFormat = pickWhitelisted(req.body.format, ALLOWED_FORMATS, 'png');

      let n = parseInt(req.body.n, 10);
      if (!Number.isFinite(n)) n = 1;
      n = Math.min(Math.max(n, 1), MAX_IMAGES_PER_REQUEST);

      // Ghép style preset (nếu có) vào prompt — preset chỉ lấy từ danh sách đã định nghĩa sẵn (không nhận modifier tự do từ client)
      const presetId = req.body.presetId;
      const preset = STYLE_PRESETS.find((p) => p.id === presetId);
      const finalPrompt = preset?.modifier ? `${prompt}, ${preset.modifier}` : prompt;

      let apiResponse;

      if (files && files.length > 0) {
        const form = new FormData();
        form.append('model', MODEL);
        form.append('prompt', finalPrompt);
        form.append('n', String(n));
        form.append('size', size);
        form.append('quality', quality);
        form.append('output_format', outputFormat);
        for (const file of files) {
          form.append('image[]', fs.createReadStream(file.path), {
            filename: file.originalname || 'reference.png',
          });
        }

        apiResponse = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            ...form.getHeaders(),
          },
          body: form,
        });
      } else {
        apiResponse = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODEL,
            prompt: finalPrompt,
            n,
            size,
            quality,
            output_format: outputFormat,
          }),
        });
      }

      cleanupFiles(files);

      const data = await apiResponse.json();

      if (!apiResponse.ok) {
        // Không lộ chi tiết nội bộ, chỉ log server-side
        console.error('Lỗi OpenAI API:', data);
        return res.status(apiResponse.status).json({
          error: data?.error?.message || 'OpenAI trả về lỗi khi tạo ảnh',
        });
      }

      const images = (data.data || []).map((item) => item.b64_json).filter(Boolean);
      if (images.length === 0) {
        return res.status(502).json({ error: 'Không nhận được ảnh từ OpenAI' });
      }

      const unitPrice = PRICE_PER_IMAGE_USD[quality]?.[size === 'auto' ? '1024x1024' : size] ?? null;

      res.json({
        images,
        meta: {
          size,
          quality,
          format: outputFormat,
          count: images.length,
          estimatedCostUsd: unitPrice ? +(unitPrice * images.length).toFixed(4) : null,
        },
      });
    } catch (err) {
      cleanupFiles(files);
      console.error('Lỗi tạo ảnh:', err);
      res.status(500).json({ error: 'Lỗi server không xác định, vui lòng thử lại' });
    }
  }
);

// ===================== FALLBACK: mọi lỗi chưa bắt được =====================
app.use((err, req, res, next) => {
  console.error('Lỗi chưa xử lý:', err);
  res.status(500).json({ error: 'Đã có lỗi xảy ra' });
});

app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
  console.log(`   Yêu cầu mật khẩu: ${REQUIRES_PASSWORD ? 'CÓ' : 'KHÔNG'}`);
});
