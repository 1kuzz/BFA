import { cellText, cellNode } from '../lib/tableDef.jsx';

export function DataTable(props) {
  var cols = props.cols, rows = props.rows, selectable = props.selectable;
  var selected = props.selected, onToggleRow = props.onToggleRow;
  var sortCol = props.sortCol, sortDir = props.sortDir, onSortClick = props.onSortClick;

  return (
    <table id="t">
      <thead>
        <tr>
          {selectable && <th aria-label="Выбор">✓</th>}
          {cols.map(function (c, i) {
            var arrow = sortCol === i ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
            return <th key={c} onClick={function () { onSortClick(i); }}>{c}{arrow}</th>;
          })}
        </tr>
      </thead>
      <tbody>
        {!rows.length && (
          <tr><td colSpan={cols.length + (selectable ? 1 : 0)} className="empty">Ничего не найдено</td></tr>
        )}
        {rows.map(function (row) {
          return (
            <tr className={'sev-row sev-' + row.sev} key={row.id}>
              {selectable && (
                <td><input type="checkbox" checked={!!selected[row.id]} onChange={function () { onToggleRow(row.id); }} /></td>
              )}
              {row.cells.map(function (value, i) {
                return <td className="long" key={i} data-text={cellText(value)}>{cellNode(value)}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
