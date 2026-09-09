// ===== Whitelist tham số — CHỈ các giá trị này được chấp nhận từ client =====
// Whitelist chống trường hợp client gửi giá trị lạ/độc hại vào API OpenAI.
export const ALLOWED_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536'];
export const ALLOWED_QUALITY = ['auto', 'low', 'medium', 'high'];
export const ALLOWED_FORMATS = ['png', 'jpeg', 'webp'];

export const MAX_IMAGES_PER_REQUEST = 4;   // số ảnh output tối đa mỗi lượt
export const MAX_REFERENCE_IMAGES = 4;     // số ảnh tham chiếu tối đa mỗi lượt
export const MAX_UPLOAD_SIZE_MB = 10;      // giới hạn dung lượng mỗi ảnh tham chiếu
export const MAX_PROMPT_LENGTH = 4000;     // giới hạn ký tự prompt

// ⚠️ LƯU Ý: Đây là bảng giá ƯỚC TÍNH THAM KHẢO để hiện lên UI cho người dùng
// hình dung chi phí trước khi bấm tạo — KHÔNG phải giá chính thức và có thể sai lệch.
// Trước khi dùng để tính tiền thật, hãy tự kiểm tra và cập nhật số liệu theo
// trang giá chính thức mới nhất của OpenAI: https://openai.com/api/pricing
export const PRICE_PER_IMAGE_USD = {
  low:    { '1024x1024': 0.01, '1536x1024': 0.015, '1024x1536': 0.015 },
  medium: { '1024x1024': 0.04, '1536x1024': 0.06,  '1024x1536': 0.06 },
  high:   { '1024x1024': 0.17, '1536x1024': 0.25,  '1024x1536': 0.25 },
  auto:   { '1024x1024': 0.04, '1536x1024': 0.06,  '1024x1536': 0.06 }, // ước tính theo mức trung bình
};

export const STYLE_PRESETS = [
  { id: 'none', label: 'Không dùng preset', modifier: '' },
  { id: 'photo-real', label: 'Ảnh chân thực', modifier: 'photorealistic, natural lighting, high detail, realistic textures' },
  { id: 'cinematic', label: 'Điện ảnh (Cinematic)', modifier: 'cinematic lighting, dramatic composition, film grain, wide shot' },
  { id: 'anime', label: 'Anime', modifier: 'anime style, vibrant colors, clean line art, cel shading' },
  { id: 'watercolor', label: 'Màu nước', modifier: 'watercolor painting style, soft edges, paper texture' },
  { id: 'oil-painting', label: 'Sơn dầu', modifier: 'oil painting style, visible brush strokes, rich texture' },
  { id: '3d-render', label: '3D Render', modifier: '3D render, octane render, studio lighting, high detail' },
  { id: 'minimalist', label: 'Tối giản (Minimalist)', modifier: 'minimalist style, simple shapes, clean background, flat design' },
  { id: 'product-shot', label: 'Ảnh sản phẩm studio', modifier: 'studio product photography, white background, soft shadows, commercial lighting' },
  { id: 'fashion', label: 'Thời trang (Editorial)', modifier: 'editorial fashion photography, high fashion, professional model pose' },
  { id: 'vintage', label: 'Vintage / Retro', modifier: 'vintage film photography, retro color grading, grainy texture' },
];
