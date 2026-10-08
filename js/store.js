/* 妈妈写的明信片、加的照片、新地方 —— 保存在这台设备的浏览器里（IndexedDB） */
window.Store = (function () {
  const DB_NAME = 'mom-life-map', VERSION = 1;
  let db = null, memory = { kv: new Map(), blobs: new Map() }, ok = true;

  function open() {
    return new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
          if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
        };
        req.onsuccess = () => { db = req.result; resolve(true); };
        req.onerror = () => { ok = false; resolve(false); };
      } catch (e) { ok = false; resolve(false); }
    });
  }
  function tx(store, mode, fn) {
    if (!db) {
      const m = memory[store];
      return Promise.resolve(fn({ get: k => m.get(k), put: (v, k) => m.set(k, v), delete: k => m.delete(k) }, true));
    }
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode), s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : r);
      t.onerror = () => reject(t.error);
    });
  }
  return {
    open,
    get persistent() { return ok && !!db; },
    get: (k) => tx('kv', 'readonly', s => s.get(k)),
    set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
    getBlob: (k) => tx('blobs', 'readonly', s => s.get(k)),
    putBlob: (k, b) => tx('blobs', 'readwrite', s => s.put(b, k)),
    delBlob: (k) => tx('blobs', 'readwrite', s => s.delete(k))
  };
})();

/* 照片处理：读位置和日期，缩小尺寸，生成缩略图 */
window.Photo = {
  async read(file) {
    let gps = null, date = null;
    try { const g = await exifr.gps(file); if (g && isFinite(g.latitude) && isFinite(g.longitude)) gps = [g.longitude, g.latitude]; } catch (e) {}
    try { const m = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']); const d = m && (m.DateTimeOriginal || m.CreateDate); if (d instanceof Date && !isNaN(d)) date = d.toISOString().slice(0, 10); } catch (e) {}
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('decode')); img.src = URL.createObjectURL(file); });
    }
    const full = await this.draw(bmp, 1800, false), thumb = await this.draw(bmp, 360, true);
    return { gps, date, full, thumb };
  },
  draw(src, max, square) {
    const w = src.width, h = src.height;
    const c = document.createElement('canvas');
    if (square) {
      const s = Math.min(w, h); c.width = c.height = max;
      c.getContext('2d').drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, max, max);
    } else {
      const k = Math.min(1, max / Math.max(w, h)); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    }
    return new Promise(r => c.toBlob(r, 'image/jpeg', square ? 0.8 : 0.86));
  }
};
