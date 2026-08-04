/* ============================================================
   Построение всех листов XLSX (полный набор из оригинала +
   Score) и JSONL. XLSX собирается через bundled xlsx.
   Возвращаем массив байт (Uint8Array) — SW инициирует download.
   ============================================================ */
import { distrib } from './analyze.js';

export function buildSheets(A, perfStats, diffChanges, timelineRows, concurrency, dupTh) {
  var rows = A.rows, sevCount = A.sevCount, clusters = A.clusters, anomalies = A.anomalies;
  var consistency = A.consistency, agreements = A.agreements, agrConflicts = A.agrConflicts;
  var presetAll = A.presetAll, fieldUsage = A.fieldUsage, requiredUsage = A.requiredUsage;
  var presetIssuesAll = A.presetIssuesAll, expectedConsent = A.expectedConsent;

  var uniqFieldSets = {}; rows.forEach(function (r) { uniqFieldSets[r.visibleFields] = 1; });
  var uniqCount = Object.keys(uniqFieldSets).length;

  var summary = [['ПОКАЗАТЕЛЬ', 'ЗНАЧЕНИЕ'], ['Всего форм', rows.length],
    ['Средний Quality Score', A.avgScore],
    ['🔴 CRIT', sevCount.CRIT], ['🟡 WARN', sevCount.WARN], ['🔵 INFO', sevCount.INFO], ['🟢 OK', sevCount.OK], [],
    ['Без версии консента', rows.filter(function (r) { return !r.consentVersion; }).length],
    ['Консент != подписка', rows.filter(function (r) { return r.consentVersion && r.subscriptionVersion && r.consentVersion !== r.subscriptionVersion; }).length],
    ['Консент EN_1 на не-EN', rows.filter(function (r) { return r.language.toLowerCase() !== 'en' && r.language && r.consentVersion === 'EN_1'; }).length],
    ['HTTP-редиректы', rows.filter(function (r) { return r.redirectIssue.indexOf('HTTP') > -1; }).length],
    ['Проблемных редиректов всего', rows.filter(function (r) { return r.redirectIssue; }).length],
    ['Невалидных preset-значений', presetIssuesAll.length],
    ['Без VisitorID', rows.filter(function (r) { return r.hasVisitorId === 'N'; }).length],
    ['Без поля Email', rows.filter(function (r) { return r.hasEmail === 'N'; }).length], [],
    ['Уникальных соглашений', Object.keys(agreements).length],
    ['Конфликтов соглашений', agrConflicts.length],
    ['Уникальных наборов полей', uniqCount],
    ['Кластеров почти-дублей', clusters.length],
    ['Аномальных полей', anomalies.length],
    ['Проблем консистентности', consistency.length],
    ['Среднее кол-во полей', A.avgFields]
  ];

  var perfSheet = [['МЕТРИКА', 'ЗНАЧЕНИЕ'],
    ['Время получения списка, мс', perfStats.listTimeMs],
    ['Форма: среднее, мс', perfStats.formAvgMs], ['Форма: мин, мс', perfStats.formMinMs], ['Форма: макс, мс', perfStats.formMaxMs],
    ['Форма: p50, мс', perfStats.formP50Ms], ['Форма: p95, мс', perfStats.formP95Ms],
    ['Всего API-вызовов', perfStats.apiCalls], ['Cache hits', perfStats.cacheHits], ['Cache hit %', perfStats.cacheHitPct],
    ['Повторов (retry)', perfStats.retries], ['Retry %', perfStats.retryPct],
    ['Ответов 429', perfStats.http429], ['Ответов 500', perfStats.http500], ['Ответов 503', perfStats.http503],
    ['Макс. пауза backoff, мс', perfStats.maxBackoffMs], ['Ошибок чтения', perfStats.errors],
    ['Исключено профилем', perfStats.excludedForms || 0],
    ['Общее время, сек', perfStats.totalSec], ['Параллельность', concurrency]
  ];

  var overview = [['ПОКАЗАТЕЛЬ', 'ЗНАЧЕНИЕ', 'ФОРМ']];
  [['ЯЗЫКИ', 'language'], ['РЕГИОН', 'region'], ['ТИП ФОРМЫ', 'formType'], ['ПРОДУКТ', 'product'], ['СУЩНОСТЬ', 'entity'], ['ТЕМА', 'theme'], ['ВЕРСИЯ КОНСЕНТА', 'consentVersion'], ['CAPTCHA', 'captcha'], ['DEDUPE', 'dedupe']]
    .forEach(function (b) { overview.push([b[0], '', '']); distrib(rows, b[1]).forEach(function (p) { overview.push(['', String(p[0]), p[1]]); }); overview.push([]); });

  var allCols = [['Severity', 'severity'], ['Score', 'score'], ['ID', 'id'], ['Имя', 'name'], ['Язык', 'language'], ['Регион', 'region'], ['Тип', 'formType'], ['Продукт', 'product'], ['Сущность', 'entity'], ['Тема', 'theme'], ['Кнопка', 'buttonCaption'], ['Видимых', 'visibleCount'], ['Поля', 'visibleFields'], ['Обязательные', 'requiredFields'], ['Preset', 'presetCount'], ['Консент', 'consentVersion'], ['Подписка', 'subscriptionVersion'], ['VisitorID', 'hasVisitorId'], ['Marketo', 'hasMarketoId'], ['Captcha', 'captcha'], ['Callback', 'callback'], ['WhatsApp', 'whatsapp'], ['Integr', 'integration'], ['Email', 'hasEmail'], ['Phone', 'hasPhone'], ['Company', 'hasCompany'], ['Country', 'hasCountry'], ['UTM', 'utmCount'], ['Редирект', 'redirect'], ['Проблема редиректа', 'redirectIssue'], ['Невалидн. preset', 'presetIssues'], ['🔴 CRIT', 'crit'], ['🟡 WARN', 'warn'], ['🔵 INFO', 'info'], ['Рекомендации', 'recommendations']];
  var allSheet = [allCols.map(function (c) { return c[0]; })];
  rows.forEach(function (r) { allSheet.push(allCols.map(function (c) { return r[c[1]]; })); });

  var probSheet = [['Severity', 'Score', 'ID', 'Имя', 'Язык', 'CRIT', 'WARN', 'Рекомендации']];
  rows.filter(function (r) { return r.severity === 'CRIT' || r.severity === 'WARN'; })
      .forEach(function (r) { probSheet.push([r.severity, r.score, r.id, r.name, r.language, r.crit, r.warn, r.recommendations]); });

  var redirSheet = [['ID', 'Имя', 'Язык', 'Редирект', 'Проблема']];
  rows.filter(function (r) { return r.redirectIssue; }).forEach(function (r) { redirSheet.push([r.id, r.name, r.language, r.redirect, r.redirectIssue]); });

  var presetValSheet = [['ID', 'Поле', 'Значение', 'Проблема', 'Решение']];
  presetIssuesAll.forEach(function (p) { presetValSheet.push([p.id, p.field, p.value, p.issue, p.decision || '']); });

  var autoSheet = [['ID', 'Имя', 'Callback', 'WhatsApp', 'Integration cases', 'Payment', 'Ответственный']];
  rows.forEach(function (r) { autoSheet.push([r.id, r.name, r.callback, r.whatsapp, r.integration, r.payment, r.responsible]); });

  var presetSheet = [['Скрытое поле', 'В формах', '% форм']];
  Object.keys(presetAll).sort(function (a, b) { return presetAll[b] - presetAll[a]; })
    .forEach(function (n) { presetSheet.push([n, presetAll[n], Math.round(presetAll[n] * 1000 / rows.length) / 10]); });

  var utmSheet = [['ID', 'Язык', 'UTM_SOURCE', 'UTM_MEDIUM', 'UTM_CAMPAIGN', 'UTM_CONTENT', 'UTM_TERM']];
  rows.forEach(function (r) { utmSheet.push([r.id, r.language, r.utmSource, r.utmMedium, r.utmCampaign, r.utmContent, r.utmTerm]); });

  var usageSheet = [['Поле', 'Используется', 'Обязательное', '% обязательных']];
  Object.keys(fieldUsage).sort(function (a, b) { return fieldUsage[b] - fieldUsage[a]; })
    .forEach(function (n) { var req = requiredUsage[n] || 0; usageSheet.push([n, fieldUsage[n], req, fieldUsage[n] ? Math.round(req * 1000 / fieldUsage[n]) / 10 : 0]); });

  var agrSheet = [['Agreement ID', 'Name', 'Форм', 'Вариантов текста', 'Текст (первый)']];
  Object.keys(agreements).sort(function (a, b) { return agreements[b].forms.length - agreements[a].forms.length; })
    .forEach(function (aid) { var a = agreements[aid]; agrSheet.push([aid, a.name, a.forms.length, Object.keys(a.texts).length, Object.keys(a.texts)[0] || '']); });

  var consentMapSheet = [['Язык', 'Ожидаемый', 'Фактический', 'OK/ERROR', 'ID']];
  rows.forEach(function (r) { var exp = expectedConsent[r.language] || ''; consentMapSheet.push([r.language, exp, r.consentVersion || '(пусто)', (r.consentVersion === exp) ? 'OK' : 'ERROR', r.id]); });

  var duplicateLabels = {
    full_duplicate: 'полный дубль', redirect_only: 'одинаковые поля, только другой редирект',
    ownership_variant: 'одинаковые поля, разный ответственный',
    field_variant: 'одинаковые поля, другие настройки', near_duplicate: 'почти-дубль'
  };
  var dupSheet = [['Язык', 'Форм', 'Категория', 'Различия', 'Ответственный различается', 'Ответственные по формам', 'Решение', 'ID форм']];
  clusters.forEach(function (c) {
    var fallback = c.exact ? 'полный дубль' : 'почти (' + Math.round(dupTh * 100) + '%+)';
    var owners = c.ownershipConflict ? c.ids.map(function (id) {
      return '#' + id + '=' + (c.responsibleValues[id] || '—');
    }).join(' / ') : '';
    dupSheet.push([c.lang, c.size, duplicateLabels[c.category] || fallback, c.differences || '',
      c.ownershipConflict ? 'ДА — ручной review' : 'Нет', owners, c.decision || '', c.ids.join(', ')]);
  });
  var anomSheet = [['Поле', 'В формах', 'Проблема', 'Решение']];
  anomalies.forEach(function (a) { anomSheet.push([a.field, a.count, a.flags, a.decision || 'Ручная проверка']); });
  var consistSheet = [['Тип формы', 'Поле', 'Присутствует', 'Обязательное', 'Замечание']]; consistency.forEach(function (c) { consistSheet.push([c.formType, c.field, c.present, c.required, c.note]); });
  var agrConflSheet = [['Agreement ID', 'Name', 'Вариантов текста', 'Форм']]; agrConflicts.forEach(function (c) { agrConflSheet.push([c.id, c.name, c.variants, c.forms]); });

  var diffSheet = [['Тип изменения', 'ID', 'Детали']];
  (diffChanges || []).forEach(function (d) { diffSheet.push([d.type, d.id, d.detail]); });
  var timelineSheet = [['ID формы', 'История severity/консент по запускам']];
  (timelineRows || []).forEach(function (t) { timelineSheet.push(t); });

  return {
    Summary: summary, Performance: perfSheet, 'Обзор': overview, 'Все формы': allSheet,
    'Проблемы': probSheet, 'Редиректы': redirSheet, 'Preset-валидация': presetValSheet,
    'Automation': autoSheet, 'Дубли': dupSheet, 'Аномальные поля': anomSheet,
    'Консистентность': consistSheet, 'Соглашения': agrSheet,
    'Конфликты соглашений': agrConflicts.length ? agrConflSheet : null,
    'Скрытые поля': presetSheet, 'UTM': utmSheet, 'Использование полей': usageSheet,
    'Карта консентов': consentMapSheet,
    'Дифф': diffSheet.length > 1 ? diffSheet : null,
    'История': timelineSheet.length > 1 ? timelineSheet : null
  };
}

/* Собрать xlsx-байты. XLSX должен быть уже импортирован в scope SW. */
export function sheetsToXlsx(XLSX, sheetsMap) {
  var wb = XLSX.utils.book_new();
  Object.keys(sheetsMap).forEach(function (name) {
    var aoa = sheetsMap[name];
    if (!aoa) return;
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    if (aoa.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: aoa[0].length - 1 } }) };
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function toJsonl(rows) {
  return rows.map(function (r) { return JSON.stringify(r); }).join('\n');
}
