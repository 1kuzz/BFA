import { normalizeLanguage } from './lang.js';

function list(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split(',');
}

function normalized(value) {
  return list(value).map(function (x) { return String(x).trim().toLowerCase(); }).filter(Boolean);
}

/* Языки сравниваем канонично: 'EN-US', 'eng' и 'English' — один язык.
   Неизвестные коды (например 'la' для LATAM) остаются как есть. */
function normalizedLanguages(value) {
  return normalized(value).map(normalizeLanguage);
}

export function formTraits(form) {
  var data = (form || {}).data || {};
  var name = String((form || {}).name || (form || {}).NAME || data.name || '');
  return {
    language: normalizeLanguage(data.language || (form || {}).language || (form || {}).LANGUAGE || ''),
    region: String(data.region || (form || {}).region || (form || {}).REGION || name.split(/[_|]/)[0] || '').trim().toLowerCase()
  };
}

export function shouldExcludeForm(form, exclusions) {
  var traits = formTraits(form), config = exclusions || {};
  return normalizedLanguages(config.languages).indexOf(traits.language) > -1 ||
    normalized(config.regions).indexOf(traits.region) > -1;
}
