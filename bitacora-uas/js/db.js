/* Almacenamiento local (IndexedDB): pilotos, aeronaves, vuelos y ajustes. Todo queda en el teléfono. */
const DB = (() => {
  const NAME = 'bitacora-uas';
  const VER = 2;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        ['pilots', 'aircraft', 'flights'].forEach((s) => {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
        });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'key' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      const r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }

  async function nextSeq() {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction('kv', 'readwrite');
      const s = t.objectStore('kv');
      const g = s.get('seq');
      let n = 0;
      g.onsuccess = () => {
        n = (g.result ? g.result.value : 0) + 1;
        s.put({ key: 'seq', value: n });
      };
      t.oncomplete = () => res(n);
      t.onerror = () => rej(t.error);
    });
  }

  return {
    all: (s) => tx(s, 'readonly', (o) => o.getAll()),
    get: (s, id) => tx(s, 'readonly', (o) => o.get(id)),
    put: (s, v) => tx(s, 'readwrite', (o) => o.put(v)),
    del: (s, id) => tx(s, 'readwrite', (o) => o.delete(id)),
    async kvGet(key, def) {
      const r = await tx('kv', 'readonly', (o) => o.get(key));
      return r ? r.value : def;
    },
    kvSet: (key, value) => tx('kv', 'readwrite', (o) => o.put({ key, value })),
    nextSeq
  };
})();
