var KINDS = ['name', 'title', 'buttonCaption', 'successUrl', 'preset', 'required', 'visible'];

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function target(options, operation) {
  if (operation.kind === 'name') return { object: options, key: 'name' };
  if (operation.kind === 'title' || operation.kind === 'buttonCaption') {
    options.data = options.data || {};
    return { object: options.data, key: operation.kind };
  }
  if (operation.kind === 'successUrl') {
    options.result = options.result || {};
    options.result.success = options.result.success || {};
    return { object: options.result.success, key: 'url' };
  }
  if (operation.kind === 'preset') {
    var preset = (options.presetFields || []).find(function (item) {
      return item.fieldName === operation.field;
    });
    if (!preset) throw new Error('Preset-поле ' + operation.field + ' отсутствует');
    return { object: preset, key: 'value' };
  }
  var field = ((options.data || {}).fields || []).find(function (item) {
    return item.name === operation.field;
  });
  if (!field) throw new Error('Поле ' + operation.field + ' отсутствует');
  return { object: field, key: operation.kind };
}

export function normalizeOperation(operation) {
  var out = {
    formId: String((operation || {}).formId || ''),
    kind: String((operation || {}).kind || ''),
    field: String((operation || {}).field || '').trim(),
    value: operation && operation.value
  };
  if (!/^\d+$/.test(out.formId)) throw new Error('Некорректный ID формы');
  if (KINDS.indexOf(out.kind) === -1) throw new Error('Неподдерживаемое изменение');
  if (out.kind === 'preset' && !/^[A-Z0-9_]+$/.test(out.field)) {
    throw new Error('Некорректное имя preset-поля');
  }
  if ((out.kind === 'required' || out.kind === 'visible') && !out.field) {
    throw new Error('Укажите поле формы');
  }
  if (out.kind === 'required' || out.kind === 'visible') {
    if (out.value !== true && out.value !== false) throw new Error('Значение должно быть true или false');
  } else {
    out.value = String(out.value == null ? '' : out.value).trim();
    if (out.value.length > 2000) throw new Error('Значение слишком длинное');
    if (out.kind === 'name' && !out.value) throw new Error('Имя формы не может быть пустым');
    if (out.kind === 'successUrl' && out.value) {
      var url;
      try { url = new URL(out.value); } catch (e) { throw new Error('Некорректный URL'); }
      if (url.protocol !== 'https:') throw new Error('Редирект должен использовать HTTPS');
    }
  }
  return out;
}

export function readEditValue(options, operation) {
  var copy = clone(options);
  var ref = target(copy, normalizeOperation(operation));
  return ref.object[ref.key];
}

export function applyEdit(options, operation) {
  var normalized = normalizeOperation(operation);
  var result = clone(options);
  var ref = target(result, normalized);
  var before = ref.object[ref.key];
  ref.object[ref.key] = normalized.value;
  return { options: result, operation: normalized, before: before, after: normalized.value };
}

export function editRisk(operation) {
  if (operation.kind === 'visible' || operation.kind === 'required') return 'HIGH';
  if (operation.kind === 'successUrl' || operation.kind === 'preset') return 'MEDIUM';
  return 'LOW';
}
