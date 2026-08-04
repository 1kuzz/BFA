import { Sparkline } from './Charts.jsx';

function historyValues(R, key) {
  return (R.historyStats || []).map(function (item) { return item[key]; });
}

export function StatCards(props) {
  var R = props.R, s = R.sevCount;
  return (
    <div className="stats" id="stats">
      <div className="card crit"><b>{s.CRIT}</b>🔴 Критичных<Sparkline values={historyValues(R, 'CRIT')} color="#fb7185" /></div>
      <div className="card warn"><b>{s.WARN}</b>🟡 Предупреждений<Sparkline values={historyValues(R, 'WARN')} color="#fbbf24" /></div>
      <div className="card info"><b>{s.INFO}</b>🔵 Инфо<Sparkline values={historyValues(R, 'INFO')} color="#60a5fa" /></div>
      <div className="card ok"><b>{s.OK}</b>🟢 OK<Sparkline values={historyValues(R, 'OK')} color="#10b981" /></div>
      <div className="card"><b>{R.avgScore}</b>Ср. Quality Score<Sparkline values={historyValues(R, 'avgScore')} color="#a78bfa" /></div>
      <div className="card"><b>{R.clusters.length}</b>Кластеров дублей</div>
      <div className="card"><b>{R.rows.filter(function (r) { return r.redirectIssue; }).length}</b>Проблем редиректов</div>
      <div className="card"><b>{R.diffChanges ? R.diffChanges.length : 0}</b>Изменений с прошлого раза</div>
    </div>
  );
}

export function RunDelta(props) {
  var history = props.R.historyStats || [], chips = [];
  if (history.length > 1) {
    var previous = history[history.length - 2], current = history[history.length - 1];
    var critDelta = current.CRIT - previous.CRIT;
    var scoreDelta = current.avgScore == null || previous.avgScore == null ? null : current.avgScore - previous.avgScore;
    chips.push((critDelta > 0 ? '+' : '') + critDelta + ' CRIT с прошлого прогона');
    if (scoreDelta != null) chips.push((scoreDelta > 0 ? '+' : '') + scoreDelta + ' к среднему Score');
  } else {
    chips.push('Базовый прогон: тренд появится после следующего запуска');
  }
  chips.push((props.R.diffChanges || []).length + ' изменений в формах');
  return (
    <div className="run-delta" id="runDelta">
      {chips.slice(0, 3).map(function (text) { return <span className="delta-chip" key={text}>{text}</span>; })}
    </div>
  );
}
