import { DUPLICATE_LABELS, duplicatePreview } from './format.js';

// A cell is either a primitive (rendered + searched/sorted as-is) or
// { text, node } - `text` drives search/sort, `node` is the rendered JSX.
// This replaces the old html()/cellText()/cellHtml() string-building trio:
// rich cells are real React nodes now, nothing goes through innerHTML.
export function cell(text, node) { return { text: text, node: node }; }

export function cellText(value) {
  return value && typeof value === 'object' && 'text' in value ? (value.text || '') : String(value == null ? '' : value);
}

export function cellNode(value) {
  return value && typeof value === 'object' && 'node' in value ? value.node : (value == null ? '' : String(value));
}

export var TABS = [
  { id: 'forms', label: 'Все формы' },
  { id: 'problems', label: 'Проблемы' },
  { id: 'redirects', label: 'Редиректы' },
  { id: 'preset', label: 'Preset-валидация' },
  { id: 'dupes', label: 'Дубли' },
  { id: 'anomalies', label: 'Аномальные поля' },
  { id: 'consistency', label: 'Консистентность' },
  { id: 'agreements', label: 'Конфликты соглашений' },
  { id: 'consent', label: 'Карта консентов' },
  { id: 'diff', label: 'Дифф' },
  { id: 'history', label: 'История' }
];

function DuplicateButton(props) {
  var cluster = props.cluster, index = props.index, compact = props.compact;
  var title = duplicatePreview(cluster);
  return (
    <button
      type="button"
      className={'secondary duplicate-open' + (compact ? ' duplicate-badge' : '')}
      title={title}
      aria-label={'Открыть сравнение кластера из ' + cluster.size + ' форм'}
      onClick={function () { props.onOpen(index); }}
    >
      {'🧬 ×' + cluster.size}
    </button>
  );
}

function formIdCell(row, clusterByForm, clusters, onOpenDuplicate) {
  var index = clusterByForm[row.id];
  if (index == null) return cell(String(row.id), String(row.id));
  return cell(String(row.id), (
    <>
      {row.id}
      <DuplicateButton cluster={clusters[index]} index={index} compact onOpen={onOpenDuplicate} />
    </>
  ));
}

// Faithful port of the original tableDef() switch - same columns, same
// filters per tab, same severity tagging - just building cell descriptors
// instead of HTML strings.
export function buildTableDef(R, tab, opts) {
  var rows = R.rows;
  var clusterByForm = opts.clusterByForm, onOpenDuplicate = opts.onOpenDuplicate;
  var onOpenAgreement = opts.onOpenAgreement, onPreparePreset = opts.onPreparePreset;

  if (tab === 'forms') return {
    cols: ['Sev', 'Score', 'ID', 'Имя', 'Язык', 'Регион', 'Тип', 'Консент', 'Подписка', 'Email', 'VisitorID', 'Captcha', 'Редирект', 'CRIT', 'WARN', 'Рекомендации'],
    data: rows.map(function (r) {
      return {
        id: r.id, sev: r.severity,
        cells: [
          cell(r.severity, <span className="sev-chip">{r.severity}</span>),
          r.score, formIdCell(r, clusterByForm, R.clusters, onOpenDuplicate), r.name, r.language, r.region, r.formType,
          r.consentVersion, r.subscriptionVersion, r.hasEmail, r.hasVisitorId, r.captcha, r.redirect, r.crit, r.warn, r.recommendations
        ]
      };
    })
  };
  if (tab === 'problems') return {
    cols: ['Sev', 'Score', 'ID', 'Имя', 'Язык', 'CRIT', 'WARN', 'Рекомендации'],
    data: rows.filter(function (r) { return r.severity === 'CRIT' || r.severity === 'WARN'; })
      .map(function (r) { return { id: r.id, sev: r.severity, cells: [r.severity, r.score, r.id, r.name, r.language, r.crit, r.warn, r.recommendations] }; })
  };
  if (tab === 'redirects') return {
    cols: ['ID', 'Имя', 'Язык', 'Редирект', 'Проблема'],
    data: rows.filter(function (r) { return r.redirectIssue; })
      .map(function (r) { return { id: r.id, sev: r.severity, cells: [r.id, r.name, r.language, r.redirect, r.redirectIssue] }; })
  };
  if (tab === 'preset') return {
    cols: ['ID', 'Поле', 'Значение', 'Проблема', 'Действие'],
    data: R.presetIssuesAll.map(function (p, i) {
      return {
        id: 'preset-' + i, sev: 'CRIT',
        cells: [p.id, p.field, p.value, p.issue, cell(p.decision, (
          <button type="button" className="secondary" onClick={function () { onPreparePreset(p.field); }}>Подготовить bulk-правку</button>
        ))]
      };
    })
  };
  if (tab === 'dupes') return {
    cols: ['Сравнить', 'Язык', 'Форм', 'Категория', 'Различия', 'Ответственный', 'Решение', 'ID форм'],
    data: R.clusters.map(function (c, index) {
      var ownership = c.ownershipConflict
        ? cell('Ответственный различается', <span className="ownership-alert">Требует ручного review</span>)
        : 'Совпадает';
      return {
        id: 'dupe-' + index, sev: c.ownershipConflict ? 'CRIT' : 'INFO',
        cells: [
          cell('сравнить', <DuplicateButton cluster={c} index={index} onOpen={onOpenDuplicate} />),
          c.lang, c.size, DUPLICATE_LABELS[c.category] || 'дубль', c.differences || '', ownership, c.decision || '', c.ids.join(', ')
        ]
      };
    })
  };
  if (tab === 'anomalies') return {
    cols: ['Поле', 'В формах', 'Проблема', 'Решение'],
    data: R.anomalies.map(function (a, i) { return { id: 'anom-' + i, sev: 'WARN', cells: [a.field, a.count, a.flags, a.decision || 'Ручная проверка'] }; })
  };
  if (tab === 'consistency') return {
    cols: ['Тип формы', 'Поле', 'Присутствует', 'Обязательное', 'Замечание'],
    data: R.consistency.map(function (c, i) { return { id: 'cons-' + i, sev: 'WARN', cells: [c.formType, c.field, c.present, c.required, c.note] }; })
  };
  if (tab === 'agreements') return {
    cols: ['Agreement ID', 'Name', 'Вариантов текста', 'Форм', 'Действие'],
    data: R.agrConflicts.map(function (c) {
      return {
        id: 'agr-' + c.id, sev: 'CRIT',
        cells: [c.id, c.name, c.variants, c.forms, cell('bulk edit', (
          <button type="button" className="agreement-edit" onClick={function () { onOpenAgreement(c.id); }}>Унифицировать текст</button>
        ))]
      };
    })
  };
  if (tab === 'consent') return {
    cols: ['Язык', 'Ожидаемый', 'Фактический', 'Статус', 'ID'],
    data: rows.map(function (r) {
      var exp = R.expectedConsent[r.language] || '';
      var ok = r.consentVersion === exp;
      return { id: 'consent-' + r.id, sev: ok ? 'OK' : 'CRIT', cells: [r.language, exp, r.consentVersion || '(пусто)', ok ? 'OK' : 'ERROR', r.id] };
    })
  };
  if (tab === 'diff') return {
    cols: ['Тип изменения', 'ID', 'Детали'],
    data: (R.diffChanges || []).map(function (d, i) { return { id: 'diff-' + i, sev: 'INFO', cells: [d.type, d.id, d.detail] }; })
  };
  if (tab === 'history') return {
    cols: ['ID формы', 'История severity/консент'],
    data: (R.timelineRows || []).map(function (t, i) { return { id: 'hist-' + i, sev: 'INFO', cells: t }; })
  };
  return { cols: [], data: [] };
}
