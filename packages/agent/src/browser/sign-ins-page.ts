/**
 * The IndexedDB half of a browser's sign-ins (sign-ins.ts), as the scripts
 * the daemon's own page on an origin runs (`Runtime.evaluate`, awaiting
 * their promise): CDP's IndexedDB domain reads but writes nothing, so the
 * IndexedDB API itself reads every database of the origin on one side and
 * makes it again on the other. They are page JavaScript, not this process's,
 * so they stand here as source.
 *
 * A database's snapshot (`IDB_READ` answers it as JSON) is its name,
 * version, and every object store: name, keyPath, autoIncrement, its indexes
 * (name, keyPath, unique, multiEntry) and every record as its primary key and
 * value, read with a cursor (`primaryKey` and `value` of one record at a
 * time). Databases sort by name, since `indexedDB.databases()` answers them
 * in no set order ("the sequence on the returned objects is undefined", MDN
 * IDBFactory.databases); stores and indexes come in their names' order
 * (`objectStoreNames`, `indexNames` are sorted lists), records in key order.
 *
 * Keys and values go through one structured-clone codec: undefined, -0,
 * NaN and the infinities, bigint, Date (an invalid one too), RegExp,
 * ArrayBuffer, every typed array and DataView (their bytes), Blob and File
 * (bytes, type, and a File's name and lastModified), Map, Set, Error, the
 * Boolean, Number and String wrappers, arrays and plain objects, nested to
 * any depth. A snapshot read again after it is written is the same string,
 * which is how a carry is checked.
 *
 * An origin whose encoded databases pass `cap` characters answers
 * `{ "over": <size so far> }` instead, read no further.
 */

/** The codec both scripts share: `enc` (async, for a Blob's bytes) and `dec`. */
const CODEC = `
const b64 = (bytes) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    text += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  }
  return btoa(text);
};
const unb64 = (text) => {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
};
const viewBytes = (view) => new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
const enc = async (v) => {
  if (v === undefined) return { t: "u" };
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (Object.is(v, -0)) return { t: "n", v: "-0" };
    return Number.isFinite(v) ? v : { t: "n", v: String(v) };
  }
  if (typeof v === "bigint") return { t: "bi", v: String(v) };
  if (Array.isArray(v)) {
    const out = [];
    for (const x of v) out.push(await enc(x));
    return { t: "a", v: out };
  }
  if (v instanceof Date) return { t: "d", v: String(v.getTime()) };
  if (v instanceof RegExp) return { t: "r", s: v.source, f: v.flags };
  if (v instanceof ArrayBuffer) return { t: "ab", b: b64(new Uint8Array(v)) };
  if (v instanceof DataView) return { t: "dv", b: b64(viewBytes(v)) };
  if (ArrayBuffer.isView(v)) return { t: "ta", k: v.constructor.name, b: b64(viewBytes(v)) };
  if (typeof File !== "undefined" && v instanceof File) {
    return { t: "f", n: v.name, y: v.type, m: v.lastModified, b: b64(new Uint8Array(await v.arrayBuffer())) };
  }
  if (v instanceof Blob) return { t: "bl", y: v.type, b: b64(new Uint8Array(await v.arrayBuffer())) };
  if (v instanceof Map) {
    const out = [];
    for (const [k, x] of v) out.push([await enc(k), await enc(x)]);
    return { t: "m", v: out };
  }
  if (v instanceof Set) {
    const out = [];
    for (const x of v) out.push(await enc(x));
    return { t: "s", v: out };
  }
  if (v instanceof Error) return { t: "e", k: v.name, m: v.message };
  if (v instanceof Boolean || v instanceof Number || v instanceof String) {
    return { t: "w", k: v.constructor.name, v: await enc(v.valueOf()) };
  }
  const out = {};
  for (const k of Object.keys(v)) out[k] = await enc(v[k]);
  return { t: "o", v: out };
};
const ERRORS = { Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError };
const dec = (v) => {
  if (v === null || typeof v !== "object") return v;
  switch (v.t) {
    case "u": return undefined;
    case "n": return v.v === "-0" ? -0 : Number(v.v);
    case "bi": return BigInt(v.v);
    case "a": return v.v.map(dec);
    case "d": return new Date(Number(v.v));
    case "r": return new RegExp(v.s, v.f);
    case "ab": return unb64(v.b).buffer;
    case "dv": return new DataView(unb64(v.b).buffer);
    case "ta": return new globalThis[v.k](unb64(v.b).buffer);
    case "f": return new File([unb64(v.b)], v.n, { type: v.y, lastModified: v.m });
    case "bl": return new Blob([unb64(v.b)], { type: v.y });
    case "m": return new Map(v.v.map(([k, x]) => [dec(k), dec(x)]));
    case "s": return new Set(v.v.map(dec));
    case "e": {
      const error = new (ERRORS[v.k] || Error)(v.m);
      return error;
    }
    case "w": return Object(dec(v.v));
    case "o": {
      const out = {};
      for (const k of Object.keys(v.v)) out[k] = dec(v.v[k]);
      return out;
    }
    default: throw new Error("an unknown value tag " + v.t);
  }
};
const done = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
`;

/** The script that answers every database of the page's origin as one JSON snapshot, or `{ over }` past `cap` characters. */
export const idbRead = (cap: number): string => `(async () => {
${CODEC}
const cap = ${cap};
let size = 0;
const listed = (await indexedDB.databases()).filter((one) => typeof one.name === "string");
listed.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
const databases = [];
for (const { name } of listed) {
  const db = await done(indexedDB.open(name));
  try {
    const stores = [];
    for (const storeName of Array.from(db.objectStoreNames)) {
      const store = db.transaction(storeName, "readonly").objectStore(storeName);
      const indexes = Array.from(store.indexNames).map((indexName) => {
        const index = store.index(indexName);
        return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
      });
      const records = [];
      const cursor = store.openCursor();
      await new Promise((resolve, reject) => {
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
          const at = cursor.result;
          if (!at) {
            resolve();
            return;
          }
          records.push([at.primaryKey, at.value]);
          at.continue();
        };
      });
      const encoded = [];
      for (const [key, value] of records) {
        const record = [await enc(key), await enc(value)];
        size += JSON.stringify(record).length;
        if (size > cap) return JSON.stringify({ over: size });
        encoded.push(record);
      }
      stores.push({ name: storeName, keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes, records: encoded });
    }
    databases.push({ name: db.name, version: db.version, stores });
  } finally {
    db.close();
  }
}
return JSON.stringify({ databases });
})()`;

/** The script that makes every database of `snapshot` (as `idbRead` answers it) again on the page's origin, at its version. */
export const idbWrite = (snapshot: string): string => `(async () => {
${CODEC}
const { databases } = JSON.parse(${JSON.stringify(snapshot)});
for (const one of databases) {
  const request = indexedDB.open(one.name, one.version);
  request.onupgradeneeded = () => {
    const db = request.result;
    for (const store of one.stores) {
      const made = db.createObjectStore(store.name, { keyPath: store.keyPath, autoIncrement: store.autoIncrement });
      for (const index of store.indexes) {
        made.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
      }
    }
  };
  const db = await done(request);
  try {
    const names = one.stores.map((store) => store.name);
    if (names.length > 0) {
      const tx = db.transaction(names, "readwrite");
      for (const store of one.stores) {
        const into = tx.objectStore(store.name);
        for (const [key, value] of store.records) {
          if (store.keyPath === null) into.put(dec(value), dec(key));
          else into.put(dec(value));
        }
      }
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
  } finally {
    db.close();
  }
}
return "written";
})()`;
