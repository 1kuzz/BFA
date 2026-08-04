/* ============================================================
   Движок правил. Всё, что в оригинале было захардкожено
   (PRESET_RULES, severity-логика, требования), вынесено сюда
   и управляется профилями. Профиль = именованный набор
   requirements + preset-паттернов. Регионы LATAM/META/EMEA/RU
   могут иметь разные требования к консенту.
   ============================================================ */

export var DEFAULT_REQUIREMENTS = {
  requireVisitorId: true,
  requireMarketoId: false,
  requireEmail: true,
  requireCaptcha: false,
  requireConsentVersion: true,
  requireHttpsRedirect: true
};

/* Паттерны preset-значений. Ключ regexp хранится строкой,
   компилируется на лету (JSON-совместимо для настроек). */
export var DEFAULT_PRESET_RULES = {
  'UF_CRM_CONSENT': '^Y$',
  'UF_CRM_SUBSCRIPTION': '^Y$',
  'UF_CRM_USED_ON_FORM_CONSENT': '^Y$',
  'UF_CRM_USED_ON_FORM_SUBSCRIPTION': '^Y$',
  'UF_CRM_CONSENT_VERSION': '^[A-Z]{2,}(_[A-Z0-9]+)*$',
  'UF_CRM_SUBSCRIPTION_VERSION': '^[A-Z]{2,}(_[A-Z0-9]+)*$',
  'UF_CRM_PERSON_STATUS_FOR_CRM': '^(PROCESSED|IN_PROCESS|NEW|\\d+)$',
  'UF_CRM_VISITOR_ID': '%UF_VISITOR_ID%',
  'UF_CRM_FORM_NAME': '%crm_form_name%',
  'UF_CRM_BITRIX_FORM_ID': '%crm_form_id%'
};

export var DEFAULT_PROFILES = {
  'Default': { requirements: DEFAULT_REQUIREMENTS, presetRules: DEFAULT_PRESET_RULES },
  'LATAM': {
    requirements: Object.assign({}, DEFAULT_REQUIREMENTS, { requireMarketoId: true }),
    presetRules: DEFAULT_PRESET_RULES
  },
  'RU': {
    requirements: Object.assign({}, DEFAULT_REQUIREMENTS, { requireCaptcha: true }),
    presetRules: DEFAULT_PRESET_RULES
  }
};

function compileRules(presetRules) {
  var out = {};
  Object.keys(presetRules || {}).forEach(function (k) {
    try { out[k] = new RegExp(presetRules[k]); } catch (e) { /* skip bad regex */ }
  });
  return out;
}

/* Валидатор одного preset-значения. Возвращает строку-проблему или null. */
export function makeValidator(presetRules) {
  var compiled = compileRules(presetRules);
  return function (fieldName, value) {
    var rule = compiled[fieldName];
    if (!rule) return null;
    return rule.test(value) ? null : ('значение "' + value + '" не соответствует шаблону');
  };
}

/* Оценка severity формы по требованиям профиля.
   Возвращает {severity, crit[], warn[], info[], recommendations[], score}. */
export function scoreForm(ctx, RULES) {
  var crit = [], warn = [], info = [], recs = [];
  var cv = ctx.consentVersion, sv = ctx.subscriptionVersion;
  var lang = (ctx.language || '').toLowerCase();

  if (RULES.requireConsentVersion && !cv) crit.push('нет версии консента');
  if (cv && sv && cv !== sv) crit.push('консент(' + cv + ') != подписка(' + sv + ')');
  if (cv && (cv.toLowerCase() === 'test' || cv.toLowerCase().indexOf('btx') > -1 ||
             cv.indexOf('ex_') === 0 || cv === 'EN_2')) crit.push('нестандартная версия: ' + cv);
  if (RULES.requireEmail && !ctx.hasEmail) crit.push('нет поля Email');
  if (RULES.requireHttpsRedirect && ctx.redirectIssue.indexOf('HTTP') > -1)
    crit.push('небезопасный редирект: ' + ctx.redirectIssue);
  if (ctx.presetIssuesCount) crit.push('невалидные preset: ' + ctx.presetIssuesCount);

  if (lang !== 'en' && lang !== '' && cv === 'EN_1') warn.push('консент EN_1 на локали ' + ctx.language);
  if (ctx.redirectIssue && ctx.redirectIssue.indexOf('HTTP') === -1) warn.push('редирект: ' + ctx.redirectIssue);
  if (RULES.requireCaptcha && ctx.captcha === 'N') warn.push('нет captcha');

  if (RULES.requireVisitorId && !ctx.hasVisitorId) info.push('нет VisitorID');
  if (RULES.requireMarketoId && !ctx.hasMarketoId) info.push('нет Marketo ID');

  if (!cv) recs.push('Добавить UF_CRM_CONSENT_VERSION');
  if (!ctx.hasVisitorId) recs.push('Добавить VisitorID (validator.js)');
  if (cv && sv && cv !== sv) recs.push('Свести версии консента и подписки');
  if (lang !== 'en' && cv === 'EN_1') recs.push('Локализовать консент для ' + ctx.language);
  if (!ctx.hasEmail) recs.push('Добавить обязательный Email');
  if (ctx.redirectIssue) recs.push('Исправить редирект: ' + ctx.redirectIssue);
  if (ctx.presetIssuesCount) recs.push('Проверить значения preset');

  var severity = crit.length ? 'CRIT' : (warn.length ? 'WARN' : (info.length ? 'INFO' : 'OK'));

  /* Quality Score 0..100: штрафуем за проблемы. */
  var score = 100 - crit.length * 25 - warn.length * 10 - info.length * 3;
  if (score < 0) score = 0;

  return { severity: severity, crit: crit, warn: warn, info: info, recommendations: recs, score: score };
}
