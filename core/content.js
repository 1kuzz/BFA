/* ============================================================
   Content script. Живёт на вкладке Bitrix24/kasperskyform.
   Задача: достать sessid и проксировать fetch к main/ajax.php.

   Тонкость: BX живёт в MAIN world страницы, а content-script —
   в изолированном мире, где window.BX недоступен. PHPSESSID
   почти всегда HttpOnly, значит document.cookie его не видит.
   Поэтому sessid добываем через инъекцию скрипта в страницу:
   он читает BX.bitrix_sessid() и кладёт значение в data-атрибут
   <html>, откуда content-script его забирает. Плюс фолбэки:
   meta[name=csrf-token], глобальные переменные, скрытые input.
   ============================================================ */
(function () {
  var ATTR = 'data-bxfa-sessid';

  function injectPageProbe() {
    return new Promise(function (resolve) {
      // если уже добыли — не инжектим повторно
      var pre = document.documentElement.getAttribute(ATTR);
      if (pre) { resolve(pre); return; }

      var code = '(' + function () {
        try {
          var s = null;
          if (typeof BX !== 'undefined' && typeof BX.bitrix_sessid === 'function') s = BX.bitrix_sessid();
          if (!s && typeof BX !== 'undefined' && BX.message) { try { s = BX.message('bitrix_sessid'); } catch (e) {} }
          if (!s && typeof window.bitrix_sessid === 'string') s = window.bitrix_sessid;
          if (s) document.documentElement.setAttribute('data-bxfa-sessid', s);
        } catch (e) {}
      }.toString() + ')();';

      var el = document.createElement('script');
      el.textContent = code;
      (document.head || document.documentElement).appendChild(el);
      el.remove();

      // значение появляется синхронно, но дадим тик на всякий случай
      setTimeout(function () {
        resolve(document.documentElement.getAttribute(ATTR));
      }, 0);
    });
  }

  function readFromDom() {
    // meta csrf (некоторые сборки Bitrix кладут sessid сюда)
    var meta = document.querySelector('meta[name="csrf-token"], meta[name="bitrix-sessid"]');
    if (meta && meta.content) return meta.content;
    // скрытый input sessid_field
    var inp = document.querySelector('input[name="sessid"], #sessid');
    if (inp && inp.value) return inp.value;
    return null;
  }

  function readCookie() {
    var m = document.cookie.match(/(?:^|;\s*)PHPSESSID=([^;]+)/);
    return m ? m[1] : null;
  }

  async function getSessid() {
    var s = await injectPageProbe();
    if (s) return s;
    s = readFromDom();
    if (s) return s;
    return readCookie();
  }

  function apiFetch(action, body, sessid) {
    var url = '/bitrix/services/main/ajax.php?action=' + encodeURIComponent(action) +
              '&sessid=' + encodeURIComponent(sessid);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bitrix-Csrf-Token': sessid },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    }).then(function (r) {
      var retryAfter = r.headers.get('Retry-After');
      return r.text().then(function (txt) {
        var json = {};
        try { json = txt ? JSON.parse(txt) : {}; } catch (e) { json = { _parseError: true, _raw: (txt || '').slice(0, 200) }; }
        return { ok: r.ok, status: r.status, json: json, retryAfter: retryAfter };
      });
    }).catch(function (e) {
      return { ok: false, status: 0, json: { _err: e.message } };
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.target !== 'content') return;

    if (msg.type === 'ping') {
      getSessid().then(function (sessid) {
        sendResponse({ ok: !!sessid, sessid: sessid || null, href: location.href });
      });
      return true; // async
    }

    if (msg.type === 'api') {
      (msg.sessid ? Promise.resolve(msg.sessid) : getSessid()).then(function (sessid) {
        if (!sessid) { sendResponse({ ok: false, status: 0, json: { _err: 'no-sessid' } }); return; }
        apiFetch(msg.action, msg.body, sessid).then(sendResponse);
      });
      return true; // async
    }
  });
})();
