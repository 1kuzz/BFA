import { useCallback, useEffect, useMemo, useState } from 'react';
import { storageGet, storageSet, sendMessage, onMessage } from './chromeApi.js';
import { buildTableDef, TABS } from './lib/tableDef.jsx';

export function useReportController() {
  var [R, setR] = useState(null);
  var [loading, setLoading] = useState(true);
  var [selected, setSelected] = useState({});
  var [lastFilteredForms, setLastFilteredForms] = useState([]);
  var [currentTab, setCurrentTab] = useState('forms');
  var [commonThreshold, setCommonThreshold] = useState(80);
  var [activeAgreement, setActiveAgreement] = useState(null);
  var [agreementVariantIndex, setAgreementVariantIndex] = useState(0);
  var [agreementText, setAgreementText] = useState('');
  var [editKind, setEditKind] = useState('name');
  var [editField, setEditField] = useState('');
  var [editValue, setEditValue] = useState('');
  var [editBoolean, setEditBoolean] = useState('true');
  var [pendingPlan, setPendingPlan] = useState(null);
  var [previewBusy, setPreviewBusy] = useState(false);
  var [applyBusy, setApplyBusy] = useState(false);
  var [editPreviewText, setEditPreviewText] = useState('');
  var [duplicateIndex, setDuplicateIndex] = useState(null);
  var [audit, setAudit] = useState([]);
  var [toastMsg, setToastMsg] = useState('');

  var toastTimer = useMemo(function () { return { id: null }; }, []);
  var toast = useCallback(function (message) {
    setToastMsg(message);
    clearTimeout(toastTimer.id);
    toastTimer.id = setTimeout(function () { setToastMsg(''); }, 3200);
  }, [toastTimer]);

  var loadAudit = useCallback(function () {
    storageGet('editAudit').then(function (stored) { setAudit(stored.editAudit || []); });
  }, []);

  var load = useCallback(function () {
    storageGet(['lastResult', 'commonThreshold']).then(function (d) {
      if (d.commonThreshold >= 50 && d.commonThreshold <= 100) setCommonThreshold(d.commonThreshold);
      setLoading(false);
      if (d.lastResult && d.lastResult.rows) setR(d.lastResult);
    });
  }, []);

  useEffect(function () { load(); loadAudit(); }, [load, loadAudit]);
  useEffect(function () {
    return onMessage(function (msg) {
      if (msg && msg.target === 'ui' && msg.type === 'done') load();
      if (msg && msg.target === 'ui' && msg.type === 'editsDone') loadAudit();
    });
  }, [load, loadAudit]);

  // Drop selection of forms that no longer exist after a fresh run.
  useEffect(function () {
    if (!R) return;
    var validIds = {}; R.rows.forEach(function (row) { validIds[row.id] = true; });
    setSelected(function (prev) {
      var next = {}, changed = false;
      Object.keys(prev).forEach(function (id) {
        if (validIds[id]) next[id] = true; else changed = true;
      });
      return changed ? next : prev;
    });
  }, [R]);

  var clusterByForm = useMemo(function () {
    var map = {};
    if (R) (R.clusters || []).forEach(function (cluster, index) {
      cluster.ids.forEach(function (id) { map[id] = index; });
    });
    return map;
  }, [R]);

  var rowById = useMemo(function () {
    var map = {};
    if (R) R.rows.forEach(function (row) { map[row.id] = row; });
    return map;
  }, [R]);

  function openDuplicate(index) { setDuplicateIndex(index); }
  function closeDuplicate() { setDuplicateIndex(null); }

  function openAgreement(id) {
    var conflict = (R.agrConflicts || []).find(function (item) { return String(item.id) === String(id); });
    if (!conflict || !Array.isArray(conflict.textVariants)) {
      toast('Перезапустите анализ, чтобы загрузить варианты текста соглашения');
      return;
    }
    var next = {}; conflict.formIds.forEach(function (formId) { next[formId] = true; });
    setSelected(next);
    setActiveAgreement(conflict);
    setAgreementVariantIndex(0);
    setAgreementText(conflict.textVariants[0].text);
  }
  function closeAgreement() { setActiveAgreement(null); }
  function changeAgreementVariant(index) {
    setAgreementVariantIndex(index);
    if (activeAgreement) setAgreementText(activeAgreement.textVariants[index].text);
  }

  var tableDefsByTab = useMemo(function () {
    var map = {};
    if (!R) return map;
    var opts = { clusterByForm: clusterByForm, onOpenDuplicate: openDuplicate, onOpenAgreement: openAgreement, onPreparePreset: preparePreset };
    TABS.forEach(function (t) { map[t.id] = buildTableDef(R, t.id, opts); });
    return map;
    // eslint-disable-next-line
  }, [R, clusterByForm]);

  function preparePreset(field) {
    var next = {};
    (R.presetIssuesAll || []).filter(function (issue) { return issue.field === field; }).forEach(function (issue) {
      next[issue.id] = true;
    });
    setSelected(next);
    setEditKind('preset'); setEditField(field); setEditValue('');
    var el = document.getElementById('controlTitle');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    toast('Выбраны формы с невалидным ' + field + ' — введите каноническое значение');
  }

  function toggleRow(id) {
    setSelected(function (prev) {
      var next = Object.assign({}, prev);
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });
  }
  function selectAll() {
    var next = {}; R.rows.forEach(function (row) { next[row.id] = true; });
    setSelected(next);
  }
  function selectShown() {
    setSelected(function (prev) {
      var next = Object.assign({}, prev);
      lastFilteredForms.forEach(function (row) { next[row.id] = true; });
      return next;
    });
  }
  function clearSelected() { setSelected({}); }
  function removeFromSelection(ids) {
    setSelected(function (prev) {
      var next = Object.assign({}, prev);
      ids.forEach(function (id) { delete next[id]; });
      return next;
    });
  }

  function changeCommonThreshold(value) {
    setCommonThreshold(value);
    storageSet({ commonThreshold: value });
  }

  function requestPreview(operations) {
    setPendingPlan(null);
    setPreviewBusy(true);
    setEditPreviewText('Загружаю свежие формы из Bitrix24...');
    sendMessage({ target: 'sw', type: 'previewEdits', operations: operations }).then(function (response) {
      setPreviewBusy(false);
      if (!response || !response.ok) {
        setEditPreviewText('Ошибка preview: ' + ((response || {}).error || 'нет ответа'));
        toast('Preview не создан');
        return;
      }
      setPendingPlan(response.plan);
      setEditPreviewText(renderPlanText(response.plan));
      toast('План правок готов — проверьте изменения');
    });
  }

  function previewBulkEdit() {
    var ids = Object.keys(selected);
    if (!ids.length) { setEditPreviewText('Выберите хотя бы одну форму.'); return; }
    var value = (editKind === 'required' || editKind === 'visible') ? editBoolean === 'true' : editValue;
    requestPreview(ids.map(function (id) { return { formId: id, kind: editKind, field: editField.trim(), value: value }; }));
  }

  function previewAgreementEdit() {
    if (!activeAgreement) return;
    var text = agreementText.trim();
    if (!text) { toast('Введите канонический текст соглашения'); return; }
    requestPreview(activeAgreement.formIds.map(function (formId) {
      return { formId: formId, kind: 'agreement', field: String(activeAgreement.id), value: text };
    }));
  }

  function previewCommonEdit(operations) {
    if (!operations.length) {
      setEditPreviewText('Укажите новое название, обязательность или видимость.');
      return;
    }
    requestPreview(operations);
  }

  function applyEdits(confirmation) {
    if (!pendingPlan) return;
    setApplyBusy(true);
    sendMessage({ target: 'sw', type: 'applyEdits', planId: pendingPlan.id, confirmation: confirmation }).then(function (response) {
      setApplyBusy(false);
      if (!response || !response.ok) {
        setEditPreviewText(function (prev) { return prev + '\n\nОшибка применения: ' + ((response || {}).error || 'нет ответа'); });
        toast('Правки не применены');
        return;
      }
      var results = response.record.results;
      setEditPreviewText(function (prev) {
        return prev + '\n\nЗавершено: ' + results.map(function (r) { return '#' + r.id + ' ' + r.status; }).join(', ') + '\nЗапустите анализ для обновления метрик.';
      });
      setPendingPlan(null);
      loadAudit();
      toast('Правки применены и проверены');
    });
  }

  return {
    R: R, loading: loading, empty: !loading && !R,
    selected: selected, toggleRow: toggleRow, selectAll: selectAll, selectShown: selectShown, clearSelected: clearSelected,
    setLastFilteredForms: setLastFilteredForms,
    currentTab: currentTab, setCurrentTab: setCurrentTab,
    tableDefsByTab: tableDefsByTab, clusterByForm: clusterByForm, rowById: rowById,
    commonThreshold: commonThreshold, changeCommonThreshold: changeCommonThreshold,
    removeFromSelection: removeFromSelection,
    activeAgreement: activeAgreement, agreementVariantIndex: agreementVariantIndex, agreementText: agreementText,
    openAgreement: openAgreement, closeAgreement: closeAgreement, changeAgreementVariant: changeAgreementVariant,
    setAgreementText: setAgreementText, previewAgreementEdit: previewAgreementEdit,
    editKind: editKind, setEditKind: setEditKind, editField: editField, setEditField: setEditField,
    editValue: editValue, setEditValue: setEditValue, editBoolean: editBoolean, setEditBoolean: setEditBoolean,
    previewBulkEdit: previewBulkEdit, previewCommonEdit: previewCommonEdit,
    pendingPlan: pendingPlan, previewBusy: previewBusy, applyBusy: applyBusy,
    editPreviewText: editPreviewText, applyEdits: applyEdits,
    duplicateIndex: duplicateIndex, openDuplicate: openDuplicate, closeDuplicate: closeDuplicate,
    audit: audit, toastMsg: toastMsg, toast: toast
  };
}

function renderPlanText(plan) {
  var lines = ['План ' + plan.id + ' · форм: ' + plan.entries.length];
  plan.entries.forEach(function (entry) {
    lines.push('\n#' + entry.id);
    entry.changes.forEach(function (change) {
      lines.push('[' + change.risk + '] ' + change.kind + (change.field ? ':' + change.field : '') +
        '\n  ' + formatValue(change.before) + '  →  ' + formatValue(change.after));
    });
  });
  return lines.join('\n');
}
function formatValue(value) {
  if (value === undefined) return 'undefined';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
