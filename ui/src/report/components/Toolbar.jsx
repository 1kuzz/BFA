import { Pager } from './Pager.jsx';

export function Toolbar(props) {
  return (
    <div className="controls">
      <input
        className="q" id="q" placeholder="Поиск..." value={props.q}
        onChange={function (e) { props.onQ(e.target.value); }}
      />
      <select id="sev" value={props.sev} onChange={function (e) { props.onSev(e.target.value); }}>
        <option value="">Все severity</option>
        <option>CRIT</option><option>WARN</option><option>INFO</option><option>OK</option>
      </select>
      <button type="button" id="print" onClick={function () { window.print(); }}>🖨 Печать / PDF</button>
      <Pager page={props.page} pageSize={props.pageSize} total={props.total} onPage={props.onPage} onPageSize={props.onPageSize} />
    </div>
  );
}
