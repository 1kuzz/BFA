export function Pager(props) {
  var page = props.page, pages = Math.max(1, Math.ceil(props.total / props.pageSize));
  return (
    <span id="pager">
      <button type="button" className="secondary" disabled={page === 1} onClick={function () { props.onPage(page - 1); }}>←</button>
      {' '}<span>{page} / {pages} · {props.total}</span>{' '}
      <button type="button" className="secondary" disabled={page === pages} onClick={function () { props.onPage(page + 1); }}>→</button>
      {' '}
      <select
        aria-label="Строк на странице"
        value={String(props.pageSize)}
        onChange={function (e) { props.onPageSize(parseInt(e.target.value, 10)); }}
      >
        <option>50</option><option>100</option><option>200</option>
      </select>
    </span>
  );
}
