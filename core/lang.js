/* ============================================================
   Язык формы. Нормализация кодов + определение языка по
   содержимому (скрипт, словарь частотных слов форм,
   диакритика). Нужен, чтобы локализованная копия формы
   считалась отдельной формой, а не дублем: набор технических
   полей (CONTACT_EMAIL и т.п.) у переводов совпадает, а вот
   тексты вопросов — нет.
   ============================================================ */

export var LANGUAGE_NAMES = {
  en: 'English', ru: 'Русский', de: 'Deutsch', fr: 'Français', es: 'Español',
  it: 'Italiano', pt: 'Português', nl: 'Nederlands', pl: 'Polski', tr: 'Türkçe',
  cs: 'Čeština', ro: 'Română', hu: 'Magyar', sv: 'Svenska', da: 'Dansk',
  fi: 'Suomi', el: 'Ελληνικά', uk: 'Українська', bg: 'Български', sr: 'Srpski',
  kk: 'Қазақша', ar: 'العربية', he: 'עברית', zh: '中文', ja: '日本語',
  ko: '한국어', th: 'ไทย'
};

/* Синонимы кодов: ISO-639-2/3, англоязычные названия, локали.
   Кодов стран здесь намеренно нет — 'br' это не 'pt', и профильные
   исключения по языкам не должны срабатывать шире, чем настроено. */
var ALIAS_GROUPS = {
  en: ['eng', 'english', 'anglais'], ru: ['rus', 'russian', 'russkiy'],
  de: ['deu', 'ger', 'german', 'deutsch'], fr: ['fra', 'fre', 'french', 'francais'],
  es: ['esp', 'spa', 'spanish', 'espanol'], it: ['ita', 'italian', 'italiano'],
  pt: ['por', 'portuguese', 'portugues'], nl: ['nld', 'dut', 'dutch'],
  pl: ['pol', 'polish', 'polski'], tr: ['tur', 'turkish', 'turkce'],
  cs: ['ces', 'cze', 'czech', 'cestina'], ro: ['ron', 'rum', 'romanian'],
  hu: ['hun', 'hungarian', 'magyar'], sv: ['swe', 'swedish', 'svenska'],
  da: ['dan', 'danish'], fi: ['fin', 'finnish', 'suomi'],
  el: ['ell', 'gre', 'greek'], uk: ['ukr', 'ukrainian'],
  bg: ['bul', 'bulgarian'], sr: ['srp', 'serbian'], kk: ['kaz', 'kazakh'],
  ar: ['ara', 'arabic'], he: ['heb', 'hebrew', 'iw'], zh: ['zho', 'chi', 'chinese'],
  ja: ['jpn', 'japanese'], ko: ['kor', 'korean'], th: ['tha', 'thai']
};

var ALIAS = {};
Object.keys(LANGUAGE_NAMES).forEach(function (code) { ALIAS[code] = code; });
Object.keys(ALIAS_GROUPS).forEach(function (code) {
  ALIAS_GROUPS[code].forEach(function (alias) { ALIAS[alias] = code; });
});

/* Словарь частотных слов веб-форм: подписи полей, кнопки,
   тексты благодарности и согласий. Хранится строками ради
   компактности, нормализуется при инициализации модуля. */
var VOCABULARY = {
  en: 'email name first last surname phone telephone mobile company organization country city job title position industry message comment question request submit send subscribe download thank agree privacy policy consent required please your work business address website department employees budget product',
  ru: 'почта почты электронная эл имя фамилия отчество телефон мобильный компания организация страна город должность отрасль сообщение комментарий вопрос запрос отправить подписаться скачать спасибо согласен согласие конфиденциальности политика обязательное пожалуйста ваш ваша рабочий рабочая адрес сайт отдел сотрудников бюджет продукт',
  de: 'vorname nachname name telefon mobil unternehmen firma organisation land stadt position berufsbezeichnung branche nachricht kommentar frage anfrage senden absenden abonnieren herunterladen danke einverstanden einwilligung datenschutz pflichtfeld bitte ihre ihr geschäftlich adresse webseite abteilung mitarbeiter budget produkt',
  fr: 'prénom nom téléphone portable entreprise société organisation pays ville fonction poste secteur message commentaire question demande envoyer soumettre abonner télécharger merci accepte consentement confidentialité obligatoire veuillez votre professionnel adresse site service salariés budget produit courriel',
  es: 'nombre apellido apellidos teléfono móvil empresa compañía organización país ciudad cargo puesto sector mensaje comentario pregunta solicitud enviar suscribir descargar gracias acepto consentimiento privacidad obligatorio por favor correo electrónico dirección sitio departamento empleados presupuesto producto',
  it: 'nome cognome telefono cellulare azienda società organizzazione paese città ruolo posizione settore messaggio commento domanda richiesta invia inviare iscriviti scarica grazie accetto consenso privacy obbligatorio favore tuo indirizzo sito reparto dipendenti budget prodotto posta elettronica',
  pt: 'nome sobrenome telefone celular empresa organização país cidade cargo setor mensagem comentário pergunta solicitação enviar assinar baixar obrigado aceito consentimento privacidade obrigatório seu endereço site departamento funcionários orçamento produto correio eletrônico',
  nl: 'voornaam achternaam naam telefoon mobiel bedrijf organisatie land stad functie branche bericht opmerking vraag aanvraag verzenden versturen abonneren downloaden bedankt akkoord toestemming privacy verplicht alstublieft zakelijk adres website afdeling medewerkers budget product',
  pl: 'imię nazwisko telefon komórka firma organizacja kraj miasto stanowisko branża wiadomość komentarz pytanie zapytanie wyślij wysłać subskrybuj pobierz dziękujemy zgadzam zgoda prywatności wymagane proszę twój służbowy adres strona dział pracowników budżet produkt',
  tr: 'ad soyad isim telefon cep şirket firma kuruluş ülke şehir pozisyon görev sektör mesaj yorum soru talep gönder abone indir teşekkür kabul onay gizlilik zorunlu lütfen adres site departman çalışan bütçe ürün posta',
  cs: 'jméno příjmení telefon mobil společnost firma organizace země město pozice odvětví zpráva komentář otázka žádost odeslat odebírat stáhnout děkujeme souhlasím souhlas soukromí povinné prosím váš pracovní adresa oddělení zaměstnanců rozpočet produkt',
  ro: 'prenume nume telefon mobil companie firmă organizație țară oraș funcție industrie mesaj comentariu întrebare solicitare trimite abonare descarcă mulțumim accept consimțământ confidențialitate obligatoriu vă rugăm adresă departament angajați buget produs',
  hu: 'keresztnév vezetéknév név telefon mobil cég vállalat szervezet ország város beosztás iparág üzenet megjegyzés kérdés kérés küldés feliratkozás letöltés köszönjük elfogadom hozzájárulás adatvédelmi kötelező kérjük cím weboldal részleg alkalmazottak költségvetés termék',
  sv: 'förnamn efternamn namn telefon mobil företag organisation land stad befattning bransch meddelande kommentar fråga förfrågan skicka prenumerera ladda tack godkänner samtycke integritet obligatoriskt vänligen adress webbplats avdelning anställda budget produkt',
  da: 'fornavn efternavn navn telefon mobil virksomhed organisation land by stilling branche besked kommentar spørgsmål forespørgsel send tilmeld hent tak accepterer samtykke privatliv påkrævet venligst adresse hjemmeside afdeling medarbejdere budget produkt',
  fi: 'etunimi sukunimi nimi puhelin matkapuhelin yritys organisaatio maa kaupunki tehtävä toimiala viesti kommentti kysymys pyyntö lähetä tilaa lataa kiitos hyväksyn suostumus tietosuoja pakollinen osoite verkkosivusto osasto työntekijät budjetti tuote',
  el: 'όνομα επώνυμο τηλέφωνο κινητό εταιρεία οργανισμός χώρα πόλη θέση κλάδος μήνυμα σχόλιο ερώτηση αίτημα αποστολή εγγραφή λήψη ευχαριστούμε αποδέχομαι συγκατάθεση απορρήτου υποχρεωτικό διεύθυνση ιστότοπος τμήμα υπάλληλοι προϊόν',
  uk: 'ім я прізвище телефон мобільний компанія організація країна місто посада галузь повідомлення коментар питання запит надіслати підписатися завантажити дякуємо згоден згода конфіденційності обов язкове будь ласка ваш робочий адреса сайт відділ співробітників бюджет продукт пошта електронна',
  bg: 'име фамилия телефон мобилен компания организация държава град длъжност бранш съобщение коментар въпрос заявка изпрати абонирай изтегли благодарим съгласен съгласие поверителност задължително моля вашият работен адрес сайт отдел служители бюджет продукт поща електронна',
  sr: 'ime prezime telefon mobilni kompanija organizacija zemlja grad pozicija delatnost poruka komentar pitanje zahtev pošalji pretplati preuzmi hvala prihvatam saglasnost privatnosti obavezno molimo adresa sajt odeljenje zaposleni budžet proizvod',
  kk: 'аты тегі әкесінің телефон ұялы компания ұйым ел қала лауазым сала хабарлама пікір сұрақ өтініш жіберу жазылу жүктеу рақмет келісемін келісім құпиялылық міндетті өтінеміз жұмыс мекенжай сайт бөлім қызметкерлер бюджет өнім'
};

/* Диакритика и специфические буквы: слабый, но независимый сигнал. */
var CHAR_HINTS = {
  de: /[äöüß]/gi, fr: /[éèêëàâçôœùû]/gi, es: /[ñ¿¡áíóú]/gi, it: /[àèìòù]/gi,
  pt: /[ãõçáêó]/gi, pl: /[ąćęłńśźż]/gi, tr: /[şğıİçöü]/g, cs: /[čřžěůýáíé]/gi,
  ro: /[ăâîșț]/gi, hu: /[őűáéíóöúü]/gi, sv: /[åäö]/gi, da: /[æøå]/gi,
  fi: /[äöå]/gi, ru: /[ыъэё]/gi, uk: /[іїєґ]/gi, bg: /[щъ]/gi,
  kk: /[әғқңөұүһі]/gi
};

var SCRIPT_RANGES = [
  ['cyrillic', /[Ѐ-ӿ]/g], ['greek', /[Ͱ-Ͽ]/g],
  ['hebrew', /[֐-׿]/g], ['arabic', /[؀-ۿ]/g],
  ['kana', /[぀-ヿ]/g], ['hangul', /[가-힯ᄀ-ᇿ]/g],
  ['han', /[一-鿿]/g], ['thai', /[฀-๿]/g],
  ['latin', /[A-Za-zÀ-ɏ]/g]
];

var SCRIPT_LANGS = {
  latin: ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'tr', 'cs', 'ro', 'hu', 'sv', 'da', 'fi', 'sr'],
  cyrillic: ['ru', 'uk', 'bg', 'sr', 'kk'], greek: ['el'], arabic: ['ar'],
  hebrew: ['he'], han: ['zh'], kana: ['ja'], hangul: ['ko'], thai: ['th']
};

/* Детерминированный порядок при равных очках. */
var PRIORITY = ['en', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'tr', 'cs', 'uk',
  'ro', 'hu', 'sv', 'da', 'fi', 'el', 'bg', 'sr', 'kk', 'ar', 'he', 'zh', 'ja', 'ko', 'th'];

/* Приводим текст к сравнимому виду: нижний регистр, без диакритики,
   ё -> е, всё кроме букв и цифр — разделитель. */
export function normalizeText(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenize(value) {
  var normalized = normalizeText(value);
  return normalized ? normalized.split(' ') : [];
}

/* Грубая основа слова: словарь не может перечислить все падежи
   («компании» / «компания» / «компанию»), поэтому длинные слова
   сравниваем ещё и по первым буквам. */
export function stemKey(word) {
  return String(word || '').length >= 6 ? String(word).slice(0, 5) : '';
}

var WORD_INDEX = {}, STEM_INDEX = {};
Object.keys(VOCABULARY).forEach(function (language) {
  tokenize(VOCABULARY[language]).forEach(function (word) {
    if (word.length < 2) return;
    (WORD_INDEX[word] = WORD_INDEX[word] || []).push(language);
    var stem = stemKey(word);
    if (stem) {
      var languages = STEM_INDEX[stem] = STEM_INDEX[stem] || [];
      if (languages.indexOf(language) < 0) languages.push(language);
    }
  });
});

/* Код языка -> канонический код. Неизвестные коды возвращаются как есть
   (профильные исключения вроде 'la' продолжают работать). */
export function normalizeLanguage(value) {
  var raw = String(value == null ? '' : value).trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return '';
  if (ALIAS[raw]) return ALIAS[raw];
  var base = raw.split('-')[0];
  return ALIAS[base] || base;
}

export function isKnownLanguage(code) {
  return !!LANGUAGE_NAMES[normalizeLanguage(code)];
}

export function languageLabel(code) {
  var normalized = normalizeLanguage(code);
  if (!normalized) return '(не определён)';
  return LANGUAGE_NAMES[normalized] ? LANGUAGE_NAMES[normalized] + ' · ' + normalized : normalized;
}

export function detectScript(text) {
  var raw = String(text || ''), best = '', bestCount = 0;
  SCRIPT_RANGES.forEach(function (entry) {
    var found = raw.match(entry[1]);
    var count = found ? found.length : 0;
    if (count > bestCount) { bestCount = count; best = entry[0]; }
  });
  return bestCount ? best : 'unknown';
}

/* Определение языка по тексту.
   Возвращает {language, confidence, script, hits, confident}.
   hits — сколько разных словарных слов нашлось: одно слово это ещё
   не язык, поэтому переопределять объявленный язык одним попаданием
   мы не будем (см. resolveFormLanguage). */
export function detectLanguage(text) {
  var raw = String(text == null ? '' : text);
  var script = detectScript(raw);
  var scores = {}, hits = 0, seen = {};

  function add(language, value) { scores[language] = (scores[language] || 0) + value; }

  tokenize(raw).forEach(function (token) {
    if (seen[token]) return;
    seen[token] = true;
    var languages = WORD_INDEX[token], exact = true;
    if (!languages) { languages = STEM_INDEX[stemKey(token)]; exact = false; }
    if (!languages) return;
    hits++;
    // слово из одного языка весит больше, чем общее для нескольких,
    // а попадание по основе — меньше, чем точное
    var weight = (1 + 3 / languages.length) * (exact ? 1 : 0.6);
    languages.forEach(function (language) { add(language, weight); });
  });

  Object.keys(CHAR_HINTS).forEach(function (language) {
    var found = raw.match(CHAR_HINTS[language]);
    if (found) add(language, Math.min(3, found.length) * 0.6);
  });

  var allowed = SCRIPT_LANGS[script];
  if (allowed) {
    Object.keys(scores).forEach(function (language) {
      if (allowed.indexOf(language) < 0) delete scores[language];
    });
    // сам по себе не-латинский скрипт уже говорит о локализации
    if (!Object.keys(scores).length && script !== 'latin') add(allowed[0], 1);
  }

  var ranked = Object.keys(scores).sort(function (a, b) {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    return PRIORITY.indexOf(a) - PRIORITY.indexOf(b);
  });
  if (!ranked.length) return { language: '', confidence: 0, script: script, hits: 0, confident: false };

  var top = scores[ranked[0]], second = ranked[1] ? scores[ranked[1]] : 0;
  var confidence = Math.min(0.98, 0.45 + 0.5 * (top - second) / top);
  var nonLatin = script !== 'latin' && script !== 'unknown';
  if (nonLatin) confidence = Math.max(confidence, 0.6);
  return {
    language: ranked[0], confidence: Math.round(confidence * 100) / 100,
    script: script, hits: hits, confident: nonLatin || (hits >= 1 && confidence >= 0.5)
  };
}

/* Имя формы вида REGION_lang_TYPE_COLOR_PRODUCT: второй сегмент. */
export function languageFromFormName(name) {
  var parts = String(name || '').split(/[_|]/).map(function (part) { return part.trim(); }).filter(Boolean);
  var candidate = normalizeLanguage(parts[1] || '');
  return LANGUAGE_NAMES[candidate] ? candidate : '';
}

/* Итоговый язык формы.
   language     — что показываем (объявленный > из имени > из контента)
   contentLanguage — что реально написано в вопросах формы
   localeKey    — ключ, по которому формы считаются «одной и той же формой»;
                  именно он разводит локализации по разным группам */
export function resolveFormLanguage(input) {
  var source = input || {};
  var declared = normalizeLanguage(source.declared);
  var named = languageFromFormName(source.name);
  var texts = Array.isArray(source.texts) ? source.texts : [source.texts];
  var content = detectLanguage(texts.filter(Boolean).join(' \n '));
  var base = declared || named || '';
  var contentLanguage = content.confident ? content.language : '';

  // объявленный язык переопределяем только на уверенном сигнале:
  // другой скрипт или минимум два словарных слова другого языка
  var strong = content.confident && (!base || content.script !== 'latin' || content.hits >= 2);
  var localeKey = (strong ? content.language : '') || base || contentLanguage;

  return {
    language: base || contentLanguage,
    declaredLanguage: declared,
    nameLanguage: named,
    contentLanguage: contentLanguage,
    localeKey: localeKey,
    script: content.script,
    confidence: content.confidence,
    source: declared ? 'declared' : (named ? 'name' : (contentLanguage ? 'content' : 'unknown')),
    mismatch: !!(base && contentLanguage && contentLanguage !== base && strong)
  };
}
