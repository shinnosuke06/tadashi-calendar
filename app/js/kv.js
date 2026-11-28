// 端末への保存。テストではメモリ、ブラウザでは IndexedDB を使う。同じ形の関数を持つ。
export const STORES = ['events', 'months', 'outbox', 'kv', 'demo'];
const copy = v => (v === undefined ? undefined : structuredClone(v));

export function createMemoryKV() {
  const stores = new Map(STORES.map(s => [s, new Map()]));
  const st = s => { if (!stores.has(s)) stores.set(s, new Map()); return stores.get(s); };
  return {
    get: async (s, k) => copy(st(s).get(k)),
    put: async (s, k, v) => { st(s).set(k, copy(v)); },
    delete: async (s, k) => { st(s).delete(k); },
    getAll: async s => [...st(s).values()].map(copy),
    clear: async s => { st(s).clear(); },
  };
}

export function createIdbKV(dbName = 'tadashi-calendar') {
  const opened = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async (s, mode, fn) => {
    const db = await opened;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(s, mode);
      const req = fn(tx.objectStore(s));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: (s, k) => run(s, 'readonly', os => os.get(k)),
    put: (s, k, v) => run(s, 'readwrite', os => os.put(v, k)).then(() => undefined),
    delete: (s, k) => run(s, 'readwrite', os => os.delete(k)).then(() => undefined),
    getAll: s => run(s, 'readonly', os => os.getAll()),
    clear: s => run(s, 'readwrite', os => os.clear()).then(() => undefined),
  };
}
