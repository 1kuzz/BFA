import { BarChart, DonutChart } from './Charts.jsx';
import { distrib } from '../lib/format.js';

export function ChartsRow(props) {
  var R = props.R, s = R.sevCount;
  var langDist = distrib(R.rows, 'language');
  var topFields = Object.keys(R.fieldUsage)
    .sort(function (a, b) { return R.fieldUsage[b] - R.fieldUsage[a]; })
    .slice(0, 10)
    .map(function (n) { return [n.replace('CONTACT_', ''), R.fieldUsage[n]]; });
  var entDist = distrib(R.rows, 'entity');

  return (
    <div className="charts" id="charts">
      <div className="chart"><h3>Severity</h3><DonutChart data={[['CRIT', s.CRIT], ['WARN', s.WARN], ['INFO', s.INFO], ['OK', s.OK]]} colors={['#fb7185', '#fbbf24', '#60a5fa', '#10b981']} /></div>
      <div className="chart"><h3>Формы по языкам</h3><BarChart data={langDist} color="#10b981" /></div>
      <div className="chart"><h3>Топ полей</h3><BarChart data={topFields} color="#60a5fa" /></div>
      <div className="chart"><h3>Сущности</h3><DonutChart data={entDist} colors={['#10b981', '#fbbf24', '#fb7185']} /></div>
    </div>
  );
}
