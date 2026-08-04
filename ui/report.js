var $ = function (id) { return document.getElementById(id); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

var R = null; // lastResult
var currentTab = 'forms';
var selected = {}, lastFiltered = [], pendingPlan = null;

$('print').onclick = function () { window.print(); };

var sevColor = { CRIT: '#3b1725', WARN: '#382d14', INFO: '#142a42', OK: '#111c2f' };

function distrib(rows, key) {
  var map = {};
  rows.forEach(function (r) { var v = (r[key] === '' || r[key] == null) ? '(пусто)' : r[key]; map[v] = (map[v] || 0) + 1; });
  return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).map(function (v) { return [v, map[v]]; });
}

function barSVG(data, color) {
  var max = Math.max.apply(null, data.map(function (d) { return d[1]; })) || 1;
  var bw = 100 / (data.length || 1);
  return '<svg viewBox="0 0 100 42" preserveAspectRatio="none" style="width:100%;height:120px">' +
    data.map(function (d, i) { var h = d[1] / max * 32; return '<rect x="' + (i * bw + 1) + '" y="' + (38 - h) + '" width="' + (bw - 2) + '" height="' + h + '" fill="' + color + '"><title>' + esc(d[0]) + ': ' + d[1] + '</title></rect>'; }).join('') +
    data.map(function (d, i) { return '<text x="' + (i * bw + bw / 2) + '" y="41.5" font-size="1.6" text-anchor="middle" fill="#555">' + esc(String(d[0]).slice(0, 6)) + '</text>'; }).join('') +
    '</svg>';
}
function donutSVG(data, colors) {
  var positive = data.filter(function (d) { return d[1] > 0; });
  if (positive.length === 1) {
    return '<svg viewBox="0 0 32 32" style="width:120px;height:120px"><circle cx="16" cy="16" r="12" fill="' +
      colors[0] + '"><title>' + esc(positive[0][0]) + ': ' + positive[0][1] +
      '</title></circle><circle cx="16" cy="16" r="6" fill="#111c2f"/></svg>';
  }
  var tot = data.reduce(function (a, d) { return a + d[1]; }, 0) || 1, acc = 0;
  var segs = data.map(function (d, i) {
    var frac = d[1] / tot, a0 = acc * 2 * Math.PI, a1 = (acc + frac) * 2 * Math.PI; acc += frac;
    var x0 = 16 + 12 * Math.sin(a0), y0 = 16 - 12 * Math.cos(a0), x1 = 16 + 12 * Math.sin(a1), y1 = 16 - 12 * Math.cos(a1);
    var large = frac > 0.5 ? 1 : 0;
    return '<path d="M16,16 L' + x0.toFixed(2) + ',' + y0.toFixed(2) + ' A12,12 0 ' + large + ',1 ' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' Z" fill="' + colors[i % colors.length] + '"><title>' + esc(d[0]) + ': ' + d[1] + '</title></path>';
  }).join('');
  return '<svg viewBox="0 0 32 32" style="width:120px;height:120px">' + segs + '<circle cx="16" cy="16" r="6" fill="#111c2f"/></svg>';
}

var TABS = [
  { id: 'forms', label: 'Все формы' },
  { id: 'problems', label: 'Проблемы' },
  { id: 'redirects', label: 'Редиректы' },
  { id: 'preset', label: 'Preset-валидация' },
  { id: 'dupes', label: 'Дубли' },
  { id: 'anomalies', label: 'Аномальные поля' },
  { id: 'consistency', label: 'Консистентность' },
  { id: 'agreements', label: 'Конфликты соглашений' },
  { id: 'consent', label: 'Карта консентов' },
  { id: 'diff', label: 'Дифф' },
  { id: 'history', label: 'История' }
];

// определения колонок для каждой вкладки: [заголовок, функция -> значение]
function tableDef(tab) {
  var rows = R.rows;
  if (tab === 'forms') return {
    cols: ['Sev', 'Score', 'ID', 'Имя', 'Язык', 'Регион', 'Тип', 'Консент', 'Подписка', 'Email', 'VisitorID', 'Captcha', 'Редирект', 'CRIT', 'WARN', 'Рекомендации'],
    data: rows.map(function (r) { return { id: r.id, sev: r.severity, cells: [r.severity, r.score, r.id, r.name, r.language, r.region, r.formType, r.consentVersion, r.subscriptionVersion, r.hasEmail, r.hasVisitorId, r.captcha, r.redirect, r.crit, r.warn, r.recommendations] }; })
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
    cols: ['ID', 'Поле', 'Значение', 'Проблема'],
    data: R.presetIssuesAll.map(function (p) { return { sev: 'CRIT', cells: [p.id, p.field, p.value, p.issue] }; })
  };
  if (tab === 'dupes') return {
    cols: ['Язык', 'Форм', 'Тип', 'ID форм'],
    data: R.clusters.map(function (c) { return { sev: 'INFO', cells: [c.lang, c.size, c.exact ? 'точный' : 'почти', c.ids.join(', ')] }; })
  };
  if (tab === 'anomalies') return {
    cols: ['Поле', 'В формах', 'Проблема'],
    data: R.anomalies.map(function (a) { return { sev: 'WARN', cells: [a.field, a.count, a.flags] }; })
  };
  if (tab === 'consistency') return {
    cols: ['Тип формы', 'Поле', 'Присутствует', 'Обязательное', 'Замечание'],
    data: R.consistency.map(function (c) { return { sev: 'WARN', cells: [c.formType, c.field, c.present, c.required, c.note] }; })
  };
  if (tab === 'agreements') return {
    cols: ['Agreement ID', 'Name', 'Вариантов текста', 'Форм'],
    data: R.agrConflicts.map(function (c) { return { sev: 'WARN', cells: [c.id, c.name, c.variants, c.forms] }; })
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

function renderTable() {
  var def = tableDef(currentTab);
  var thead = $('t').tHead, tbody = $('t').tBodies[0];
  var selectable = currentTab === 'forms';
  thead.innerHTML = '<tr>' + (selectable ? '<th aria-label="Выбор">✓</th>' : '') + def.cols.map(function (c, i) { return '<th data-index="' + i + '">' + esc(c) + '</th>'; }).join('') + '</tr>';

  var q = ($('q').value || '').toLowerCase(), s = $('sev').value;
  var filtered = def.data.filter(function (row) {
    var okS = !s || row.sev === s;
    var okQ = !q || row.cells.join(' ').toLowerCase().indexOf(q) > -1;
    return okS && okQ;
  });
  lastFiltered = selectable ? filtered : [];

  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="' + (def.cols.length + (selectable ? 1 : 0)) + '" class="empty">Ничего не найдено</td></tr>'; return; }
  tbody.innerHTML = filtered.map(function (row) {
    var checkbox = selectable ? '<td><input type="checkbox" data-form-id="' + esc(row.id) + '"' + (selected[row.id] ? ' checked' : '') + '></td>' : '';
    return '<tr style="background:' + (sevColor[row.sev] || '#111c2f') + '">' + checkbox + row.cells.map(function (v) { return '<td class="long">' + esc(v) + '</td>'; }).join('') + '</tr>';
  }).join('');

  [].forEach.call(tbody.querySelectorAll('[data-form-id]'), function (box) {
    box.onchange = function () {
      if (box.checked) selected[box.getAttribute('data-form-id')] = true;
      else delete selected[box.getAttribute('data-form-id')];
      updateSelection();
    };
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
    return '<div class="tab' + (t.id === currentTab ? ' active' : '') + '" data-tab="' + t.id + '">' + esc(t.label) + ' <b>' + count + '</b></div>';
  }).join('');
  [].forEach.call($('tabs').children, function (el) {
    el.onclick = function () { currentTab = el.getAttribute('data-tab'); renderTabs(); renderTable(); };
  });
}

function render() {
  $('meta').textContent = 'Профиль: ' + R.profile + ' · ' + new Date(R.generatedAt).toLocaleString('ru-RU') +
    ' · форм: ' + R.rows.length + ' · ср. Score: ' + R.avgScore +
    ' · ' + R.perfStats.totalSec + 'с · cache-hit ' + R.perfStats.cacheHitPct + '%';

  var s = R.sevCount;
  $('stats').innerHTML =
    '<div class="card crit"><b>' + s.CRIT + '</b>🔴 Критичных</div>' +
    '<div class="card warn"><b>' + s.WARN + '</b>🟡 Предупреждений</div>' +
    '<div class="card info"><b>' + s.INFO + '</b>🔵 Инфо</div>' +
    '<div class="card ok"><b>' + s.OK + '</b>🟢 OK</div>' +
    '<div class="card"><b>' + R.avgScore + '</b>Ср. Quality Score</div>' +
    '<div class="card"><b>' + R.clusters.length + '</b>Кластеров дублей</div>' +
    '<div class="card"><b>' + R.rows.filter(function (r) { return r.redirectIssue; }).length + '</b>Проблем редиректов</div>' +
    '<div class="card"><b>' + (R.diffChanges ? R.diffChanges.length : 0) + '</b>Изменений с прошлого раза</div>';

  var langDist = distrib(R.rows, 'language').slice(0, 12);
  var topFields = Object.keys(R.fieldUsage).sort(function (a, b) { return R.fieldUsage[b] - R.fieldUsage[a]; }).slice(0, 10).map(function (n) { return [n.replace('CONTACT_', ''), R.fieldUsage[n]]; });
  var entDist = distrib(R.rows, 'entity');
  $('charts').innerHTML =
    '<div class="chart"><h3>Severity</h3>' + donutSVG([['CRIT', s.CRIT], ['WARN', s.WARN], ['INFO', s.INFO], ['OK', s.OK]], ['#c0392b', '#e0a800', '#2b6cb0', '#1F6F5C']) + '</div>' +
    '<div class="chart"><h3>Формы по языкам</h3>' + barSVG(langDist, '#1F6F5C') + '</div>' +
    '<div class="chart"><h3>Топ полей</h3>' + barSVG(topFields, '#2b6cb0') + '</div>' +
    '<div class="chart"><h3>Сущности</h3>' + donutSVG(entDist, ['#1F6F5C', '#e0a800', '#c0392b']) + '</div>';

  renderTabs();
  renderTable();
  updateSelection();
  $('q').oninput = renderTable;
  $('sev').onchange = renderTable;

  $('empty').style.display = 'none';
  $('dashboard').style.display = 'block';
}

function updateSelection() {
  $('selection').textContent = 'Выбрано: ' + Object.keys(selected).length;
}

function updateEditor() {
  var kind = $('editKind').value;
  var needsField = kind === 'preset' || kind === 'required' || kind === 'visible';
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
$('selectShown').onclick = function () {
  lastFiltered.forEach(function (row) { selected[row.id] = true; });
  updateSelection(); renderTable();
};
$('clearSelected').onclick = function () { selected = {}; updateSelection(); renderTable(); };
$('previewEdits').onclick = function () {
  var ids = Object.keys(selected);
  if (!ids.length) { $('editPreview').textContent = 'Выберите хотя бы одну форму.'; $('editPreview').style.display = 'block'; return; }
  var kind = $('editKind').value;
  var value = (kind === 'required' || kind === 'visible') ? $('editBoolean').value === 'true' : $('editValue').value;
  var operations = ids.map(function (id) {
    return { formId: id, kind: kind, field: $('editField').value.trim(), value: value };
  });
  $('previewEdits').disabled = true;
  $('editPreview').textContent = 'Загружаю свежие формы из Bitrix24...';
  $('editPreview').style.display = 'block';
  chrome.runtime.sendMessage({ target: 'sw', type: 'previewEdits', operations: operations }, function (response) {
    $('previewEdits').disabled = false;
    if (!response || !response.ok) { $('editPreview').textContent = 'Ошибка preview: ' + ((response || {}).error || 'нет ответа'); return; }
    pendingPlan = response.plan; renderPlan(pendingPlan);
  });
};
$('applyEdits').onclick = function () {
  if (!pendingPlan) return;
  $('applyEdits').disabled = true;
  chrome.runtime.sendMessage({
    target: 'sw', type: 'applyEdits', planId: pendingPlan.id, confirmation: $('confirmation').value.trim()
  }, function (response) {
    $('applyEdits').disabled = false;
    if (!response || !response.ok) { $('editPreview').textContent += '\n\nОшибка применения: ' + ((response || {}).error || 'нет ответа'); return; }
    var results = response.record.results;
    $('editPreview').textContent += '\n\nЗавершено: ' + results.map(function (r) { return '#' + r.id + ' ' + r.status; }).join(', ') + '\nЗапустите анализ для обновления метрик.';
    pendingPlan = null; $('approval').className = 'approval'; loadAudit();
  });
};
updateEditor();
loadAudit();

function load() {
  chrome.storage.local.get('lastResult', function (d) {
    if (d.lastResult && d.lastResult.rows) { R = d.lastResult; render(); }
  });
}
load();

// живое обновление после нового прогона
chrome.runtime.onMessage.addListener(function (msg) {
  if (msg && msg.target === 'ui' && msg.type === 'done') load();
  if (msg && msg.target === 'ui' && msg.type === 'editsDone') loadAudit();
});
