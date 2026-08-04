/* ============================================================
   Движок правил. Всё, что в оригинале было захардкожено
   (PRESET_RULES, severity-логика, требования), вынесено сюда
   и управляется профилями. Профиль = именованный набор
   requirements + preset-паттернов. Инстансы META/EMEA/RU
   могут иметь разные требования к консенту.
   ============================================================ */

export var DEFAULT_REQUIREMENTS = {
  requireVisitorId: true,
  requireMarketoId: false,
  requireEmail: true,
  requireCaptcha: false,
  requireConsentVersion: true,
  requireHttpsRedirect: true,
  invalidConsentVersionPatterns: ['^test$', '^ex_', '^EN_2$'],
  nonEnglishEn1Severity: 'CRIT'
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
  'Default': {
    requirements: Object.assign({}, DEFAULT_REQUIREMENTS, {
      invalidConsentVersionPatterns: DEFAULT_REQUIREMENTS.invalidConsentVersionPatterns.slice()
    }),
    presetRules: Object.assign({}, DEFAULT_PRESET_RULES),
    exclusions: { languages: ['la'], regions: ['Americas'] }
  },
  'RU': {
    requirements: Object.assign({}, DEFAULT_REQUIREMENTS, {
      requireCaptcha: true,
      invalidConsentVersionPatterns: DEFAULT_REQUIREMENTS.invalidConsentVersionPatterns.slice()
    }),
    presetRules: Object.assign({}, DEFAULT_PRESET_RULES, {
      'UF_CRM_CONSENT_VERSION': '^(?:[Bb][Tt][Xx]|[Rr][Uu](?: [A-Za-zА-Яа-я0-9]+)+) [Vv]\\d+$',
      'UF_CRM_SUBSCRIPTION_VERSION': '^(?:[Bb][Tt][Xx]|[Rr][Uu](?: [A-Za-zА-Яа-я0-9]+)+) [Vv]\\d+$'
    }),
    exclusions: { languages: [], regions: [] }
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
  RULES = RULES || DEFAULT_REQUIREMENTS;
  var crit = [], warn = [], info = [], recs = [], seen = {};
  var cv = ctx.consentVersion, sv = ctx.subscriptionVersion;
  ctx.redirectIssue = ctx.redirectIssue || '';
  var lang = (ctx.language || '').toLowerCase();
  function add(list, key, text) {
    if (!seen[key]) { seen[key] = true; list.push(text); }
  }

  if (RULES.requireConsentVersion && !cv) add(crit, 'consent:missing', 'нет версии консента');
  if (cv && sv && cv !== sv) add(crit, 'consent:mismatch', 'консент(' + cv + ') != подписка(' + sv + ')');
  (RULES.invalidConsentVersionPatterns || []).some(function (pattern) {
    try {
      if (cv && new RegExp(pattern, 'i').test(cv)) {
        add(crit, 'preset:UF_CRM_CONSENT_VERSION', 'нестандартная версия: ' + cv);
        return true;
      }
    } catch (e) { /* bad custom regexp is ignored */ }
    return false;
  });
  (ctx.presetIssues || []).forEach(function (issue) {
    add(crit, 'preset:' + issue.field, 'невалидный preset ' + issue.field + ': ' + issue.value);
  });
  if (!ctx.presetIssues && ctx.presetIssuesCount)
    add(crit, 'preset:legacy', 'невалидные preset: ' + ctx.presetIssuesCount);
  (ctx.agreementConflicts || []).forEach(function (conflict) {
    add(crit, 'agreement:' + conflict.id,
      'конфликт текста соглашения ' + conflict.id + ': ' + conflict.variants + ' вариантов');
  });
  if (RULES.requireEmail && !ctx.hasEmail) add(crit, 'field:email', 'нет поля Email');
  if (RULES.requireHttpsRedirect && ctx.redirectIssue.indexOf('HTTP') > -1)
    add(crit, 'redirect:http', 'небезопасный редирект: ' + ctx.redirectIssue);

  if (lang !== 'en' && lang !== '' && cv === 'EN_1') {
    var en1 = 'консент EN_1 на локали ' + ctx.language;
    add(RULES.nonEnglishEn1Severity === 'WARN' ? warn : crit, 'consent:wrong-locale', en1);
  }
  if (ctx.redirectIssue && ctx.redirectIssue.indexOf('HTTP') === -1)
    add(warn, 'redirect:other', 'редирект: ' + ctx.redirectIssue);
  if (RULES.requireCaptcha && ctx.captcha === 'N') add(warn, 'captcha:missing', 'нет captcha');

  if (RULES.requireVisitorId && !ctx.hasVisitorId) add(info, 'field:visitor', 'нет VisitorID');
  if (RULES.requireMarketoId && !ctx.hasMarketoId) add(info, 'field:marketo', 'нет Marketo ID');

  if (!cv) recs.push('Добавить UF_CRM_CONSENT_VERSION');
  if (!ctx.hasVisitorId) recs.push('Добавить VisitorID (validator.js)');
  if (cv && sv && cv !== sv) recs.push('Свести версии консента и подписки');
  if (lang !== 'en' && cv === 'EN_1') recs.push('Локализовать консент для ' + ctx.language);
  if (!ctx.hasEmail) recs.push('Добавить обязательный Email');
  if (ctx.redirectIssue) recs.push('Исправить редирект: ' + ctx.redirectIssue);
  if ((ctx.presetIssues || []).length || ctx.presetIssuesCount) recs.push('Проверить значения preset');

  var severity = crit.length ? 'CRIT' : (warn.length ? 'WARN' : (info.length ? 'INFO' : 'OK'));

  /* Quality Score 0..100: штрафуем за проблемы. */
  var score = 100 - crit.length * 25 - warn.length * 10 - info.length * 3;
  if (score < 0) score = 0;

  return { severity: severity, crit: crit, warn: warn, info: info, recommendations: recs, score: score };
}
