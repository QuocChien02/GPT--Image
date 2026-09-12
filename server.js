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
  MODELS,
  DEFAULT_MODEL_ID,
  getModel,
  MAX_REFERENCE_IMAGES,
  MAX_UPLOAD_SIZE_MB,
  MAX_PROMPT_LENGTH,
  PRICE_PER_IMAGE_USD,
  USD_TO_VND_RATE,
  STYLE_PRESETS,
  CHAT_MODEL,
  CHAT_MAX_TOKENS,
  CHAT_MAX_HISTORY,
  CHAT_MAX_MESSAGE_LENGTH,
  CHAT_SYSTEM_PROMPT,
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
    : crypto.randomBytes(32).toString('hex'); // fallback: random mỗi lần khởi động
const IS_PROD = process.env.NODE_ENV === 'production';

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
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'], // data: cho ảnh kết quả base64, blob: cho ảnh tham chiếu xem trước
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

// ===================== AUTH =====================
function makeSessionToken() {
  return crypto.createHmac('sha256', SESSION_SECRET).update('authenticated-session').digest('hex');
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // giữ thời gian xử lý đồng đều
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAuth(req, res, next) {
  if (!REQUIRES_PASSWORD) return next();
  const token = req.cookies?.session;
  if (token && timingSafeStringEqual(token, makeSessionToken())) return next();
  return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Thử đăng nhập quá nhiều lần, vui lòng thử lại sau ít phút' },
});

app.post('/api/login', loginLimiter, (req, res) => {
  if (!REQUIRES_PASSWORD) return res.json({ ok: true, requiresPassword: false });
  const { password } = req.body || {};
  if (!password || !timingSafeStringEqual(password, APP_PASSWORD)) {
    return res.status(401).json({ error: 'Sai mật khẩu' });
  }
  res.cookie('session', makeSessionToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

// ===================== CONFIG CÔNG KHAI =====================
app.get('/api/config', (req, res) => {
  res.json({
    requiresPassword: REQUIRES_PASSWORD,
    models: MODELS,
    defaultModelId: DEFAULT_MODEL_ID,
    maxReferenceImages: MAX_REFERENCE_IMAGES,
    pricePerImageUsd: PRICE_PER_IMAGE_USD,
    usdToVndRate: USD_TO_VND_RATE,
    stylePresets: STYLE_PRESETS,
  });
});

app.get('/api/session-status', (req, res) => {
  if (!REQUIRES_PASSWORD) return res.json({ authenticated: true, requiresPassword: false });
  const token = req.cookies?.session;
  const authenticated = !!(token && timingSafeStringEqual(token, makeSessionToken()));
  res.json({ authenticated, requiresPassword: true });
});

// ===================== RATE LIMIT TẠO ẢNH =====================
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40, // chế độ hàng loạt gửi mỗi ảnh 1 request riêng nên cần hạn mức cao hơn
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bạn đang gửi yêu cầu quá nhanh, vui lòng chờ một chút rồi thử lại' },
});

// ===================== TIỆN ÍCH =====================
function sanitizePrompt(raw) {
  if (typeof raw !== 'string') return '';
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
      if (err) return res.status(400).json({ error: err.message || 'Lỗi upload ảnh tham chiếu' });
      next();
    });
  },
  async (req, res) => {
    const files = req.files;
    try {
      if (!OPENAI_API_KEY) {
        cleanupFiles(files);
        return res.status(500).json({ error: 'Server chưa cấu hình OPENAI_API_KEY' });
      }

      // --- Xác định model, mọi tham số sau đó whitelist theo NĂNG LỰC của model đó ---
      const model = getModel(req.body.model) || getModel(DEFAULT_MODEL_ID);
      if (!model) {
        cleanupFiles(files);
        return res.status(400).json({ error: 'Model không hợp lệ' });
      }

      const prompt = sanitizePrompt(req.body.prompt);
      if (!prompt) {
        cleanupFiles(files);
        return res.status(400).json({ error: 'Thiếu prompt hoặc prompt không hợp lệ' });
      }

      const size = pickWhitelisted(req.body.size, model.sizes, model.sizes[0]);
      const quality = pickWhitelisted(req.body.quality, model.qualities, model.qualities[0]);
      const outputFormat = pickWhitelisted(req.body.format, model.formats, model.formats[0]);

      let n = parseInt(req.body.n, 10);
      if (!Number.isFinite(n)) n = 1;
      n = Math.min(Math.max(n, 1), model.maxImages);

      const hasReferenceImages = files && files.length > 0;
      if (hasReferenceImages && !model.supportsReferenceImages) {
        cleanupFiles(files);
        return res.status(400).json({
          error: `${model.id} không hỗ trợ ảnh tham chiếu. Hãy bỏ ảnh tham chiếu hoặc chọn model khác.`,
        });
      }

      // Preset chỉ lấy từ danh sách định nghĩa sẵn (không nhận modifier tự do từ client)
      const preset = STYLE_PRESETS.find((p) => p.id === req.body.presetId);
      const finalPrompt = preset?.modifier ? `${prompt}, ${preset.modifier}` : prompt;

      let apiResponse;

      if (hasReferenceImages) {
        const form = new FormData();
        form.append('model', model.id);
        form.append('prompt', finalPrompt);
        form.append('n', String(n));
        form.append('size', size);
        form.append('quality', quality);
        if (model.supportsOutputFormat) form.append('output_format', outputFormat);
        for (const file of files) {
          form.append('image[]', fs.createReadStream(file.path), {
            filename: file.originalname || 'reference.png',
          });
        }

        apiResponse = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, ...form.getHeaders() },
          body: form,
        });
      } else {
        const payload = {
          model: model.id,
          prompt: finalPrompt,
          n,
          size,
          quality,
        };
        if (model.supportsOutputFormat) payload.output_format = outputFormat;
        // DALL·E 3 trả về URL mặc định — yêu cầu base64 để đồng nhất cách hiển thị
        if (model.id === 'dall-e-3') payload.response_format = 'b64_json';

        apiResponse = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      cleanupFiles(files);

      const data = await apiResponse.json();

      if (!apiResponse.ok) {
        console.error('Lỗi OpenAI API:', data);
        return res.status(apiResponse.status).json({
          error: data?.error?.message || 'OpenAI trả về lỗi khi tạo ảnh',
        });
      }

      const images = (data.data || []).map((item) => item.b64_json).filter(Boolean);
      if (images.length === 0) {
        return res.status(502).json({ error: 'Không nhận được ảnh từ OpenAI' });
      }

      const unitPrice = PRICE_PER_IMAGE_USD[model.id]?.[quality]?.[size === 'auto' ? '1024x1024' : size] ?? null;
      const estimatedCostUsd = unitPrice ? +(unitPrice * images.length).toFixed(4) : null;
      const estimatedCostVnd = estimatedCostUsd ? Math.round(estimatedCostUsd * USD_TO_VND_RATE) : null;

      res.json({
        images,
        meta: {
          model: model.id,
          size,
          quality,
          format: model.supportsOutputFormat ? outputFormat : 'png',
          count: images.length,
          estimatedCostUsd,
          estimatedCostVnd,
        },
      });
    } catch (err) {
      cleanupFiles(files);
      console.error('Lỗi tạo ảnh:', err);
      res.status(500).json({ error: 'Lỗi server không xác định, vui lòng thử lại' });
    }
  }
);

// ===================== API CHAT (trợ lý prompt + hỏi đáp) =====================
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // chat rẻ hơn ảnh nhiều nhưng vẫn giới hạn để tránh spam
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bạn đang chat quá nhanh, vui lòng chờ một chút' },
});

app.post('/api/chat', requireAuth, chatLimiter, async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Server chưa cấu hình OPENAI_API_KEY' });
    }

    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (rawMessages.length === 0) {
      return res.status(400).json({ error: 'Thiếu nội dung tin nhắn' });
    }

    // Chỉ nhận role user/assistant, cắt độ dài, giới hạn số tin nhắn gần nhất
    const history = rawMessages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-CHAT_MAX_HISTORY)
      .map((m) => ({
        role: m.role,
        content: sanitizePrompt(m.content).slice(0, CHAT_MAX_MESSAGE_LENGTH),
      }))
      .filter((m) => m.content.length > 0);

    if (history.length === 0) {
      return res.status(400).json({ error: 'Nội dung tin nhắn không hợp lệ' });
    }

    const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: CHAT_MAX_TOKENS,
        messages: [{ role: 'system', content: CHAT_SYSTEM_PROMPT }, ...history],
      }),
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error('Lỗi OpenAI Chat API:', data);
      return res.status(apiResponse.status).json({
        error: data?.error?.message || 'OpenAI trả về lỗi khi chat',
      });
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(502).json({ error: 'Không nhận được phản hồi từ OpenAI' });
    }

    res.json({
      reply,
      usage: {
        promptTokens: data?.usage?.prompt_tokens ?? null,
        completionTokens: data?.usage?.completion_tokens ?? null,
      },
    });
  } catch (err) {
    console.error('Lỗi chat:', err);
    res.status(500).json({ error: 'Lỗi server khi xử lý chat' });
  }
});

app.use((err, req, res, next) => {
  console.error('Lỗi chưa xử lý:', err);
  res.status(500).json({ error: 'Đã có lỗi xảy ra' });
});

app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
  console.log(`   Yêu cầu mật khẩu: ${REQUIRES_PASSWORD ? 'CÓ' : 'KHÔNG'}`);
});
