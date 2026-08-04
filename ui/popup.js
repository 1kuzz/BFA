var $ = function (id) { return document.getElementById(id); };
var fill = $('fill'), phase = $('phase'), logEl = $('log');

function log(t) { logEl.textContent = (t + '\n' + logEl.textContent).slice(0, 4000); }
function setProgress(done, total) {
  var pct = total ? Math.round(done / total * 100) : 0;
  fill.style.width = pct + '%';
  phase.textContent = 'Загрузка форм: ' + done + '/' + total + ' (' + pct + '%)';
}

function toSw(type, cb) { chrome.runtime.sendMessage({ target: 'sw', type: type }, cb || function () {}); }

$('run').onclick = function () { fill.style.width = '0%'; phase.textContent = 'Запуск...'; toSw('run'); };
$('runForce').onclick = function () { fill.style.width = '0%'; phase.textContent = 'Полный прогон...'; toSw('runForce'); };
$('report').onclick = function () { toSw('openReport'); };
$('opts').onclick = function (e) { e.preventDefault(); chrome.runtime.openOptionsPage(); };

// профили
chrome.storage.local.get(['profiles', 'activeProfile'], function (d) {
  var profiles = d.profiles || { Default: 1, RU: 1 };
  var sel = $('profile');
  Object.keys(profiles).filter(function (name) { return name.toUpperCase() !== 'LATAM'; }).forEach(function (name) {
    var o = document.createElement('option'); o.value = name; o.textContent = name;
    if (name === (d.activeProfile || 'Default')) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = function () { chrome.storage.local.set({ activeProfile: sel.value }); };
});

// подписка на прогресс из SW
chrome.runtime.onMessage.addListener(function (msg) {
  if (!msg || msg.target !== 'ui') return;
  if (msg.type === 'status') { phase.textContent = msg.text; if (msg.total) setProgress(msg.done || 0, msg.total); }
  if (msg.type === 'progress') setProgress(msg.done, msg.total);
  if (msg.type === 'log') log(msg.text);
  if (msg.type === 'error') { phase.textContent = '⚠ ' + msg.text; log(msg.text); }
  if (msg.type === 'done') {
    fill.style.width = '100%';
    phase.textContent = 'Готово за ' + msg.summary.totalSec + 'с. Файлы скачаны.';
    var s = msg.summary.sev;
    $('stats').style.display = 'flex';
    $('sC').textContent = s.CRIT; $('sW').textContent = s.WARN; $('sI').textContent = s.INFO; $('sO').textContent = s.OK;
    log('Всего ' + msg.summary.total + ' форм, ср. Score ' + msg.summary.avgScore + ', изменений в диффе: ' + msg.summary.diff);
  }
});
