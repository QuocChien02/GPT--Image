// ============================================================================
// ĐỊNH NGHĨA MODEL — mỗi model OpenAI hỗ trợ tham số khác nhau.
// Frontend đọc bảng này để tự đổi các lựa chọn khi user chuyển model,
// backend dùng nó để whitelist (chặn client gửi tham số model không hỗ trợ).
//
// ⚠️ Khả năng của từng model dưới đây dựa trên tài liệu OpenAI tại thời điểm
// viết code. OpenAI có thể thay đổi/bổ sung — nếu gọi API báo lỗi tham số,
// hãy đối chiếu lại https://platform.openai.com/docs/api-reference/images
// và cập nhật bảng này.
// ============================================================================
export const MODELS = [
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2 — mới nhất, chất lượng cao nhất',
    sizes: ['auto', '1024x1024', '1536x1024', '1024x1536'],
    qualities: ['auto', 'low', 'medium', 'high'],
    formats: ['png', 'jpeg', 'webp'],
    maxImages: 4,
    supportsReferenceImages: true,   // dùng được endpoint /images/edits
    supportsOutputFormat: true,
  },
  {
    id: 'gpt-image-1',
    label: 'GPT Image 1 — thế hệ trước, rẻ hơn',
    sizes: ['auto', '1024x1024', '1536x1024', '1024x1536'],
    qualities: ['auto', 'low', 'medium', 'high'],
    formats: ['png', 'jpeg', 'webp'],
    maxImages: 4,
    supportsReferenceImages: true,
    supportsOutputFormat: true,
  },
  {
    id: 'dall-e-3',
    label: 'DALL·E 3 — chỉ text→ảnh, 1 ảnh/lượt',
    sizes: ['1024x1024', '1792x1024', '1024x1792'],
    qualities: ['standard', 'hd'],
    formats: ['png'],
    maxImages: 1,                    // DALL·E 3 chỉ trả về 1 ảnh mỗi request
    supportsReferenceImages: false,  // không hỗ trợ ảnh tham chiếu
    supportsOutputFormat: false,     // không nhận tham số output_format
  },
];

export const DEFAULT_MODEL_ID = 'gpt-image-2';

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || null;
}

// ===== Giới hạn chung =====
export const MAX_REFERENCE_IMAGES = 4;     // số ảnh tham chiếu tối đa mỗi lượt
export const MAX_UPLOAD_SIZE_MB = 10;      // giới hạn dung lượng mỗi ảnh tham chiếu
export const MAX_PROMPT_LENGTH = 4000;     // giới hạn ký tự prompt

// Tỉ giá quy đổi USD -> VNĐ để hiện chi phí ước tính bằng VNĐ trên UI.
// ⚠️ Đây là tỉ giá bạn TỰ đặt/cập nhật định kỳ — không tự động lấy tỉ giá thực tế.
export const USD_TO_VND_RATE = 25400;

// ⚠️ BẢNG GIÁ ƯỚC TÍNH THAM KHẢO — hiện lên UI để hình dung chi phí trước khi tạo.
// KHÔNG phải giá chính thức, có thể sai lệch. Hãy tự kiểm tra và cập nhật theo
// trang giá chính thức mới nhất: https://openai.com/api/pricing
export const PRICE_PER_IMAGE_USD = {
  'gpt-image-2': {
    low:    { '1024x1024': 0.01, '1536x1024': 0.015, '1024x1536': 0.015 },
    medium: { '1024x1024': 0.04, '1536x1024': 0.06,  '1024x1536': 0.06 },
    high:   { '1024x1024': 0.17, '1536x1024': 0.25,  '1024x1536': 0.25 },
    auto:   { '1024x1024': 0.04, '1536x1024': 0.06,  '1024x1536': 0.06 },
  },
  'gpt-image-1': {
    low:    { '1024x1024': 0.011, '1536x1024': 0.016, '1024x1536': 0.016 },
    medium: { '1024x1024': 0.042, '1536x1024': 0.063, '1024x1536': 0.063 },
    high:   { '1024x1024': 0.167, '1536x1024': 0.25,  '1024x1536': 0.25 },
    auto:   { '1024x1024': 0.042, '1536x1024': 0.063, '1024x1536': 0.063 },
  },
  'dall-e-3': {
    standard: { '1024x1024': 0.04, '1792x1024': 0.08, '1024x1792': 0.08 },
    hd:       { '1024x1024': 0.08, '1792x1024': 0.12, '1024x1792': 0.12 },
  },
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
