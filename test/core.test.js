import test from 'node:test';
import assert from 'node:assert/strict';

import { runPool } from '../core/api.js';
import { applyEdit, editRisk, normalizeOperation, readEditValue } from '../core/editor.js';
import { DEFAULT_PROFILES, DEFAULT_REQUIREMENTS, makeValidator, scoreForm } from '../core/rules.js';
import { acceptsCrmHost, acceptsCrmUrl, crmScope } from '../core/scope.js';
import { shouldExcludeForm } from '../core/filter.js';
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
    name: 'Old', data: { title: 'Title', buttonCaption: 'Send', fields: [
      { name: 'CONTACT_EMAIL', visible: true, required: false }
    ] },
    presetFields: [{ fieldName: 'UF_CRM_CONSENT_VERSION', value: 'EN_1' }],
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
});

test('profile exclusions remove LATAM without treating Brazil as LATAM by default', function () {
  var exclusions = DEFAULT_PROFILES.Default.exclusions;
  assert.equal(shouldExcludeForm({ data: { language: 'la' }, name: 'EMEA_la_Form' }, exclusions), true);
  assert.equal(shouldExcludeForm({ data: { language: 'es' }, name: 'Americas_es_Form' }, exclusions), true);
  assert.equal(shouldExcludeForm({ data: { language: 'br' }, name: 'Brazil_br_Form' }, exclusions), false);
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
  var sheets = buildSheets(result, { errors: 0 }, [], [], 2, 0.9);
  assert.equal(sheets['Дубли'][1][2], 'одинаковые поля, только другой редирект');
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
