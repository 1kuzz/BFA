/* ============================================================
   IndexedDB. Хранилища:
   - forms   : raw данные формы по id (+ meta с hash/updatedAt)
   - history : лёгкие снапшоты запусков по метке времени
   - meta    : снимок для диффа, служебные ключи
   Инкрементальность: у каждой формы храним hash; при следующем
   запуске форму можно пропустить, если hash в списке совпал.
   ============================================================ */

var DB_NAME = 'bxFormsAnalyzer', VER = 3;
export var STORE = 'forms', HIST = 'history', META = 'meta';

export function openDb() {
  return new Promise(function (res, rej) {
    var q = indexedDB.open(DB_NAME, VER);
    q.onupgradeneeded = function () {
      var d = q.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      if (!d.objectStoreNames.contains(HIST)) d.createObjectStore(HIST);
      if (!d.objectStoreNames.contains(META)) d.createObjectStore(META);
    };
    q.onsuccess = function () { res(q.result); };
    q.onerror = function () { rej(q.error); };
  });
}

export function cacheGet(db, k, store) {
  return new Promise(function (res) {
    try {
      var t = db.transaction(store || STORE, 'readonly').objectStore(store || STORE).get(k);
      t.onsuccess = function () { res(t.result); };
      t.onerror = function () { res(null); };
    } catch (e) { res(null); }
  });
}

export function cacheSet(db, k, v, store) {
  return new Promise(function (res) {
    try {
      var t = db.transaction(store || STORE, 'readwrite').objectStore(store || STORE).put(v, k);
      t.onsuccess = function () { res(); };
      t.onerror = function () { res(); };
    } catch (e) { res(); }
  });
}

export function cacheKeys(db, store) {
  return new Promise(function (res) {
    try {
      var t = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
      t.onsuccess = function () { res(t.result || []); };
      t.onerror = function () { res([]); };
    } catch (e) { res([]); }
  });
}

export function deleteDb() {
  return new Promise(function (res) {
    var rq = indexedDB.deleteDatabase(DB_NAME);
    rq.onsuccess = res; rq.onerror = res; rq.onblocked = res;
    setTimeout(res, 2000);
  });
}

/* Быстрый строковый хэш (FNV-1a) для инкрементального сравнения. */
export function hashObj(obj) {
  var s = JSON.stringify(obj);
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}
