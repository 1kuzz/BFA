import { useEffect, useState } from 'react';

export function BulkEditForm(props) {
  var kind = props.editKind;
  var needsField = kind === 'preset' || kind === 'label' || kind === 'required' || kind === 'visible';
  var isBoolean = kind === 'required' || kind === 'visible';
  var fieldPlaceholder = kind === 'preset' ? 'UF_CRM_CONSENT_VERSION' : 'CONTACT_EMAIL';

  var [confirmation, setConfirmation] = useState('');
  useEffect(function () { setConfirmation(''); }, [props.pendingPlan]);

  return (
    <>
      <h2>Расширенное массовое изменение</h2>
      <div className="control-grid">
        <div>
          <label htmlFor="editKind">Изменение</label>
          <select id="editKind" value={kind} onChange={function (e) { props.onEditKind(e.target.value); }}>
            <option value="name">Имя формы</option>
            <option value="title">Заголовок</option>
            <option value="buttonCaption">Текст кнопки</option>
            <option value="successUrl">HTTPS-редирект</option>
            <option value="preset">Существующее preset-поле</option>
            <option value="label">Текст вопроса</option>
            <option value="required">Обязательность поля</option>
            <option value="visible">Видимость поля</option>
          </select>
        </div>
        {needsField && (
          <div id="fieldWrap">
            <label htmlFor="editField">Поле</label>
            <input id="editField" placeholder={fieldPlaceholder} value={props.editField} onChange={function (e) { props.onEditField(e.target.value); }} />
          </div>
        )}
        <div>
          <label htmlFor="editValue">Новое значение</label>
          {!isBoolean && (
            <input id="editValue" placeholder="Введите значение" value={props.editValue} onChange={function (e) { props.onEditValue(e.target.value); }} />
          )}
          {isBoolean && (
            <select id="editBoolean" value={props.editBoolean} onChange={function (e) { props.onEditBoolean(e.target.value); }}>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          )}
        </div>
        <button type="button" id="previewEdits" disabled={props.previewBusy} onClick={props.onPreviewBulkEdit}>Preview</button>
      </div>
      {!!props.editPreviewText && <div className="preview" id="editPreview" style={{ display: 'block' }}>{props.editPreviewText}</div>}
      {!!props.pendingPlan && (
        <div className="approval show" id="approval">
          <input
            id="confirmation" placeholder={props.pendingPlan.confirmation}
            value={confirmation} onChange={function (e) { setConfirmation(e.target.value); }}
          />
          <button type="button" className="danger" id="applyEdits" disabled={props.applyBusy} onClick={function () { props.onApplyEdits(confirmation.trim()); }}>
            Применить и проверить
          </button>
        </div>
      )}
    </>
  );
}
