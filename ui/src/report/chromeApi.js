// Thin promise wrapper around the chrome.* calls report.js used directly.
// Keeps the extension messaging contract with core/service-worker.js and
// core/cache.js (via chrome.storage.local) completely unchanged.

export function storageGet(keys) {
  return new Promise(function (resolve) {
    chrome.storage.local.get(keys, resolve);
  });
}

export function storageSet(values) {
  return new Promise(function (resolve) {
    chrome.storage.local.set(values, resolve);
  });
}

export function sendMessage(message) {
  return new Promise(function (resolve) {
    chrome.runtime.sendMessage(message, resolve);
  });
}

export function onMessage(handler) {
  chrome.runtime.onMessage.addListener(handler);
  return function () { chrome.runtime.onMessage.removeListener(handler); };
}
