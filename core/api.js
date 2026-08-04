/* ============================================================
   Сетевой слой. Портирован из forms_all_in_one v4:
   - apiRetry с экспоненциальным backoff + учётом Retry-After
   - адаптивный глобальный троттлинг при 429/503
   - пул воркеров с ограниченной параллельностью
   Отличие от оригинала: реальный fetch делается в content script
   (через sendToTab), сам SW только оркестрирует.
   ============================================================ */

export function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
export function clean(s) { return (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim(); }

export function createApi(opts) {
  var tabId = opts.tabId;
  var sessid = opts.sessid;
  var MAX_RETRIES = opts.maxRetries || 8;
  var MAX_BACKOFF_MS = opts.maxBackoffMs || 30000;

  var perf = {
    listTime: 0, formTimes: [], cacheHits: 0, apiCalls: 0,
    retries: 0, http429: 0, http500: 0, http503: 0, errors: 0, maxBackoffMs: 0
  };

  var throttle = { extraDelay: 0, pausedUntil: 0 };

  function noteOverload(retryAfterMs) {
    throttle.extraDelay = Math.min((throttle.extraDelay || 250) * 1.5, MAX_BACKOFF_MS);
    var wait = retryAfterMs || throttle.extraDelay;
    throttle.pausedUntil = Math.max(throttle.pausedUntil, Date.now() + wait);
  }
  function noteSuccess() {
    if (throttle.extraDelay > 0) throttle.extraDelay = Math.max(0, throttle.extraDelay * 0.8 - 20);
  }
  async function respectThrottle() {
    var now = Date.now();
    if (throttle.pausedUntil > now) await sleep(throttle.pausedUntil - now);
    if (throttle.extraDelay > 0) await sleep(throttle.extraDelay);
  }

  function sendToTab(action, body) {
    return new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, {
        target: 'content', type: 'api', action: action, body: body, sessid: sessid
      }, function (resp) {
        if (chrome.runtime.lastError || !resp) {
          resolve({ ok: false, status: 0, json: { _err: (chrome.runtime.lastError || {}).message || 'no-response' } });
        } else {
          resolve(resp);
        }
      });
    });
  }

  function api(action, body) {
    perf.apiCalls++;
    return sendToTab(action, body);
  }

  async function apiRetry(action, body, retries) {
    retries = retries == null ? MAX_RETRIES : retries;
    for (var a = 0; a <= retries; a++) {
      await respectThrottle();
      var r = await api(action, body), j = r.json;
      if (r.ok && j && j.status === 'success') { noteSuccess(); return j; }
      if (r.status === 429) perf.http429++;
      if (r.status === 500) perf.http500++;
      if (r.status === 503) perf.http503++;
      var transient = (r.status === 429 || r.status === 500 || r.status === 0 ||
                       r.status === 503 || r.status === 502 || r.status === 504);
      if (a < retries && transient) {
        perf.retries++;
        var expo = Math.min(500 * Math.pow(2, a), MAX_BACKOFF_MS);
        var ra = r.retryAfter ? parseInt(r.retryAfter, 10) * 1000 : 0;
        var waitMs = Math.max(expo, ra || 0);
        perf.maxBackoffMs = Math.max(perf.maxBackoffMs, waitMs);
        if (r.status === 503 || r.status === 429) noteOverload(ra || waitMs);
        await sleep(waitMs);
        continue;
      }
      noteSuccess();
      return j;
    }
  }

  return { perf: perf, api: api, apiRetry: apiRetry, respectThrottle: respectThrottle };
}

/* Пул воркеров с прогрессом. taskFn(id) -> Promise. */
export async function runPool(ids, concurrency, taskFn, onProgress) {
  var queue = ids.slice();
  var done = 0;
  var total = ids.length;
  async function worker() {
    while (queue.length) {
      var id = queue.shift();
      await taskFn(id);
      done++;
      if (onProgress) onProgress(done, total);
    }
  }
  var pool = [];
  var n = Math.max(1, Math.min(concurrency, total));
  for (var w = 0; w < n; w++) pool.push(worker());
  await Promise.all(pool);
}
