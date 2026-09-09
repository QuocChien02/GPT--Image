// ============ STATE ============
let CONFIG = null;
let currentModel = null;
let refFiles = [];        // { file, previewUrl }
let resultCount = 0;
let skeletonTimer = null;

// ============ ELEMENTS ============
const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

const modelEl = document.getElementById('model');
const modelHint = document.getElementById('modelHint');
const promptEl = document.getElementById('prompt');
const refField = document.getElementById('refField');
const refDropzone = document.getElementById('refDropzone');
const refInput = document.getElementById('refInput');
const refThumbs = document.getElementById('refThumbs');
const presetEl = document.getElementById('preset');
const sizeSwatches = document.getElementById('sizeSwatches');
const sizeHint = document.getElementById('sizeHint');
const qualityEl = document.getElementById('quality');
const formatField = document.getElementById('formatField');
const formatEl = document.getElementById('format');
const countEl = document.getElementById('count');
const costVndEl = document.getElementById('costVnd');
const costUsdEl = document.getElementById('costUsd');
const genBtn = document.getElementById('genBtn');
const errorBox = document.getElementById('errorBox');
const gallery = document.getElementById('gallery');
const emptyState = document.getElementById('emptyState');
const resultsCount = document.getElementById('resultsCount');
const toast = document.getElementById('toast');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxInfo = document.getElementById('lightboxInfo');
const lightboxDownload = document.getElementById('lightboxDownload');

// ============ TIỆN ÍCH ============
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = 'block';
}
function hideError() { errorBox.style.display = 'none'; }
function fillSelect(el, options, labelFn, valueFn) {
  el.innerHTML = '';
  options.forEach((opt) => {
    const o = document.createElement('option');
    o.value = valueFn ? valueFn(opt) : (typeof opt === 'string' ? opt : opt.value);
    o.textContent = labelFn ? labelFn(opt) : o.value;
    el.appendChild(o);
  });
}
function formatVnd(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + '₫';
}

const QUALITY_LABELS = {
  auto: 'Tự động', low: 'Thấp', medium: 'Trung bình', high: 'Cao',
  standard: 'Tiêu chuẩn', hd: 'HD',
};

const SIZE_META = {
  auto:        { w: 24, h: 24, label: 'Tự động', dashed: true, ratio: 1 },
  '1024x1024': { w: 24, h: 24, label: 'Vuông 1:1', ratio: 1 },
  '1536x1024': { w: 30, h: 20, label: 'Ngang 3:2', ratio: 1.5 },
  '1024x1536': { w: 20, h: 30, label: 'Dọc 2:3', ratio: 2 / 3 },
  '1792x1024': { w: 32, h: 18, label: 'Ngang 7:4', ratio: 1.75 },
  '1024x1792': { w: 18, h: 32, label: 'Dọc 4:7', ratio: 1 / 1.75 },
};

// ============ KHỞI TẠO ============
async function init() {
  try {
    const res = await fetch('/api/config');
    CONFIG = await res.json();
  } catch (e) {
    showError('Không tải được cấu hình từ server.');
    return;
  }

  fillSelect(modelEl, CONFIG.models, (m) => m.label, (m) => m.id);
  modelEl.value = CONFIG.defaultModelId;
  modelEl.addEventListener('change', onModelChange);

  fillSelect(presetEl, CONFIG.stylePresets, (p) => p.label, (p) => p.id);

  onModelChange();

  [qualityEl, countEl].forEach((el) => el.addEventListener('change', updateCostEstimate));

  if (CONFIG.requiresPassword) {
    const statusRes = await fetch('/api/session-status');
    const status = await statusRes.json();
    status.authenticated ? showApp() : showLogin();
  } else {
    showApp();
  }
}

function onModelChange() {
  currentModel = CONFIG.models.find((m) => m.id === modelEl.value);
  if (!currentModel) return;

  renderSizeSwatches();
  fillSelect(qualityEl, currentModel.qualities, (q) => QUALITY_LABELS[q] || q);
  fillSelect(formatEl, currentModel.formats, (f) => f.toUpperCase());
  const counts = Array.from({ length: currentModel.maxImages }, (_, i) => i + 1);
  fillSelect(countEl, counts, (c) => `${c} ảnh`);

  if (currentModel.supportsReferenceImages) {
    refField.classList.remove('hidden');
  } else {
    refField.classList.add('hidden');
    refFiles.forEach((rf) => URL.revokeObjectURL(rf.previewUrl));
    refFiles = [];
    renderRefThumbs();
  }
  formatField.classList.toggle('hidden', !currentModel.supportsOutputFormat);

  const notes = [];
  if (!currentModel.supportsReferenceImages) notes.push('không dùng được ảnh tham chiếu');
  if (currentModel.maxImages === 1) notes.push('chỉ tạo 1 ảnh mỗi lượt');
  if (!currentModel.supportsOutputFormat) notes.push('chỉ xuất PNG');
  modelHint.textContent = notes.length ? `Model này ${notes.join(', ')}.` : '';

  sizeHint.textContent = 'Ảnh tạo ra đúng tỉ lệ đã chọn. Ghi tỉ lệ trong prompt không có tác dụng.';

  updateCostEstimate();
}

function renderSizeSwatches() {
  sizeSwatches.innerHTML = '';
  currentModel.sizes.forEach((size, idx) => {
    const meta = SIZE_META[size] || { w: 24, h: 24, label: size };
    const wrap = document.createElement('label');
    wrap.className = 'swatch';
    wrap.innerHTML = `
      <input type="radio" name="size" value="${size}" ${idx === 0 ? 'checked' : ''} />
      <span class="swatch-card">
        <span class="swatch-shape" style="width:${meta.w}px;height:${meta.h}px;${meta.dashed ? 'border-style:dashed;' : ''}"></span>
        <span class="swatch-label">${meta.label}</span>
      </span>
    `;
    wrap.querySelector('input').addEventListener('change', updateCostEstimate);
    sizeSwatches.appendChild(wrap);
  });
}

function getSelectedSize() {
  const checked = document.querySelector('input[name="size"]:checked');
  return checked ? checked.value : currentModel.sizes[0];
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
  passwordInput.focus();
}
function showApp() {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  if (CONFIG?.requiresPassword) logoutBtn.classList.remove('hidden');
}

// ============ ĐĂNG NHẬP / ĐĂNG XUẤT ============
loginBtn.addEventListener('click', doLogin);
passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  loginError.textContent = '';
  const password = passwordInput.value;
  if (!password) return;
  loginBtn.disabled = true;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) { loginError.textContent = data.error || 'Sai mật khẩu'; return; }
    passwordInput.value = '';
    showApp();
  } catch (e) {
    loginError.textContent = 'Không kết nối được tới server';
  } finally {
    loginBtn.disabled = false;
  }
}

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  showLogin();
});

// ============ ẢNH THAM CHIẾU ============
refDropzone.addEventListener('click', () => refInput.click());
refDropzone.addEventListener('dragover', (e) => { e.preventDefault(); refDropzone.style.borderColor = 'var(--accent)'; });
refDropzone.addEventListener('dragleave', () => { refDropzone.style.borderColor = ''; });
refDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  refDropzone.style.borderColor = '';
  addRefFiles(Array.from(e.dataTransfer.files));
});
refInput.addEventListener('change', () => {
  addRefFiles(Array.from(refInput.files));
  refInput.value = '';
});

function addRefFiles(files) {
  const max = CONFIG?.maxReferenceImages || 4;
  for (const file of files) {
    if (refFiles.length >= max) { showToast(`Chỉ tối đa ${max} ảnh tham chiếu`); break; }
    if (!file.type.startsWith('image/')) continue;
    refFiles.push({ file, previewUrl: URL.createObjectURL(file) });
  }
  renderRefThumbs();
}
function removeRefFile(idx) {
  URL.revokeObjectURL(refFiles[idx].previewUrl);
  refFiles.splice(idx, 1);
  renderRefThumbs();
}
function renderRefThumbs() {
  refThumbs.innerHTML = '';
  refFiles.forEach((rf, idx) => {
    const div = document.createElement('div');
    div.className = 'ref-thumb';
    div.innerHTML = `<img src="${rf.previewUrl}" /><button title="Xoá">✕</button>`;
    div.querySelector('button').addEventListener('click', () => removeRefFile(idx));
    refThumbs.appendChild(div);
  });
}

// ============ ƯỚC TÍNH CHI PHÍ ============
function updateCostEstimate() {
  if (!CONFIG || !currentModel) return;
  const rawSize = getSelectedSize();
  const size = rawSize === 'auto' ? '1024x1024' : rawSize;
  const quality = qualityEl.value;
  const count = parseInt(countEl.value, 10) || 1;
  const unit = CONFIG.pricePerImageUsd?.[currentModel.id]?.[quality]?.[size];
  if (unit == null) {
    costVndEl.textContent = 'Không xác định';
    costUsdEl.textContent = '';
    return;
  }
  const totalUsd = unit * count;
  const totalVnd = totalUsd * (CONFIG.usdToVndRate || 25400);
  costVndEl.textContent = `~${formatVnd(totalVnd)}`;
  costUsdEl.textContent = `~$${totalUsd.toFixed(4)} · ${count} ảnh × ~$${unit}/ảnh`;
}

// ============ SKELETON KHI ĐANG TẠO ============
function showSkeletons(count, sizeKey) {
  emptyState.classList.add('hidden');
  const ratio = SIZE_META[sizeKey]?.ratio || 1;
  const startedAt = Date.now();

  for (let i = 0; i < count; i++) {
    const sk = document.createElement('div');
    sk.className = 'skeleton';
    sk.dataset.skeleton = 'true';
    sk.innerHTML = `
      <div class="skeleton-img" style="--sk-ratio:${ratio}"></div>
      <div class="skeleton-note">Đang tạo ảnh… <span class="skeleton-timer">0s</span></div>
    `;
    gallery.prepend(sk);
  }

  // Đếm giây để biết đã chờ bao lâu
  skeletonTimer = setInterval(() => {
    const secs = Math.floor((Date.now() - startedAt) / 1000);
    document.querySelectorAll('.skeleton-timer').forEach((el) => {
      el.textContent = `${secs}s`;
    });
  }, 1000);
}

function clearSkeletons() {
  if (skeletonTimer) { clearInterval(skeletonTimer); skeletonTimer = null; }
  document.querySelectorAll('[data-skeleton="true"]').forEach((el) => el.remove());
  if (resultCount === 0) emptyState.classList.remove('hidden');
}

// ============ LIGHTBOX XEM TRƯỚC ============
function openLightbox(src, filename, meta) {
  lightboxImg.src = src;
  lightboxDownload.href = src;
  lightboxDownload.download = filename;

  // Hiện kích thước thật của ảnh sau khi load xong
  lightboxImg.onload = () => {
    const dims = `${lightboxImg.naturalWidth} × ${lightboxImg.naturalHeight}px`;
    const parts = [dims];
    if (meta?.model) parts.push(meta.model);
    if (meta?.format) parts.push(meta.format.toUpperCase());
    lightboxInfo.textContent = parts.join(' · ');
  };

  lightbox.classList.remove('hidden');
  lightboxClose.focus();
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
  lightboxInfo.textContent = '';
}

lightboxClose.addEventListener('click', closeLightbox);
// Bấm ra nền ngoài ảnh cũng đóng
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) closeLightbox();
});

// ============ TẠO ẢNH ============
genBtn.addEventListener('click', generateImages);

async function generateImages() {
  hideError();
  const prompt = promptEl.value.trim();
  if (!prompt) { showError('Vui lòng nhập prompt.'); return; }

  const selectedSize = getSelectedSize();
  const nImages = parseInt(countEl.value, 10) || 1;

  const formData = new FormData();
  formData.append('model', modelEl.value);
  formData.append('prompt', prompt);
  formData.append('size', selectedSize);
  formData.append('quality', qualityEl.value);
  formData.append('format', formatEl.value);
  formData.append('n', String(nImages));
  formData.append('presetId', presetEl.value);
  if (currentModel.supportsReferenceImages) {
    refFiles.forEach((rf) => formData.append('images', rf.file));
  }

  genBtn.disabled = true;
  genBtn.innerHTML = '<span class="spinner"></span>Đang tạo ảnh...';
  showSkeletons(nImages, selectedSize);

  try {
    const res = await fetch('/api/generate', { method: 'POST', body: formData });
    const data = await res.json();

    clearSkeletons();

    if (res.status === 401) { showLogin(); return; }
    if (!res.ok) { showError(data.error || 'Có lỗi xảy ra, vui lòng thử lại.'); return; }

    renderResults(data.images, data.meta);
  } catch (err) {
    clearSkeletons();
    showError('Không kết nối được tới server: ' + err.message);
  } finally {
    genBtn.disabled = false;
    genBtn.textContent = 'Tạo ảnh';
  }
}

function renderResults(base64Images, meta) {
  emptyState.classList.add('hidden');

  base64Images.forEach((b64, idx) => {
    const mime = meta?.format === 'jpeg' ? 'image/jpeg' : meta?.format === 'webp' ? 'image/webp' : 'image/png';
    const src = `data:${mime};base64,${b64}`;
    const filename = `gpt-image-${Date.now()}-${idx + 1}.${meta?.format || 'png'}`;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${src}" alt="Ảnh kết quả" title="Bấm để xem lớn" />
      <div class="card-actions">
        <a href="${src}" download="${filename}">⬇ Tải</a>
        <button data-action="reuse">↺ Dùng làm ref</button>
      </div>
    `;
    card.querySelector('img').addEventListener('click', () => openLightbox(src, filename, meta));
    card.querySelector('[data-action="reuse"]').addEventListener('click', () => reuseAsReference(src));
    gallery.prepend(card);
    resultCount++;
  });

  resultsCount.textContent = `${resultCount} ảnh trong phiên này`;

  if (meta?.estimatedCostVnd != null) {
    showToast(`Đã tạo ${base64Images.length} ảnh — ~${formatVnd(meta.estimatedCostVnd)}`);
  }
}

async function reuseAsReference(dataUrl) {
  if (!currentModel.supportsReferenceImages) {
    showToast('Model đang chọn không dùng được ảnh tham chiếu');
    return;
  }
  const max = CONFIG?.maxReferenceImages || 4;
  if (refFiles.length >= max) { showToast(`Đã đủ ${max} ảnh tham chiếu, hãy xoá bớt trước`); return; }
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], `reference-${Date.now()}.png`, { type: blob.type });
  refFiles.push({ file, previewUrl: URL.createObjectURL(blob) });
  renderRefThumbs();
  showToast('Đã thêm ảnh vào danh sách tham chiếu');
}

init();
