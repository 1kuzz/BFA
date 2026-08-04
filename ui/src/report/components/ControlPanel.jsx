import { CommonQuestionsEditor } from './CommonQuestionsEditor.jsx';
import { AgreementEditor } from './AgreementEditor.jsx';
import { BulkEditForm } from './BulkEditForm.jsx';

export function ControlPanel(props) {
  var c = props.controller;
  var selectionCount = Object.keys(c.selected).length;

  return (
    <section className="control" aria-labelledby="controlTitle">
      <div className="control-head">
        <div>
          <h2 id="controlTitle">Управление формами</h2>
          <div className="selection" id="selection">Выбрано: {selectionCount}</div>
        </div>
        <div>
          <button type="button" className="secondary" onClick={c.selectAll}>Выбрать все формы</button>{' '}
          <button type="button" className="secondary" onClick={c.selectShown}>Выбрать отфильтрованные</button>{' '}
          <button type="button" className="secondary" onClick={c.clearSelected}>Очистить</button>
        </div>
      </div>

      <CommonQuestionsEditor
        R={c.R} selected={c.selected} threshold={c.commonThreshold}
        onChangeThreshold={c.changeCommonThreshold}
        onPreview={c.previewCommonEdit}
        onRemoveMissing={function (ids) { c.removeFromSelection(ids); c.toast('Формы без этого поля сняты с выделения'); }}
      />

      <AgreementEditor
        activeAgreement={c.activeAgreement} variantIndex={c.agreementVariantIndex} text={c.agreementText}
        onVariantChange={c.changeAgreementVariant} onTextChange={c.setAgreementText}
        onClose={c.closeAgreement} onPreview={c.previewAgreementEdit}
      />

      <BulkEditForm
        editKind={c.editKind} onEditKind={c.setEditKind}
        editField={c.editField} onEditField={c.setEditField}
        editValue={c.editValue} onEditValue={c.setEditValue}
        editBoolean={c.editBoolean} onEditBoolean={c.setEditBoolean}
        previewBusy={c.previewBusy} applyBusy={c.applyBusy}
        editPreviewText={c.editPreviewText} pendingPlan={c.pendingPlan}
        onPreviewBulkEdit={c.previewBulkEdit} onApplyEdits={c.applyEdits}
      />
    </section>
  );
}
