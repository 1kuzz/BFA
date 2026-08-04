function list(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split(',');
}

function normalized(value) {
  return list(value).map(function (x) { return String(x).trim().toLowerCase(); }).filter(Boolean);
}

export function formTraits(form) {
  var data = (form || {}).data || {};
  var name = String((form || {}).name || (form || {}).NAME || data.name || '');
  return {
    language: String(data.language || (form || {}).language || (form || {}).LANGUAGE || '').trim().toLowerCase(),
    region: String(data.region || (form || {}).region || (form || {}).REGION || name.split(/[_|]/)[0] || '').trim().toLowerCase()
  };
}

export function shouldExcludeForm(form, exclusions) {
  var traits = formTraits(form), config = exclusions || {};
  return normalized(config.languages).indexOf(traits.language) > -1 ||
    normalized(config.regions).indexOf(traits.region) > -1;
}
