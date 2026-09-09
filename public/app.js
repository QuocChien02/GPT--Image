// ============ STATE ============
let CONFIG = null;
let refFiles = []; // { file, previewUrl }

// ============ ELEMENTS ============
const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

const promptEl = document.getElementById('prompt');
const refDropzone = document.getElementById('refDropzone');
const refInput = document.getElementById('refInput');
const refThumbs = document.getElementById('refThumbs');
const presetEl = document.getElementById('preset');
const sizeEl = document.getElementById('size');
const qualityEl = document.getElementById('quality');
const formatEl = document.getElementById('format');
const countEl = document.getElementById('count');
const costBox = document.getElementById('costBox');
const genBtn = document.getElementById('genBtn');
const errorBox = document.getElementById('errorBox');
const gallery = document.getElementById('gallery');
const toast = document.getElementById('toast');

// ============ TIỆN ÍCH ============
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = 'block';
}
function hideError() {
  errorBox.style.display = 'none';
}
function fillSelect(el, options, labelFn) {
  el.innerHTML = '';
  options.forEach((opt) => {
    const o = document.createElement('option');
    o.value = typeof opt === 'string' ? opt : opt.value;
    o.textContent = labelFn ? labelFn(opt) : o.value;
    el.appendChild(o);
  });
}

const SIZE_LABELS = { auto: 'Tự động', '1024x1024': 'Vuông (1:1)', '1536x1024': 'Ngang (3:2)', '1024x1536': 'Dọc (2:3)' };
const QUALITY_LABELS = { auto: 'Tự động', low: 'Thấp', medium: 'Trung bình', high: 'Cao' };

// ============ KHỞI TẠO ============
async function init() {
  try {
    const res = await fetch('/api/config');
    CONFIG = await res.json();
  } catch (e) {
    showError('Không tải được cấu hình từ server.');
    return;
  }

  fillSelect(presetEl, CONFIG.stylePresets, (p) => p.label);
  presetEl.querySelectorAll('option').forEach((o, i) => (o.value = CONFIG.stylePresets[i].id));

  fillSelect(sizeEl, CONFIG.allowedSizes, (s) => SIZE_LABELS[s] || s);
  fillSelect(qualityEl, CONFIG.allowedQuality, (q) => QUALITY_LABELS[q] || q);
  fillSelect(formatEl, CONFIG.allowedFormats, (f) => f.toUpperCase());

  const counts = Array.from({ length: CONFIG.maxImagesPerRequest }, (_, i) => i + 1);
  fillSelect(countEl, counts, (c) => `${c} ảnh`);

  updateCostEstimate();
  [sizeEl, qualityEl, countEl].forEach((el) => el.addEventListener('change', updateCostEstimate));

  if (CONFIG.requiresPassword) {
    const statusRes = await fetch('/api/session-status');
    const status = await statusRes.json();
    if (status.authenticated) {
      showApp();
    } else {
      showLogin();
    }
  } else {
    showApp();
  }
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
    if (!res.ok) {
      loginError.textContent = data.error || 'Sai mật khẩu';
      return;
    }
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
    if (refFiles.length >= max) {
      showToast(`Chỉ tối đa ${max} ảnh tham chiếu`);
      break;
    }
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
  if (!CONFIG) return;
  const size = sizeEl.value === 'auto' ? '1024x1024' : sizeEl.value;
  const quality = qualityEl.value;
  const count = parseInt(countEl.value, 10) || 1;
  const unit = CONFIG.pricePerImageUsd?.[quality]?.[size];
  if (unit == null) {
    costBox.innerHTML = 'Chi phí ước tính: <strong>không xác định</strong>';
    return;
  }
  const total = (unit * count).toFixed(4);
  costBox.innerHTML = `Chi phí ước tính: <strong>~$${total}</strong> (${count} ảnh × ~$${unit}/ảnh) — số liệu tham khảo, kiểm tra giá thật trên trang OpenAI`;
}

// ============ TẠO ẢNH ============
genBtn.addEventListener('click', generateImages);

async function generateImages() {
  hideError();
  const prompt = promptEl.value.trim();
  if (!prompt) {
    showError('Vui lòng nhập prompt.');
    return;
  }

  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('size', sizeEl.value);
  formData.append('quality', qualityEl.value);
  formData.append('format', formatEl.value);
  formData.append('n', countEl.value);
  formData.append('presetId', presetEl.value);
  refFiles.forEach((rf) => formData.append('images', rf.file));

  genBtn.disabled = true;
  genBtn.innerHTML = '<span class="spinner"></span>Đang tạo ảnh...';

  try {
    const res = await fetch('/api/generate', { method: 'POST', body: formData });
    const data = await res.json();

    if (res.status === 401) {
      showLogin();
      return;
    }
    if (!res.ok) {
      showError(data.error || 'Có lỗi xảy ra, vui lòng thử lại.');
      return;
    }

    renderResults(data.images, prompt, data.meta);
  } catch (err) {
    showError('Không kết nối được tới server: ' + err.message);
  } finally {
    genBtn.disabled = false;
    genBtn.textContent = 'Tạo ảnh';
  }
}

function renderResults(base64Images, promptUsed, meta) {
  base64Images.forEach((b64, idx) => {
    const mime = meta?.format === 'jpeg' ? 'image/jpeg' : meta?.format === 'webp' ? 'image/webp' : 'image/png';
    const src = `data:${mime};base64,${b64}`;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${src}" alt="Kết quả" />
      <div class="card-actions">
        <a href="${src}" download="gpt-image-${Date.now()}-${idx + 1}.${meta?.format || 'png'}">⬇ Tải</a>
        <button data-action="reuse">↺ Dùng làm ref</button>
      </div>
    `;
    card.querySelector('[data-action="reuse"]').addEventListener('click', () => reuseAsReference(src));
    gallery.prepend(card);
  });

  if (meta?.estimatedCostUsd != null) {
    showToast(`Đã tạo ${base64Images.length} ảnh — chi phí ước tính ~$${meta.estimatedCostUsd}`);
  }
}

async function reuseAsReference(dataUrl) {
  const max = CONFIG?.maxReferenceImages || 4;
  if (refFiles.length >= max) {
    showToast(`Đã đủ ${max} ảnh tham chiếu, hãy xoá bớt trước`);
    return;
  }
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], `reference-${Date.now()}.png`, { type: blob.type });
  refFiles.push({ file, previewUrl: URL.createObjectURL(blob) });
  renderRefThumbs();
  showToast('Đã thêm ảnh vào danh sách tham chiếu');
}

init();
