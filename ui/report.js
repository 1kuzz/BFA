var $ = function (id) { return document.getElementById(id); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

var R = null; // lastResult
var currentTab = 'forms';

$('print').onclick = function () { window.print(); };

var sevColor = { CRIT: '#ffd6d6', WARN: '#fff3cf', INFO: '#e3f0ff', OK: '#ffffff' };

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
  var tot = data.reduce(function (a, d) { return a + d[1]; }, 0) || 1, acc = 0;
  var segs = data.map(function (d, i) {
    var frac = d[1] / tot, a0 = acc * 2 * Math.PI, a1 = (acc + frac) * 2 * Math.PI; acc += frac;
    var x0 = 16 + 12 * Math.sin(a0), y0 = 16 - 12 * Math.cos(a0), x1 = 16 + 12 * Math.sin(a1), y1 = 16 - 12 * Math.cos(a1);
    var large = frac > 0.5 ? 1 : 0;
    return '<path d="M16,16 L' + x0.toFixed(2) + ',' + y0.toFixed(2) + ' A12,12 0 ' + large + ',1 ' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' Z" fill="' + colors[i % colors.length] + '"><title>' + esc(d[0]) + ': ' + d[1] + '</title></path>';
  }).join('');
  return '<svg viewBox="0 0 32 32" style="width:120px;height:120px">' + segs + '<circle cx="16" cy="16" r="6" fill="#fff"/></svg>';
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
    data: rows.map(function (r) { return { sev: r.severity, cells: [r.severity, r.score, r.id, r.name, r.language, r.region, r.formType, r.consentVersion, r.subscriptionVersion, r.hasEmail, r.hasVisitorId, r.captcha, r.redirect, r.crit, r.warn, r.recommendations] }; })
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
  thead.innerHTML = '<tr>' + def.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>';

  var q = ($('q').value || '').toLowerCase(), s = $('sev').value;
  var filtered = def.data.filter(function (row) {
    var okS = !s || row.sev === s;
    var okQ = !q || row.cells.join(' ').toLowerCase().indexOf(q) > -1;
    return okS && okQ;
  });

  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="' + def.cols.length + '" class="empty">Ничего не найдено</td></tr>'; return; }
  tbody.innerHTML = filtered.map(function (row) {
    return '<tr style="background:' + (sevColor[row.sev] || '#fff') + '">' + row.cells.map(function (v) { return '<td class="long">' + esc(v) + '</td>'; }).join('') + '</tr>';
  }).join('');

  // сортировка по клику
  var ths = thead.rows[0].cells;
  [].forEach.call(ths, function (th, i) {
    var asc = 1;
    th.onclick = function () {
      var rs = [].slice.call(tbody.rows);
      rs.sort(function (a, b) {
        var x = a.cells[i].textContent, y = b.cells[i].textContent, nx = parseFloat(x), ny = parseFloat(y);
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
  $('q').oninput = renderTable;
  $('sev').onchange = renderTable;

  $('empty').style.display = 'none';
  $('dashboard').style.display = 'block';
}

function load() {
  chrome.storage.local.get('lastResult', function (d) {
    if (d.lastResult && d.lastResult.rows) { R = d.lastResult; render(); }
  });
}
load();

// живое обновление после нового прогона
chrome.runtime.onMessage.addListener(function (msg) {
  if (msg && msg.target === 'ui' && msg.type === 'done') load();
});
