import { useEffect } from 'react';
import { useReportController } from './useReportController.js';
import { Header } from './components/Header.jsx';
import { StatCards } from './components/StatCards.jsx';
import { ChartsRow } from './components/ChartsRow.jsx';
import { ControlPanel } from './components/ControlPanel.jsx';
import { AuditLog } from './components/AuditLog.jsx';
import { FormsExplorer } from './components/FormsExplorer.jsx';
import { Toast } from './components/Toast.jsx';
import { DuplicateDialog } from './components/DuplicateDialog.jsx';

export function App() {
  var c = useReportController();

  useEffect(function () {
    function onKeydown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        var q = document.getElementById('q');
        if (q) { q.focus(); q.select(); }
        return;
      }
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        var tabsEl = document.getElementById('tabs');
        if (!tabsEl || !tabsEl.contains(document.activeElement)) return;
        event.preventDefault();
        var tabs = [].slice.call(tabsEl.querySelectorAll('.tab'));
        var index = tabs.indexOf(document.activeElement) + (event.key === 'ArrowRight' ? 1 : -1);
        var target = tabs[(index + tabs.length) % tabs.length];
        target.click();
        target.focus();
      }
    }
    document.addEventListener('keydown', onKeydown);
    return function () { document.removeEventListener('keydown', onKeydown); };
  }, []);

  return (
    <>
      <Header R={c.R} />

      {c.loading && (
        <div id="loading">
          <div className="skeleton" style={{ height: '96px', marginBottom: '14px' }} />
          <div className="skeleton" style={{ height: '260px' }} />
        </div>
      )}

      {c.empty && (
        <div className="empty-state" id="empty">
          <strong>Данных анализа пока нет</strong><br />Откройте Bitrix24 и запустите анализ из попапа расширения.
        </div>
      )}

      {c.R && (
        <div id="dashboard">
          <StatCards R={c.R} />
          <ChartsRow R={c.R} />
          <ControlPanel controller={c} />
          <AuditLog audit={c.audit} />
          <FormsExplorer
            R={c.R} tableDefsByTab={c.tableDefsByTab}
            currentTab={c.currentTab} onTabChange={c.setCurrentTab}
            selected={c.selected} onToggleRow={c.toggleRow}
            onFilteredFormsChange={c.setLastFilteredForms}
          />
        </div>
      )}

      <Toast message={c.toastMsg} />
      <DuplicateDialog
        cluster={c.duplicateIndex != null && c.R ? c.R.clusters[c.duplicateIndex] : null}
        rowById={c.rowById} onClose={c.closeDuplicate}
      />
    </>
  );
}
