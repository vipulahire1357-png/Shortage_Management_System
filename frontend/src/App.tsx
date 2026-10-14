import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, CheckCircle, ChevronDown,
  ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Filter, FolderOpen,
  LayoutDashboard, LoaderCircle, Menu, RefreshCw, Search, UploadCloud, X,
  XCircle,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────
   API base — relative so dev proxy + production both work.
───────────────────────────────────────────────────────────── */
const API = "/api";

/* ═══════════════════════════════════════════════════════════
   Shared UI components
═══════════════════════════════════════════════════════════ */

/** Searchable dropdown combobox. */
function Combobox({
  value, options, onChange, placeholder = "Select…",
}: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = ["All", ...options];
    return q ? all.filter(o => o.toLowerCase().includes(q)) : all;
  }, [options, search]);

  const select = (v: string) => { onChange(v); setOpen(false); setSearch(""); };

  return (
    <div className="combobox" ref={ref}>
      <button type="button" className="combobox-trigger"
        onClick={() => { setOpen(o => !o); setSearch(""); }}>
        <span className="combobox-value">{value || placeholder}</span>
        <ChevronDown size={13} className={`combobox-chevron${open ? " open" : ""}`} />
      </button>
      {open && (
        <div className="combobox-dropdown">
          <div className="combobox-search">
            <Search size={11} />
            <input autoFocus value={search}
              onChange={e => setSearch(e.target.value)} placeholder="Search…" />
            {search && <button onClick={() => setSearch("")}><X size={10} /></button>}
          </div>
          <ul className="combobox-list">
            {filtered.length === 0
              ? <li className="combobox-empty">No matches</li>
              : filtered.map(o => (
                <li key={o}
                  className={`combobox-option${value === o ? " selected" : ""}`}
                  onMouseDown={() => select(o)}>{o}</li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Two-item export dropdown. */
function ExportMenu({ onCsv, onXlsx }: { onCsv: () => void; onXlsx: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, []);
  return (
    <div className="export-menu" ref={ref}>
      <button type="button" className="outline-button export-trigger"
        onClick={() => setOpen(o => !o)} aria-haspopup="true" aria-expanded={open}>
        <FileDown size={15} /> Export <ChevronDown size={12} className={`export-chevron${open ? " open" : ""}`} />
      </button>
      {open && (
        <div className="export-dropdown" role="menu">
          <button role="menuitem" className="export-option"
            onMouseDown={() => { setOpen(false); onCsv(); }}>
            <FileDown size={13} /> CSV (.csv)
          </button>
          <button role="menuitem" className="export-option"
            onMouseDown={() => { setOpen(false); onXlsx(); }}>
            <FileSpreadsheet size={13} /> Excel (.xlsx)
          </button>
        </div>
      )}
    </div>
  );
}

/** Inline editable remarks cell. */
function RemarksCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) taRef.current?.focus(); }, [editing]);
  const save = () => { onSave(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };
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
    <div className="remarks-text editable" title="Click to edit"
      onClick={() => { setDraft(value); setEditing(true); }}>
      {value || <span className="remarks-placeholder">Click to add…</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Types
═══════════════════════════════════════════════════════════ */
type Row = {
  material_ref_code: string; wbs_element: string; material_code: string;
  material_description: string; zpp7_quantity: number; project_stock_quantity: number;
  po_quantity: number; open_po_quantity: number; pr_quantity: number;
  net_shortage: number; free_stock: number; remarks: string; scope: string;
};
type Filters = { material_ref_code: string[]; wbs_element: string[]; material_code: string[]; scope: string[] };
type Payload = {
  items: Row[]; total: number; page: number; page_size: number; pages: number;
  summary: { materials: number; net_shortage: number; demand: number };
};
interface ProjectFile {
  report_key: string; label: string; filename: string | null;
  extension: string | null; available: boolean;
}
interface ProjectFilesResponse {
  project_id: string; project_files: ProjectFile[];
  global_files: ProjectFile[]; other_files: string[];
}
interface ProjectStatus {
  project_id: string; ready: boolean;
  missing_project: string[]; missing_global: string[];
}

/* ═══════════════════════════════════════════════════════════
   Shortage table constants
═══════════════════════════════════════════════════════════ */
const filterLabels: Record<keyof Filters, string> = {
  material_ref_code: "Material Ref Code", wbs_element: "WBS Element",
  material_code: "Material Code", scope: "Scope",
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
  { key: "remarks", label: "Remarks" },
];
const fmt = (v: number | string | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0";
};

/* ═══════════════════════════════════════════════════════════
   Input & Imports — sub-components
═══════════════════════════════════════════════════════════ */

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`status-badge ${ok ? "badge-ok" : "badge-miss"}`}>
      {ok ? <CheckCircle size={11} /> : <XCircle size={11} />}
      {label}
    </span>
  );
}

function FileRow({ file }: { file: ProjectFile }) {
  return (
    <div className="file-row">
      <div className="file-row-left">
        <span className={`file-dot ${file.available ? "dot-ok" : "dot-miss"}`} />
        <div>
          <div className="file-name">
            {file.available
              ? file.filename
              : <span className="file-missing">Not found</span>}
          </div>
          <div className="file-label">{file.label}</div>
        </div>
      </div>
      <StatusBadge ok={file.available} label={file.available ? "Available" : "Missing"} />
    </div>
  );
}

function ProjectCard({
  projectId, availableCount, isSelected, onSelect,
}: {
  projectId: string; availableCount: number; isSelected: boolean; onSelect: () => void;
}) {
  return (
    <div
      className={`project-card${isSelected ? " project-card-selected" : ""}`}
      onClick={onSelect} role="button" tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onSelect()}
    >
      <FolderOpen size={15} className="project-card-icon" />
      <div className="project-card-body">
        <div className="project-card-id">{projectId}</div>
        {isSelected && availableCount > 0 && (
          <div className="project-card-meta">{availableCount} report{availableCount !== 1 ? "s" : ""} found</div>
        )}
      </div>
      {isSelected && <div className="project-card-active-bar" />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Input & Imports page (receives shared project state)
═══════════════════════════════════════════════════════════ */
function InputPage({
  selectedProject, setSelectedProject, projects, onRefreshProjects,
}: {
  selectedProject: string;
  setSelectedProject: (id: string) => void;
  projects: string[];
  onRefreshProjects: () => Promise<void>;
}) {
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [filesData, setFilesData] = useState<ProjectFilesResponse | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processLog, setProcessLog] = useState("");
  const [processError, setProcessError] = useState("");
  const [processSuccess, setProcessSuccess] = useState("");

  const refreshProjects = async () => {
    setLoadingProjects(true);
    await onRefreshProjects();
    setLoadingProjects(false);
  };

  /* Load files + status when project changes */
  useEffect(() => {
    if (!selectedProject) { setFilesData(null); setStatus(null); return; }
    setLoadingFiles(true);
    setProcessLog(""); setProcessError(""); setProcessSuccess("");
    Promise.all([
      fetch(`${API}/projects/${encodeURIComponent(selectedProject)}/files`).then(r => r.json()),
      fetch(`${API}/projects/${encodeURIComponent(selectedProject)}/status`).then(r => r.json()),
    ]).then(([fd, st]) => { setFilesData(fd); setStatus(st); })
      .catch(() => { setFilesData(null); setStatus(null); })
      .finally(() => setLoadingFiles(false));
  }, [selectedProject]);

  const select = (id: string) => setSelectedProject(id === "All" ? "" : id);

  const runProcessing = async () => {
    if (!selectedProject) return;
    setProcessing(true); setProcessLog(""); setProcessError(""); setProcessSuccess("");
    try {
      const res = await fetch(
        `${API}/projects/${encodeURIComponent(selectedProject)}/process`,
        { method: "POST" },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Processing failed.");
      setProcessSuccess(result.message || "Processing completed successfully.");
      setProcessLog(result.output || "");
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : "Processing failed.");
    } finally { setProcessing(false); }
  };

  const canProcess = !!selectedProject && status?.ready === true && !processing;
  const availableCount = filesData ? filesData.project_files.filter(f => f.available).length : 0;

  return (
    <div className="input-page">
      {/* ── Left: project list sidebar ─────────────────── */}
      <div className="input-sidebar">
        <div className="input-section-head">
          <h2 className="input-sidebar-title">Projects</h2>
          <button className="outline-button icon-btn" onClick={refreshProjects}
            title="Refresh project list">
            <RefreshCw size={13} className={loadingProjects ? "spin" : ""} />
          </button>
        </div>

        {loadingProjects ? (
          <div className="empty-hint"><LoaderCircle size={16} className="spin" /> Refreshing…</div>
        ) : projects.length === 0 ? (
          <div className="empty-hint">
            <FolderOpen size={24} />
            <span>No projects found.<br />Create a subfolder in <code>projects/</code>.</span>
          </div>
        ) : (
          <div className="project-list">
            {projects.map(id => (
              <ProjectCard key={id} projectId={id}
                availableCount={selectedProject === id ? availableCount : 0}
                isSelected={selectedProject === id}
                onSelect={() => select(id)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Right: detail ──────────────────────────────── */}
      <div className="input-detail">
        {!selectedProject ? (
          <div className="no-project-hint">
            <FolderOpen size={42} />
            <h3>Select a project</h3>
            <p>Choose a project from the list on the left or from the <strong>Select Project</strong> combobox in the sidebar to view its reports and run processing.</p>
          </div>
        ) : loadingFiles ? (
          <div className="no-project-hint">
            <LoaderCircle size={32} className="spin" />
            <p>Loading project files…</p>
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div className="detail-header">
              <div>
                <div className="eyebrow">Selected Project</div>
                <div className="detail-project-id">{selectedProject}</div>
              </div>
              <StatusBadge ok={status?.ready ?? false}
                label={status?.ready ? "Ready to process" : "Not ready"} />
            </div>

            {/* Missing files warning */}
            {status && !status.ready && (
              <div className="alert error missing-alert">
                <AlertTriangle size={15} />
                <div>
                  <strong>Missing required reports — cannot process</strong>
                  {status.missing_project.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      Project reports: {status.missing_project.map(k => k.toUpperCase()).join(", ")}
                    </div>
                  )}
                  {status.missing_global.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      Global reports: {status.missing_global.map(k => k.toUpperCase()).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* File listing grid */}
            <div className="files-grid">
              {/* Project-specific reports */}
              <div className="upload-card files-card">
                <div className="files-card-title">
                  <FileSpreadsheet size={14} />
                  <span>Project Reports</span>
                  <span className="files-card-sub">from <code>projects/{selectedProject}/</code></span>
                </div>
                <div className="file-list">
                  {filesData?.project_files.map(f => <FileRow key={f.report_key} file={f} />)}
                </div>
                {filesData && filesData.other_files.length > 0 && (
                  <div className="other-files">
                    <span className="other-files-label">Other files</span>
                    {filesData.other_files.map(n => (
                      <span key={n} className="other-file-name">{n}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Global shared reports */}
              <div className="upload-card files-card">
                <div className="files-card-title">
                  <FileSpreadsheet size={14} />
                  <span>Global Reports</span>
                  <span className="files-card-sub">from <code>global/</code> — shared</span>
                </div>
                <div className="file-list">
                  {filesData?.global_files.map(f => <FileRow key={f.report_key} file={f} />)}
                </div>
                <div className="info-note" style={{ marginTop: 14 }}>
                  <AlertTriangle size={14} />
                  MB52 and Scope List are shared reports. Place them in the <code>global/</code>
                  folder at the project root, not inside a project folder.
                </div>
              </div>
            </div>

            {/* Process panel */}
            <div className="process-panel">
              <div className="process-panel-text">
                <div className="process-title">Run Shortage Calculation</div>
                <div className="process-desc">
                  Stages all reports into <code>data/raw/</code> then runs parsers and shortage
                  calculation. Source files in <code>projects/</code> and <code>global/</code> are
                  never modified.
                </div>
              </div>
              <button
                id="process-all-btn"
                className="primary-button process-btn"
                disabled={!canProcess}
                onClick={runProcessing}
                title={
                  !selectedProject ? "Select a project first"
                    : !status?.ready ? "Some required reports are missing"
                    : "Stage reports and run processing"
                }
              >
                {processing
                  ? <><LoaderCircle className="spin" size={16} /> Processing…</>
                  : <><Activity size={16} /> Process All Reports</>}
              </button>
            </div>

            {processSuccess && (
              <div className="upload-message success-text">
                <CheckCircle size={14} /> {processSuccess}
              </div>
            )}
            {processError && (
              <div className="upload-message error-text">
                <AlertTriangle size={14} /> {processError}
              </div>
            )}
            {processLog && <pre className="process-log">{processLog}</pre>}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Root App component
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [page, setPage] = useState<"shortage" | "input">("shortage");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* Shortage page state */
  const [filters, setFilters] = useState<Filters>({
    material_ref_code: [], wbs_element: [], material_code: [], scope: [],
  });
  const [selected, setSelected] = useState({
    material_ref_code: "All", wbs_element: "All", material_code: "All", scope: "All",
  });
  const [payload, setPayload] = useState<Payload | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState({ by: "material_code", dir: "asc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});

  /* Shared project state — used by both sidebar combobox and InputPage */
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");

  /* ── Data loaders ── */
  const loadFilters = useCallback(async () => {
    const res = await fetch(`${API}/filters`);
    if (!res.ok) throw new Error("Could not load filter values.");
    setFilters(await res.json());
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({
        page: String(pageNum), page_size: String(pageSize),
        sort_by: sort.by, sort_dir: sort.dir,
      });
      (Object.keys(selected) as (keyof typeof selected)[])
        .forEach(k => { if (selected[k] !== "All") params.set(k, selected[k]); });
      const res = await fetch(`${API}/shortages?${params}`);
      if (!res.ok) throw new Error("API error");
      setPayload(await res.json());
    } catch {
      setError("Cannot connect to the backend. Start FastAPI on http://127.0.0.1:8000 and refresh.");
    } finally { setLoading(false); }
  }, [selected, pageNum, pageSize, sort]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API}/projects`);
      if (res.ok) setProjects((await res.json()).projects ?? []);
    } catch { /* non-blocking */ }
  }, []);

  useEffect(() => {
    loadFilters().catch(() => setError("Backend is not running. Start FastAPI first."));
    loadProjects();
  }, [loadFilters, loadProjects]);
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (page === "input") loadProjects(); }, [page, loadProjects]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payload?.items ?? [];
    return (payload?.items ?? []).filter(r =>
      Object.values(r).some(v => String(v ?? "").toLowerCase().includes(q))
    );
  }, [payload, search]);

  const rowKey = (r: Row) => `${r.material_code}||${r.wbs_element}`;

  const updateFilter = (key: keyof typeof selected, value: string) => {
    setSelected(prev => ({ ...prev, [key]: value })); setPageNum(1);
  };
  const sortBy = (key: keyof Row) => {
    setSort(prev => ({ by: key, dir: prev.by === key && prev.dir === "asc" ? "desc" : "asc" }));
    setPageNum(1);
  };
  const saveRemark = async (row: Row, val: string) => {
    setRemarksMap(prev => ({ ...prev, [rowKey(row)]: val }));
    try {
      await fetch(`${API}/remarks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_code: row.material_code, wbs_element: row.wbs_element, remarks: val }),
      });
    } catch { /* silent */ }
  };
  const exportVisible = () => {
    const h = columns.map(c => c.label);
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [h.map(esc).join(","), ...filteredRows.map(r => columns.map(c => esc(r[c.key])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = "abb-shortage-records.csv"; a.click();
    URL.revokeObjectURL(url);
  };
  const exportXlsx = () => {
    const params = new URLSearchParams({ format: "xlsx" });
    (Object.keys(selected) as (keyof typeof selected)[])
      .forEach(k => { if (selected[k] !== "All") params.set(k, selected[k]); });
    const a = document.createElement("a");
    a.href = `${API}/export?${params}`; a.download = "abb-shortage-records.xlsx"; a.click();
  };

  return (
    <div className={`app-shell${sidebarOpen ? "" : " sidebar-collapsed"}`}>
      {/* ── Sidebar ───────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? "" : " collapsed"}`}>
        <div className="brand">
          {sidebarOpen && <>
            <div className="abb-logo">ABB</div>
            <div><div className="brand-title">Shortage Management</div></div>
          </>}
          <button className="sidebar-toggle"
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}>
            <Menu size={18} />
          </button>
        </div>

        {sidebarOpen && <>
          <div className="sidebar-caption">WORKSPACE</div>
          <button className={`nav-item ${page === "shortage" ? "active" : ""}`}
            onClick={() => setPage("shortage")}>
            <LayoutDashboard size={18} /> Shortage Management
          </button>
          <button className={`nav-item ${page === "input" ? "active" : ""}`}
            onClick={() => setPage("input")}>
            <FileSpreadsheet size={18} /> Input &amp; Imports
          </button>

          {/* Project selector — only on Input page */}
          {page === "input" && (
            <>
              <div className="sidebar-caption filter-caption" style={{ marginTop: 24 }}>
                <FolderOpen size={13} /> SELECT PROJECT
              </div>
              <label className="filter-field">
                <span>Project</span>
                <Combobox
                  value={selectedProject || "All"}
                  options={projects}
                  onChange={v => setSelectedProject(v === "All" ? "" : v)}
                  placeholder="— choose project —"
                />
              </label>
              <button className="reset-button" style={{ marginTop: 4 }} onClick={loadProjects}>
                <RefreshCw size={13} /> Refresh projects
              </button>
            </>
          )}

          {/* Shortage filters — only on Shortage page */}
          {page === "shortage" && <>
            <div className="sidebar-caption filter-caption"><Filter size={14} /> FILTERS</div>
            {(Object.keys(filterLabels) as (keyof Filters)[]).map(key => (
              <label className="filter-field" key={key}>
                <span>{filterLabels[key]}</span>
                <Combobox value={selected[key]} options={filters[key] ?? []}
                  onChange={v => updateFilter(key, v)} />
              </label>
            ))}
            <button className="reset-button" onClick={() => {
              setSelected({ material_ref_code: "All", wbs_element: "All", material_code: "All", scope: "All" });
              setPageNum(1);
            }}>
              <RefreshCw size={14} /> Reset filters
            </button>
          </>}

          <div className="sidebar-bottom">
            <div className="status-dot" /> Local workspace <span className="version">v1.0</span>
          </div>
        </>}

        {!sidebarOpen && (
          <div className="sidebar-icons-collapsed">
            <button className={`nav-icon${page === "shortage" ? " active" : ""}`}
              onClick={() => setPage("shortage")} title="Shortage Management">
              <LayoutDashboard size={20} />
            </button>
            <button className={`nav-icon${page === "input" ? " active" : ""}`}
              onClick={() => setPage("input")} title="Input &amp; Imports">
              <FileSpreadsheet size={20} />
            </button>
          </div>
        )}
      </aside>

      {/* ── Main content ─────────────────────────────── */}
      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">ABB · MATERIAL PLANNING</div>
            <h1>{page === "shortage" ? "Shortage Management" : "Input & Imports"}</h1>
            <p>{page === "shortage"
              ? "Monitor material availability and procurement gaps."
              : "Select a project, verify required reports, and run shortage calculations."}</p>
          </div>
          <div className="topbar-actions">
            <div className="system-status"><span className="status-dot" /> API workspace</div>
            <div className="avatar">AM</div>
          </div>
        </header>

        {error && (
          <div className="alert error">
            <AlertTriangle size={18} />
            <span>{error}</span>
            <button onClick={() => { loadFilters().catch(() => {}); loadData(); }}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}

        {/* ── Shortage page ── */}
        {page === "shortage" ? (
          <>
            <section className="table-card">
              <div className="table-heading">
                <div>
                  <h2>Material shortage register</h2>
                  <p>Material-level inventory and procurement position</p>
                </div>
                <div className="table-actions">
                  <ExportMenu onCsv={exportVisible} onXlsx={exportXlsx} />
                  <button className="primary-button" onClick={() => setPage("input")}>
                    <UploadCloud size={16} /> Import data
                  </button>
                </div>
              </div>
              <div className="table-toolbar">
                <div className="result-count">
                  {loading ? "Loading records…" : `${fmt(payload?.total)} records`}
                </div>
                <div className="toolbar-right">
                  <div className="search-box">
                    <Search size={15} />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search visible records…" />
                    {search && <button onClick={() => setSearch("")}><X size={13} /></button>}
                  </div>
                  <label className="page-size">
                    Rows <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPageNum(1); }}>
                      <option>10</option><option>25</option><option>50</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {columns.map(col => (
                        <th key={col.key}
                          className={`${col.numeric ? "numeric" : ""} ${col.key === "remarks" ? "remarks-col" : ""}`}>
                          <button className="sort-button" onClick={() => sortBy(col.key)}>
                            {col.label}
                            {sort.by === col.key && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={columns.length} className="empty-cell">
                        <LoaderCircle className="spin" size={22} /> Loading shortage data…
                      </td></tr>
                    ) : filteredRows.length === 0 ? (
                      <tr><td colSpan={columns.length} className="empty-cell">No records match your filters.</td></tr>
                    ) : filteredRows.map((row, idx) => (
                      <tr key={`${row.material_code}-${row.wbs_element}-${idx}`}>
                        {columns.map(col => (
                          <td key={col.key}
                            className={`${col.numeric ? "numeric" : ""} ${col.key === "remarks" ? "remarks-cell" : ""}`}>
                            {col.key === "net_shortage"
                              ? <span className={`shortage-pill ${Number(row.net_shortage) > 0 ? "has-shortage" : "no-shortage"}`}>
                                {fmt(row.net_shortage)}
                              </span>
                              : col.key === "material_code"
                              ? <span className="material-code">{row.material_code || "—"}</span>
                              : col.numeric ? fmt(row[col.key] as number)
                              : col.key === "remarks"
                              ? <RemarksCell value={remarksMap[rowKey(row)] ?? row.remarks ?? ""} onSave={val => saveRemark(row, val)} />
                              : <span>{String(row[col.key] ?? "—") || "—"}</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <span>Page {payload?.page ?? pageNum} of {payload?.pages ?? 1}</span>
                <div className="pagination">
                  <button disabled={pageNum <= 1 || loading} onClick={() => setPageNum(p => Math.max(1, p - 1))}>
                    <ChevronLeft size={16} />
                  </button>
                  <span>{pageNum}</span>
                  <button disabled={pageNum >= (payload?.pages ?? 1) || loading} onClick={() => setPageNum(p => p + 1)}>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </section>
            <div className="footnote">
              <Activity size={14} /> Data shown from the local shortage database. Verify imported values against source SAP reports.
            </div>
          </>
        ) : (
          /* ── Input & Imports page ── */
          <InputPage
            selectedProject={selectedProject}
            setSelectedProject={setSelectedProject}
            projects={projects}
            onRefreshProjects={loadProjects}
          />
        )}
      </main>
    </div>
  );
}
