// ============================================================================
// LƯU ẢNH TRONG TRÌNH DUYỆT BẰNG INDEXEDDB
//
// Vì sao không lưu trên server? Gói Free của Render dùng ổ đĩa tạm — file bị
// xoá sạch mỗi lần deploy lại hoặc server tự khởi động lại. IndexedDB nằm
// trong trình duyệt của bạn nên F5 hay tắt máy vẫn còn.
//
// Giới hạn: chỉ có trên máy/trình duyệt này. Xoá dữ liệu duyệt web sẽ mất.
// ============================================================================

const DB_NAME = 'gpt-image-studio';
const DB_VERSION = 1;
const STORE = 'images';
const MAX_STORED = 150; // giữ tối đa 150 ảnh gần nhất, cũ hơn tự xoá

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode) {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

/** Lưu 1 ảnh. blob là Blob ảnh, meta là thông tin kèm theo. */
export async function saveImage(blob, meta) {
  const store = await tx('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.add({
      blob,
      prompt: meta.prompt || '',
      model: meta.model || '',
      size: meta.size || '',
      format: meta.format || 'png',
      createdAt: Date.now(),
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Lấy toàn bộ ảnh đã lưu, mới nhất trước. */
export async function getAllImages() {
  const store = await tx('readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}

/** Xoá 1 ảnh theo id. */
export async function deleteImage(id) {
  const store = await tx('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Xoá toàn bộ ảnh đã lưu. */
export async function clearAllImages() {
  const store = await tx('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Xoá bớt ảnh cũ nếu vượt quá giới hạn, tránh đầy dung lượng trình duyệt. */
export async function pruneOldImages() {
  const all = await getAllImages();
  if (all.length <= MAX_STORED) return 0;
  const toDelete = all.slice(MAX_STORED);
  for (const item of toDelete) {
    await deleteImage(item.id);
  }
  return toDelete.length;
}

/** Ước tính dung lượng đang dùng (byte). */
export async function getUsageBytes() {
  const all = await getAllImages();
  return all.reduce((sum, item) => sum + (item.blob?.size || 0), 0);
}

export { MAX_STORED };
