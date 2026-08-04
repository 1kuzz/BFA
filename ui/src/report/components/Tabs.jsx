import { TABS } from '../lib/tableDef.jsx';

export function Tabs(props) {
  var currentTab = props.currentTab, onSelect = props.onSelect, tableDefsByTab = props.tableDefsByTab;
  return (
    <div className="tabs" id="tabs">
      {TABS.map(function (t) {
        var count = tableDefsByTab[t.id].data.length;
        return (
          <button
            key={t.id}
            type="button"
            className={'tab' + (t.id === currentTab ? ' active' : '')}
            data-tab={t.id}
            aria-selected={t.id === currentTab}
            onClick={function () { onSelect(t.id); }}
          >
            {t.label} <b>{count}</b>
          </button>
        );
      })}
    </div>
  );
}

export function ReasonGroups(props) {
  var R = props.R, currentTab = props.currentTab, onPickReason = props.onPickReason;
  if (currentTab !== 'problems') return <div className="reason-groups" />;
  var counts = {};
  R.rows.forEach(function (row) {
    [row.crit, row.warn].filter(Boolean).forEach(function (text) {
      text.split(' ; ').forEach(function (reason) { counts[reason] = (counts[reason] || 0) + 1; });
    });
  });
  var reasons = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 8);
  if (!reasons.length) return <div className="reason-groups" />;
  return (
    <div className="reason-groups show">
      {reasons.map(function (reason) {
        return (
          <button
            type="button" key={reason} className="secondary reason-filter" title="Показать формы"
            onClick={function () { onPickReason(reason); }}
          >
            {reason} · {counts[reason]}
          </button>
        );
      })}
    </div>
  );
}
