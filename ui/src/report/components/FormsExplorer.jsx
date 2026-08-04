import { useEffect, useMemo, useState } from 'react';
import { Tabs, ReasonGroups } from './Tabs.jsx';
import { Toolbar } from './Toolbar.jsx';
import { DataTable } from './DataTable.jsx';
import { cellText } from '../lib/tableDef.jsx';

export function FormsExplorer(props) {
  var R = props.R, tableDefsByTab = props.tableDefsByTab;
  var currentTab = props.currentTab, onTabChange = props.onTabChange;
  var selected = props.selected, onToggleRow = props.onToggleRow;
  var onFilteredFormsChange = props.onFilteredFormsChange;

  var [q, setQ] = useState('');
  var [sev, setSev] = useState('');
  var [page, setPage] = useState(1);
  var [pageSize, setPageSize] = useState(100);
  var [sortCol, setSortCol] = useState(null);
  var [sortDir, setSortDir] = useState(1);

  var def = tableDefsByTab[currentTab];
  var selectable = currentTab === 'forms';

  var filtered = useMemo(function () {
    var query = q.toLowerCase();
    return def.data.filter(function (row) {
      var okS = !sev || row.sev === sev;
      var okQ = !query || row.cells.map(cellText).join(' ').toLowerCase().indexOf(query) > -1;
      return okS && okQ;
    });
  }, [def, q, sev]);

  var sorted = useMemo(function () {
    if (sortCol == null) return filtered;
    var copy = filtered.slice();
    copy.sort(function (a, b) {
      var x = cellText(a.cells[sortCol]), y = cellText(b.cells[sortCol]);
      var nx = parseFloat(x), ny = parseFloat(y);
      if (!isNaN(nx) && !isNaN(ny)) return (nx - ny) * sortDir;
      return x.localeCompare(y) * sortDir;
    });
    return copy;
  }, [filtered, sortCol, sortDir]);

  var pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  var safePage = Math.min(page, pages);
  var paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(function () { setPage(1); setSortCol(null); }, [currentTab]);
  useEffect(function () {
    onFilteredFormsChange(selectable ? filtered : []);
  }, [filtered, selectable]);

  function handleSortClick(index) {
    if (sortCol === index) setSortDir(sortDir * -1);
    else { setSortCol(index); setSortDir(1); }
  }

  function handleTabChange(id) { onTabChange(id); }
  function handlePickReason(reason) { setQ(reason); setPage(1); }

  return (
    <>
      <Tabs currentTab={currentTab} onSelect={handleTabChange} tableDefsByTab={tableDefsByTab} />
      <ReasonGroups R={R} currentTab={currentTab} onPickReason={handlePickReason} />
      <Toolbar
        q={q} onQ={function (v) { setQ(v); setPage(1); }}
        sev={sev} onSev={function (v) { setSev(v); setPage(1); }}
        page={safePage} pageSize={pageSize} total={sorted.length}
        onPage={setPage} onPageSize={function (v) { setPageSize(v); setPage(1); }}
      />
      <div className="wrap">
        <DataTable
          cols={def.cols} rows={paged} selectable={selectable}
          selected={selected} onToggleRow={onToggleRow}
          sortCol={sortCol} sortDir={sortDir} onSortClick={handleSortClick}
        />
      </div>
    </>
  );
}
