import test from 'node:test';
import assert from 'node:assert/strict';

import { runPool } from '../core/api.js';
import { applyEdit, editRisk, normalizeOperation, readEditValue } from '../core/editor.js';
import { DEFAULT_REQUIREMENTS, makeValidator, scoreForm } from '../core/rules.js';
import { analyze } from '../analyzers/analyze.js';
import { buildSnapshot, diffSnapshots } from '../analyzers/diff.js';
import { buildSheets, sheetsToXlsx, toJsonl } from '../analyzers/export.js';
import XLSX from '../vendor/xlsx.full.min.js';

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
});

test('analyzer produces stable rows, exports, and diffs', function () {
  var raw = {
    '42': {
      name: 'RU_ru_Download_Red_Product',
      data: {
        language: 'ru',
        fields: [
          { name: 'CONTACT_EMAIL', visible: true, required: true },
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
