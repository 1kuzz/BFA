import { topWithOther } from '../lib/format.js';

export function Sparkline(props) {
  var values = props.values.filter(function (v) { return typeof v === 'number'; });
  if (values.length < 2) return <span className="trend">Тренд появится после следующего прогона</span>;
  var min = Math.min.apply(null, values), max = Math.max.apply(null, values), span = max - min || 1;
  var points = values.map(function (value, i) {
    return (i * 80 / (values.length - 1)).toFixed(1) + ',' + (16 - (value - min) * 14 / span).toFixed(1);
  }).join(' ');
  return (
    <svg className="spark" viewBox="0 0 80 18" preserveAspectRatio="none" aria-label="Тренд">
      <polyline points={points} fill="none" stroke={props.color} strokeWidth="2" />
    </svg>
  );
}

export function BarChart(props) {
  var data = topWithOther(props.data, 8);
  var max = Math.max.apply(null, data.map(function (item) { return item[1]; })) || 1;
  var total = data.reduce(function (sum, item) { return sum + item[1]; }, 0) || 1;
  return (
    <div className="bar-list">
      {data.map(function (item) {
        var pct = Math.round(item[1] * 1000 / total) / 10;
        return (
          <div className="bar-row" key={item[0]} title={item[0] + ': ' + item[1] + ' (' + pct + '%)'}>
            <span>{item[0]}</span>
            <span className="bar-track">
              <i className="bar-fill" style={{ width: Math.max(2, item[1] * 100 / max) + '%', background: props.color }} />
            </span>
            <b>{item[1] + ' · ' + pct + '%'}</b>
          </div>
        );
      })}
    </div>
  );
}

export function DonutChart(props) {
  var data = props.data, colors = props.colors;
  var tot = data.reduce(function (a, d) { return a + d[1]; }, 0) || 1, acc = 0;
  var positive = data.map(function (item, index) { return item[1] > 0 ? index : -1; }).filter(function (index) { return index >= 0; });
  var segs;
  if (positive.length === 1) {
    segs = <circle cx="16" cy="16" r="12" fill={colors[positive[0] % colors.length]} />;
  } else {
    segs = data.map(function (d, i) {
      var frac = d[1] / tot, a0 = acc * 2 * Math.PI, a1 = (acc + frac) * 2 * Math.PI; acc += frac;
      var x0 = 16 + 12 * Math.sin(a0), y0 = 16 - 12 * Math.cos(a0), x1 = 16 + 12 * Math.sin(a1), y1 = 16 - 12 * Math.cos(a1);
      var large = frac > 0.5 ? 1 : 0;
      var path = 'M16,16 L' + x0.toFixed(2) + ',' + y0.toFixed(2) + ' A12,12 0 ' + large + ',1 ' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' Z';
      return (
        <path key={d[0]} d={path} fill={colors[i % colors.length]}>
          <title>{d[0] + ': ' + d[1]}</title>
        </path>
      );
    });
  }
  var legend = data.filter(function (item) { return item[1] > 0; }).map(function (item, i) {
    return (
      <span key={item[0]}>
        <i style={{ background: colors[i % colors.length] }} />
        {item[0]} <b>{item[1]}</b> · {Math.round(item[1] * 1000 / tot) / 10}%
      </span>
    );
  });
  return (
    <div className="chart-body">
      <svg viewBox="0 0 32 32" style={{ width: '120px', height: '120px', flex: 'none' }}>
        {segs}
        <circle cx="16" cy="16" r="6" fill="#111c2f" />
      </svg>
      <div className="legend">{legend}</div>
    </div>
  );
}
