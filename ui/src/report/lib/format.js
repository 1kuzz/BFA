export function distrib(rows, key) {
  var map = {};
  rows.forEach(function (r) {
    var v = (r[key] === '' || r[key] == null) ? '(пусто)' : r[key];
    map[v] = (map[v] || 0) + 1;
  });
  return Object.keys(map)
    .sort(function (a, b) { return map[b] - map[a]; })
    .map(function (v) { return [v, map[v]]; });
}

export function topWithOther(data, limit) {
  if (data.length <= limit) return data;
  return data.slice(0, limit).concat([
    ['Остальные', data.slice(limit).reduce(function (sum, item) { return sum + item[1]; }, 0)]
  ]);
}

export function formatValue(value) {
  if (value === undefined) return 'undefined';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function stateLabel(values) {
  var unique = {};
  values.forEach(function (value) { unique[String(value)] = true; });
  if (Object.keys(unique).length > 1) return 'Смешано';
  return values[0] ? 'Да' : 'Нет';
}

export var DUPLICATE_LABELS = {
  full_duplicate: 'полный дубль',
  redirect_only: 'только другой редирект',
  ownership_variant: 'одинаковые поля, разный ответственный',
  field_variant: 'одинаковые поля, другие настройки',
  near_duplicate: 'почти-дубль (поля)'
};

export function duplicatePreview(cluster) {
  var rows = (cluster.diffMatrix || []).slice(0, 5).map(function (row) {
    return row.label + ': ' + cluster.ids.map(function (id) { return '#' + id + '=' + row.values[id]; }).join(' / ');
  });
  return rows.length ? rows.join('\n') : 'Все анализируемые поля и настройки совпадают';
}
