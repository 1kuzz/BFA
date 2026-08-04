/* ============================================================
   Аналитика. Чистые функции над raw-данными форм.
   Полный перенос логики оригинала (разбор, консент-карта,
   нечёткие дубли, аномальные поля, консистентность,
   конфликты соглашений, метрики) + Quality Score.
   ============================================================ */
import { clean } from '../core/api.js';
import { makeValidator, scoreForm } from '../core/rules.js';

var SCHEME = { '1': 'Лид', '2': 'Контакт', '3': 'Динам. сущность' };

function parseName(nm) {
  var p = nm.split(/[_|]/).map(function (s) { return s.trim(); }).filter(Boolean);
  return { region: p[0] || '', langName: p[1] || '', formType: p[2] || '', color: p[3] || '', product: p.slice(4).join(' ') || '' };
}

function jaccard(a, b) {
  var A = {}, cnt = 0; a.forEach(function (x) { A[x] = 1; });
  var B = {}; b.forEach(function (x) { B[x] = 1; });
  Object.keys(A).forEach(function (x) { if (B[x]) cnt++; });
  var uni = Object.keys(A).length + Object.keys(B).length - cnt;
  return uni ? cnt / uni : 1;
}

var DUP_SETTINGS = [
  ['redirect', 'Redirect'], ['successText', 'Success text'], ['buttonCaption', 'Текст кнопки'],
  ['theme', 'Theme'], ['agreementIds', 'Agreement IDs'], ['captcha', 'Captcha'],
  ['callback', 'Callback'], ['whatsapp', 'WhatsApp'], ['integration', 'Integration'],
  ['payment', 'Payment'], ['entity', 'Сущность'], ['requiredFields', 'Обязательные поля'],
  ['presetSignature', 'Preset'], ['dedupe', 'Dedupe'], ['responsible', 'Ответственный']
];

function different(values) {
  return new Set(Object.keys(values).map(function (id) { return String(values[id]); })).size > 1;
}

function clusterDiff(ids, rowById) {
  var matrix = [], fieldCount = {}, questions = {};
  ids.forEach(function (id) {
    questions[id] = {};
    (rowById[id].questions || []).forEach(function (question) {
      questions[id][question.name] = question;
    });
    rowById[id].visibleFields.split(', ').filter(Boolean).forEach(function (name) {
      fieldCount[name] = (fieldCount[name] || 0) + 1;
    });
  });
  var diffFields = Object.keys(fieldCount).filter(function (name) { return fieldCount[name] !== ids.length; });
  var allQuestionNames = {};
  ids.forEach(function (id) { Object.keys(questions[id]).forEach(function (name) { allQuestionNames[name] = true; }); });
  Object.keys(allQuestionNames).sort().forEach(function (name) {
    var presence = {}, presentEverywhere = true;
    ids.forEach(function (id) {
      presence[id] = questions[id][name] ? 'Да' : '—';
      if (!questions[id][name]) presentEverywhere = false;
    });
    if (different(presence)) matrix.push({ kind: 'field', key: name + ':presence', label: name + ' · присутствует', values: presence, differs: true });
    if (!presentEverywhere) return;
    [['label', 'label'], ['required', 'обязательное'], ['visible', 'видимое']].forEach(function (attr) {
      var values = {};
      ids.forEach(function (id) {
        var value = questions[id][name][attr[0]];
        values[id] = typeof value === 'boolean' ? (value ? 'Да' : 'Нет') : value;
      });
      if (different(values)) matrix.push({ kind: 'field', key: name + ':' + attr[0], label: name + ' · ' + attr[1], values: values, differs: true });
    });
  });
  DUP_SETTINGS.forEach(function (setting) {
    var values = {};
    ids.forEach(function (id) {
      var value = rowById[id][setting[0]];
      values[id] = value === '' || value == null ? '—' : value;
    });
    if (different(values)) matrix.push({ kind: 'setting', key: setting[0], label: setting[1], values: values, differs: true });
  });
  return { diffFields: diffFields.sort(), matrix: matrix };
}

export function analyze(raw, RULES, presetRules, dupThreshold) {
  var DUP_TH = dupThreshold || 0.9;
  var validatePreset = makeValidator(presetRules);

  var rows = [], presetAll = {}, agreements = {}, fieldUsage = {}, requiredUsage = {}, presetIssuesAll = [];

  Object.keys(raw).forEach(function (id) {
    var top = raw[id], d = top.data || {};
    var fields = Array.isArray(d.fields) ? d.fields : [];
    var questions = fields.map(function (f) {
      return {
        name: f.name || '', label: clean(f.label || f.name),
        required: !!f.required, visible: f.visible !== false
      };
    }).filter(function (f) { return f.name; });
    var visible = fields.filter(function (f) { return f.visible !== false; });
    var visNames = visible.map(function (f) { return f.name; });
    visible.forEach(function (f) {
      var nm = f.name || '';
      fieldUsage[nm] = (fieldUsage[nm] || 0) + 1;
      if (f.required) requiredUsage[nm] = (requiredUsage[nm] || 0) + 1;
    });

    var doc = top.document || {}, entity = (doc.scheme && SCHEME[doc.scheme]) ? SCHEME[doc.scheme] : 'CONTACT';
    var preset = Array.isArray(top.presetFields) ? top.presetFields : [];
    var pmap = {}, pnames = [], presetIssues = [];
    preset.forEach(function (p) {
      pmap[p.fieldName] = clean(p.value); pnames.push(p.fieldName);
      presetAll[p.fieldName] = (presetAll[p.fieldName] || 0) + 1;
      var v = validatePreset(p.fieldName, clean(p.value));
      if (v) {
        var issue = {
          id: id, field: p.fieldName, value: clean(p.value), issue: v,
          actionable: true, decision: 'Можно исправить существующее preset-поле через approval-flow'
        };
        presetIssues.push(issue); presetIssuesAll.push(issue);
      }
    });

    var res = top.result || {}, succ = res.success || {};
    (d.agreements || []).forEach(function (a) {
      var aid = String(a.id);
      if (!agreements[aid]) agreements[aid] = { name: clean(a.name), texts: {}, textForms: {}, forms: [] };
      var txt = clean(a.label);
      agreements[aid].texts[txt] = (agreements[aid].texts[txt] || 0) + 1;
      (agreements[aid].textForms[txt] = agreements[aid].textForms[txt] || []).push(id);
      agreements[aid].forms.push(id);
    });

    var lang = d.language || '', cv = pmap['UF_CRM_CONSENT_VERSION'] || '', sv = pmap['UF_CRM_SUBSCRIPTION_VERSION'] || '';
    var cap = top.captcha || {}, capOn = ((cap.recaptcha || {}).use || (cap.yandexCaptcha || {}).use) ? 'Y' : 'N';
    var callbackOn = (top.callback && top.callback.use) ? 'Y' : 'N';
    var whatsappOn = (top.whatsapp && top.whatsapp.use) ? 'Y' : 'N';
    var integrationN = ((top.integration || {}).cases || []).length;
    var paymentOn = (top.payment && top.payment.use) ? 'Y' : 'N';
    var responsible = (top.responsible && top.responsible.users) ? top.responsible.users.join(',') : '';
    var dedupe = doc.duplicateMode || (doc.deal && doc.deal.duplicatesEnabled ? 'deal:on' : '') || '';
    function hasField(sub) { return visNames.some(function (n) { return n.toUpperCase().indexOf(sub) > -1; }); }
    var nmeta = parseName(clean(top.name));

    var redirect = clean(succ.url), redirectIssue = '';
    if (redirect) {
      if (/^http:\/\//i.test(redirect)) redirectIssue = 'HTTP вместо HTTPS';
      else if (!/^https?:\/\//i.test(redirect)) redirectIssue = 'относительный URL';
      if (/localhost|127\.0\.0\.1|staging|\.dev|dev\.|test\.|\.local/i.test(redirect))
        redirectIssue = (redirectIssue ? redirectIssue + '; ' : '') + 'dev/staging домен';
    }

    var scoreContext = {
      consentVersion: cv, subscriptionVersion: sv, language: lang,
      hasEmail: hasField('EMAIL'), redirectIssue: redirectIssue,
      presetIssues: presetIssues, captcha: capOn,
      hasVisitorId: pnames.indexOf('UF_CRM_VISITOR_ID') > -1,
      hasMarketoId: pnames.indexOf('UF_CRM_MARKETO_FORM_ID') > -1
    };

    var utm = ['SOURCE', 'MEDIUM', 'CAMPAIGN', 'CONTENT', 'TERM'].map(function (u) { return pmap['UF_CRM_UTM_' + u] || ''; });

    rows.push({
      id: id, name: clean(top.name), language: lang, entity: entity, region: nmeta.region, formType: nmeta.formType, product: nmeta.product, color: nmeta.color,
      theme: (d.design || {}).theme || '', buttonCaption: clean(d.buttonCaption),
      visibleCount: visible.length, visibleFields: visNames.join(', '),
      questions: questions,
      requiredFields: visible.filter(function (f) { return f.required; }).map(function (f) { return f.name; }).join(', '),
      presetCount: preset.length, consentVersion: cv, subscriptionVersion: sv,
      presetSignature: preset.map(function (p) { return p.fieldName + '=' + clean(p.value); }).sort().join('|'),
      hasVisitorId: pnames.indexOf('UF_CRM_VISITOR_ID') > -1 ? 'Y' : 'N',
      hasMarketoId: pnames.indexOf('UF_CRM_MARKETO_FORM_ID') > -1 ? 'Y' : 'N',
      captcha: capOn, callback: callbackOn, whatsapp: whatsappOn, integration: integrationN, payment: paymentOn,
      responsible: responsible, dedupe: dedupe,
      hasEmail: hasField('EMAIL') ? 'Y' : 'N', hasPhone: hasField('PHONE') ? 'Y' : 'N',
      hasCompany: hasField('COMPANY') ? 'Y' : 'N', hasCountry: hasField('COUNTRY') ? 'Y' : 'N',
      utmSource: utm[0], utmMedium: utm[1], utmCampaign: utm[2], utmContent: utm[3], utmTerm: utm[4],
      utmCount: utm.filter(function (x) { return x; }).length,
      agreementIds: (d.agreements || []).map(function (a) { return a.id; }).join(', '),
      redirect: redirect, redirectIssue: redirectIssue, redirectDelay: clean(res.redirectDelay), successText: clean(succ.text),
      presetIssues: presetIssues.map(function (x) { return x.field + ': ' + x.issue; }).join(' ; '),
      _scoreContext: scoreContext
    });
  });

  // Один Agreement ID с разными текстами — юридический конфликт каждой затронутой формы.
  var agrConflicts = [], conflictsByForm = {};
  Object.keys(agreements).forEach(function (aid) {
    var agreement = agreements[aid], txts = Object.keys(agreement.texts);
    if (txts.length < 2) return;
    var formIds = Array.from(new Set(agreement.forms));
    var conflict = {
      id: aid, name: agreement.name, variants: txts.length, forms: formIds.length, formIds: formIds,
      textVariants: txts.map(function (text) {
        return { text: text, count: agreement.texts[text], formIds: Array.from(new Set(agreement.textForms[text])) };
      }).sort(function (a, b) { return b.count - a.count; })
    };
    agrConflicts.push(conflict);
    conflict.formIds.forEach(function (formId) {
      (conflictsByForm[formId] = conflictsByForm[formId] || []).push(conflict);
    });
  });

  rows.forEach(function (row) {
    row._scoreContext.agreementConflicts = conflictsByForm[row.id] || [];
    var scored = scoreForm(row._scoreContext, RULES);
    row.severity = scored.severity; row.score = scored.score;
    row.crit = scored.crit.join(' ; '); row.warn = scored.warn.join(' ; ');
    row.info = scored.info.join(' ; '); row.recommendations = scored.recommendations.join(' ; ');
    delete row._scoreContext;
  });

  var order = { CRIT: 0, WARN: 1, INFO: 2, OK: 3 };
  rows.sort(function (a, b) {
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return a.language < b.language ? -1 : a.language > b.language ? 1 : parseInt(a.id) - parseInt(b.id);
  });
  var rowById = {}; rows.forEach(function (r) { rowById[r.id] = r; });

  // консент-карта
  var byLang = {};
  rows.forEach(function (r) { if (!r.language) return; byLang[r.language] = byLang[r.language] || {}; var v = r.consentVersion || '(пусто)'; byLang[r.language][v] = (byLang[r.language][v] || 0) + 1; });
  var expectedConsent = {};
  Object.keys(byLang).forEach(function (l) { var best = '', bc = -1; Object.keys(byLang[l]).forEach(function (v) { if (byLang[l][v] > bc) { bc = byLang[l][v]; best = v; } }); expectedConsent[l] = best; });

  // нечёткие дубли
  var langGroups = {};
  rows.forEach(function (r) { (langGroups[r.language] = langGroups[r.language] || []).push(r.id); });
  var clusters = [];
  Object.keys(langGroups).forEach(function (l) {
    var g = langGroups[l], used = {};
    g.forEach(function (seed) {
      if (used[seed]) return;
      var cl = [seed]; used[seed] = 1;
      var sf = rowById[seed].visibleFields.split(', ');
      g.forEach(function (other) {
        if (!used[other]) {
          var of = rowById[other].visibleFields.split(', ');
          if (jaccard(sf, of) >= DUP_TH) { cl.push(other); used[other] = 1; }
        }
      });
      if (cl.length > 1) {
        var exact = new Set(cl.map(function (i) {
          return rowById[i].visibleFields.split(', ').filter(Boolean).sort().join('\u001f');
        })).size === 1;
        var diff = clusterDiff(cl, rowById);
        var category = 'near_duplicate', differences = diff.diffFields.join(', ') || 'поля';
        if (exact) {
          var settingDiffs = diff.matrix.filter(function (row) { return row.kind === 'setting'; });
          var fieldDiffs = diff.matrix.filter(function (row) { return row.kind === 'field'; });
          if (!settingDiffs.length && !fieldDiffs.length) {
            category = 'full_duplicate'; differences = 'нет';
          } else if (!fieldDiffs.length && settingDiffs.length === 1 && settingDiffs[0].key === 'redirect') {
            category = 'redirect_only'; differences = 'redirect/landing';
          } else {
            category = 'field_variant';
            differences = diff.matrix.map(function (row) { return row.label; }).join(', ');
          }
        }
        clusters.push({
          lang: l, size: cl.length, ids: cl, exact: exact, category: category,
          differences: differences, diffFields: diff.diffFields, diffMatrix: diff.matrix
        });
      }
    });
  });
  clusters.sort(function (a, b) { return b.size - a.size; });

  // аномальные поля
  var anomalies = [];
  Object.keys(fieldUsage).forEach(function (n) {
    var flags = [];
    if (/UF_CRM_\d{5,}/.test(n)) flags.push('числовое кастомное');
    var mt = n.match(/^(.*?)(\d)$/);
    if (mt && fieldUsage[mt[1]]) flags.push('опечатка/дубль базового ' + mt[1]);
    if (fieldUsage[n] <= 2) flags.push('редкое (' + fieldUsage[n] + ')');
    if (flags.length) anomalies.push({
      field: n, count: fieldUsage[n], flags: flags.join('; '), actionable: false,
      decision: 'Ручная проверка: переименование меняет CRM-схему и не поддерживается безопасным editor.js'
    });
  });
  anomalies.sort(function (a, b) { return a.count - b.count; });

  // консистентность обязательных
  var typeGroups = {};
  rows.forEach(function (r) { var t = r.formType || '(без типа)'; (typeGroups[t] = typeGroups[t] || []).push(r); });
  var consistency = [], CORE = ['CONTACT_EMAIL', 'CONTACT_NAME', 'CONTACT_LAST_NAME', 'CONTACT_PHONE', 'CONTACT_UF_CRM_COMPANY', 'CONTACT_UF_CRM_COUNTRY'];
  Object.keys(typeGroups).forEach(function (t) {
    var grp = typeGroups[t]; if (grp.length < 3) return;
    CORE.forEach(function (field) {
      var pr = 0, rq = 0;
      grp.forEach(function (r) {
        if (r.visibleFields.split(', ').indexOf(field) > -1) { pr++; if (r.requiredFields.split(', ').indexOf(field) > -1) rq++; }
      });
      if (pr > 0 && rq > 0 && rq < pr) consistency.push({ formType: t, field: field, present: pr, required: rq, note: 'обязательное в ' + rq + ' из ' + pr });
    });
  });

  var sevCount = { CRIT: 0, WARN: 0, INFO: 0, OK: 0 };
  rows.forEach(function (r) { sevCount[r.severity]++; });
  var avgFields = rows.length ? Math.round(rows.reduce(function (a, r) { return a + r.visibleCount; }, 0) / rows.length * 10) / 10 : 0;
  var avgScore = rows.length ? Math.round(rows.reduce(function (a, r) { return a + r.score; }, 0) / rows.length) : 0;

  return {
    rows: rows, rowById: rowById, sevCount: sevCount, avgFields: avgFields, avgScore: avgScore,
    presetAll: presetAll, agreements: agreements, fieldUsage: fieldUsage, requiredUsage: requiredUsage,
    presetIssuesAll: presetIssuesAll, expectedConsent: expectedConsent, clusters: clusters,
    anomalies: anomalies, consistency: consistency, agrConflicts: agrConflicts
  };
}

export function distrib(rows, key) {
  var map = {};
  rows.forEach(function (r) { var v = (r[key] === '' || r[key] == null) ? '(пусто)' : r[key]; map[v] = (map[v] || 0) + 1; });
  return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).map(function (v) { return [v, map[v]]; });
}
