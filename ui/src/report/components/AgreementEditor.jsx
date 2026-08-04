export function AgreementEditor(props) {
  var conflict = props.activeAgreement;
  var show = !!conflict;
  return (
    <div className={'agreement-editor' + (show ? ' show' : '')} id="agreementEditor">
      {show && (
        <>
          <div className="control-head">
            <h2 id="agreementTitle">Agreement {conflict.id} · {conflict.name}</h2>
            <button type="button" className="secondary" onClick={props.onClose}>Закрыть</button>
          </div>
          <label htmlFor="agreementVariant">Канонический вариант</label>
          <select
            id="agreementVariant" value={props.variantIndex}
            onChange={function (e) { props.onVariantChange(parseInt(e.target.value, 10)); }}
          >
            {conflict.textVariants.map(function (variant, index) {
              return <option value={index} key={index}>{variant.count + ' форм · ' + (variant.text || '(пусто)').slice(0, 120)}</option>;
            })}
          </select>
          <label htmlFor="agreementText">Текст соглашения</label>
          <textarea id="agreementText" value={props.text} onChange={function (e) { props.onTextChange(e.target.value); }} />
          <div className="selection" id="agreementImpact">Будет проверено и изменено до {conflict.formIds.length} форм</div>
          <button type="button" id="previewAgreement" onClick={props.onPreview}>Preview через approval-flow</button>
        </>
      )}
    </div>
  );
}
