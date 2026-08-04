export function AuditLog(props) {
  var audit = props.audit;
  return (
    <section className="audit">
      <h2>Журнал изменений</h2>
      <div id="audit">
        {!audit.length && 'Изменений пока нет.'}
        {audit.slice(0, 10).map(function (record, i) {
          var applied = record.results.filter(function (r) { return r.status === 'applied'; }).length;
          var failed = record.results.length - applied;
          var detail = record.results.map(function (result) {
            var changes = (result.changes || []).map(function (change) {
              return change.kind + (change.field ? ':' + change.field : '') + ' [' + change.risk + ']';
            }).join(', ');
            return '#' + result.id + ' ' + result.status + (changes ? ' · ' + changes : '') + (result.error ? ' · ' + result.error : '');
          }).join('\n');
          return (
            <details className="audit-row" key={record.planId + '-' + i}>
              <summary>
                <span>{new Date(record.appliedAt).toLocaleString('ru-RU')} · применено {applied}{failed ? ' · ошибок/откатов ' + failed : ''}</span>
                <small>{record.planId}</small>
              </summary>
              <div className="audit-detail">{detail}</div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
