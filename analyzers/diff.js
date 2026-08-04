/* ============================================================
   Дифф двух снапшотов. Возвращает список изменений:
   добавлена/удалена форма, изменён консент/редирект/severity,
   добавлено/удалено поле.
   ============================================================ */
export function buildSnapshot(rows) {
  var snap = {};
  rows.forEach(function (r) {
    snap[r.id] = {
      consentVersion: r.consentVersion, redirect: r.redirect,
      visibleFields: r.visibleFields, name: r.name, severity: r.severity, score: r.score
    };
  });
  return snap;
}

export function diffSnapshots(prevSnap, curSnap) {
  var changes = [];
  if (!prevSnap) return changes;
  var pIds = Object.keys(prevSnap), cIds = Object.keys(curSnap);

  cIds.filter(function (id) { return !prevSnap[id]; })
      .forEach(function (id) { changes.push({ type: 'Добавлена форма', id: id, detail: curSnap[id].name }); });
  pIds.filter(function (id) { return !curSnap[id]; })
      .forEach(function (id) { changes.push({ type: 'Удалена форма', id: id, detail: prevSnap[id].name }); });

  cIds.filter(function (id) { return prevSnap[id]; }).forEach(function (id) {
    var p = prevSnap[id], c = curSnap[id];
    if (p.consentVersion != null && p.consentVersion !== c.consentVersion)
      changes.push({ type: 'Изменён консент', id: id, detail: (p.consentVersion || '—') + ' -> ' + (c.consentVersion || '—') });
    if (p.redirect != null && p.redirect !== c.redirect)
      changes.push({ type: 'Изменён редирект', id: id, detail: (p.redirect || '—') + ' -> ' + (c.redirect || '—') });
    if (p.severity != null && p.severity !== c.severity)
      changes.push({ type: 'Изменён severity', id: id, detail: (p.severity || '—') + ' -> ' + (c.severity || '—') });
    if (p.visibleFields != null && p.visibleFields !== c.visibleFields) {
      var pf = p.visibleFields.split(', '), cf = c.visibleFields.split(', ');
      var ad = cf.filter(function (x) { return pf.indexOf(x) === -1; });
      var rm = pf.filter(function (x) { return cf.indexOf(x) === -1; });
      if (ad.length) changes.push({ type: 'Добавлено поле', id: id, detail: ad.join(', ') });
      if (rm.length) changes.push({ type: 'Удалено поле', id: id, detail: rm.join(', ') });
    }
  });
  return changes;
}
