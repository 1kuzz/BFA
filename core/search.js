/* ============================================================
   Поиск форм по тексту вопросов.
   Человек пишет вопрос как он выглядит в форме («Email»),
   и остаются только формы, где такой вопрос есть, — на языке
   запроса и отсортированные по совпадению. Каждый следующий
   вопрос сужает выборку (логика И).
   Плюс подбор форм с тем же набором полей и языком, но другими
   формулировками — чтобы унифицировать тексты.
   ============================================================ */
import { detectLanguage, normalizeText, stemKey, tokenize } from './lang.js';

/* Понятия, которые в формах называют по-разному на разных языках.
   Нужны, чтобы «почта» находила «Email», а «телефон» — «Mobile». */
var CONCEPTS = {
  email: 'email mail e-mail почта почты эл электронная courriel correo electronico posta elettronica correio eletronico e-posta пошта поща',
  phone: 'phone telephone mobile cell телефон мобильный telefon teléfono telefono telefone téléphone portable celular komórka cep ұялы мобільний',
  firstName: 'first name firstname given name имя vorname prénom prenom nombre nome voornaam imię keresztnév etunimi förnamn fornavn ім я аты',
  lastName: 'last name lastname surname family name фамилия nachname nom apellido cognome sobrenome achternaam nazwisko soyad příjmení prezime тегі прізвище',
  fullName: 'full name name имя фамилия name naam nome nombre isim ад',
  company: 'company organization employer компания организация unternehmen firma société societe empresa azienda bedrijf şirket společnost cég företag virksomhed yritys компанія ұйым',
  country: 'country страна land pays país paese ülke země ország maa země країна ел',
  city: 'city town город stadt ville ciudad città cidade şehir město város kaupunki місто қала',
  jobTitle: 'job title position role должность berufsbezeichnung fonction poste cargo ruolo functie stanowisko pozice beosztás befattning посада лауазым',
  industry: 'industry sector отрасль branche secteur sector settore branża odvětví iparág toimiala галузь сала',
  message: 'message comment question сообщение комментарий вопрос nachricht kommentar frage message commentaire mensaje comentario messaggio bericht wiadomość zpráva üzenet viesti повідомлення хабарлама',
  consent: 'consent agree privacy согласие согласен конфиденциальности einwilligung datenschutz consentement confidentialité consentimiento privacidad consenso toestemming zgoda souhlas hozzájárulás згода келісім',
  subscription: 'subscribe subscription newsletter подписка рассылка abonnieren newsletter abonnement suscripción iscrizione abonneren subskrypcja odběr feliratkozás підписка жазылу',
  website: 'website site url сайт webseite site web sitio sito website strona web weboldal сайт',
  department: 'department отдел abteilung service departamento reparto afdeling dział oddělení részleg відділ бөлім',
  employees: 'employees company size сотрудников сотрудники mitarbeiter salariés empleados dipendenti medewerkers pracowników zaměstnanců alkalmazottak співробітників қызметкерлер',
  budget: 'budget бюджет budget presupuesto budżet rozpočet költségvetés бюджет'
};

var CONCEPT_INDEX = {}, CONCEPT_STEMS = {};
Object.keys(CONCEPTS).forEach(function (concept) {
  tokenize(CONCEPTS[concept]).forEach(function (word) {
    if (word.length < 2) return;
    (CONCEPT_INDEX[word] = CONCEPT_INDEX[word] || {})[concept] = true;
    var stem = stemKey(word);
    if (stem) (CONCEPT_STEMS[stem] = CONCEPT_STEMS[stem] || {})[concept] = true;
  });
});

/* Понятия текста. Падежи и склонения ловим по основе слова:
   «Название компании» должно находить «Company name». */
export function conceptsOf(text) {
  var found = {};
  tokenize(text).forEach(function (word) {
    var concepts = CONCEPT_INDEX[word] || CONCEPT_STEMS[stemKey(word)] || {};
    Object.keys(concepts).forEach(function (concept) { found[concept] = true; });
  });
  return Object.keys(found);
}

function trigrams(value) {
  var padded = '  ' + value + ' ', out = [];
  for (var i = 0; i < padded.length - 2; i++) out.push(padded.slice(i, i + 3));
  return out;
}

function diceSets(a, b) {
  if (!a.length || !b.length) return 0;
  var counts = {}, shared = 0;
  a.forEach(function (item) { counts[item] = (counts[item] || 0) + 1; });
  b.forEach(function (item) { if (counts[item] > 0) { counts[item]--; shared++; } });
  return 2 * shared / (a.length + b.length);
}

/* Расстояние Дамерау — Левенштейна: опечатки и перестановки букв
   («emial» вместо «email») не должны прятать форму от человека. */
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  var matrix = [], i, j;
  for (i = 0; i <= a.length; i++) matrix[i] = [i];
  for (j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      var cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }
  return matrix[a.length][b.length];
}

function tokenSimilarity(a, b) {
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) return 0;
  var distance = editDistance(a, b), longest = Math.max(a.length, b.length);
  var score = 1 - distance / longest;
  return score > 0 ? score : 0;
}

/* Каждое слово запроса ищем в подписи вопроса с допуском на опечатку. */
function alignTokens(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  var total = tokensA.reduce(function (acc, token) {
    var best = 0;
    tokensB.forEach(function (other) { best = Math.max(best, tokenSimilarity(token, other)); });
    return acc + best;
  }, 0);
  return total / tokensA.length;
}

/* Похожесть двух строк: 0..1. Точное совпадение, вхождение слова,
   пересечение слов, опечатки (триграммы + расстояние правок). */
export function similarity(left, right) {
  var a = normalizeText(left), b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  var tokensA = a.split(' '), tokensB = b.split(' ');
  var best = 0;
  if (tokensB.indexOf(a) > -1 || tokensA.indexOf(b) > -1) best = 0.9;
  else if (b.indexOf(a) > -1 || a.indexOf(b) > -1) best = Math.max(best, 0.78);
  best = Math.max(best, 0.88 * diceSets(tokensA, tokensB));
  best = Math.max(best, 0.8 * diceSets(trigrams(a), trigrams(b)));
  best = Math.max(best, 0.86 * alignTokens(tokensA, tokensB));
  return Math.round(best * 1000) / 1000;
}

function questionsOf(row) {
  if (Array.isArray(row.questions) && row.questions.length) return row.questions;
  // результаты старых прогонов: названий вопросов нет, есть только поля
  return String(row.visibleFields || '').split(', ').filter(Boolean).map(function (name) {
    return { name: name, label: name, required: false, visible: true };
  });
}

/* Насколько вопрос формы отвечает введённому тексту. */
export function questionScore(query, question) {
  var label = question.label || question.name || '';
  // CONTACT_UF_CRM_COMPANY -> «company»: техническое имя тоже ищем
  var key = String(question.name || '').replace(/^CONTACT_/, '').replace(/^UF_CRM_/, '').replace(/_/g, ' ');
  var score = similarity(query, label), via = 'label';

  var byKey = 0.86 * similarity(query, key);
  if (byKey > score) { score = byKey; via = 'field'; }

  if (score < 0.72) {
    var queryConcepts = conceptsOf(query);
    if (queryConcepts.length) {
      var target = conceptsOf(label + ' ' + key);
      var shared = queryConcepts.filter(function (concept) { return target.indexOf(concept) > -1; });
      if (shared.length) { score = 0.72; via = 'concept'; }
    }
  }
  return { score: Math.round(score * 1000) / 1000, via: via };
}

export function bestQuestionMatch(query, row) {
  var best = null;
  questionsOf(row).forEach(function (question) {
    var scored = questionScore(query, question);
    if (!best || scored.score > best.score) {
      best = {
        query: query, name: question.name, label: question.label || question.name,
        required: !!question.required, visible: question.visible !== false,
        score: scored.score, via: scored.via
      };
    }
  });
  return best;
}

/* Язык формы для фильтрации: сначала распознанный по контенту. */
export function formLocale(row) {
  return row.localeKey || row.contentLanguage || row.language || '';
}

export function formSignature(row) {
  return String(row.visibleFields || '').split(', ').filter(Boolean).sort().join('\u001f');
}

/* Поиск форм по списку вопросов.
   options: {language: 'auto' | '' (любой) | код, threshold}
   Возвращает язык, по которому отфильтровали, результаты по убыванию
   совпадения и раскладку кандидатов по языкам — чтобы UI мог
   предложить переключиться. */
export function searchForms(rows, queries, options) {
  var config = options || {};
  var threshold = config.threshold == null ? 0.5 : config.threshold;
  var list = (queries || []).map(function (query) { return String(query == null ? '' : query).trim(); })
    .filter(Boolean);
  var pool = Array.isArray(rows) ? rows : [];

  if (!list.length) {
    return {
      queries: [], language: '', languageSource: 'none', results: [],
      languageCounts: [], scanned: pool.length, total: pool.length
    };
  }

  var candidates = [];
  pool.forEach(function (row) {
    var matches = list.map(function (query) { return bestQuestionMatch(query, row); });
    if (matches.some(function (match) { return !match || match.score < threshold; })) return;
    var sum = matches.reduce(function (acc, match) { return acc + match.score; }, 0);
    candidates.push({
      id: row.id, row: row, locale: formLocale(row),
      score: Math.round(sum / matches.length * 1000) / 1000,
      exact: matches.every(function (match) { return match.score >= 0.999; }),
      matches: matches
    });
  });

  var counts = {};
  candidates.forEach(function (candidate) {
    var key = candidate.locale || '';
    counts[key] = (counts[key] || 0) + 1;
  });

  var requested = config.language == null ? 'auto' : config.language;
  var language = '', languageSource = 'any';
  if (requested === 'auto') {
    var detected = detectLanguage(list.join(' '));
    if (detected.confident) {
      language = detected.language; languageSource = 'query';
    } else {
      // язык запроса неоднозначен (Telefon — это и de, и pl, и cs) —
      // берём язык самого точного совпадения, переключить можно вручную
      var bestByLocale = {};
      candidates.forEach(function (candidate) {
        if (!candidate.locale) return;
        if (!bestByLocale[candidate.locale] || candidate.score > bestByLocale[candidate.locale]) {
          bestByLocale[candidate.locale] = candidate.score;
        }
      });
      var dominant = Object.keys(bestByLocale).sort(function (a, b) {
        if (bestByLocale[b] !== bestByLocale[a]) return bestByLocale[b] - bestByLocale[a];
        if (counts[b] !== counts[a]) return counts[b] - counts[a];
        return a < b ? -1 : 1;
      })[0];
      if (dominant) { language = dominant; languageSource = 'matches'; }
    }
  } else if (requested) {
    language = String(requested).toLowerCase();
    languageSource = 'manual';
  }

  var results = language ? candidates.filter(function (candidate) { return candidate.locale === language; }) : candidates;
  results.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if (a.row.visibleCount !== b.row.visibleCount) return a.row.visibleCount - b.row.visibleCount;
    return String(a.row.name).localeCompare(String(b.row.name), 'ru');
  });

  return {
    queries: list, language: language, languageSource: languageSource,
    results: results, scanned: candidates.length, total: pool.length,
    languageCounts: Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
      .map(function (key) { return { language: key, count: counts[key] }; })
  };
}

/* Формы с тем же набором полей и тем же языком, но другими
   формулировками вопросов. Основа для унификации текстов. */
export function wordingVariants(rows, results, options) {
  var config = options || {};
  var pool = Array.isArray(rows) ? rows : [];
  var matched = {}, groups = [];
  (results || []).forEach(function (result) { matched[result.id || result] = true; });

  var focusFields = {};
  (results || []).forEach(function (result) {
    (result.matches || []).forEach(function (match) { focusFields[match.name] = true; });
  });
  var limitToFocus = Object.keys(focusFields).length > 0;

  if (!Object.keys(matched).length) return groups;

  var buckets = {};
  pool.forEach(function (row) {
    var signature = formSignature(row);
    if (!signature) return;
    var key = formLocale(row) + '\u001f' + signature;
    (buckets[key] = buckets[key] || []).push(row);
  });

  Object.keys(buckets).forEach(function (key) {
    var group = buckets[key];
    if (group.length < 2) return;
    if (!group.some(function (row) { return matched[row.id]; })) return;

    var labelsByField = {};
    group.forEach(function (row) {
      questionsOf(row).forEach(function (question) {
        if (limitToFocus && !focusFields[question.name]) return;
        var field = labelsByField[question.name] = labelsByField[question.name] || {};
        var label = question.label || question.name;
        (field[label] = field[label] || []).push(row.id);
      });
    });

    var questions = Object.keys(labelsByField).filter(function (name) {
      return Object.keys(labelsByField[name]).length > 1;
    }).map(function (name) {
      return {
        name: name,
        variants: Object.keys(labelsByField[name]).map(function (label) {
          return { label: label, ids: labelsByField[name][label], count: labelsByField[name][label].length };
        }).sort(function (a, b) { return b.count - a.count; })
      };
    }).sort(function (a, b) { return b.variants.length - a.variants.length; });

    if (!questions.length) return;
    groups.push({
      locale: key.split('\u001f')[0], signature: group[0].visibleFields,
      size: group.length, ids: group.map(function (row) { return row.id; }),
      matchedIds: group.filter(function (row) { return matched[row.id]; }).map(function (row) { return row.id; }),
      forms: group.map(function (row) {
        var labels = {};
        questions.forEach(function (question) {
          var found = questionsOf(row).find(function (item) { return item.name === question.name; });
          labels[question.name] = found ? (found.label || found.name) : '—';
        });
        return { id: row.id, name: row.name, matched: !!matched[row.id], labels: labels };
      }),
      questions: questions
    });
  });

  groups.sort(function (a, b) {
    if (b.questions.length !== a.questions.length) return b.questions.length - a.questions.length;
    return b.size - a.size;
  });
  return groups;
}
