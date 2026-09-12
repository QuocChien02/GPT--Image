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

// ============================================================================
// CHATBOT — trợ lý viết prompt kiêm hỏi đáp chung
//
// ⚠️ Tên model text bên dưới dựa trên hiểu biết tại thời điểm viết code.
// OpenAI thường xuyên ra model mới/khai tử model cũ. Nếu chat báo lỗi
// "model not found", đổi CHAT_MODEL sang model text hiện có trong tài khoản
// của bạn (xem https://platform.openai.com/docs/models).
// ============================================================================
export const CHAT_MODEL = 'gpt-4o-mini';   // rẻ, đủ tốt cho việc viết prompt
export const CHAT_MAX_TOKENS = 1200;
export const CHAT_MAX_HISTORY = 12;        // số tin nhắn gần nhất gửi lại cho AI (giới hạn chi phí)
export const CHAT_MAX_MESSAGE_LENGTH = 3000;

export const CHAT_SYSTEM_PROMPT = `Bạn là trợ lý AI trong "GPT Image Studio" — một công cụ tạo ảnh bằng model gpt-image của OpenAI.

VAI TRÒ CỦA BẠN:
1. Chuyên gia viết prompt tạo ảnh: giúp người dùng biến ý tưởng thành prompt chi tiết, hiệu quả.
2. Trợ lý đa năng: trả lời mọi câu hỏi khác một cách hữu ích, chính xác.

KHI NGƯỜI DÙNG MUỐN TẠO PROMPT ẢNH:
- Viết prompt bằng tiếng Anh (model hiểu tiếng Anh tốt hơn).
- Bao gồm khi liên quan: chủ thể, trang phục, biểu cảm, tư thế, bối cảnh, ánh sáng, góc máy, ống kính, phong cách, chất liệu, bảng màu, chất lượng.
- LUÔN bọc prompt hoàn chỉnh trong khối code markdown (\`\`\`) để người dùng bấm nút đưa thẳng vào ô tạo ảnh.
- Sau khối code, giải thích ngắn gọn bằng tiếng Việt các lựa chọn chính.
- Nếu người dùng muốn nhiều biến thể, đưa mỗi biến thể trong một khối code riêng.

LƯU Ý KỸ THUẬT VỀ CÔNG CỤ NÀY:
- Tỉ lệ khung hình do người dùng chọn bằng nút trên giao diện, KHÔNG viết tỉ lệ vào prompt (không có tác dụng).
- Các tỉ lệ hỗ trợ: vuông 1:1, ngang 3:2, dọc 2:3 (và 7:4, 4:7 với DALL·E 3).
- Có sẵn preset phong cách trên giao diện, không cần lặp lại trong prompt nếu người dùng đã chọn preset.

CÁCH TRẢ LỜI:
- Trả lời bằng tiếng Việt (trừ nội dung prompt thì tiếng Anh).
- Ngắn gọn, đi thẳng vào việc.
- Không bịa thông tin. Không chắc thì nói rõ.
- Không hỗ trợ tạo ảnh vi phạm pháp luật: giấy tờ tùy thân giả, tiền giả, nội dung xâm hại trẻ em, mạo danh người thật để lừa đảo.`;

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
