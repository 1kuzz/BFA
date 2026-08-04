var $ = function (id) { return document.getElementById(id); };

var DEFAULT_REQ = {
  requireVisitorId: true, requireMarketoId: false, requireEmail: true,
  requireCaptcha: false, requireConsentVersion: true, requireHttpsRedirect: true
};
var DEFAULT_PRESET = {
  'UF_CRM_CONSENT': '^Y$', 'UF_CRM_SUBSCRIPTION': '^Y$',
  'UF_CRM_USED_ON_FORM_CONSENT': '^Y$', 'UF_CRM_USED_ON_FORM_SUBSCRIPTION': '^Y$',
  'UF_CRM_CONSENT_VERSION': '^[A-Z]{2,}(_[A-Z0-9]+)*$',
  'UF_CRM_SUBSCRIPTION_VERSION': '^[A-Z]{2,}(_[A-Z0-9]+)*$',
  'UF_CRM_PERSON_STATUS_FOR_CRM': '^(PROCESSED|IN_PROCESS|NEW|\\d+)$',
  'UF_CRM_VISITOR_ID': '%UF_VISITOR_ID%', 'UF_CRM_FORM_NAME': '%crm_form_name%', 'UF_CRM_BITRIX_FORM_ID': '%crm_form_id%'
};
var DEFAULT_PROFILES = {
  'Default': { requirements: DEFAULT_REQ, presetRules: DEFAULT_PRESET },
  'LATAM': { requirements: Object.assign({}, DEFAULT_REQ, { requireMarketoId: true }), presetRules: DEFAULT_PRESET },
  'RU': { requirements: Object.assign({}, DEFAULT_REQ, { requireCaptcha: true }), presetRules: DEFAULT_PRESET }
};

var REQ_KEYS = ['requireConsentVersion', 'requireEmail', 'requireHttpsRedirect', 'requireCaptcha', 'requireVisitorId', 'requireMarketoId'];
var state = { profiles: null, active: 'Default', settings: {} };

function loadProfileIntoForm(name) {
  var p = state.profiles[name] || DEFAULT_PROFILES.Default;
  REQ_KEYS.forEach(function (k) { $(k).checked = !!(p.requirements || {})[k]; });
  $('presetRules').value = JSON.stringify(p.presetRules || {}, null, 2);
}

function readProfileFromForm() {
  var req = {}; REQ_KEYS.forEach(function (k) { req[k] = $(k).checked; });
  var presetRules;
  try { presetRules = JSON.parse($('presetRules').value); }
  catch (e) { alert('Ошибка в JSON preset-паттернов: ' + e.message); return null; }
  if (!presetRules || Array.isArray(presetRules) || typeof presetRules !== 'object') {
    alert('Preset-паттерны должны быть JSON-объектом.'); return null;
  }
  try {
    Object.keys(presetRules).forEach(function (key) {
      if (typeof presetRules[key] !== 'string') throw new Error(key + ': шаблон должен быть строкой');
      new RegExp(presetRules[key]);
    });
  } catch (e) { alert('Ошибка в regex preset-паттернов: ' + e.message); return null; }
  return { requirements: req, presetRules: presetRules };
}

function renderProfileList() {
  var sel = $('profileSel'); sel.innerHTML = '';
  Object.keys(state.profiles).forEach(function (name) {
    var o = document.createElement('option'); o.value = name; o.textContent = name;
    if (name === state.active) o.selected = true;
    sel.appendChild(o);
  });
}

chrome.storage.local.get(['settings', 'profiles', 'activeProfile'], function (d) {
  state.settings = d.settings || {};
  state.profiles = d.profiles || DEFAULT_PROFILES;
  state.active = d.activeProfile || 'Default';

  renderProfileList();
  loadProfileIntoForm(state.active);

  var s = state.settings;
  $('concurrency').value = s.concurrency || 4;
  $('dupThreshold').value = s.dupThreshold || 0.9;
  $('maxRetries').value = s.maxRetries || 8;
  $('useCache').checked = s.useCache !== false;
  $('incremental').checked = s.incremental !== false;
  $('scheduleMinutes').value = s.scheduleMinutes || 0;
  $('webhookUrl').value = s.webhookUrl || '';
});

$('profileSel').onchange = function () {
  // сохранить текущую форму в старый профиль перед переключением
  var cur = readProfileFromForm();
  if (cur) state.profiles[state.active] = cur;
  state.active = $('profileSel').value;
  loadProfileIntoForm(state.active);
};

$('newProfile').onclick = function () {
  var name = prompt('Имя нового профиля (например META или EMEA):');
  if (!name) return;
  state.profiles[name] = { requirements: Object.assign({}, DEFAULT_REQ), presetRules: DEFAULT_PRESET };
  state.active = name;
  renderProfileList();
  loadProfileIntoForm(name);
};

$('delProfile').onclick = function () {
  if (Object.keys(state.profiles).length <= 1) { alert('Нельзя удалить последний профиль.'); return; }
  delete state.profiles[state.active];
  state.active = Object.keys(state.profiles)[0];
  renderProfileList();
  loadProfileIntoForm(state.active);
};

$('save').onclick = function () {
  var cur = readProfileFromForm();
  if (!cur) return;
  state.profiles[state.active] = cur;

  var settings = {
    concurrency: Math.max(1, Math.min(10, parseInt($('concurrency').value) || 4)),
    dupThreshold: parseFloat($('dupThreshold').value) || 0.9,
    maxRetries: parseInt($('maxRetries').value) || 8,
    useCache: $('useCache').checked,
    incremental: $('incremental').checked,
    scheduleMinutes: parseInt($('scheduleMinutes').value) || 0,
    webhookUrl: $('webhookUrl').value.trim()
  };

  function persist() {
    chrome.storage.local.set({ settings: settings, profiles: state.profiles, activeProfile: state.active }, function () {
      // пересоздать аларм
      chrome.alarms.clear('scheduledRun', function () {
        if (settings.scheduleMinutes > 0) chrome.alarms.create('scheduledRun', { periodInMinutes: settings.scheduleMinutes });
      });
      $('saved').textContent = '✓ Сохранено';
      setTimeout(function () { $('saved').textContent = ''; }, 2000);
    });
  }

  if (!settings.webhookUrl) { persist(); return; }
  var webhook;
  try { webhook = new URL(settings.webhookUrl); }
  catch (e) { alert('Некорректный URL вебхука.'); return; }
  if (webhook.protocol !== 'https:') { alert('Вебхук должен использовать HTTPS.'); return; }
  chrome.permissions.request({ origins: [webhook.origin + '/*'] }, function (granted) {
    if (!granted) { alert('Без разрешения на домен вебхук не сможет работать.'); return; }
    persist();
  });
};

$('reset').onclick = function () {
  if (!confirm('Удалить кэш форм, снапшот и историю запусков?')) return;
  chrome.runtime.sendMessage({ target: 'sw', type: 'resetCache' }, function () {
    $('saved').textContent = '✓ Кэш сброшен';
    setTimeout(function () { $('saved').textContent = ''; }, 2000);
  });
};
