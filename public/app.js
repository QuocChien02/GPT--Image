import {
  saveImage,
  getAllImages,
  deleteImage,
  clearAllImages,
  pruneOldImages,
  getUsageBytes,
  MAX_STORED,
} from './storage.js';

// ============ STATE ============
let CONFIG = null;
let currentModel = null;
let refFiles = [];        // { file, previewUrl }
let resultCount = 0;
let currentMode = 'single';   // 'single' | 'batch'
let isRunning = false;
let stopRequested = false;
const CONCURRENCY = 2;        // số ảnh tạo song song — 2 là an toàn với rate limit OpenAI

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
const batchPromptEl = document.getElementById('batchPrompt');
const singlePromptField = document.getElementById('singlePromptField');
const batchPromptField = document.getElementById('batchPromptField');
const batchSummary = document.getElementById('batchSummary');
const modeTabs = document.querySelectorAll('.mode-tab');
const stopBtn = document.getElementById('stopBtn');
const batchProgress = document.getElementById('batchProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const downloadAllBtn = document.getElementById('downloadAllBtn');
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
const storageInfo = document.getElementById('storageInfo');
const clearAllBtn = document.getElementById('clearAllBtn');
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
    if (status.authenticated) {
      showApp();
      loadStoredImages();
    } else {
      showLogin();
    }
  } else {
    showApp();
    loadStoredImages();
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
    loadStoredImages();
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
  updateBatchSummary(); // cập nhật luôn tổng chi phí của chế độ hàng loạt
}

// ============ CHUYỂN CHẾ ĐỘ ĐƠN / HÀNG LOẠT ============
modeTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (isRunning) return; // đang chạy thì không cho đổi chế độ
    currentMode = tab.dataset.mode;
    modeTabs.forEach((t) => t.classList.toggle('active', t === tab));
    singlePromptField.classList.toggle('hidden', currentMode !== 'single');
    batchPromptField.classList.toggle('hidden', currentMode !== 'batch');
    updateBatchSummary();
    updateCostEstimate();
    genBtn.textContent = currentMode === 'batch' ? 'Tạo hàng loạt' : 'Tạo ảnh';
  });
});

/** Tách textarea thành danh sách prompt, bỏ dòng trống và trùng lặp liền kề. */
function parseBatchPrompts() {
  return batchPromptEl.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function updateBatchSummary() {
  if (currentMode !== 'batch') return;
  const prompts = parseBatchPrompts();
  if (prompts.length === 0) {
    batchSummary.textContent = 'Chưa nhập prompt nào';
    return;
  }
  const perImage = getUnitPrice();
  const nPerPrompt = parseInt(countEl.value, 10) || 1;
  const totalImages = prompts.length * nPerPrompt;
  if (perImage == null) {
    batchSummary.innerHTML = `<strong>${prompts.length}</strong> prompt · ${totalImages} ảnh`;
    return;
  }
  const totalVnd = perImage * totalImages * (CONFIG.usdToVndRate || 25400);
  batchSummary.innerHTML =
    `<strong>${prompts.length}</strong> prompt × ${nPerPrompt} ảnh = <strong>${totalImages}</strong> ảnh · ước tính <strong>~${formatVnd(totalVnd)}</strong>`;
}

batchPromptEl.addEventListener('input', updateBatchSummary);

function getUnitPrice() {
  if (!CONFIG || !currentModel) return null;
  const rawSize = getSelectedSize();
  const size = rawSize === 'auto' ? '1024x1024' : rawSize;
  return CONFIG.pricePerImageUsd?.[currentModel.id]?.[qualityEl.value]?.[size] ?? null;
}

// ============ THẺ HÀNG ĐỢI ============
// Mỗi prompt trong loạt có 1 thẻ riêng, đổi trạng thái: chờ -> đang tạo -> xong / lỗi
function createQueueCard(prompt, index, total) {
  const ratio = SIZE_META[getSelectedSize()]?.ratio || 1;
  const card = document.createElement('div');
  card.className = 'queue-card is-waiting';
  card.innerHTML = `
    <div class="queue-visual" style="--sk-ratio:${ratio}">
      <span class="queue-badge">Chờ · ${index + 1}/${total}</span>
      <span class="queue-prompt">${escapeHtml(prompt)}</span>
    </div>
  `;
  gallery.prepend(card);
  return card;
}

function setQueueCardRunning(card, index, total) {
  card.className = 'queue-card is-running';
  const badge = card.querySelector('.queue-badge');
  if (badge) badge.textContent = `Đang tạo · ${index + 1}/${total}`;
}

function setQueueCardError(card, prompt, errorMsg, onRetry) {
  card.className = 'queue-card is-error';
  const badge = card.querySelector('.queue-badge');
  if (badge) badge.textContent = 'Lỗi';
  if (!card.querySelector('.queue-error-msg')) {
    const msg = document.createElement('div');
    msg.className = 'queue-error-msg';
    msg.textContent = errorMsg;
    card.appendChild(msg);

    const retry = document.createElement('button');
    retry.className = 'queue-retry';
    retry.textContent = '↻ Thử lại prompt này';
    retry.addEventListener('click', () => {
      card.remove();
      onRetry();
    });
    card.appendChild(retry);
  }
}

// ============ TIẾN ĐỘ ============
function updateProgress(done, total, startedAt) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  progressFill.style.width = pct + '%';

  let etaText = '';
  if (done > 0 && done < total) {
    const elapsed = (Date.now() - startedAt) / 1000;
    const perItem = elapsed / done;
    const remaining = Math.round(perItem * (total - done));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    etaText = mins > 0 ? ` · còn ~${mins}p${secs}s` : ` · còn ~${secs}s`;
  }
  progressText.textContent = `Đã xong ${done}/${total}${etaText}`;
}

function setRunningState(running) {
  isRunning = running;
  genBtn.disabled = running;
  stopBtn.classList.toggle('hidden', !running);
  batchProgress.classList.toggle('hidden', !running);
  modeTabs.forEach((t) => (t.style.opacity = running ? '0.5' : '1'));
  if (!running) {
    genBtn.textContent = currentMode === 'batch' ? 'Tạo hàng loạt' : 'Tạo ảnh';
  }
}

stopBtn.addEventListener('click', () => {
  stopRequested = true;
  stopBtn.textContent = 'Đang dừng...';
  stopBtn.disabled = true;
});

// ============ GỌI API TẠO 1 ẢNH ============
async function requestImages(prompt) {
  const formData = new FormData();
  formData.append('model', modelEl.value);
  formData.append('prompt', prompt);
  formData.append('size', getSelectedSize());
  formData.append('quality', qualityEl.value);
  formData.append('format', formatEl.value);
  formData.append('n', countEl.value);
  formData.append('presetId', presetEl.value);
  if (currentModel.supportsReferenceImages) {
    refFiles.forEach((rf) => formData.append('images', rf.file));
  }

  const res = await fetch('/api/generate', { method: 'POST', body: formData });
  const data = await res.json();

  if (res.status === 401) {
    showLogin();
    throw new Error('Phiên đăng nhập đã hết hạn');
  }
  if (!res.ok) throw new Error(data.error || 'Lỗi không xác định từ server');
  return data;
}

// ============ CHẠY HÀNG LOẠT ============
genBtn.addEventListener('click', onGenerateClick);

async function onGenerateClick() {
  hideError();
  if (isRunning) return;

  const prompts = currentMode === 'batch' ? parseBatchPrompts() : [promptEl.value.trim()].filter(Boolean);

  if (prompts.length === 0) {
    showError(currentMode === 'batch' ? 'Vui lòng nhập ít nhất 1 prompt.' : 'Vui lòng nhập prompt.');
    return;
  }

  // Xác nhận chi phí khi chạy nhiều prompt
  if (prompts.length > 1) {
    const perImage = getUnitPrice();
    const nPer = parseInt(countEl.value, 10) || 1;
    const totalImages = prompts.length * nPer;
    let msg = `Sắp tạo ${totalImages} ảnh từ ${prompts.length} prompt.`;
    if (perImage != null) {
      const totalVnd = perImage * totalImages * (CONFIG.usdToVndRate || 25400);
      msg += `\nChi phí ước tính: ~${formatVnd(totalVnd)}`;
    }
    msg += '\n\nTiếp tục?';
    if (!confirm(msg)) return;
  }

  stopRequested = false;
  stopBtn.textContent = '■ Dừng lại';
  stopBtn.disabled = false;
  setRunningState(true);
  emptyState.classList.add('hidden');

  const total = prompts.length;
  const startedAt = Date.now();
  let done = 0;
  let failed = 0;
  updateProgress(0, total, startedAt);

  // Tạo sẵn thẻ cho từng prompt để thấy toàn cảnh hàng đợi
  const jobs = prompts.map((prompt, i) => ({
    prompt,
    index: i,
    card: createQueueCard(prompt, i, total),
  }));

  // Chạy song song CONCURRENCY luồng, mỗi luồng lấy job kế tiếp
  let nextIndex = 0;
  async function worker() {
    while (true) {
      if (stopRequested) return;
      const myIndex = nextIndex++;
      if (myIndex >= jobs.length) return;
      const job = jobs[myIndex];

      setQueueCardRunning(job.card, job.index, total);
      try {
        const data = await requestImages(job.prompt);
        job.card.remove();
        await renderResults(data.images, data.meta, job.prompt);
      } catch (err) {
        failed++;
        setQueueCardError(job.card, job.prompt, err.message, () => retrySingle(job.prompt));
      }
      done++;
      updateProgress(done, total, startedAt);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));

  // Dọn các thẻ còn đang chờ nếu người dùng bấm Dừng
  if (stopRequested) {
    jobs.forEach((j) => { if (j.card.classList.contains('is-waiting')) j.card.remove(); });
  }

  setRunningState(false);

  const succeeded = total - failed;
  if (stopRequested) {
    showToast(`Đã dừng — tạo được ${succeeded} ảnh`);
  } else if (failed > 0) {
    showToast(`Xong: ${succeeded} thành công, ${failed} lỗi`);
  } else if (total > 1) {
    showToast(`Đã tạo xong ${succeeded} prompt`);
  }
  refreshResultsMeta();
}

/** Thử lại 1 prompt bị lỗi. */
async function retrySingle(prompt) {
  if (isRunning) { showToast('Đang chạy loạt khác, hãy đợi xong'); return; }
  setRunningState(true);
  const card = createQueueCard(prompt, 0, 1);
  setQueueCardRunning(card, 0, 1);
  updateProgress(0, 1, Date.now());
  try {
    const data = await requestImages(prompt);
    card.remove();
    await renderResults(data.images, data.meta, prompt);
    showToast('Thử lại thành công');
  } catch (err) {
    setQueueCardError(card, prompt, err.message, () => retrySingle(prompt));
    showToast('Vẫn lỗi: ' + err.message);
  }
  updateProgress(1, 1, Date.now());
  setRunningState(false);
  refreshResultsMeta();
}

// ============ HIỂN THỊ 1 THẺ ẢNH ============
// Dùng chung cho ảnh mới tạo và ảnh tải lại từ bộ nhớ trình duyệt.
function buildCard({ id, src, filename, meta, prompt, createdAt }) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.imageId = id ?? '';

  const timeText = createdAt
    ? new Date(createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  card.innerHTML = `
    <img src="${src}" alt="Ảnh kết quả" title="Bấm để xem lớn" />
    <div class="card-actions">
      <a href="${src}" download="${filename}">⬇ Tải</a>
      <button data-action="reuse">↺ Dùng làm ref</button>
      <button data-action="delete" title="Xoá ảnh này">🗑</button>
    </div>
    ${prompt ? `<div class="card-meta">${timeText ? timeText + ' · ' : ''}${escapeHtml(prompt)}</div>` : ''}
  `;

  card.querySelector('img').addEventListener('click', () => openLightbox(src, filename, meta));
  card.querySelector('[data-action="reuse"]').addEventListener('click', () => reuseAsReference(src));
  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (id != null) await deleteImage(id);
    card.remove();
    resultCount = Math.max(0, resultCount - 1);
    refreshResultsMeta();
  });

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============ TẢI LẠI ẢNH ĐÃ LƯU KHI MỞ TRANG ============
async function loadStoredImages() {
  let stored = [];
  try {
    stored = await getAllImages();
  } catch (e) {
    console.warn('Không đọc được ảnh đã lưu:', e);
    return;
  }
  if (stored.length === 0) return;

  emptyState.classList.add('hidden');
  // getAllImages trả về mới nhất trước; append theo thứ tự đó để ảnh mới nằm trên
  stored.forEach((item) => {
    const src = URL.createObjectURL(item.blob);
    const filename = `gpt-image-${item.id}.${item.format || 'png'}`;
    gallery.appendChild(
      buildCard({
        id: item.id,
        src,
        filename,
        meta: { model: item.model, format: item.format },
        prompt: item.prompt,
        createdAt: item.createdAt,
      })
    );
    resultCount++;
  });
  refreshResultsMeta();
}

async function refreshResultsMeta() {
  resultsCount.textContent = resultCount > 0 ? `${resultCount} ảnh đã lưu` : '';
  if (resultCount === 0) emptyState.classList.remove('hidden');
  try {
    const bytes = await getUsageBytes();
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    storageInfo.textContent = bytes > 0 ? `${mb} MB · tối đa ${MAX_STORED} ảnh` : '';
  } catch (e) {
    storageInfo.textContent = '';
  }
}

downloadAllBtn.addEventListener('click', async () => {
  if (resultCount === 0) { showToast('Chưa có ảnh nào để tải'); return; }
  let stored = [];
  try {
    stored = await getAllImages();
  } catch (e) {
    showToast('Không đọc được ảnh đã lưu');
    return;
  }
  if (stored.length === 0) return;
  if (!confirm(`Tải ${stored.length} ảnh về máy? Trình duyệt có thể hỏi xin phép tải nhiều file.`)) return;

  showToast(`Đang tải ${stored.length} ảnh...`);
  // Tải lần lượt, giãn cách nhẹ để trình duyệt không chặn
  for (let i = 0; i < stored.length; i++) {
    const item = stored[i];
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gpt-image-${String(i + 1).padStart(3, '0')}.${item.format || 'png'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    await new Promise((r) => setTimeout(r, 350));
    URL.revokeObjectURL(url);
  }
  showToast(`Đã tải xong ${stored.length} ảnh`);
});

clearAllBtn.addEventListener('click', async () => {
  if (resultCount === 0) return;
  if (!confirm('Xoá toàn bộ ảnh đã lưu trong trình duyệt? Hành động này không hoàn tác được.')) return;
  await clearAllImages();
  gallery.innerHTML = '';
  resultCount = 0;
  refreshResultsMeta();
  showToast('Đã xoá toàn bộ ảnh đã lưu');
});

// ============ HIỂN THỊ KẾT QUẢ MỚI ============
async function renderResults(base64Images, meta, promptUsed) {
  emptyState.classList.add('hidden');

  for (let idx = 0; idx < base64Images.length; idx++) {
    const b64 = base64Images[idx];
    const mime = meta?.format === 'jpeg' ? 'image/jpeg' : meta?.format === 'webp' ? 'image/webp' : 'image/png';
    const dataUrl = `data:${mime};base64,${b64}`;

    // Lưu vào IndexedDB dưới dạng Blob (nhẹ hơn base64 khoảng 25%)
    let savedId = null;
    let objectUrl = dataUrl;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      savedId = await saveImage(blob, {
        prompt: promptUsed,
        model: meta?.model,
        size: meta?.size,
        format: meta?.format,
      });
      objectUrl = URL.createObjectURL(blob);
    } catch (e) {
      console.warn('Không lưu được ảnh vào trình duyệt:', e);
      showToast('Ảnh đã tạo nhưng không lưu được — hãy tải về ngay');
    }

    const filename = `gpt-image-${Date.now()}-${idx + 1}.${meta?.format || 'png'}`;
    gallery.prepend(
      buildCard({
        id: savedId,
        src: objectUrl,
        filename,
        meta,
        prompt: promptUsed,
        createdAt: Date.now(),
      })
    );
    resultCount++;
  }

  // Dọn bớt ảnh cũ nếu vượt giới hạn
  try {
    const pruned = await pruneOldImages();
    if (pruned > 0) {
      // Xoá luôn thẻ tương ứng khỏi giao diện
      const cards = Array.from(gallery.querySelectorAll('.card'));
      cards.slice(MAX_STORED).forEach((c) => c.remove());
      resultCount = Math.min(resultCount, MAX_STORED);
      showToast(`Đã xoá ${pruned} ảnh cũ nhất (giới hạn ${MAX_STORED} ảnh)`);
    }
  } catch (e) {
    console.warn('Không dọn được ảnh cũ:', e);
  }

  refreshResultsMeta();

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
