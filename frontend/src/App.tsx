import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronLeft,
  ChevronRight, FileSpreadsheet, Filter, LayoutDashboard,
  LoaderCircle, Menu, RefreshCw, Search, UploadCloud, X
} from "lucide-react";

/* ── Combobox (searchable dropdown) ── */
function Combobox({ value, options, onChange }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = ["All", ...options];
    return q ? all.filter(o => o.toLowerCase().includes(q)) : all;
  }, [options, search]);

  function select(v: string) { onChange(v); setOpen(false); setSearch(""); }

  return (
    <div className="combobox" ref={ref}>
      <button type="button" className="combobox-trigger"
        onClick={() => { setOpen(o => !o); setSearch(""); }}>
        <span className="combobox-value">{value}</span>
        <ChevronDown size={13} className={`combobox-chevron${open ? " open" : ""}`} />
      </button>
      {open && (
        <div className="combobox-dropdown">
          <div className="combobox-search">
            <Search size={11} />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" />
            {search && <button onClick={() => setSearch("")}><X size={10} /></button>}
          </div>
          <ul className="combobox-list">
            {filtered.length === 0
              ? <li className="combobox-empty">No matches</li>
              : filtered.map(o => (
                <li key={o} className={`combobox-option${value === o ? " selected" : ""}`}
                  onMouseDown={() => select(o)}>{o}</li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Remarks inline-edit cell ── */
function RemarksCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) taRef.current?.focus(); }, [editing]);

  function save() { onSave(draft); setEditing(false); }
  function cancel() { setDraft(value); setEditing(false); }

  if (editing) return (
    <div className="remarks-edit">
      <textarea ref={taRef} className="remarks-textarea" value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === "Escape") cancel(); }}
        rows={3} />
      <div className="remarks-edit-actions">
        <button className="remarks-save" onClick={save}>Save</button>
        <button className="remarks-cancel" onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
  return (
    <div className="remarks-text editable" title="Click to edit" onClick={() => { setDraft(value); setEditing(true); }}>
      {value || <span className="remarks-placeholder">Click to add…</span>}
    </div>
  );
}

const API = "http://127.0.0.1:8000/api";

type Row = {
  material_ref_code: string; wbs_element: string; material_code: string;
  material_description: string; zpp7_quantity: number; project_stock_quantity: number;
  po_quantity: number; open_po_quantity: number; pr_quantity: number;
  net_shortage: number; free_stock: number; remarks: string;
};
type Filters = { material_ref_code: string[]; wbs_element: string[]; material_code: string[] };
type Payload = { items: Row[]; total: number; page: number; page_size: number; pages: number;
  summary: { materials: number; net_shortage: number; demand: number } };

const labels: Record<keyof Filters, string> = {
  material_ref_code: "Material Ref Code",
  wbs_element: "WBS Element",
  material_code: "Material Code"
};
const columns: { key: keyof Row; label: string; numeric?: boolean }[] = [
  { key: "material_ref_code", label: "Material Ref Code" },
  { key: "wbs_element", label: "WBS Element" },
  { key: "material_code", label: "Material Code" },
  { key: "material_description", label: "Material Description" },
  { key: "zpp7_quantity", label: "ZPP7 Qty", numeric: true },
  { key: "project_stock_quantity", label: "Project Stock", numeric: true },
  { key: "po_quantity", label: "PO Qty", numeric: true },
  { key: "open_po_quantity", label: "Open PO Qty", numeric: true },
  { key: "pr_quantity", label: "PR Qty", numeric: true },
  { key: "net_shortage", label: "Net Shortage", numeric: true },
  { key: "free_stock", label: "Free Stock", numeric: true },
  { key: "remarks", label: "Remarks" }
];

function number(value: number | string | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0";
}

export default function App() {
  const [page, setPage] = useState<"shortage" | "input">("shortage");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filters, setFilters] = useState<Filters>({ material_ref_code: [], wbs_element: [], material_code: [] });
  const [selected, setSelected] = useState({ material_ref_code: "All", wbs_element: "All", material_code: "All" });
  const [payload, setPayload] = useState<Payload | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState({ by: "material_code", dir: "asc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reportType, setReportType] = useState("mb25");
  const [rawFiles, setRawFiles] = useState<string[]>([]);
  const [processLog, setProcessLog] = useState("");
  const [search, setSearch] = useState("");
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});

  const loadFilters = useCallback(async () => {
    const res = await fetch(`${API}/filters`);
    if (!res.ok) throw new Error("Could not load filter values.");
    setFilters(await res.json());
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(pageNum), page_size: String(pageSize), sort_by: sort.by, sort_dir: sort.dir });
      (Object.keys(selected) as (keyof typeof selected)[]).forEach(k => {
        if (selected[k] !== "All") params.set(k, selected[k]);
      });
      const res = await fetch(`${API}/shortages?${params.toString()}`);
      if (!res.ok) throw new Error("API returned an error.");
      setPayload(await res.json());
    } catch {
      setError("Cannot connect to the backend. Start FastAPI on http://127.0.0.1:8000 and refresh.");
    } finally { setLoading(false); }
  }, [selected, pageNum, pageSize, sort]);

  useEffect(() => { loadFilters().catch(() => setError("Backend is not running. Start FastAPI first.")); }, [loadFilters]);
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (page === "input") refreshRawFiles(); }, [page]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payload?.items ?? [];
    return (payload?.items ?? []).filter(row => Object.values(row).some(v => String(v ?? "").toLowerCase().includes(q)));
  }, [payload, search]);

  function rowKey(row: Row) { return `${row.material_code}||${row.wbs_element}`; }

  function updateFilter(key: keyof typeof selected, value: string) {
    setSelected(prev => ({ ...prev, [key]: value }));
    setPageNum(1);
  }
  function sortBy(key: keyof Row) {
    setSort(prev => ({ by: key, dir: prev.by === key && prev.dir === "asc" ? "desc" : "asc" }));
    setPageNum(1);
  }
  async function saveRemark(row: Row, val: string) {
    const key = rowKey(row);
    setRemarksMap(prev => ({ ...prev, [key]: val }));
    try {
      await fetch(`${API}/remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_code: row.material_code, wbs_element: row.wbs_element, remarks: val })
      });
    } catch { /* silent – local state already updated */ }
  }
  async function refreshRawFiles() {
    try {
      const res = await fetch(`${API}/raw-files`);
      if (res.ok) setRawFiles((await res.json()).files ?? []);
    } catch { /* backend error is shown by the main data loader */ }
  }
  async function upload() {
    if (!file) { setUploadMessage("Choose the source report first."); return; }
    setUploading(true); setUploadMessage("");
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch(`${API}/reports/${reportType}`, { method: "POST", body: form });
      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Upload failed.");
      setUploadMessage(result.message || "Raw report saved.");
      setFile(null);
      const picker = document.getElementById("raw-report-file") as HTMLInputElement | null;
      if (picker) picker.value = "";
      await refreshRawFiles();
    } catch (e) { setUploadMessage(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploading(false); }
  }
  async function runProcessing() {
    setProcessing(true); setProcessLog(""); setUploadMessage("");
    try {
      const res = await fetch(`${API}/process`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Report processing failed.");
      setProcessLog(result.output || result.message || "Processing completed.");
      setUploadMessage(result.message || "Processing completed successfully.");
      await loadFilters();
      setSelected({ material_ref_code: "All", wbs_element: "All", material_code: "All" });
      setPageNum(1);
      await loadData();
    } catch (e) { setProcessLog(e instanceof Error ? e.message : "Processing failed."); }
    finally { setProcessing(false); }
  }
  function exportVisible() {
    const rows = filteredRows;
    const header = columns.map(c => c.label);
    const escape = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [header.map(escape).join(","), ...rows.map(r => columns.map(c => escape(r[c.key])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = "abb-shortage-records.csv"; a.click(); URL.revokeObjectURL(url);
  }

  return <div className={`app-shell${sidebarOpen ? "" : " sidebar-collapsed"}`}>
    <aside className={`sidebar${sidebarOpen ? "" : " collapsed"}`}>
      <div className="brand">
        {sidebarOpen && <>
          <div className="abb-logo">ABB</div>
          <div><div className="brand-title">Shortage System</div><div className="brand-subtitle">Inventory management</div></div>
        </>}
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}>
          <Menu size={18} />
        </button>
      </div>
      {sidebarOpen && <>
        <div className="sidebar-caption">WORKSPACE</div>
        <button className={`nav-item ${page === "shortage" ? "active" : ""}`} onClick={() => setPage("shortage")}><LayoutDashboard size={18}/> Shortage Management</button>
        <button className={`nav-item ${page === "input" ? "active" : ""}`} onClick={() => setPage("input")}><FileSpreadsheet size={18}/> Input &amp; Imports</button>
        {page === "shortage" && <>
          <div className="sidebar-caption filter-caption"><Filter size={14}/> FILTERS</div>
          {(Object.keys(labels) as (keyof Filters)[]).map(key => <label className="filter-field" key={key}>
            <span>{labels[key]}</span>
            <Combobox value={selected[key]} options={filters[key] ?? []} onChange={v => updateFilter(key, v)} />
          </label>)}
          <button className="reset-button" onClick={() => { setSelected({ material_ref_code: "All", wbs_element: "All", material_code: "All" }); setPageNum(1); }}><RefreshCw size={14}/> Reset filters</button>
        </>}
        <div className="sidebar-bottom"><div className="status-dot"/> Local workspace <span className="version">v1.0</span></div>
      </>}
      {!sidebarOpen && <div className="sidebar-icons-collapsed">
        <button className={`nav-icon${page === "shortage" ? " active" : ""}`} onClick={() => setPage("shortage")} title="Shortage Management"><LayoutDashboard size={20}/></button>
        <button className={`nav-icon${page === "input" ? " active" : ""}`} onClick={() => setPage("input")} title="Input &amp; Imports"><FileSpreadsheet size={20}/></button>
      </div>}
    </aside>

    <main className="main">
      <header className="topbar">
        <div><div className="eyebrow">ABB · MATERIAL PLANNING</div><h1>{page === "shortage" ? "Shortage Management" : "Input & Imports"}</h1><p>{page === "shortage" ? "Monitor material availability and procurement gaps." : "Upload SAP reports, run parsers, and refresh shortage calculations."}</p></div>
        <div className="topbar-actions"><div className="system-status"><span className="status-dot"/> API workspace</div><div className="avatar">AM</div></div>
      </header>

      {error && <div className="alert error"><AlertTriangle size={18}/><span>{error}</span><button onClick={() => { loadFilters().catch(() => {}); loadData(); }}><RefreshCw size={14}/> Retry</button></div>}

      {page === "shortage" ? <>
        <section className="table-card">
          <div className="table-heading"><div><h2>Material shortage register</h2><p>Material-level inventory and procurement position</p></div><div className="table-actions"><button className="outline-button" onClick={exportVisible}><ArrowDown size={15}/> Export CSV</button><button className="primary-button" onClick={() => setPage("input")}><UploadCloud size={16}/> Import data</button></div></div>
          <div className="table-toolbar"><div className="result-count">{loading ? "Loading records…" : `${number(payload?.total)} records`}</div><div className="toolbar-right"><div className="search-box"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search visible records…"/>{search && <button onClick={() => setSearch("")}><X size={13}/></button>}</div><label className="page-size">Rows <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPageNum(1); }}><option>10</option><option>25</option><option>50</option></select></label></div></div>
          <div className="table-scroll"><table><thead><tr>{columns.map(col => <th key={col.key} className={`${col.numeric ? "numeric" : ""} ${col.key === "remarks" ? "remarks-col" : ""}`}><button className="sort-button" onClick={() => sortBy(col.key)}>{col.label}{sort.by === col.key && (sort.dir === "asc" ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</button></th>)}</tr></thead>
            <tbody>{loading ? <tr><td colSpan={columns.length} className="empty-cell"><LoaderCircle className="spin" size={22}/> Loading shortage data…</td></tr> : filteredRows.length === 0 ? <tr><td colSpan={columns.length} className="empty-cell">No records match your filters.</td></tr> : filteredRows.map((row, idx) => <tr key={`${row.material_code}-${row.wbs_element}-${idx}`}>
              {columns.map(col => <td key={col.key} className={`${col.numeric ? "numeric" : ""} ${col.key === "remarks" ? "remarks-cell" : ""}`}>
                {col.key === "net_shortage" ? <span className={`shortage-pill ${Number(row.net_shortage) > 0 ? "has-shortage" : "no-shortage"}`}>{number(row.net_shortage)}</span>
                  : col.key === "material_code" ? <span className="material-code">{row.material_code || "—"}</span>
                  : col.numeric ? number(row[col.key] as number)
                  : col.key === "remarks"
                    ? <RemarksCell value={remarksMap[rowKey(row)] ?? row.remarks ?? ""} onSave={val => saveRemark(row, val)} />
                  : <span>{String(row[col.key] ?? "—") || "—"}</span>}
              </td>)}
            </tr>)}</tbody></table></div>
          <div className="table-footer"><span>Page {payload?.page ?? pageNum} of {payload?.pages ?? 1}</span><div className="pagination"><button disabled={pageNum <= 1 || loading} onClick={() => setPageNum(p => Math.max(1, p - 1))}><ChevronLeft size={16}/></button><span>{pageNum}</span><button disabled={pageNum >= (payload?.pages ?? 1) || loading} onClick={() => setPageNum(p => p + 1)}><ChevronRight size={16}/></button></div></div>
        </section>
        <div className="footnote"><Activity size={14}/> Data shown from the local shortage database. Verify imported values against source SAP reports.</div>
      </> : <section className="upload-layout">
        <div className="upload-card"><div className="upload-icon"><UploadCloud size={24}/></div><h2>Upload SAP source reports</h2><p>Upload each original report. Files are saved to <code>data/raw/</code> using the names expected by your existing parser modules.</p>
          <label className="filter-field upload-report-select"><span>Report type</span><div className="select-wrap"><select value={reportType} onChange={e => { setReportType(e.target.value); setFile(null); setUploadMessage(""); }}>
            <option value="mb25">MB25 — WBS Mapping</option><option value="mb52">MB52 — Warehouse Stock</option><option value="me2j">ME2J — Purchase Orders</option><option value="pr">PR — Purchase Requisitions</option><option value="scopelist">Scope List</option><option value="zpp7">ZPP7 — Requirements</option>
          </select><ChevronDown size={15}/></div></label>
          <label className="dropzone"><input id="raw-report-file" type="file" accept={reportType === "mb52" ? ".htm,.html,.xls,.xlsx,.xlsm" : reportType === "pr" ? ".xls,.xlsx,.xlsm,.txt,.tsv,.csv" : reportType === "zpp7" ? ".xls,.xlsx,.xlsm,.txt,.csv" : ".xls,.xlsx,.xlsm"} onChange={(e: ChangeEvent<HTMLInputElement>) => { setFile(e.target.files?.[0] ?? null); setUploadMessage(""); }}/><FileSpreadsheet size={30}/><strong>{file ? file.name : "Choose the SAP report to upload"}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB` : "Upload the original exported report; do not rename it manually"}</span><span className="browse-label">Browse files</span></label>
          <button className="primary-button upload-submit" disabled={uploading || !file} onClick={upload}>{uploading ? <><LoaderCircle className="spin" size={16}/> Saving report…</> : <><UploadCloud size={16}/> Save raw report</>}</button>
          {uploadMessage && <div className={`upload-message ${uploadMessage.toLowerCase().includes("fail") || uploadMessage.toLowerCase().includes("error") || uploadMessage.toLowerCase().includes("missing") || uploadMessage.toLowerCase().includes("choose") ? "error-text" : "success-text"}`}>{uploadMessage}</div>}
          <div className="process-divider"></div><h2>Run shortage calculation</h2><p>After all six source reports are uploaded, run the original parsers and shortage calculation. The existing SQLite databases and calculation logic are used.</p>
          <button className="primary-button upload-submit" disabled={processing} onClick={runProcessing}>{processing ? <><LoaderCircle className="spin" size={16}/> Processing reports…</> : <><Activity size={16}/> Process all reports</>}</button>
          {processLog && <pre className="process-log">{processLog}</pre>}
        </div>
        <div className="upload-card format-card"><h2>Raw reports currently saved</h2><p>These are the files in <code>data/raw/</code>. Uploading a replacement for a report type replaces that type’s previous file.</p>
          <div className="format-list">{rawFiles.length ? rawFiles.map(name => <div key={name}><span>{name}</span><span className="required">Saved</span></div>) : <div><span>No raw reports uploaded yet</span><span className="optional">Empty</span></div>}</div>
          <button className="outline-button refresh-files" onClick={refreshRawFiles}><RefreshCw size={14}/> Refresh file list</button>
          <div className="info-note"><AlertTriangle size={16}/> Upload all six: MB25, MB52, ME2J, PR, Scope List, and ZPP7. The shortage table refreshes only if the parsers all succeed.</div>
          <h2 className="report-list-title">Expected source reports</h2><div className="format-list">{["MB25 — WBS mapping", "MB52 — warehouse stock", "ME2J — purchase orders", "PR — purchase requisitions", "MATERIAL_SCOPE_LIST — scope list", "ZPP7 — requirements"].map(name => <div key={name}><span>{name}</span><span className="optional">Required</span></div>)}</div>
        </div>
      </section>}
    </main>
  </div>;
}
