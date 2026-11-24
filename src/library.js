/**
 * Persist audiobook metadata + audio blobs in IndexedDB.
 */

const DB_NAME = 'yingsheng-library';
const DB_VER = 1;
const STORE = 'books';
const META_KEY = 'yingsheng-meta-v1';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
  });
}

function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveMeta(list) {
  localStorage.setItem(META_KEY, JSON.stringify(list));
  return list;
}

/**
 * @param {{ id?: string, title: string, mode: 'extract'|'tts', chapters: object[], duration: number, createdAt?: number, sourceName?: string, mime?: string }} book
 * @param {Blob|null} blob
 */
export async function upsertBook(book, blob = null) {
  const id = book.id || `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    ...book,
    id,
    createdAt: book.createdAt || Date.now(),
  };

  const meta = loadMeta().filter((b) => b.id !== id);
  meta.unshift({
    id: record.id,
    title: record.title,
    mode: record.mode,
    duration: record.duration,
    createdAt: record.createdAt,
    sourceName: record.sourceName || '',
    chapterCount: record.chapters?.length || 0,
    mime: record.mime || '',
  });
  saveMeta(meta);

  if (blob || record.chapters) {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    await idbReq(
      tx.objectStore(STORE).put({
        id,
        blob: blob || null,
        chapters: record.chapters || [],
        mode: record.mode,
        title: record.title,
        mime: record.mime || (blob && blob.type) || '',
      }),
    );
    db.close();
  }

  return record;
}

export async function getBook(id) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const row = await idbReq(tx.objectStore(STORE).get(id));
  db.close();
  return row || null;
}

export async function removeBook(id) {
  saveMeta(loadMeta().filter((b) => b.id !== id));
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await idbReq(tx.objectStore(STORE).delete(id));
  db.close();
}

export function createId() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
