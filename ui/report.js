import { languageLabel } from '../core/lang.js';
import { formLocale, searchForms, wordingVariants } from '../core/search.js';

var $ = function (id) { return document.getElementById(id); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

var R = null; // lastResult
var currentTab = 'forms';
var selected = {}, lastFiltered = [], pendingPlan = null;
var page = 1, pageSize = 100;
var clusterByForm = {}, rowById = {}, activeAgreement = null;
var finderQueries = [], finderLanguage = 'auto', lastFinderIds = [];

function toast(message) {
  $('toast').textContent = message; $('toast').style.display = 'block';
  clearTimeout(toast.timer); toast.timer = setTimeout(function () { $('toast').style.display = 'none'; }, 3200);
}

$('print').onclick = function () { window.print(); };

function html(value, text) { return { html: value, text: text || '' }; }
function cellText(value) { return value && value.html != null ? value.text || '' : String(value == null ? '' : value); }
function cellHtml(value) { return value && value.html != null ? value.html : esc(value); }

function distrib(rows, key) {
  var map = {};
  rows.forEach(function (r) { var v = (r[key] === '' || r[key] == null) ? '(пусто)' : r[key]; map[v] = (map[v] || 0) + 1; });
  return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).map(function (v) { return [v, map[v]]; });
}

function topWithOther(data, limit) {
  if (data.length <= limit) return data;
  return data.slice(0, limit).concat([['Остальные', data.slice(limit).reduce(function (sum, item) { return sum + item[1]; }, 0)]]);
}
function barChart(data, color) {
  data = topWithOther(data, 8);
  var max = Math.max.apply(null, data.map(function (item) { return item[1]; })) || 1;
  var total = data.reduce(function (sum, item) { return sum + item[1]; }, 0) || 1;
  return '<div class="bar-list">' + data.map(function (item) {
    var pct = Math.round(item[1] * 1000 / total) / 10;
    return '<div class="bar-row" title="' + esc(item[0]) + ': ' + item[1] + ' (' + pct + '%)"><span>' + esc(item[0]) +
      '</span><span class="bar-track"><i class="bar-fill" style="width:' + Math.max(2, item[1] * 100 / max) + '%;background:' + color + '"></i></span><b>' +
      item[1] + ' · ' + pct + '%</b></div>';
  }).join('') + '</div>';
}
function donutChart(data, colors) {
  var tot = data.reduce(function (a, d) { return a + d[1]; }, 0) || 1, acc = 0;
  var positive = data.map(function (item, index) { return item[1] > 0 ? index : -1; }).filter(function (index) { return index >= 0; });
  var segs = positive.length === 1 ? '<circle cx="16" cy="16" r="12" fill="' + colors[positive[0] % colors.length] + '"/>' : data.map(function (d, i) {
    var frac = d[1] / tot, a0 = acc * 2 * Math.PI, a1 = (acc + frac) * 2 * Math.PI; acc += frac;
    var x0 = 16 + 12 * Math.sin(a0), y0 = 16 - 12 * Math.cos(a0), x1 = 16 + 12 * Math.sin(a1), y1 = 16 - 12 * Math.cos(a1);
    var large = frac > 0.5 ? 1 : 0;
    return '<path d="M16,16 L' + x0.toFixed(2) + ',' + y0.toFixed(2) + ' A12,12 0 ' + large + ',1 ' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' Z" fill="' + colors[i % colors.length] + '"><title>' + esc(d[0]) + ': ' + d[1] + '</title></path>';
  }).join('');
  var legend = data.map(function (item, i) {
    if (item[1] <= 0) return '';
    return '<span><i style="background:' + colors[i % colors.length] + '"></i>' + esc(item[0]) + ' <b>' + item[1] +
      '</b> · ' + Math.round(item[1] * 1000 / tot) / 10 + '%</span>';
  }).join('');
  return '<div class="chart-body"><svg viewBox="0 0 32 32" style="width:120px;height:120px;flex:none">' + segs +
    '<circle cx="16" cy="16" r="6" fill="#111c2f"/></svg><div class="legend">' + legend + '</div></div>';
}
function sparkline(key, color) {
  var values = (R.historyStats || []).map(function (item) { return item[key]; }).filter(function (v) { return typeof v === 'number'; });
  if (values.length < 2) return '<span class="trend">Тренд появится после следующего прогона</span>';
  var min = Math.min.apply(null, values), max = Math.max.apply(null, values), span = max - min || 1;
  var points = values.map(function (value, i) {
    return (i * 80 / (values.length - 1)).toFixed(1) + ',' + (16 - (value - min) * 14 / span).toFixed(1);
  }).join(' ');
  return '<svg class="spark" viewBox="0 0 80 18" preserveAspectRatio="none" aria-label="Тренд"><polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="2"/></svg>';
}
function renderRunDelta() {
  var history = R.historyStats || [], chips = [];
  if (history.length > 1) {
    var previous = history[history.length - 2], current = history[history.length - 1];
    var critDelta = current.CRIT - previous.CRIT;
    var scoreDelta = current.avgScore == null || previous.avgScore == null ? null : current.avgScore - previous.avgScore;
    chips.push((critDelta > 0 ? '+' : '') + critDelta + ' CRIT с прошлого прогона');
    if (scoreDelta != null) chips.push((scoreDelta > 0 ? '+' : '') + scoreDelta + ' к среднему Score');
  } else chips.push('Базовый прогон: тренд появится после следующего запуска');
  chips.push((R.diffChanges || []).length + ' изменений в формах');
  $('runDelta').innerHTML = chips.slice(0, 3).map(function (text) { return '<span class="delta-chip">' + esc(text) + '</span>'; }).join('');
}

var TABS = [
  { id: 'forms', label: 'Все формы' },
  { id: 'problems', label: 'Проблемы' },
  { id: 'redirects', label: 'Редиректы' },
  { id: 'preset', label: 'Preset-валидация' },
  { id: 'dupes', label: 'Дубли' },
  { id: 'localizations', label: 'Локализации' },
  { id: 'anomalies', label: 'Аномальные поля' },
  { id: 'consistency', label: 'Консистентность' },
  { id: 'agreements', label: 'Конфликты соглашений' },
  { id: 'consent', label: 'Карта консентов' },
  { id: 'diff', label: 'Дифф' },
  { id: 'history', label: 'История' }
];

var DUPLICATE_LABELS = {
  full_duplicate: 'полный дубль', redirect_only: 'только другой редирект',
  ownership_variant: 'одинаковые поля, разный ответственный',
  field_variant: 'одинаковые поля, другие настройки', near_duplicate: 'почти-дубль (поля)'
};
function duplicatePreview(cluster) {
  var rows = (cluster.diffMatrix || []).slice(0, 5).map(function (row) {
    return row.label + ': ' + cluster.ids.map(function (id) { return '#' + id + '=' + row.values[id]; }).join(' / ');
  });
  return rows.length ? rows.join('\n') : 'Все анализируемые поля и настройки совпадают';
}
function duplicateButton(index, compact) {
  var cluster = R.clusters[index], title = duplicatePreview(cluster);
  return '<button class="secondary duplicate-open' + (compact ? ' duplicate-badge' : '') + '" data-cluster="' + index +
    '" title="' + esc(title) + '" aria-label="Открыть сравнение кластера из ' + cluster.size + ' форм">🧬 ×' + cluster.size + '</button>';
}
function formIdCell(row) {
  var index = clusterByForm[row.id];
  return html(esc(row.id) + (index == null ? '' : duplicateButton(index, true)), row.id);
}

var LANGUAGE_SOURCES = {
  declared: 'указан в форме', name: 'из названия формы',
  content: 'распознан по вопросам', unknown: 'не определён'
};
/* Локаль формы: по ней формы считаются «одной и той же формой».
   Показываем, откуда она взялась, и когда контент расходится с
   объявленным языком — это как раз локализованная копия. */
function localeCell(row) {
  var locale = formLocale(row);
  var title = LANGUAGE_SOURCES[row.languageSource] || 'не определён';
  if (row.languageMismatch === 'Y') {
    title = 'объявлен «' + (row.declaredLanguage || '—') + '», вопросы на «' + row.contentLanguage + '»';
    return html('<span class="ownership-alert" title="' + esc(title) + '">' + esc(locale || '—') + '</span>', locale || '—');
  }
  return html('<span title="' + esc(title) + '">' + esc(locale || '—') + '</span>', locale || '—');
}

// определения колонок для каждой вкладки: [заголовок, функция -> значение]
function tableDef(tab) {
  var rows = R.rows;
  if (tab === 'forms') return {
    cols: ['Sev', 'Score', 'ID', 'Имя', 'Язык', 'Локаль', 'Регион', 'Тип', 'Консент', 'Подписка', 'Email', 'VisitorID', 'Captcha', 'Редирект', 'CRIT', 'WARN', 'Рекомендации'],
    data: rows.map(function (r) { return { id: r.id, sev: r.severity, cells: [html('<span class="sev-chip">' + esc(r.severity) + '</span>', r.severity), r.score, formIdCell(r), r.name, r.language, localeCell(r), r.region, r.formType, r.consentVersion, r.subscriptionVersion, r.hasEmail, r.hasVisitorId, r.captcha, r.redirect, r.crit, r.warn, r.recommendations] }; })
  };
  if (tab === 'problems') return {
    cols: ['Sev', 'Score', 'ID', 'Имя', 'Язык', 'CRIT', 'WARN', 'Рекомендации'],
    data: rows.filter(function (r) { return r.severity === 'CRIT' || r.severity === 'WARN'; }).map(function (r) { return { sev: r.severity, cells: [r.severity, r.score, r.id, r.name, r.language, r.crit, r.warn, r.recommendations] }; })
  };
  if (tab === 'redirects') return {
    cols: ['ID', 'Имя', 'Язык', 'Редирект', 'Проблема'],
    data: rows.filter(function (r) { return r.redirectIssue; }).map(function (r) { return { sev: r.severity, cells: [r.id, r.name, r.language, r.redirect, r.redirectIssue] }; })
  };
  if (tab === 'preset') return {
    cols: ['ID', 'Поле', 'Значение', 'Проблема', 'Действие'],
    data: R.presetIssuesAll.map(function (p) {
      return { sev: 'CRIT', cells: [p.id, p.field, p.value, p.issue, html('<button class="secondary preset-fix" data-field="' + esc(p.field) + '">Подготовить bulk-правку</button>', p.decision)] };
    })
  };
  if (tab === 'dupes') return {
    cols: ['Сравнить', 'Локаль', 'Форм', 'Категория', 'Различия', 'Ответственный', 'Решение', 'ID форм'],
    data: R.clusters.map(function (c, index) {
      var ownership = c.ownershipConflict ? html('<span class="ownership-alert">Требует ручного review</span>', 'Ответственный различается') : 'Совпадает';
      return { sev: c.ownershipConflict ? 'CRIT' : 'INFO', cells: [html(duplicateButton(index, false), 'сравнить'), c.localeLabel || c.lang, c.size, DUPLICATE_LABELS[c.category] || 'дубль', c.differences || '', ownership, c.decision || '', c.ids.join(', ')] };
    })
  };
  if (tab === 'localizations') return {
    cols: ['Набор полей', 'Языков', 'Форм', 'Формы по языкам', 'Консент по языкам', 'Нет локализации на', 'Решение'],
    data: (R.localizations || []).map(function (family) {
      var byLocale = family.locales.map(function (locale) {
        return languageLabel(locale) + ': ' + family.byLocale[locale].map(function (id) { return '#' + id; }).join(' ');
      }).join(' · ');
      var consent = family.locales.map(function (locale) {
        return locale + ': ' + family.consentByLocale[locale];
      }).join(' · ');
      return {
        sev: family.sharedConsent ? 'WARN' : 'INFO',
        cells: [family.signature, family.locales.length, family.size, byLocale,
          family.sharedConsent ? html('<span class="ownership-alert">' + esc(consent) + '</span>', consent) : consent,
          family.missingLocales.join(', ') || '—', family.decision]
      };
    })
  };
  if (tab === 'anomalies') return {
    cols: ['Поле', 'В формах', 'Проблема', 'Решение'],
    data: R.anomalies.map(function (a) { return { sev: 'WARN', cells: [a.field, a.count, a.flags, a.decision || 'Ручная проверка'] }; })
  };
  if (tab === 'consistency') return {
    cols: ['Тип формы', 'Поле', 'Присутствует', 'Обязательное', 'Замечание'],
    data: R.consistency.map(function (c) { return { sev: 'WARN', cells: [c.formType, c.field, c.present, c.required, c.note] }; })
  };
  if (tab === 'agreements') return {
    cols: ['Agreement ID', 'Name', 'Вариантов текста', 'Форм', 'Действие'],
    data: R.agrConflicts.map(function (c) { return { sev: 'CRIT', cells: [c.id, c.name, c.variants, c.forms, html('<button class="agreement-edit" data-agreement="' + esc(c.id) + '">Унифицировать текст</button>', 'bulk edit')] }; })
  };
  if (tab === 'consent') return {
    cols: ['Язык', 'Ожидаемый', 'Фактический', 'Статус', 'ID'],
    data: rows.map(function (r) { var exp = R.expectedConsent[r.language] || ''; return { sev: (r.consentVersion === exp ? 'OK' : 'CRIT'), cells: [r.language, exp, r.consentVersion || '(пусто)', r.consentVersion === exp ? 'OK' : 'ERROR', r.id] }; })
  };
  if (tab === 'diff') return {
    cols: ['Тип изменения', 'ID', 'Детали'],
    data: (R.diffChanges || []).map(function (d) { return { sev: 'INFO', cells: [d.type, d.id, d.detail] }; })
  };
  if (tab === 'history') return {
    cols: ['ID формы', 'История severity/консент'],
    data: (R.timelineRows || []).map(function (t) { return { sev: 'INFO', cells: t }; })
  };
  return { cols: [], data: [] };
}

function openDuplicate(index) {
  var cluster = R.clusters[index];
  if (!cluster) return;
  $('duplicateDialogTitle').textContent = DUPLICATE_LABELS[cluster.category] || 'Сравнение дублей';
  $('duplicateDialogMeta').textContent = cluster.size + ' форм · ' + cluster.ids.map(function (id) {
    return '#' + id + ' ' + (rowById[id] || {}).name;
  }).join(' · ') + ' · ' + (cluster.decision || 'Ручной review');
  var matrix = cluster.diffMatrix || [];
  if (!matrix.length) {
    $('duplicateMatrix').innerHTML = '<div class="empty-state">Все анализируемые поля и настройки совпадают. Это кандидат на схлопывание.</div>';
  } else {
    $('duplicateMatrix').innerHTML = '<table><thead><tr><th>Поле / атрибут</th>' + cluster.ids.map(function (id) {
      return '<th>#' + esc(id) + '</th>';
    }).join('') + '</tr></thead><tbody>' + matrix.map(function (row) {
      return '<tr><th>' + esc(row.label) + '</th>' + cluster.ids.map(function (id) {
        return '<td class="diff-cell">' + esc(row.values[id] == null ? '—' : row.values[id]) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  }
  var dialog = $('duplicateDialog');
  if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
}

function openAgreement(id) {
  var conflict = (R.agrConflicts || []).find(function (item) { return String(item.id) === String(id); });
  if (!conflict || !Array.isArray(conflict.textVariants)) {
    toast('Перезапустите анализ, чтобы загрузить варианты текста соглашения'); return;
  }
  activeAgreement = conflict;
  selected = {}; conflict.formIds.forEach(function (formId) { selected[formId] = true; });
  updateSelection(); renderTable();
  $('agreementTitle').textContent = 'Agreement ' + conflict.id + ' · ' + conflict.name;
  $('agreementVariant').innerHTML = '';
  conflict.textVariants.forEach(function (variant, index) {
    var option = document.createElement('option'); option.value = String(index);
    option.textContent = variant.count + ' форм · ' + (variant.text || '(пусто)').slice(0, 120);
    $('agreementVariant').appendChild(option);
  });
  $('agreementText').value = conflict.textVariants[0].text;
  $('agreementImpact').textContent = 'Будет проверено и изменено до ' + conflict.formIds.length + ' форм';
  $('agreementEditor').className = 'agreement-editor show';
  $('agreementEditor').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function preparePreset(field) {
  selected = {};
  (R.presetIssuesAll || []).filter(function (issue) { return issue.field === field; }).forEach(function (issue) {
    selected[issue.id] = true;
  });
  $('editKind').value = 'preset'; $('editField').value = field; $('editValue').value = '';
  updateEditor(); updateSelection(); renderTable();
  $('controlTitle').scrollIntoView({ behavior: 'smooth' });
  toast('Выбраны формы с невалидным ' + field + ' — введите каноническое значение');
}

function renderPager(total) {
  var pages = Math.max(1, Math.ceil(total / pageSize)); page = Math.min(page, pages);
  $('pager').innerHTML = '<button class="secondary" id="pagePrev"' + (page === 1 ? ' disabled' : '') + '>←</button> ' +
    '<span>' + page + ' / ' + pages + ' · ' + total + '</span> <button class="secondary" id="pageNext"' + (page === pages ? ' disabled' : '') + '>→</button> ' +
    '<select id="pageSize" aria-label="Строк на странице"><option>50</option><option>100</option><option>200</option></select>';
  $('pageSize').value = String(pageSize);
  $('pagePrev').onclick = function () { page--; renderTable(); };
  $('pageNext').onclick = function () { page++; renderTable(); };
  $('pageSize').onchange = function () { pageSize = parseInt(this.value); page = 1; renderTable(); };
}

function renderTable() {
  var def = tableDef(currentTab);
  var thead = $('t').tHead, tbody = $('t').tBodies[0];
  var selectable = currentTab === 'forms';
  thead.innerHTML = '<tr>' + (selectable ? '<th aria-label="Выбор">✓</th>' : '') + def.cols.map(function (c, i) { return '<th data-index="' + i + '">' + esc(c) + '</th>'; }).join('') + '</tr>';

  var q = ($('q').value || '').toLowerCase(), s = $('sev').value;
  var filtered = def.data.filter(function (row) {
    var okS = !s || row.sev === s;
    var okQ = !q || row.cells.map(cellText).join(' ').toLowerCase().indexOf(q) > -1;
    return okS && okQ;
  });
  lastFiltered = selectable ? filtered : [];
  renderPager(filtered.length);

  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="' + (def.cols.length + (selectable ? 1 : 0)) + '" class="empty">Ничего не найдено</td></tr>'; return; }
  var visibleRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  tbody.innerHTML = visibleRows.map(function (row) {
    var checkbox = selectable ? '<td><input type="checkbox" data-form-id="' + esc(row.id) + '"' + (selected[row.id] ? ' checked' : '') + '></td>' : '';
    return '<tr class="sev-row sev-' + esc(row.sev) + '">' + checkbox + row.cells.map(function (v) { return '<td class="long">' + cellHtml(v) + '</td>'; }).join('') + '</tr>';
  }).join('');

  [].forEach.call(tbody.querySelectorAll('[data-form-id]'), function (box) {
    box.onchange = function () {
      if (box.checked) selected[box.getAttribute('data-form-id')] = true;
      else delete selected[box.getAttribute('data-form-id')];
      updateSelection();
    };
  });
  [].forEach.call(tbody.querySelectorAll('.duplicate-open'), function (button) {
    button.onclick = function () { openDuplicate(parseInt(button.getAttribute('data-cluster'))); };
  });
  [].forEach.call(tbody.querySelectorAll('.agreement-edit'), function (button) {
    button.onclick = function () { openAgreement(button.getAttribute('data-agreement')); };
  });
  [].forEach.call(tbody.querySelectorAll('.preset-fix'), function (button) {
    button.onclick = function () { preparePreset(button.getAttribute('data-field')); };
  });

  // сортировка по клику
  var ths = thead.rows[0].cells;
  [].forEach.call(ths, function (th) {
    var index = th.getAttribute('data-index');
    if (index == null) return;
    var cellIndex = parseInt(index) + (selectable ? 1 : 0);
    var asc = 1;
    th.onclick = function () {
      var rs = [].slice.call(tbody.rows);
      rs.sort(function (a, b) {
        var x = a.cells[cellIndex].textContent, y = b.cells[cellIndex].textContent, nx = parseFloat(x), ny = parseFloat(y);
        if (!isNaN(nx) && !isNaN(ny)) return (nx - ny) * asc;
        return x.localeCompare(y) * asc;
      });
      asc *= -1; rs.forEach(function (r) { tbody.appendChild(r); });
    };
  });
}

function renderTabs() {
  $('tabs').innerHTML = TABS.map(function (t) {
    var count = tableDef(t.id).data.length;
    return '<button class="tab' + (t.id === currentTab ? ' active' : '') + '" data-tab="' + t.id + '" aria-selected="' + (t.id === currentTab) + '">' + esc(t.label) + ' <b>' + count + '</b></button>';
  }).join('');
  [].forEach.call($('tabs').children, function (el) {
    el.onclick = function () { currentTab = el.getAttribute('data-tab'); page = 1; renderTabs(); renderReasonGroups(); renderTable(); };
  });
}

function renderReasonGroups() {
  if (!R || currentTab !== 'problems') { $('reasonGroups').className = 'reason-groups'; return; }
  var counts = {};
  R.rows.forEach(function (row) {
    [row.crit, row.warn].filter(Boolean).forEach(function (text) {
      text.split(' ; ').forEach(function (reason) { counts[reason] = (counts[reason] || 0) + 1; });
    });
  });
  var reasons = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 8);
  $('reasonGroups').className = reasons.length ? 'reason-groups show' : 'reason-groups';
  $('reasonGroups').innerHTML = reasons.map(function (reason) {
    return '<button class="secondary reason-filter" data-reason="' + esc(reason) + '" title="Показать формы">' + esc(reason) + ' · ' + counts[reason] + '</button>';
  }).join('');
  [].forEach.call($('reasonGroups').querySelectorAll('.reason-filter'), function (button) {
    button.onclick = function () { $('q').value = button.getAttribute('data-reason'); page = 1; renderTable(); };
  });
}

function render() {
  var validIds = {}; rowById = {}; clusterByForm = {};
  R.rows.forEach(function (row) { validIds[row.id] = true; rowById[row.id] = row; });
  (R.clusters || []).forEach(function (cluster, index) {
    cluster.ids.forEach(function (id) { clusterByForm[id] = index; });
  });
  Object.keys(selected).forEach(function (id) { if (!validIds[id]) delete selected[id]; });
  $('meta').textContent = 'Профиль: ' + R.profile + ' · ' + new Date(R.generatedAt).toLocaleString('ru-RU') +
    ' · форм: ' + R.rows.length + ' · ср. Score: ' + R.avgScore +
    ' · ' + R.perfStats.totalSec + 'с · cache-hit ' + R.perfStats.cacheHitPct + '%';
  renderRunDelta();

  var s = R.sevCount;
  $('stats').innerHTML =
    '<div class="card crit"><b>' + s.CRIT + '</b>🔴 Критичных' + sparkline('CRIT', '#fb7185') + '</div>' +
    '<div class="card warn"><b>' + s.WARN + '</b>🟡 Предупреждений' + sparkline('WARN', '#fbbf24') + '</div>' +
    '<div class="card info"><b>' + s.INFO + '</b>🔵 Инфо' + sparkline('INFO', '#60a5fa') + '</div>' +
    '<div class="card ok"><b>' + s.OK + '</b>🟢 OK' + sparkline('OK', '#10b981') + '</div>' +
    '<div class="card"><b>' + R.avgScore + '</b>Ср. Quality Score' + sparkline('avgScore', '#a78bfa') + '</div>' +
    '<div class="card"><b>' + R.clusters.length + '</b>Кластеров дублей</div>' +
    '<div class="card"><b>' + R.rows.filter(function (r) { return r.redirectIssue; }).length + '</b>Проблем редиректов</div>' +
    '<div class="card"><b>' + (R.diffChanges ? R.diffChanges.length : 0) + '</b>Изменений с прошлого раза</div>';

  var langDist = distrib(R.rows, 'language');
  var topFields = Object.keys(R.fieldUsage).sort(function (a, b) { return R.fieldUsage[b] - R.fieldUsage[a]; }).slice(0, 10).map(function (n) { return [n.replace('CONTACT_', ''), R.fieldUsage[n]]; });
  var entDist = distrib(R.rows, 'entity');
  $('charts').innerHTML =
    '<div class="chart"><h3>Severity</h3>' + donutChart([['CRIT', s.CRIT], ['WARN', s.WARN], ['INFO', s.INFO], ['OK', s.OK]], ['#fb7185', '#fbbf24', '#60a5fa', '#10b981']) + '</div>' +
    '<div class="chart"><h3>Формы по языкам</h3>' + barChart(langDist, '#10b981') + '</div>' +
    '<div class="chart"><h3>Топ полей</h3>' + barChart(topFields, '#60a5fa') + '</div>' +
    '<div class="chart"><h3>Сущности</h3>' + donutChart(entDist, ['#10b981', '#fbbf24', '#fb7185']) + '</div>';

  renderTabs();
  renderReasonGroups();
  renderTable();
  fillLanguageOptions();
  renderFinder();
  updateSelection();
  $('q').oninput = function () { page = 1; renderTable(); };
  $('sev').onchange = function () { page = 1; renderTable(); };

  $('empty').style.display = 'none';
  $('loading').style.display = 'none';
  $('dashboard').style.display = 'block';
}

function stateLabel(values) {
  var unique = {};
  values.forEach(function (value) { unique[String(value)] = true; });
  if (Object.keys(unique).length > 1) return 'Смешано';
  return values[0] ? 'Да' : 'Нет';
}

function renderCommonQuestions() {
  if (!R) return;
  var threshold = parseInt($('commonThreshold').value) || 80;
  $('commonThresholdValue').textContent = threshold + '%';
  var rows = R.rows.filter(function (row) { return selected[row.id]; });
  if (!rows.length) {
    $('commonImpact').textContent = '';
    $('commonQuestions').textContent = 'Выберите формы, чтобы увидеть общие вопросы.'; return;
  }
  if (rows.some(function (row) { return !Array.isArray(row.questions); })) {
    $('commonQuestions').textContent = 'Запустите полный анализ после обновления BFA, чтобы загрузить названия вопросов.';
    return;
  }

  var common = {};
  rows.forEach(function (row) {
    var seen = {};
    row.questions.forEach(function (question) {
      if (!question.name || seen[question.name]) return;
      seen[question.name] = true;
      var item = common[question.name] || (common[question.name] = {
        name: question.name, labels: [], required: [], visible: [], formIds: []
      });
      item.labels.push(question.label || question.name); item.required.push(question.required);
      item.visible.push(question.visible); item.formIds.push(row.id);
    });
  });

  var questions = Object.keys(common).map(function (name) { return common[name]; }).filter(function (question) {
    return question.formIds.length * 100 / rows.length >= threshold;
  });
  questions.sort(function (a, b) { return a.labels[0].localeCompare(b.labels[0], 'ru'); });
  if (!questions.length) {
    $('commonImpact').textContent = '0 вопросов · минимум ' + Math.ceil(rows.length * threshold / 100) + ' из ' + rows.length + ' форм';
    $('commonQuestions').textContent = 'Даже с порогом ' + threshold + '% нет общих полей. Вероятно, выбраны формы разных типов — сузьте фильтр или тип формы.';
    return;
  }
  var coverage = questions.map(function (question) { return question.formIds.length; });
  $('commonImpact').textContent = questions.length + ' вопросов · каждая правка затронет от ' +
    Math.min.apply(null, coverage) + ' до ' + Math.max.apply(null, coverage) + ' из ' + rows.length + ' форм';

  $('commonQuestions').innerHTML = '<table><thead><tr><th>Вопрос</th><th>Технический ключ</th><th>Охват</th><th>Исключения</th><th>Обяз.</th><th>Виден</th><th>Новое название</th><th>Обяз.</th><th>Виден</th><th></th></tr></thead><tbody>' +
    questions.map(function (question) {
      var labels = Array.from(new Set(question.labels));
      var original = labels.length === 1 ? labels[0] : '';
      var title = labels.length === 1 ? labels[0] : 'Разные названия: ' + labels.join(' / ');
      var present = {}; question.formIds.forEach(function (id) { present[id] = true; });
      var missing = rows.filter(function (row) { return !present[row.id]; });
      var exceptions = missing.length ? '<details><summary>' + missing.length + ' форм</summary>' + missing.map(function (row) {
        return '<div>#' + esc(row.id) + ' ' + esc(row.name) + '</div>';
      }).join('') + '</details><button class="secondary remove-missing" data-missing="' + esc(missing.map(function (row) { return row.id; }).join(',')) + '">Снять их</button>' : 'Нет';
      return '<tr data-question="' + esc(question.name) + '" data-present="' + esc(question.formIds.join(',')) + '"><td data-label="Вопрос" title="' + esc(title) + '">' + esc(title) +
        '</td><td data-label="Технический ключ"><code>' + esc(question.name) + '</code></td>' +
        '<td data-label="Охват"><b>' + question.formIds.length + ' из ' + rows.length + '</b></td><td data-label="Исключения">' + exceptions +
        '</td><td data-label="Сейчас обязательный">' + esc(stateLabel(question.required)) +
        '</td><td data-label="Сейчас виден">' + esc(stateLabel(question.visible)) + '</td><td data-label="Новое название"><input class="question-label" data-original="' +
        esc(original) + '" value="' + esc(original) + '" placeholder="Введите единое название"></td>' +
        '<td data-label="Новая обязательность"><select class="question-required"><option value="keep">Не менять</option><option value="true">Да</option><option value="false">Нет</option></select></td>' +
        '<td data-label="Новая видимость"><select class="question-visible"><option value="keep">Не менять</option><option value="true">Да</option><option value="false">Нет</option></select></td>' +
        '<td data-label="Проверка"><button class="question-preview">Preview · ' + question.formIds.length + ' форм</button></td></tr>';
    }).join('') + '</tbody></table>';

  [].forEach.call($('commonQuestions').querySelectorAll('.question-preview'), function (button) {
    button.onclick = function () {
      var row = button.closest('tr'), field = row.getAttribute('data-question');
      var labelInput = row.querySelector('.question-label');
      var label = labelInput.value.trim(), original = labelInput.getAttribute('data-original');
      var required = row.querySelector('.question-required').value;
      var visible = row.querySelector('.question-visible').value;
      var operations = [];
      row.getAttribute('data-present').split(',').filter(Boolean).forEach(function (id) {
        if (label && label !== original) operations.push({ formId: id, kind: 'label', field: field, value: label });
        if (required !== 'keep') operations.push({ formId: id, kind: 'required', field: field, value: required === 'true' });
        if (visible !== 'keep') operations.push({ formId: id, kind: 'visible', field: field, value: visible === 'true' });
      });
      if (!operations.length) {
        $('editPreview').textContent = 'Укажите новое название, обязательность или видимость.';
        $('editPreview').style.display = 'block';
        return;
      }
      requestPreview(operations);
    };
  });
  [].forEach.call($('commonQuestions').querySelectorAll('.remove-missing'), function (button) {
    button.onclick = function () {
      button.getAttribute('data-missing').split(',').filter(Boolean).forEach(function (id) { delete selected[id]; });
      updateSelection(); renderTable(); toast('Формы без этого поля сняты с выделения');
    };
  });
}

$('commonThreshold').oninput = function () {
  chrome.storage.local.set({ commonThreshold: parseInt(this.value) });
  renderCommonQuestions();
};

function updateSelection() {
  $('selection').textContent = 'Выбрано: ' + Object.keys(selected).length;
  renderCommonQuestions();
}

/* ---- Поиск форм по вопросам ------------------------------------- */

/* 1 форма / 2 формы / 5 форм */
function plural(count, variants) {
  var mod100 = count % 100, mod10 = count % 10;
  if (mod100 > 10 && mod100 < 20) return variants[2];
  if (mod10 === 1) return variants[0];
  if (mod10 > 1 && mod10 < 5) return variants[1];
  return variants[2];
}
function formCount(count) { return count + ' ' + plural(count, ['форма', 'формы', 'форм']); }

function matchBar(score) {
  var percent = Math.round(score * 100);
  return '<span class="match-bar"><i style="width:' + percent + '%"></i></span>' + percent + '%';
}

var MATCH_VIA = { label: 'по тексту вопроса', field: 'по имени поля', concept: 'по смыслу' };

function fillLanguageOptions() {
  var present = {};
  R.rows.forEach(function (row) { var locale = formLocale(row); if (locale) present[locale] = (present[locale] || 0) + 1; });
  var codes = Object.keys(present).sort(function (a, b) { return present[b] - present[a]; });
  $('finderLang').innerHTML = '<option value="auto">Авто (по языку запроса)</option><option value="">Любой язык</option>' +
    codes.map(function (code) {
      return '<option value="' + esc(code) + '">' + esc(languageLabel(code)) + ' · ' + present[code] + '</option>';
    }).join('');
  $('finderLang').value = finderLanguage;
  if ($('finderLang').value !== finderLanguage) { finderLanguage = 'auto'; $('finderLang').value = 'auto'; }
}

function renderFinderChips() {
  $('finderChips').innerHTML = finderQueries.map(function (query, index) {
    return '<span class="chip"><b>' + (index + 1) + '.</b> ' + esc(query) +
      '<button data-remove="' + index + '" title="Убрать вопрос" aria-label="Убрать вопрос">×</button></span>';
  }).join('');
  [].forEach.call($('finderChips').querySelectorAll('[data-remove]'), function (button) {
    button.onclick = function () {
      finderQueries.splice(parseInt(button.getAttribute('data-remove')), 1);
      persistFinder(); renderFinder();
    };
  });
}

function persistFinder() {
  chrome.storage.local.set({ finderQueries: finderQueries, finderLanguage: finderLanguage });
}

function renderFinderResults(found) {
  if (!found.results.length) {
    $('finderResults').innerHTML = '<div class="empty">Ни одна форма ' +
      (found.language ? 'на языке «' + esc(languageLabel(found.language)) + '» ' : '') +
      'не содержит все указанные вопросы. Уберите последний вопрос или смените язык.</div>';
    return;
  }
  var head = '<tr><th>✓</th><th>Совпадение</th><th>ID</th><th>Имя</th><th>Локаль</th>' +
    found.queries.map(function (query) { return '<th>' + esc(query) + '</th>'; }).join('') +
    '<th>Полей</th><th>Sev</th></tr>';
  var body = found.results.map(function (result) {
    var row = result.row;
    return '<tr class="sev-row sev-' + esc(row.severity) + '"><td><input type="checkbox" data-finder-id="' + esc(row.id) + '"' +
      (selected[row.id] ? ' checked' : '') + '></td>' +
      '<td>' + matchBar(result.score) + '</td><td>#' + esc(row.id) + '</td>' +
      '<td class="long" title="' + esc(row.name) + '">' + esc(row.name) + '</td>' +
      '<td>' + esc(result.locale || '—') + '</td>' +
      result.matches.map(function (match) {
        return '<td class="long" title="' + esc(match.name) + '">' + esc(match.label) +
          '<span class="via">' + esc(MATCH_VIA[match.via] || match.via) + ' · ' + Math.round(match.score * 100) + '%</span></td>';
      }).join('') +
      '<td>' + esc(row.visibleCount) + '</td><td><span class="sev-chip">' + esc(row.severity) + '</span></td></tr>';
  }).join('');
  $('finderResults').innerHTML = '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  [].forEach.call($('finderResults').querySelectorAll('[data-finder-id]'), function (box) {
    box.onchange = function () {
      var id = box.getAttribute('data-finder-id');
      if (box.checked) selected[id] = true; else delete selected[id];
      updateSelection(); renderTable();
    };
  });
}

function renderFinderVariants(groups) {
  if (!groups.length) {
    $('finderVariants').innerHTML = '<div class="empty">Формулировки во всех найденных формах совпадают — унифицировать нечего.</div>';
    return;
  }
  $('finderVariants').innerHTML = groups.slice(0, 12).map(function (group, index) {
    var questions = group.questions;
    var head = '<tr><th>Форма</th>' + questions.map(function (question) {
      return '<th>' + esc(question.name) + '</th>';
    }).join('') + '</tr>';
    var body = group.forms.map(function (form) {
      return '<tr' + (form.matched ? ' class="sev-row sev-OK"' : '') + '><td class="long" title="' + esc(form.name) + '">#' +
        esc(form.id) + ' ' + esc(form.name) + '</td>' + questions.map(function (question) {
          return '<td class="long">' + esc(form.labels[question.name]) + '</td>';
        }).join('') + '</tr>';
    }).join('');
    var variantCounts = questions.map(function (question) {
      return esc(question.name) + ' — ' + question.variants.length + ' ' +
        plural(question.variants.length, ['формулировка', 'формулировки', 'формулировок']);
    }).join(' · ');
    return '<div class="variant-group"><h4>' + esc(languageLabel(group.locale)) + ' · ' + formCount(group.size) +
      ' · ' + esc(group.signature) + '</h4><div class="meta">' + variantCounts + '</div>' +
      '<div class="finder-wrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
      '<button class="secondary variant-select" data-ids="' + esc(group.ids.join(',')) + '" data-index="' + index +
      '">Выбрать эти ' + formCount(group.size) + ' для унификации</button></div>';
  }).join('');
  [].forEach.call($('finderVariants').querySelectorAll('.variant-select'), function (button) {
    button.onclick = function () {
      selected = {};
      button.getAttribute('data-ids').split(',').filter(Boolean).forEach(function (id) { selected[id] = true; });
      updateSelection(); renderTable();
      $('controlTitle').scrollIntoView({ behavior: 'smooth' });
      toast('Формы выбраны — задайте единое название вопроса в «Общих вопросах»');
    };
  });
}

function renderFinder() {
  if (!R) return;
  renderFinderChips();
  if (!finderQueries.length) {
    $('finderImpact').textContent = 'Введите первый вопрос';
    $('finderResults').innerHTML = '<div class="empty">Пока ничего не задано. Первый вопрос сузит список форм, второй — ещё сильнее.</div>';
    $('finderLangChips').innerHTML = '';
    $('finderVariants').innerHTML = 'Появится после первого запроса.';
    lastFinderIds = [];
    return;
  }
  var found = searchForms(R.rows, finderQueries, { language: finderLanguage });
  lastFinderIds = found.results.map(function (result) { return result.id; });

  var reason = found.languageSource === 'query' ? 'по языку запроса' :
    found.languageSource === 'manual' ? 'выбран вручную' :
    found.languageSource === 'matches' ? 'по лучшим совпадениям' : '';
  $('finderImpact').textContent = formCount(found.results.length) + ' из ' + found.total +
    ' · ' + found.queries.length + ' ' + plural(found.queries.length, ['вопрос', 'вопроса', 'вопросов']) + ' в запросе' +
    (found.language ? ' · язык: ' + languageLabel(found.language) + (reason ? ' (' + reason + ')' : '') : ' · язык: любой');

  $('finderLangChips').innerHTML = found.languageCounts.length > 1 ? '<span class="chip-label">Совпадения есть и на других языках:</span>' +
    found.languageCounts.map(function (item) {
      return '<button class="chip lang' + (item.language === found.language ? ' active' : '') +
        '" data-lang="' + esc(item.language) + '">' + esc(languageLabel(item.language)) + ' · ' + item.count + '</button>';
    }).join('') : '';
  [].forEach.call($('finderLangChips').querySelectorAll('[data-lang]'), function (button) {
    button.onclick = function () {
      finderLanguage = button.getAttribute('data-lang');
      $('finderLang').value = finderLanguage;
      persistFinder(); renderFinder();
    };
  });

  renderFinderResults(found);
  renderFinderVariants(wordingVariants(R.rows, found.results, { queries: found.queries }));
}

function addFinderQuery() {
  var value = $('finderInput').value.trim();
  if (!value) return;
  if (finderQueries.some(function (query) { return query.toLowerCase() === value.toLowerCase(); })) {
    toast('Такой вопрос уже добавлен'); return;
  }
  finderQueries.push(value);
  $('finderInput').value = '';
  persistFinder(); renderFinder();
}

$('finderAdd').onclick = addFinderQuery;
$('finderInput').onkeydown = function (event) {
  if (event.key === 'Enter') { event.preventDefault(); addFinderQuery(); }
};
$('finderClear').onclick = function () {
  finderQueries = []; $('finderInput').value = '';
  persistFinder(); renderFinder();
};
$('finderLang').onchange = function () { finderLanguage = this.value; persistFinder(); renderFinder(); };
$('finderSelect').onclick = function () {
  if (!lastFinderIds.length) { toast('Сначала найдите формы по вопросам'); return; }
  lastFinderIds.forEach(function (id) { selected[id] = true; });
  updateSelection(); renderTable();
  toast('Найденные формы добавлены к выделению');
};

function updateEditor() {
  var kind = $('editKind').value;
  var needsField = kind === 'preset' || kind === 'label' || kind === 'required' || kind === 'visible';
  var isBoolean = kind === 'required' || kind === 'visible';
  $('fieldWrap').style.display = needsField ? 'block' : 'none';
  $('editValue').style.display = isBoolean ? 'none' : 'block';
  $('editBoolean').style.display = isBoolean ? 'block' : 'none';
  $('editField').placeholder = kind === 'preset' ? 'UF_CRM_CONSENT_VERSION' : 'CONTACT_EMAIL';
}

function formatValue(value) {
  if (value === undefined) return 'undefined';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function renderPlan(plan) {
  var lines = ['План ' + plan.id + ' · форм: ' + plan.entries.length];
  plan.entries.forEach(function (entry) {
    lines.push('\n#' + entry.id);
    entry.changes.forEach(function (change) {
      lines.push('[' + change.risk + '] ' + change.kind + (change.field ? ':' + change.field : '') +
        '\n  ' + formatValue(change.before) + '  →  ' + formatValue(change.after));
    });
  });
  $('editPreview').textContent = lines.join('\n');
  $('editPreview').style.display = 'block';
  $('confirmation').value = '';
  $('confirmation').placeholder = plan.confirmation;
  $('approval').className = 'approval show';
}

function loadAudit() {
  chrome.storage.local.get('editAudit', function (stored) {
    var audit = stored.editAudit || [];
    if (!audit.length) { $('audit').textContent = 'Изменений пока нет.'; return; }
    $('audit').innerHTML = audit.slice(0, 10).map(function (record) {
      var applied = record.results.filter(function (r) { return r.status === 'applied'; }).length;
      var failed = record.results.length - applied;
      var detail = record.results.map(function (result) {
        var changes = (result.changes || []).map(function (change) {
          return change.kind + (change.field ? ':' + change.field : '') + ' [' + change.risk + ']';
        }).join(', ');
        return '#' + result.id + ' ' + result.status + (changes ? ' · ' + changes : '') +
          (result.error ? ' · ' + result.error : '');
      }).join('\n');
      return '<details class="audit-row"><summary><span>' + esc(new Date(record.appliedAt).toLocaleString('ru-RU')) +
        ' · применено ' + applied + (failed ? ' · ошибок/откатов ' + failed : '') +
        '</span><small>' + esc(record.planId) + '</small></summary><div class="audit-detail">' +
        esc(detail) + '</div></details>';
    }).join('');
  });
}

$('editKind').onchange = updateEditor;
$('closeDuplicate').onclick = function () { $('duplicateDialog').close(); };
$('closeAgreement').onclick = function () {
  activeAgreement = null; $('agreementEditor').className = 'agreement-editor';
};
$('agreementVariant').onchange = function () {
  if (activeAgreement) $('agreementText').value = activeAgreement.textVariants[parseInt(this.value)].text;
};
$('previewAgreement').onclick = function () {
  if (!activeAgreement) return;
  var text = $('agreementText').value.trim();
  if (!text) { toast('Введите канонический текст соглашения'); return; }
  requestPreview(activeAgreement.formIds.map(function (formId) {
    return { formId: formId, kind: 'agreement', field: String(activeAgreement.id), value: text };
  }));
};
$('selectAll').onclick = function () {
  R.rows.forEach(function (row) { selected[row.id] = true; });
  updateSelection(); renderTable();
};
$('selectShown').onclick = function () {
  lastFiltered.forEach(function (row) { selected[row.id] = true; });
  updateSelection(); renderTable();
};
$('clearSelected').onclick = function () { selected = {}; updateSelection(); renderTable(); };
function requestPreview(operations) {
  pendingPlan = null;
  $('approval').className = 'approval';
  $('previewEdits').disabled = true;
  $('editPreview').textContent = 'Загружаю свежие формы из Bitrix24...';
  $('editPreview').style.display = 'block';
  chrome.runtime.sendMessage({ target: 'sw', type: 'previewEdits', operations: operations }, function (response) {
    $('previewEdits').disabled = false;
    if (!response || !response.ok) { $('editPreview').textContent = 'Ошибка preview: ' + ((response || {}).error || 'нет ответа'); toast('Preview не создан'); return; }
    pendingPlan = response.plan; renderPlan(pendingPlan);
    toast('План правок готов — проверьте изменения');
  });
}
$('previewEdits').onclick = function () {
  var ids = Object.keys(selected);
  if (!ids.length) { $('editPreview').textContent = 'Выберите хотя бы одну форму.'; $('editPreview').style.display = 'block'; return; }
  var kind = $('editKind').value;
  var value = (kind === 'required' || kind === 'visible') ? $('editBoolean').value === 'true' : $('editValue').value;
  requestPreview(ids.map(function (id) {
    return { formId: id, kind: kind, field: $('editField').value.trim(), value: value };
  }));
};
$('applyEdits').onclick = function () {
  if (!pendingPlan) return;
  $('applyEdits').disabled = true;
  chrome.runtime.sendMessage({
    target: 'sw', type: 'applyEdits', planId: pendingPlan.id, confirmation: $('confirmation').value.trim()
  }, function (response) {
    $('applyEdits').disabled = false;
    if (!response || !response.ok) { $('editPreview').textContent += '\n\nОшибка применения: ' + ((response || {}).error || 'нет ответа'); toast('Правки не применены'); return; }
    var results = response.record.results;
    $('editPreview').textContent += '\n\nЗавершено: ' + results.map(function (r) { return '#' + r.id + ' ' + r.status; }).join(', ') + '\nЗапустите анализ для обновления метрик.';
    pendingPlan = null; $('approval').className = 'approval'; loadAudit();
    toast('Правки применены и проверены');
  });
};
updateEditor();
loadAudit();

function load() {
  chrome.storage.local.get(['lastResult', 'commonThreshold', 'finderQueries', 'finderLanguage'], function (d) {
    if (d.commonThreshold >= 50 && d.commonThreshold <= 100) $('commonThreshold').value = d.commonThreshold;
    if (Array.isArray(d.finderQueries)) finderQueries = d.finderQueries.filter(Boolean);
    if (typeof d.finderLanguage === 'string') finderLanguage = d.finderLanguage;
    if (d.lastResult && d.lastResult.rows) { R = d.lastResult; render(); return; }
    $('loading').style.display = 'none'; $('empty').style.display = 'block';
  });
}
load();

document.addEventListener('keydown', function (event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); $('q').focus(); $('q').select(); return;
  }
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && $('tabs').contains(document.activeElement)) {
    event.preventDefault();
    var tabs = [].slice.call($('tabs').querySelectorAll('.tab'));
    var index = tabs.indexOf(document.activeElement) + (event.key === 'ArrowRight' ? 1 : -1);
    var target = tabs[(index + tabs.length) % tabs.length].getAttribute('data-tab');
    tabs[(index + tabs.length) % tabs.length].click();
    $('tabs').querySelector('[data-tab="' + target + '"]').focus();
  }
});

// живое обновление после нового прогона
chrome.runtime.onMessage.addListener(function (msg) {
  if (msg && msg.target === 'ui' && msg.type === 'done') load();
  if (msg && msg.target === 'ui' && msg.type === 'editsDone') loadAudit();
});
