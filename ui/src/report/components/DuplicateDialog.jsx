import { useEffect, useRef } from 'react';
import { DUPLICATE_LABELS } from '../lib/format.js';

export function DuplicateDialog(props) {
  var dialogRef = useRef(null);
  var cluster = props.cluster, rowById = props.rowById;

  useEffect(function () {
    var dialog = dialogRef.current;
    if (!dialog) return;
    if (cluster) {
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    } else if (dialog.open) {
      dialog.close();
    }
  }, [cluster]);

  var matrix = cluster ? (cluster.diffMatrix || []) : [];

  return (
    <dialog
      ref={dialogRef} id="duplicateDialog" aria-labelledby="duplicateDialogTitle"
      onClose={props.onClose}
    >
      <div className="dialog-head">
        <div>
          <h2 id="duplicateDialogTitle">{cluster ? (DUPLICATE_LABELS[cluster.category] || 'Сравнение дублей') : 'Сравнение дублей'}</h2>
          <div className="meta" id="duplicateDialogMeta">
            {cluster && (cluster.size + ' форм · ' + cluster.ids.map(function (id) {
              return '#' + id + ' ' + ((rowById[id] || {}).name || '');
            }).join(' · ') + ' · ' + (cluster.decision || 'Ручной review'))}
          </div>
        </div>
        <button type="button" className="secondary" id="closeDuplicate" onClick={props.onClose}>Закрыть</button>
      </div>
      <div className="diff-matrix" id="duplicateMatrix">
        {cluster && !matrix.length && (
          <div className="empty-state">Все анализируемые поля и настройки совпадают. Это кандидат на схлопывание.</div>
        )}
        {cluster && !!matrix.length && (
          <table>
            <thead>
              <tr>
                <th>Поле / атрибут</th>
                {cluster.ids.map(function (id) { return <th key={id}>#{id}</th>; })}
              </tr>
            </thead>
            <tbody>
              {matrix.map(function (row) {
                return (
                  <tr key={row.key || row.label}>
                    <th>{row.label}</th>
                    {cluster.ids.map(function (id) {
                      return <td className="diff-cell" key={id}>{row.values[id] == null ? '—' : row.values[id]}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </dialog>
  );
}
