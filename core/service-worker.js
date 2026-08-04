/* ============================================================
   Service worker — оркестратор.
   Пайплайн: список форм -> инкрементальный fetch деталей ->
   анализ -> дифф со снапшотом -> запись истории -> экспорт ->
   опциональный вебхук по CRIT. Прогресс шлётся в popup/report.
   ============================================================ */
import { createApi, runPool, sleep, clean } from './api.js';
import { openDb, cacheGet, cacheSet, cacheKeys, deleteDb, hashObj, STORE, HIST, META } from './cache.js';
import { DEFAULT_PROFILES } from './rules.js';
import { analyze } from '../analyzers/analyze.js';
import { buildSnapshot, diffSnapshots } from '../analyzers/diff.js';
import { buildSheets, sheetsToXlsx, toJsonl } from '../analyzers/export.js';
import * as XLSX from '../vendor/xlsx.full.min.js';

var running = false;
var lastResult = null;

function broadcast(msg) {
  chrome.runtime.sendMessage(Object.assign({ target: 'ui' }, msg)).catch(function () {});
}

async function getSettings() {
  var d = await chrome.storage.local.get(['settings', 'profiles', 'activeProfile']);
  var settings = d.settings || {};
  var profiles = d.profiles || DEFAULT_PROFILES;
  var activeProfile = d.activeProfile || 'Default';
  var profile = profiles[activeProfile] || DEFAULT_PROFILES.Default;
  return {
    concurrency: settings.concurrency || 4,
    useCache: settings.useCache !== false,
    incremental: settings.incremental !== false,
    dupThreshold: settings.dupThreshold || 0.9,
    maxRetries: settings.maxRetries || 8,
    webhookUrl: settings.webhookUrl || '',
    profileName: activeProfile,
    requirements: profile.requirements,
    presetRules: profile.presetRules
  };
}

function pingTab(tabId) {
  return new Promise(function (res) {
    chrome.tabs.sendMessage(tabId, { target: 'content', type: 'ping' }, function (r) {
      if (chrome.runtime.lastError) res(null); else res(r);
    });
  });
}

/* Достаём sessid напрямую из MAIN world вкладки — самый надёжный путь:
   executeScript с world:'MAIN' видит BX, в отличие от content-script. */
async function probeSessidMainWorld(tabId) {
  try {
    var results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: function () {
        try {
          if (typeof BX !== 'undefined' && typeof BX.bitrix_sessid === 'function') {
            var s = BX.bitrix_sessid();
            if (s) return s;
          }
        } catch (e) {}
        try { if (typeof BX !== 'undefined' && BX.message) { var m = BX.message('bitrix_sessid'); if (m) return m; } } catch (e) {}
        try { if (typeof window.bitrix_sessid === 'string' && window.bitrix_sessid) return window.bitrix_sessid; } catch (e) {}
        var meta = document.querySelector('meta[name="csrf-token"], meta[name="bitrix-sessid"]');
        if (meta && meta.content) return meta.content;
        var inp = document.querySelector('input[name="sessid"], #sessid');
        if (inp && inp.value) return inp.value;
        return null;
      }
    });
    if (results && results[0] && results[0].result) return results[0].result;
  } catch (e) { /* нет доступа к вкладке */ }
  return null;
}

/* Гарантируем, что content-script (прокси fetch) есть на вкладке. */
async function ensureContentScript(tabId) {
  var pong = await pingTab(tabId);
  if (pong) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['core/content.js'] });
    // дать листенеру зарегистрироваться
    await sleep(150);
    return true;
  } catch (e) { return false; }
}

async function findCrmTab() {
  var matchUrls = ['https://*.bitrix24.eu/*', 'https://*.kasperskyform.eu/*', 'https://kasperskyform.eu/*'];

  // сначала активная вкладка текущего окна, потом все совпадающие
  var active = await chrome.tabs.query({ active: true, currentWindow: true });
  var matched = await chrome.tabs.query({ url: matchUrls });
  var ordered = [];
  if (active[0]) ordered.push(active[0]);
  matched.forEach(function (t) { if (!ordered.some(function (o) { return o.id === t.id; })) ordered.push(t); });

  for (var i = 0; i < ordered.length; i++) {
    var tab = ordered[i];
    if (!tab || !tab.url) continue;
    var host = '';
    try { host = new URL(tab.url).host; } catch (e) {}
    var isBx = /(^|\.)bitrix24\.eu$/.test(host) || /(^|\.)?kasperskyform\.eu$/.test(host);
    if (!isBx) continue;

    // добыть sessid напрямую из MAIN world
    var sessid = await probeSessidMainWorld(tab.id);
    if (!sessid) continue;

    // убедиться, что прокси-content-script на месте
    await ensureContentScript(tab.id);
    return { tabId: tab.id, sessid: sessid, href: tab.url };
  }
  return null;
}

/* В MV3 service worker нет URL.createObjectURL/Blob-URL.
   Отдаём файл как data-URL (base64). Кодируем чанками, чтобы
   не переполнить стек на больших массивах (xlsx/raw json). */
function bytesToBase64(bytes) {
  var CHUNK = 0x8000, out = '';
  for (var i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}
function downloadBytes(filename, bytes, mime) {
  var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  var dataUrl = 'data:' + (mime || 'application/octet-stream') + ';base64,' + bytesToBase64(u8);
  chrome.downloads.download({ url: dataUrl, filename: filename, saveAs: false }, function () {
    if (chrome.runtime.lastError) broadcast({ type: 'log', level: 'warn', text: 'Скачивание ' + filename + ': ' + chrome.runtime.lastError.message });
  });
}
function downloadText(filename, text, mime) {
  downloadBytes(filename, new TextEncoder().encode(text), mime);
}

async function sendWebhook(url, A, profileName) {
  if (!url) return;
  var crit = A.rows.filter(function (r) { return r.severity === 'CRIT'; });
  var payload = {
    text: 'Bitrix24 Forms Analyzer — профиль ' + profileName +
          '\nВсего форм: ' + A.rows.length +
          ' | 🔴 ' + A.sevCount.CRIT + ' | 🟡 ' + A.sevCount.WARN +
          ' | 🔵 ' + A.sevCount.INFO + ' | 🟢 ' + A.sevCount.OK +
          '\nСредний Score: ' + A.avgScore +
          (crit.length ? '\nТоп CRIT: ' + crit.slice(0, 10).map(function (r) { return r.id + ' (' + (r.crit || '').slice(0, 60) + ')'; }).join('; ') : '')
  };
  try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  catch (e) { broadcast({ type: 'log', level: 'warn', text: 'Вебхук не отправлен: ' + e.message }); }
}

async function run(force) {
  if (running) { broadcast({ type: 'log', text: 'Уже выполняется...' }); return; }
  running = true;
  var tStart = Date.now();
  try {
    var S = await getSettings();
    broadcast({ type: 'status', phase: 'init', text: 'Ищу вкладку Bitrix24...' });

    var tab = await findCrmTab();
    if (!tab) {
      broadcast({ type: 'error', text: 'Сессия не найдена. Откройте CRM (kasperskyform.eu), войдите и обновите вкладку (F5), затем запустите снова.' });
      running = false; return;
    }
    broadcast({ type: 'log', text: 'Сессия найдена на ' + tab.href });

    var db = null;
    if (S.useCache) { try { db = await openDb(); } catch (e) { broadcast({ type: 'log', level: 'warn', text: 'IndexedDB недоступен' }); } }

    var apiCtx = createApi({ tabId: tab.tabId, sessid: tab.sessid, maxRetries: S.maxRetries });
    var perf = apiCtx.perf;

    // 1) список форм
    broadcast({ type: 'status', phase: 'list', text: 'Собираю список форм...' });
    var t0 = Date.now(), ids = [], seen = {}, page = 1;
    while (page <= 200) {
      var lr = await apiCtx.apiRetry('crm.api.form.list', { navigation: { iNumPage: page, nPageSize: 50 } });
      var items = (lr && lr.data && (lr.data.items || lr.data.forms || lr.data.list)) || (Array.isArray(lr && lr.data) ? lr.data : null);
      if (!items || !items.length) break;
      var added = 0;
      items.forEach(function (f) { var id = f.id != null ? f.id : f.ID; if (id != null && !seen[id]) { seen[id] = 1; ids.push(String(id)); added++; } });
      if (added === 0) break; page++; await sleep(120);
    }
    perf.listTime = Date.now() - t0;
    broadcast({ type: 'log', text: 'Форм найдено: ' + ids.length + ' за ' + perf.listTime + 'мс' });

    // 2) инкрементальный fetch
    var raw = {}, fails = [];
    broadcast({ type: 'status', phase: 'fetch', text: 'Загружаю детали форм...', done: 0, total: ids.length });

    async function fetchForm(id) {
      if (S.useCache && db && !force) {
        var cached = await cacheGet(db, id);
        if (cached) { raw[id] = cached; perf.cacheHits++; return; }
      }
      var ts = Date.now();
      var resp = await apiCtx.apiRetry('crm.api.form.get', { id: id });
      perf.formTimes.push(Date.now() - ts);
      if (!resp || resp.status !== 'success' || !resp.data || !resp.data.data) { fails.push(id); perf.errors++; return; }
      raw[id] = resp.data;
      if (S.useCache && db) await cacheSet(db, id, resp.data);
    }

    await runPool(ids, S.concurrency, fetchForm, function (done, total) {
      if (done % 10 === 0 || done === total) broadcast({ type: 'progress', done: done, total: total });
    });
    broadcast({ type: 'log', text: 'Разобрано: ' + Object.keys(raw).length + ', ошибок: ' + fails.length });

    // 3) анализ
    broadcast({ type: 'status', phase: 'analyze', text: 'Анализирую...' });
    var A = analyze(raw, S.requirements, S.presetRules, S.dupThreshold);

    // 4) метрики
    var ft = perf.formTimes.slice().sort(function (a, b) { return a - b; });
    var perfStats = {
      listTimeMs: perf.listTime,
      formAvgMs: ft.length ? Math.round(ft.reduce(function (a, b) { return a + b; }, 0) / ft.length) : 0,
      formMinMs: ft.length ? ft[0] : 0, formMaxMs: ft.length ? ft[ft.length - 1] : 0,
      formP50Ms: ft.length ? ft[Math.floor(ft.length * 0.5)] : 0, formP95Ms: ft.length ? ft[Math.floor(ft.length * 0.95)] : 0,
      apiCalls: perf.apiCalls, cacheHits: perf.cacheHits, cacheHitPct: ids.length ? Math.round(perf.cacheHits * 1000 / ids.length) / 10 : 0,
      retries: perf.retries, retryPct: perf.apiCalls ? Math.round(perf.retries * 1000 / perf.apiCalls) / 10 : 0,
      http429: perf.http429, http500: perf.http500, http503: perf.http503, maxBackoffMs: perf.maxBackoffMs,
      errors: perf.errors, totalSec: Math.round((Date.now() - tStart) / 1000)
    };

    // 5) дифф + история
    var diffChanges = [], timelineRows = [];
    if (S.useCache && db) {
      var SNAP_KEY = '__snapshot__', SNAP_VER = 'v5';
      var prevWrap = await cacheGet(db, SNAP_KEY, META);
      var curSnap = buildSnapshot(A.rows);
      var prevSnap = (prevWrap && prevWrap.ver === SNAP_VER) ? prevWrap.data : null;
      diffChanges = diffSnapshots(prevSnap, curSnap);
      await cacheSet(db, SNAP_KEY, { ver: SNAP_VER, data: curSnap }, META);

      var stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
      var lightSnap = {}; A.rows.forEach(function (r) { lightSnap[r.id] = { s: r.severity, cv: r.consentVersion }; });
      await cacheSet(db, stamp, lightSnap, HIST);

      var histKeys = (await cacheKeys(db, HIST)).sort();
      if (histKeys.length > 1) {
        var histData = {};
        for (var hi = 0; hi < histKeys.length; hi++) histData[histKeys[hi]] = await cacheGet(db, histKeys[hi], HIST);
        var allFormIds = {}; histKeys.forEach(function (k) { Object.keys(histData[k] || {}).forEach(function (id) { allFormIds[id] = 1; }); });
        Object.keys(allFormIds).forEach(function (id) {
          var seq = histKeys.map(function (k) { var v = (histData[k] || {})[id]; return v ? v.s + '/' + (v.cv || '—') : '—'; });
          if (new Set(seq).size > 1) timelineRows.push([id, histKeys.map(function (k, i) { return k.slice(5, 16) + ': ' + seq[i]; }).join('  ->  ')]);
        });
      }
    }

    // 6) экспорт
    broadcast({ type: 'status', phase: 'export', text: 'Формирую файлы...' });
    var sheets = buildSheets(A, perfStats, diffChanges, timelineRows, S.concurrency, S.dupThreshold);
    var xlsxBytes = sheetsToXlsx(XLSX, sheets);
    downloadBytes('Forms_Analysis.xlsx', xlsxBytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    downloadText('forms_analysis.jsonl', toJsonl(A.rows), 'application/x-ndjson');
    downloadText('forms_raw.json', JSON.stringify(raw), 'application/json');

    // 7) вебхук
    await sendWebhook(S.webhookUrl, A, S.profileName);

    // 8) результат для report.html
    lastResult = {
      generatedAt: new Date().toISOString(), profile: S.profileName,
      rows: A.rows, sevCount: A.sevCount, avgScore: A.avgScore, avgFields: A.avgFields,
      clusters: A.clusters, anomalies: A.anomalies, consistency: A.consistency,
      agrConflicts: A.agrConflicts, presetIssuesAll: A.presetIssuesAll,
      expectedConsent: A.expectedConsent, fieldUsage: A.fieldUsage,
      perfStats: perfStats, diffChanges: diffChanges, timelineRows: timelineRows,
      fails: fails
    };
    await chrome.storage.local.set({ lastResult: lastResult });

    broadcast({ type: 'done', summary: { total: A.rows.length, sev: A.sevCount, avgScore: A.avgScore, diff: diffChanges.length, totalSec: perfStats.totalSec } });
  } catch (e) {
    broadcast({ type: 'error', text: 'Ошибка: ' + (e && e.message ? e.message : e) });
  } finally {
    running = false;
  }
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.target !== 'sw') return;
  if (msg.type === 'run') { run(false); sendResponse({ ok: true }); return true; }
  if (msg.type === 'runForce') { run(true); sendResponse({ ok: true }); return true; }
  if (msg.type === 'resetCache') { deleteDb().then(function () { sendResponse({ ok: true }); }); return true; }
  if (msg.type === 'openReport') { chrome.tabs.create({ url: chrome.runtime.getURL('ui/report.html') }); sendResponse({ ok: true }); return true; }
  if (msg.type === 'status') { sendResponse({ running: running }); return true; }
});

/* Плановый прогон (алармы) — если задан интервал в настройках. */
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === 'scheduledRun') run(false);
});
chrome.runtime.onInstalled.addListener(async function () {
  var d = await chrome.storage.local.get('settings');
  var mins = (d.settings || {}).scheduleMinutes || 0;
  if (mins > 0) chrome.alarms.create('scheduledRun', { periodInMinutes: mins });
});
