import { RunDelta } from './StatCards.jsx';

export function Header(props) {
  var R = props.R;
  var meta = R
    ? 'Профиль: ' + R.profile + ' · ' + new Date(R.generatedAt).toLocaleString('ru-RU') +
      ' · форм: ' + R.rows.length + ' · ср. Score: ' + R.avgScore +
      ' · ' + R.perfStats.totalSec + 'с · cache-hit ' + R.perfStats.cacheHitPct + '%'
    : '';
  return (
    <header className="hero">
      <div>
        <h1>BFA Control Center</h1>
        <div className="meta" id="meta">{meta}</div>
        {R && <RunDelta R={R} />}
      </div>
      <span className="live">LIVE GOVERNANCE</span>
    </header>
  );
}
