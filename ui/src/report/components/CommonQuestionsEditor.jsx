import { stateLabel } from '../lib/format.js';

function buildCommonQuestions(rows) {
  var common = {};
  rows.forEach(function (row) {
    var seen = {};
    row.questions.forEach(function (question) {
      if (!question.name || seen[question.name]) return;
      seen[question.name] = true;
      var item = common[question.name] || (common[question.name] = {
        name: question.name, labels: [], required: [], visible: [], formIds: []
      });
      item.labels.push(question.label || question.name);
      item.required.push(question.required);
      item.visible.push(question.visible);
      item.formIds.push(row.id);
    });
  });
  return common;
}

function Head(props) {
  return (
    <div className="control-head">
      <div><h2>Общие вопросы выбранных форм</h2><div className="selection" id="commonImpact">{props.impact}</div></div>
      <label>
        Порог большинства: <output id="commonThresholdValue">{props.threshold}%</output>
        <input
          id="commonThreshold" type="range" min="50" max="100" value={props.threshold}
          onChange={function (e) { props.onChangeThreshold(parseInt(e.target.value, 10)); }}
        />
      </label>
    </div>
  );
}

export function CommonQuestionsEditor(props) {
  var R = props.R, selected = props.selected, threshold = props.threshold;
  var rows = R.rows.filter(function (row) { return selected[row.id]; });

  var body, impact = '';

  if (!rows.length) {
    body = 'Выберите формы, чтобы увидеть общие вопросы.';
  } else if (rows.some(function (row) { return !Array.isArray(row.questions); })) {
    body = 'Запустите полный анализ после обновления BFA, чтобы загрузить названия вопросов.';
  } else {
    var common = buildCommonQuestions(rows);
    var questions = Object.keys(common).map(function (name) { return common[name]; })
      .filter(function (question) { return question.formIds.length * 100 / rows.length >= threshold; });
    questions.sort(function (a, b) { return a.labels[0].localeCompare(b.labels[0], 'ru'); });

    if (!questions.length) {
      impact = '0 вопросов · минимум ' + Math.ceil(rows.length * threshold / 100) + ' из ' + rows.length + ' форм';
      body = 'Даже с порогом ' + threshold + '% нет общих полей. Вероятно, выбраны формы разных типов — сузьте фильтр или тип формы.';
    } else {
      var coverage = questions.map(function (question) { return question.formIds.length; });
      impact = questions.length + ' вопросов · каждая правка затронет от ' +
        Math.min.apply(null, coverage) + ' до ' + Math.max.apply(null, coverage) + ' из ' + rows.length + ' форм';
      body = <QuestionsTable rows={rows} questions={questions} onPreview={props.onPreview} onRemoveMissing={props.onRemoveMissing} />;
    }
  }

  return (
    <div className="common">
      <Head threshold={threshold} onChangeThreshold={props.onChangeThreshold} impact={impact} />
      <div className="common-help">Вопрос считается общим, когда встречается минимум в указанной доле выборки. Исключения можно проверить и убрать из выделения.</div>
      <div className="common-wrap" id="commonQuestions">{body}</div>
    </div>
  );
}

function QuestionsTable(props) {
  var rows = props.rows, questions = props.questions;

  function handlePreview(event, question) {
    var tr = event.currentTarget.closest('tr');
    var labelInput = tr.querySelector('.question-label');
    var label = labelInput.value.trim(), original = labelInput.getAttribute('data-original');
    var required = tr.querySelector('.question-required').value;
    var visible = tr.querySelector('.question-visible').value;
    var operations = [];
    question.formIds.forEach(function (id) {
      if (label && label !== original) operations.push({ formId: id, kind: 'label', field: question.name, value: label });
      if (required !== 'keep') operations.push({ formId: id, kind: 'required', field: question.name, value: required === 'true' });
      if (visible !== 'keep') operations.push({ formId: id, kind: 'visible', field: question.name, value: visible === 'true' });
    });
    props.onPreview(operations);
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Вопрос</th><th>Технический ключ</th><th>Охват</th><th>Исключения</th><th>Обяз.</th><th>Виден</th>
          <th>Новое название</th><th>Обяз.</th><th>Виден</th><th></th>
        </tr>
      </thead>
      <tbody>
        {questions.map(function (question) {
          var labels = Array.from(new Set(question.labels));
          var original = labels.length === 1 ? labels[0] : '';
          var title = labels.length === 1 ? labels[0] : 'Разные названия: ' + labels.join(' / ');
          var present = {}; question.formIds.forEach(function (id) { present[id] = true; });
          var missing = rows.filter(function (row) { return !present[row.id]; });
          return (
            <tr key={question.name}>
              <td data-label="Вопрос" title={title}>{title}</td>
              <td data-label="Технический ключ"><code>{question.name}</code></td>
              <td data-label="Охват"><b>{question.formIds.length} из {rows.length}</b></td>
              <td data-label="Исключения">
                {missing.length ? (
                  <>
                    <details>
                      <summary>{missing.length} форм</summary>
                      {missing.map(function (row) { return <div key={row.id}>#{row.id} {row.name}</div>; })}
                    </details>
                    <button
                      type="button" className="secondary"
                      onClick={function () { props.onRemoveMissing(missing.map(function (row) { return row.id; })); }}
                    >Снять их</button>
                  </>
                ) : 'Нет'}
              </td>
              <td data-label="Сейчас обязательный">{stateLabel(question.required)}</td>
              <td data-label="Сейчас виден">{stateLabel(question.visible)}</td>
              <td data-label="Новое название">
                <input className="question-label" data-original={original} defaultValue={original} placeholder="Введите единое название" />
              </td>
              <td data-label="Новая обязательность">
                <select className="question-required" defaultValue="keep"><option value="keep">Не менять</option><option value="true">Да</option><option value="false">Нет</option></select>
              </td>
              <td data-label="Новая видимость">
                <select className="question-visible" defaultValue="keep"><option value="keep">Не менять</option><option value="true">Да</option><option value="false">Нет</option></select>
              </td>
              <td data-label="Проверка">
                <button type="button" className="question-preview" onClick={function (e) { handlePreview(e, question); }}>Preview · {question.formIds.length} форм</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
