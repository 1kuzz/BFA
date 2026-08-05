import test from 'node:test';
import assert from 'node:assert/strict';

import { runPool } from '../core/api.js';
import { cacheNamespace } from '../core/cache.js';
import { applyEdit, editRisk, normalizeOperation, readEditValue } from '../core/editor.js';
import { DEFAULT_PROFILES, DEFAULT_REQUIREMENTS, makeValidator, scoreForm } from '../core/rules.js';
import { acceptsCrmHost, acceptsCrmUrl, crmScope } from '../core/scope.js';
import { shouldExcludeForm } from '../core/filter.js';
import { detectLanguage, languageFromFormName, normalizeLanguage, resolveFormLanguage } from '../core/lang.js';
import { searchForms, similarity, wordingVariants } from '../core/search.js';
import { analyze } from '../analyzers/analyze.js';
import { buildSnapshot, diffSnapshots } from '../analyzers/diff.js';
import { buildSheets, sheetsToXlsx, toJsonl } from '../analyzers/export.js';
import XLSX from '../vendor/xlsx.full.min.js';

test('RU profile is isolated to the Russian CRM instance', function () {
  assert.equal(crmScope('RU').expectedUrl, 'https://kasperskyform.com/crm/webform/');
  assert.equal(acceptsCrmHost('RU', 'kasperskyform.com'), true);
  assert.equal(acceptsCrmHost('RU', 'sub.kasperskyform.com'), false);
  assert.equal(acceptsCrmHost('RU', 'kasperskyform.eu'), false);
  assert.equal(acceptsCrmHost('Default', 'kasperskyform.eu'), true);
  assert.equal(acceptsCrmHost('Default', 'kasperskyform.com'), false);
  assert.equal(acceptsCrmUrl('RU', 'https://kasperskyform.com/crm/webform/'), true);
  assert.equal(acceptsCrmUrl('RU', 'https://kasperskyform.com/crm/webform/edit/42/'), true);
  assert.equal(acceptsCrmUrl('RU', 'https://kasperskyform.com/other/'), false);
});

test('editor validates, patches, and reads only supported form settings', function () {
  var form = {
    name: 'Old',
    presetFields: [{ fieldName: 'UF_CRM_CONSENT_VERSION', value: 'EN_1' }],
    data: { title: 'Title', buttonCaption: 'Send', fields: [
      { name: 'CONTACT_EMAIL', visible: true, required: false }
    ], agreements: [{ id: 9, label: 'Old privacy text' }] },
    result: { success: { url: 'https://example.com/old' } }
  };
  var operation = normalizeOperation({
    formId: 42, kind: 'preset', field: 'UF_CRM_CONSENT_VERSION', value: 'EN_2'
  });
  var patched = applyEdit(form, operation);
  assert.equal(patched.before, 'EN_1');
  assert.equal(readEditValue(patched.options, operation), 'EN_2');
  assert.equal(form.presetFields[0].value, 'EN_1');
  assert.equal(editRisk(operation), 'MEDIUM');

  var renamed = applyEdit(form, {
    formId: 42, kind: 'label', field: 'CONTACT_EMAIL', value: 'Рабочий email'
  });
  assert.equal(readEditValue(renamed.options, renamed.operation), 'Рабочий email');
  var agreement = applyEdit(form, { formId: 42, kind: 'agreement', field: '9', value: 'Canonical text' });
  assert.equal(readEditValue(agreement.options, agreement.operation), 'Canonical text');
  assert.equal(editRisk(agreement.operation), 'HIGH');

  assert.throws(function () {
    normalizeOperation({ formId: 42, kind: 'successUrl', value: 'http://example.com' });
  }, /HTTPS/);
  assert.throws(function () {
    applyEdit(form, { formId: 42, kind: 'required', field: 'MISSING', value: true });
  }, /отсутствует/);
});

test('preset rules and scoring report unsafe forms', function () {
  var validate = makeValidator({ UF_CRM_CONSENT: '^Y$' });
  assert.equal(validate('UF_CRM_CONSENT', 'Y'), null);
  assert.match(validate('UF_CRM_CONSENT', 'N'), /не соответствует/);

  var result = scoreForm({
    consentVersion: '', subscriptionVersion: '', language: 'ru', hasEmail: false,
    redirectIssue: 'HTTP вместо HTTPS', presetIssuesCount: 0, captcha: 'N',
    hasVisitorId: false, hasMarketoId: false
  }, DEFAULT_REQUIREMENTS);
  assert.equal(result.severity, 'CRIT');
  assert.equal(result.score, 22);

  var ruValidate = makeValidator(DEFAULT_PROFILES.RU.presetRules);
  assert.equal(ruValidate('UF_CRM_CONSENT_VERSION', 'BTX v1'), null);
  assert.equal(ruValidate('UF_CRM_CONSENT_VERSION', 'RU EULA v1'), null);
  var ruScore = scoreForm({
    consentVersion: 'BTX v1', subscriptionVersion: 'BTX v1', language: 'ru', hasEmail: true,
    redirectIssue: '', presetIssues: [], captcha: 'Y', hasVisitorId: true, hasMarketoId: false
  }, DEFAULT_PROFILES.RU.requirements);
  assert.equal(ruScore.severity, 'OK');
  var ruAnalysis = analyze({ '7': {
    name: 'RU_ru_Download', data: {
      language: 'ru', fields: [{ name: 'CONTACT_EMAIL', visible: true }], agreements: []
    },
    captcha: { recaptcha: { use: true } },
    presetFields: [
      { fieldName: 'UF_CRM_CONSENT_VERSION', value: 'BTX v1' },
      { fieldName: 'UF_CRM_VISITOR_ID', value: '%UF_VISITOR_ID%' }
    ], result: { success: { url: 'https://example.com/thanks' } }
  } }, DEFAULT_PROFILES.RU.requirements, DEFAULT_PROFILES.RU.presetRules, 0.9);
  assert.equal(ruAnalysis.rows[0].score, 100);
  assert.equal(ruAnalysis.rows[0].presetIssues, '');

  var duplicateCause = scoreForm({
    consentVersion: 'EN_2', language: 'de', hasEmail: true, redirectIssue: '', captcha: 'Y',
    presetIssues: [{ field: 'UF_CRM_CONSENT_VERSION', value: 'EN_2' }], hasVisitorId: true
  }, DEFAULT_PROFILES.Default.requirements);
  assert.equal(duplicateCause.crit.length, 1);

  var wrongLocale = scoreForm({
    consentVersion: 'EN_1', language: 'fr', hasEmail: true, redirectIssue: '', captcha: 'Y',
    presetIssues: [], hasVisitorId: true
  }, DEFAULT_PROFILES.Default.requirements);
  assert.equal(wrongLocale.severity, 'CRIT');

  var wrongLocaleNotRequired = scoreForm({
    consentVersion: 'EN_1', language: 'fr', hasEmail: true, redirectIssue: '', captcha: 'Y',
    presetIssues: [], hasVisitorId: true
  }, Object.assign({}, DEFAULT_PROFILES.Default.requirements, { requireConsentVersion: false }));
  assert.equal(wrongLocaleNotRequired.crit.indexOf('консент EN_1 на локали fr'), -1);
  assert.equal(wrongLocaleNotRequired.recommendations.indexOf('Локализовать консент для fr'), -1);

  var missingCaptcha = scoreForm({
    consentVersion: 'BTX v1', language: 'ru', hasEmail: true, redirectIssue: '', captcha: 'N',
    presetIssues: [], hasVisitorId: true
  }, DEFAULT_PROFILES.RU.requirements);
  assert.equal(missingCaptcha.severity, 'CRIT');
});

test('recommendations only fire for requirements the active profile actually enables', function () {
  var relaxed = Object.assign({}, DEFAULT_PROFILES.Default.requirements, {
    requireConsentVersion: false, requireVisitorId: false, requireEmail: false, requireHttpsRedirect: false
  });

  var noConsent = scoreForm({
    consentVersion: '', subscriptionVersion: '', language: 'fr', hasEmail: false,
    redirectIssue: '', captcha: 'Y', presetIssues: [], hasVisitorId: false
  }, relaxed);
  assert.equal(noConsent.severity, 'OK');
  assert.equal(noConsent.recommendations.indexOf('Добавить UF_CRM_CONSENT_VERSION'), -1);
  assert.equal(noConsent.recommendations.indexOf('Добавить VisitorID (validator.js)'), -1);
  assert.equal(noConsent.recommendations.indexOf('Добавить обязательный Email'), -1);

  var httpRedirect = scoreForm({
    consentVersion: 'BTX v1', subscriptionVersion: 'BTX v1', language: 'en', hasEmail: true,
    redirectIssue: 'HTTP вместо HTTPS', captcha: 'Y', presetIssues: [], hasVisitorId: true
  }, relaxed);
  assert.equal(httpRedirect.severity, 'OK');
  assert.equal(httpRedirect.recommendations.some(function (r) { return r.indexOf('Исправить редирект') > -1; }), false);

  var strict = DEFAULT_PROFILES.Default.requirements;
  var stillEnabled = scoreForm({
    consentVersion: '', subscriptionVersion: '', language: 'fr', hasEmail: false,
    redirectIssue: '', captcha: 'Y', presetIssues: [], hasVisitorId: false
  }, strict);
  assert.equal(stillEnabled.recommendations.indexOf('Добавить UF_CRM_CONSENT_VERSION') > -1, true);
  assert.equal(stillEnabled.recommendations.indexOf('Добавить VisitorID (validator.js)') > -1, true);
  assert.equal(stillEnabled.recommendations.indexOf('Добавить обязательный Email') > -1, true);
});

test('cache namespaces isolate RU and EU forms, snapshots, and history', function () {
  var eu = cacheNamespace('Default'), ru = cacheNamespace('RU');
  assert.notEqual(eu.formPrefix + '42', ru.formPrefix + '42');
  assert.notEqual(eu.snapshot, ru.snapshot);
  assert.notEqual(eu.historyPrefix, ru.historyPrefix);
});

test('profile exclusions remove LATAM without treating Brazil as LATAM by default', function () {
  var exclusions = DEFAULT_PROFILES.Default.exclusions;
  assert.equal(shouldExcludeForm({ data: { language: 'la' }, name: 'EMEA_la_Form' }, exclusions), true);
  assert.equal(shouldExcludeForm({ data: { language: 'es' }, name: 'Americas_es_Form' }, exclusions), true);
  assert.equal(shouldExcludeForm({ data: { language: 'br' }, name: 'Brazil_br_Form' }, exclusions), false);
  // язык сравнивается канонично, а не по написанию
  assert.equal(shouldExcludeForm({ data: { language: 'DE-de' }, name: 'EMEA_de_Form' }, { languages: ['German'] }), true);
  assert.equal(shouldExcludeForm({ data: { language: 'de' }, name: 'EMEA_de_Form' }, { languages: ['la'] }), false);
});

test('analyzer produces stable rows, exports, and diffs', function () {
  var raw = {
    '42': {
      name: 'RU_ru_Download_Red_Product',
      data: {
        language: 'ru',
        fields: [
          { name: 'CONTACT_EMAIL', label: 'Рабочий email', visible: true, required: true },
          { name: 'CONTACT_NAME', visible: true, required: false }
        ],
        agreements: []
      },
      document: { scheme: '2' },
      presetFields: [
        { fieldName: 'UF_CRM_CONSENT_VERSION', value: 'RU_1' },
        { fieldName: 'UF_CRM_SUBSCRIPTION_VERSION', value: 'RU_1' },
        { fieldName: 'UF_CRM_VISITOR_ID', value: '%UF_VISITOR_ID%' }
      ],
      result: { success: { url: 'https://example.com/thanks' } }
    }
  };
  var result = analyze(raw, DEFAULT_REQUIREMENTS, {}, 0.9);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].severity, 'OK');
  assert.deepEqual(result.rows[0].questions[0], {
    name: 'CONTACT_EMAIL', label: 'Рабочий email', required: true, visible: true
  });
  assert.equal(JSON.parse(toJsonl(result.rows)).id, '42');

  var previous = buildSnapshot(result.rows);
  result.rows[0].redirect = 'https://example.com/new';
  var changes = diffSnapshots(previous, buildSnapshot(result.rows));
  assert.deepEqual(changes.map(function (change) { return change.type; }), ['Изменён редирект']);

  var sheets = buildSheets(result, {
    listTimeMs: 1, formAvgMs: 1, formMinMs: 1, formMaxMs: 1, formP50Ms: 1,
    formP95Ms: 1, apiCalls: 2, cacheHits: 0, cacheHitPct: 0, retries: 0,
    retryPct: 0, http429: 0, http500: 0, http503: 0, maxBackoffMs: 0,
    errors: 0, totalSec: 1
  }, changes, [], 2, 0.9);
  assert.equal(sheets['Все формы'].length, 2);
  assert.equal(sheets['Дифф'].length, 2);
  assert.ok(sheetsToXlsx(XLSX, sheets).byteLength > 1000);
});

test('agreement conflicts affect forms and exact duplicates expose redirect-only variants', function () {
  function form(id, redirect, agreementLabel) {
    return {
      name: 'EMEA_en_Download_' + id,
      data: {
        language: 'en', buttonCaption: 'Send', design: { theme: 'dark' },
        fields: [{ name: 'CONTACT_EMAIL', visible: true, required: true }],
        agreements: [{ id: 9, name: 'Privacy', label: agreementLabel }]
      },
      presetFields: [
        { fieldName: 'UF_CRM_CONSENT_VERSION', value: 'EN_1' },
        { fieldName: 'UF_CRM_VISITOR_ID', value: '%UF_VISITOR_ID%' }
      ],
      result: { success: { url: redirect, text: 'Thanks' } }
    };
  }
  var result = analyze({
    '1': form('1', 'https://example.com/a', 'Text A'),
    '2': form('2', 'https://example.com/b', 'Text B')
  }, DEFAULT_PROFILES.Default.requirements, DEFAULT_PROFILES.Default.presetRules, 0.9);
  assert.equal(result.agrConflicts.length, 1);
  assert.equal(result.rows[0].severity, 'CRIT');
  assert.match(result.rows[0].crit, /конфликт текста соглашения 9/);
  assert.equal(result.clusters[0].category, 'redirect_only');
  assert.deepEqual(result.clusters[0].diffMatrix.find(function (row) { return row.key === 'redirect'; }).values, {
    '1': 'https://example.com/a', '2': 'https://example.com/b'
  });
  assert.equal(result.agrConflicts[0].textVariants[0].formIds.length, 1);
  var sheets = buildSheets(result, { errors: 0 }, [], [], 2, 0.9);
  assert.equal(sheets['Дубли'][1][2], 'одинаковые поля, только другой редирект');
});

test('near-duplicate matrix names the missing field and per-form values', function () {
  function form(fields) {
    return {
      name: 'EMEA_en_Download', data: { language: 'en', fields: fields.map(function (name) {
        return { name: name, label: name, visible: true, required: false };
      }), agreements: [] },
      presetFields: [
        { fieldName: 'UF_CRM_CONSENT_VERSION', value: 'EN_1' },
        { fieldName: 'UF_CRM_VISITOR_ID', value: '%UF_VISITOR_ID%' }
      ], result: { success: { url: 'https://example.com/thanks' } }
    };
  }
  var fields = ['CONTACT_EMAIL', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'];
  var result = analyze({ '1': form(fields), '2': form(fields.slice(0, 9)) },
    DEFAULT_PROFILES.Default.requirements, DEFAULT_PROFILES.Default.presetRules, 0.9);
  assert.equal(result.clusters[0].category, 'near_duplicate');
  assert.deepEqual(result.clusters[0].diffFields, ['F9']);
  assert.deepEqual(result.clusters[0].diffMatrix.find(function (row) { return row.key === 'F9:presence'; }).values,
    { '1': 'Да', '2': '—' });

  var left = form(fields), right = form(fields);
  right.data.fields[0].label = 'Рабочий email'; right.data.fields[0].required = true;
  right.data.fields[0].visible = false;
  var questionResult = analyze({ '1': left, '2': right },
    DEFAULT_PROFILES.Default.requirements, DEFAULT_PROFILES.Default.presetRules, 0.9);
  var keys = questionResult.clusters[0].diffMatrix.map(function (row) { return row.key; });
  assert.ok(keys.includes('CONTACT_EMAIL:label'));
  assert.ok(keys.includes('CONTACT_EMAIL:required'));
  assert.ok(keys.includes('CONTACT_EMAIL:visible'));
});

test('RU and EU regression parity keeps regional rules, duplicate detail, and ownership review', function () {
  function form(id, language, consent, responsible) {
    return {
      name: (language === 'ru' ? 'RU' : 'EMEA') + '_' + language + '_Download_' + id,
      data: {
        language: language, fields: [{
          name: 'CONTACT_EMAIL', label: 'Email', visible: true, required: true
        }], agreements: []
      },
      captcha: { recaptcha: { use: true } },
      responsible: { users: [responsible] },
      presetFields: [
        { fieldName: 'UF_CRM_CONSENT_VERSION', value: consent },
        { fieldName: 'UF_CRM_VISITOR_ID', value: '%UF_VISITOR_ID%' }
      ],
      result: { success: { url: 'https://example.com/thanks' } }
    };
  }
  var ru = analyze({
    '1': form('1', 'ru', 'BTX v1', '101'),
    '2': form('2', 'ru', 'BTX v1', '202')
  }, DEFAULT_PROFILES.RU.requirements, DEFAULT_PROFILES.RU.presetRules, 0.9);
  assert.equal(ru.rows.every(function (row) { return !row.presetIssues; }), true);
  assert.equal(ru.clusters[0].category, 'ownership_variant');
  assert.equal(ru.clusters[0].ownershipConflict, true);
  assert.equal(ru.clusters[0].differences, 'нет прочих различий');
  assert.equal(ru.clusters[0].diffMatrix[0].kind, 'ownership');
  assert.match(ru.clusters[0].decision, /владельца лидов/);

  var euRaw = {
    '3': form('3', 'en', 'EN_1', '303'),
    '4': form('4', 'en', 'EN_1', '303'),
    '5': form('5', 'la', 'EN_1', '303')
  };
  Object.keys(euRaw).forEach(function (id) {
    if (shouldExcludeForm(euRaw[id], DEFAULT_PROFILES.Default.exclusions)) delete euRaw[id];
  });
  var eu = analyze(euRaw, DEFAULT_PROFILES.Default.requirements, DEFAULT_PROFILES.Default.presetRules, 0.9);
  assert.deepEqual(eu.rows.map(function (row) { return row.id; }), ['3', '4']);
  assert.equal(eu.clusters[0].category, 'full_duplicate');
  assert.equal(eu.clusters[0].decision, 'Кандидат на схлопывание');
  var sheets = buildSheets(ru, { errors: 0 }, [], [], 2, 0.9);
  assert.equal(sheets['Дубли'][0][4], 'Ответственный различается');
  assert.match(sheets['Дубли'][1][5], /#1=101/);
});

test('language codes normalize and content reveals the real locale', function () {
  assert.equal(normalizeLanguage('EN-US'), 'en');
  assert.equal(normalizeLanguage('Russian'), 'ru');
  assert.equal(normalizeLanguage('deu'), 'de');
  assert.equal(normalizeLanguage('la'), 'la', 'неизвестные коды не переписываются — исключения профилей продолжают работать');
  assert.equal(normalizeLanguage(''), '');
  assert.equal(languageFromFormName('EMEA_de_Download_Red_Product'), 'de');
  assert.equal(languageFromFormName('EMEA_la_Download'), '');

  assert.equal(detectLanguage('Work email, First name, Company, Submit').language, 'en');
  assert.equal(detectLanguage('Vorname, Nachname, Unternehmen, Absenden').language, 'de');
  assert.equal(detectLanguage('Рабочая почта, Имя, Компания, Отправить').language, 'ru');
  assert.equal(detectLanguage('Telefon').confident, false, 'одно слово из нескольких языков — не язык');

  // объявленный язык переписывается только уверенным сигналом
  var declaredWins = resolveFormLanguage({ declared: 'ru', name: 'RU_ru_Download', texts: ['Email'] });
  assert.equal(declaredWins.localeKey, 'ru');
  assert.equal(declaredWins.mismatch, false);
  var contentWins = resolveFormLanguage({ declared: 'en', name: '', texts: ['Рабочая почта', 'Отправить'] });
  assert.equal(contentWins.localeKey, 'ru');
  assert.equal(contentWins.mismatch, true);
  var noDeclaration = resolveFormLanguage({ declared: '', name: 'EMEA_Download', texts: ['Vorname', 'Absenden'] });
  assert.equal(noDeclaration.localeKey, 'de');
  assert.equal(noDeclaration.source, 'content');
});

function localizedForm(name, language, labels) {
  return {
    name: name,
    data: {
      language: language, buttonCaption: labels.button,
      fields: Object.keys(labels.q).map(function (key) {
        return { name: key, label: labels.q[key], visible: true, required: true };
      }),
      agreements: []
    },
    presetFields: [
      { fieldName: 'UF_CRM_CONSENT_VERSION', value: 'EN_1' },
      { fieldName: 'UF_CRM_VISITOR_ID', value: '%UF_VISITOR_ID%' }
    ],
    result: { success: { url: 'https://example.com/thanks' } }
  };
}

var LOCALIZED_FLEET = {
  '1': localizedForm('EMEA_Download_Red_Product', '', { button: 'Submit', q: {
    CONTACT_EMAIL: 'Work email', CONTACT_PHONE: 'Phone number', CONTACT_NAME: 'First name' } }),
  '2': localizedForm('EMEA_Download_Blue_Product', '', { button: 'Send', q: {
    CONTACT_EMAIL: 'Business e-mail', CONTACT_PHONE: 'Mobile phone', CONTACT_NAME: 'First name' } }),
  '3': localizedForm('EMEA_Download_Red_Product', '', { button: 'Absenden', q: {
    CONTACT_EMAIL: 'Geschäftliche E-Mail', CONTACT_PHONE: 'Telefonnummer', CONTACT_NAME: 'Vorname' } }),
  '4': localizedForm('EMEA_Download_Red_Product', '', { button: 'Отправить', q: {
    CONTACT_EMAIL: 'Рабочая почта', CONTACT_PHONE: 'Телефон', CONTACT_NAME: 'Имя' } })
};

function analyzeFleet(raw) {
  return analyze(raw || LOCALIZED_FLEET, DEFAULT_PROFILES.Default.requirements,
    DEFAULT_PROFILES.Default.presetRules, 0.9);
}

test('a form localized into another language is a separate form, not a duplicate', function () {
  var result = analyzeFleet();
  var locales = {};
  result.rows.forEach(function (row) { locales[row.id] = row.localeKey; });
  assert.deepEqual(locales, { '1': 'en', '2': 'en', '3': 'de', '4': 'ru' });
  assert.equal(result.rowById['3'].languageSource, 'content');

  // без языковой развязки все четыре формы были бы одним кластером дублей
  assert.equal(result.clusters.length, 1);
  assert.deepEqual(result.clusters[0].ids.slice().sort(), ['1', '2']);
  assert.equal(result.clusters[0].locale, 'en');

  var family = result.localizations[0];
  assert.deepEqual(family.locales, ['de', 'en', 'ru']);
  assert.deepEqual(family.byLocale.de, ['3']);
  assert.deepEqual(family.byLocale.en.slice().sort(), ['1', '2']);
  assert.equal(family.sharedConsent, true, 'один EN_1 на три языка — повод проверить локальные согласия');
  assert.match(family.decision, /Локализации/);

  var sheets = buildSheets(result, { errors: 0 }, [], [], 2, 0.9);
  assert.equal(sheets['Локализации'].length, 2);
  assert.match(sheets['Локализации'][1][4], /de: 3/);
});

test('typed questions narrow the fleet to one language, ranked by match', function () {
  var rows = analyzeFleet().rows;

  var byEmail = searchForms(rows, ['Email']);
  assert.equal(byEmail.language, 'en');
  assert.equal(byEmail.languageSource, 'query');
  assert.deepEqual(byEmail.results.map(function (item) { return item.id; }), ['1', '2']);
  assert.ok(byEmail.results[0].score >= byEmail.results[1].score, 'сортировка по совпадению');
  assert.deepEqual(byEmail.languageCounts.map(function (item) { return item.language; }).sort(), ['de', 'en', 'ru']);

  // второй вопрос сужает выборку и переставляет её по совпадению:
  // форма с точной формулировкой поднимается над той, где вопрос про то же,
  // но назван иначе, а форма без такого вопроса выпадает совсем
  var narrowed = searchForms(rows, ['Email', 'Mobile phone']);
  assert.equal(narrowed.results[0].id, '2');
  assert.equal(narrowed.results[0].matches[1].label, 'Mobile phone');
  assert.ok(narrowed.results[0].score > narrowed.results[1].score);
  assert.equal(searchForms(rows, ['Email', 'Country']).results.length, 0);

  // язык берётся из запроса, а не из данных
  assert.deepEqual(searchForms(rows, ['Почта']).results.map(function (item) { return item.id; }), ['4']);
  assert.equal(searchForms(rows, ['Vorname']).language, 'de');
  assert.deepEqual(searchForms(rows, ['Email'], { language: 'ru' }).results.map(function (i) { return i.id; }), ['4']);
  assert.equal(searchForms(rows, ['Email'], { language: '' }).results.length, 4);
  assert.equal(searchForms(rows, []).results.length, 0);

  // опечатка не должна прятать форму
  assert.ok(similarity('Emial', 'Work email') > 0.5);
  assert.deepEqual(searchForms(rows, ['Emial']).results.map(function (item) { return item.id; }), ['1', '2']);
});

test('same fields and language with different wording are offered for unification', function () {
  var rows = analyzeFleet().rows;
  var found = searchForms(rows, ['Email']);
  var groups = wordingVariants(rows, found.results, { queries: found.queries });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].locale, 'en');
  assert.deepEqual(groups[0].ids.slice().sort(), ['1', '2']);
  var emailVariants = groups[0].questions.find(function (question) { return question.name === 'CONTACT_EMAIL'; });
  assert.deepEqual(emailVariants.variants.map(function (variant) { return variant.label; }).sort(),
    ['Business e-mail', 'Work email']);
  // формы на других языках в группу не попадают
  assert.equal(groups[0].forms.some(function (form) { return form.id === '3' || form.id === '4'; }), false);
  assert.deepEqual(wordingVariants(rows, [], {}), []);
});

test('worker pool respects its concurrency limit and reports completion', async function () {
  var active = 0, peak = 0, progress = [];
  await runPool([1, 2, 3, 4], 2, async function () {
    active++;
    peak = Math.max(peak, active);
    await new Promise(function (resolve) { setTimeout(resolve, 5); });
    active--;
  }, function (done) { progress.push(done); });
  assert.equal(peak, 2);
  assert.deepEqual(progress, [1, 2, 3, 4]);
});
