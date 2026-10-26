import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, CheckCircle, ChevronDown,
  ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Filter, FolderOpen,
  LayoutDashboard, LoaderCircle, Menu, RefreshCw, Search, UploadCloud, X,
  XCircle, Truck, CheckSquare, Square, Trash2,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────
   API base — relative so dev proxy + production both work.
───────────────────────────────────────────────────────────── */
const API = "/api";

function DismissibleNotice({
  children, className, style,
}: {
  children: React.ReactNode;
  className: string;
  style?: React.CSSProperties;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className={`${className} dismissible-notice`} style={style}
      role={className.includes("error") ? "alert" : "status"}>
      {children}
      <button type="button" className="notification-close" aria-label="Close notification"
        title="Close notification" onClick={() => setDismissed(true)}>
        <X size={14} />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Shared UI components
═══════════════════════════════════════════════════════════ */

/** Position hook to dynamically anchor dropdown above/below and expand visible height intelligently based on available viewport space. */
function useDropdownPosition(open: boolean, triggerRef: React.RefObject<HTMLDivElement>) {
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const [maxListHeight, setMaxListHeight] = useState<number>(380);

  const calculate = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 14;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    // Prefer opening upward if space below is cramped (< 300px) and above has more space
    const openUp = spaceBelow < 300 && spaceAbove > spaceBelow;
    setPlacement(openUp ? "top" : "bottom");

    // Compute maximum allowable height for the list to maximize visible items without viewport overflow
    const available = openUp ? spaceAbove : spaceBelow;
    // Reserve ~70px for search bar, clear button (if any), borders and padding
    const targetHeight = Math.max(180, Math.min(Math.floor(available - 70), 480));
    setMaxListHeight(targetHeight);
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (!open) return;
    calculate();
    window.addEventListener("resize", calculate);
    window.addEventListener("scroll", calculate, true);
    return () => {
      window.removeEventListener("resize", calculate);
      window.removeEventListener("scroll", calculate, true);
    };
  }, [open, calculate]);

  return { placement, maxListHeight };
}

/** Searchable single-select dropdown combobox. */
function Combobox({
  value, options, onChange, placeholder = "Select…",
}: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { placement, maxListHeight } = useDropdownPosition(open, ref);

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
        <div className={`combobox-dropdown placement-${placement}`}>
          <div className="combobox-search">
            <Search size={11} />
            <input autoFocus value={search}
              onChange={e => setSearch(e.target.value)} placeholder="Search…" />
            {search && <button onClick={() => setSearch("")}><X size={10} /></button>}
          </div>
          <ul className="combobox-list" style={{ maxHeight: `${maxListHeight}px` }}>
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

/** Multi-select combobox with checkboxes. */
function MultiCombobox({
  values, options, onChange, placeholder = "All",
}: {
  values: string[]; options: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { placement, maxListHeight } = useDropdownPosition(open, ref);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter(o => o.toLowerCase().includes(q)) : options;
  }, [options, search]);

  const toggle = (v: string) => {
    if (values.includes(v)) onChange(values.filter(x => x !== v));
    else onChange([...values, v]);
  };

  const displayValue = values.length === 0
    ? placeholder
    : values.length === 1
    ? values[0]
    : `${values.length} selected`;

  return (
    <div className="combobox" ref={ref}>
      <button type="button" className="combobox-trigger"
        onClick={() => { setOpen(o => !o); setSearch(""); }}>
        <span className="combobox-value">{displayValue}</span>
        <ChevronDown size={13} className={`combobox-chevron${open ? " open" : ""}`} />
      </button>
      {open && (
        <div className={`combobox-dropdown placement-${placement}`}>
          <div className="combobox-search">
            <Search size={11} />
            <input autoFocus value={search}
              onChange={e => setSearch(e.target.value)} placeholder="Search…" />
            {search && <button onClick={() => setSearch("")}><X size={10} /></button>}
          </div>
          {values.length > 0 && (
            <div className="multi-combobox-clear">
              <button onMouseDown={() => onChange([])}>
                <X size={10} /> Clear ({values.length})
              </button>
            </div>
          )}
          <ul className="combobox-list" style={{ maxHeight: `${maxListHeight}px` }}>
            {filtered.length === 0
              ? <li className="combobox-empty">No matches</li>
              : filtered.map(o => (
                <li key={o}
                  className={`combobox-option multi-option${values.includes(o) ? " selected" : ""}`}
                  onMouseDown={() => toggle(o)}>
                  <span className="multi-check">
                    {values.includes(o)
                      ? <CheckSquare size={12} />
                      : <Square size={12} />}
                  </span>
                  {o}
                </li>
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
  net_shortage: number; free_stock: number; vendor_detail: string; remarks: string; scope: string;
  final_date: string;
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

// Vendor Track types
interface VtRow {
  vendor_detail: string;
  wbs_element: string;
  material_code: string;
  description: string;
  quantity: number;
  vendor_date: string;
  proposed_date: string;
  final_date: string;
}
interface VtPayload {
  items: VtRow[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
interface ExportModalData {
  vendor: string;
  vendor_folder?: string;
  project_count: number | string;
  projects: string[];
  wbs_elements: string | string[];
  row_count: number;
  remark: "First" | "Second";
  filename: string;
  output_path: string;
  message: string;
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
  { key: "vendor_detail", label: "Vendor Detail" },
  { key: "final_date", label: "Final Date" },
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
  selectedProject, setSelectedProject, projects, onRefreshProjects, onProcessSuccess,
}: {
  selectedProject: string;
  setSelectedProject: (id: string) => void;
  projects: string[];
  onRefreshProjects: () => Promise<void>;
  onProcessSuccess?: () => void;
}) {
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [filesData, setFilesData] = useState<ProjectFilesResponse | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processLog, setProcessLog] = useState("");
  const [processError, setProcessError] = useState("");
  const [processSuccess, setProcessSuccess] = useState("");
  const [exportingReg, setExportingReg] = useState(false);
  const [exportRegSuccess, setExportRegSuccess] = useState("");
  const [projectSidebarOpen, setProjectSidebarOpen] = useState(true);

  const refreshProjects = async () => {
    setLoadingProjects(true);
    await onRefreshProjects();
    setLoadingProjects(false);
  };

  const runExportRegister = async () => {
    if (!selectedProject) return;
    setExportingReg(true);
    setExportRegSuccess("");
    setProcessError("");
    try {
      const res = await fetch(
        `${API}/projects/${encodeURIComponent(selectedProject)}/export-register`,
        { method: "POST" },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Export failed.");
      setExportRegSuccess(
        `Material Shortage Register saved: ${result.filename} (${result.rows} rows). Path: ${result.path}`
      );
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExportingReg(false);
    }
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
      // Auto-navigate to Material Shortage Register after successful processing
      if (onProcessSuccess) {
        setTimeout(() => onProcessSuccess(), 1500);
      }
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : "Processing failed.");
    } finally { setProcessing(false); }
  };

  const canProcess = !!selectedProject && status?.ready === true && !processing;
  const availableCount = filesData ? filesData.project_files.filter(f => f.available).length : 0;

  return (
    <div className={`input-page${projectSidebarOpen ? "" : " input-page-sidebar-collapsed"}`}>
      {/* ── Left: project list sidebar ─────────────────── */}
      <div className="input-sidebar">
        <div className="input-section-head">
          <h2 className="input-sidebar-title">Projects</h2>
          <button className="sidebar-toggle workspace-toggle" onClick={() => setProjectSidebarOpen(o => !o)}
            title={projectSidebarOpen ? "Collapse project list" : "Expand project list"}>
            <Menu size={16} />
          </button>
          <button className="outline-button icon-btn" onClick={refreshProjects}
            title="Refresh project list">
            <RefreshCw size={13} className={loadingProjects ? "spin" : ""} />
          </button>
        </div>

        {projectSidebarOpen && (loadingProjects ? (
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
        ))}
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
              <DismissibleNotice key={selectedProject} className="alert error missing-alert">
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
              </DismissibleNotice>
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
                <div className="process-title">Run Shortage Calculation &amp; Register Export</div>
                <div className="process-desc">
                  Stages all reports into <code>data/raw/</code>, runs parsers and shortage calculation,
                  and generates the Material Shortage Register workbook in <code>Material Shortage Registers/</code>.
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  id="export-register-btn"
                  className="outline-button"
                  disabled={!selectedProject || exportingReg || processing}
                  onClick={runExportRegister}
                  title="Export or regenerate Material Shortage Register workbook for this project"
                >
                  {exportingReg
                    ? <><LoaderCircle className="spin" size={14} /> Exporting…</>
                    : <><FileSpreadsheet size={14} /> Export Register</>}
                </button>
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
            </div>

            {exportRegSuccess && (
              <DismissibleNotice key={exportRegSuccess} className="upload-message success-text">
                <CheckCircle size={14} /> {exportRegSuccess}
              </DismissibleNotice>
            )}
            {processSuccess && (
              <DismissibleNotice key={processSuccess} className="upload-message success-text">
                <CheckCircle size={14} /> {processSuccess}
              </DismissibleNotice>
            )}
            {processError && (
              <DismissibleNotice key={processError} className="upload-message error-text">
                <AlertTriangle size={14} /> {processError}
              </DismissibleNotice>
            )}
            {processLog && <pre className="process-log">{processLog}</pre>}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Vendor Import types
═══════════════════════════════════════════════════════════ */
interface ImportFile {
  vendor_folder: string;
  filename: string;
  relative_path: string;
  absolute_path: string;
  size_bytes: number;
  modified_at: string;
  is_outgoing: boolean;
}
interface PreviewItem {
  row_index: number;
  project_id: string;
  wbs_element: string;
  material_code: string;
  description: string;
  vendor: string;
  quantity: number | null;
  vendor_date: string;
  proposed_date: string;
  final_date: string;
  matched: boolean;
  ambiguous: boolean;
  status: "";
  workbook_values: Record<string, string>;
}
interface PreviewResult {
  filename: string;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  changed_dates_count: number;
  proposed_dates_count: number;
  ambiguous_rows: number;
  headers: string[];
  items: PreviewItem[];
}
interface SubmittedFinalDateFolder {
  name: string;
  file_count: number;
}

/* ═══════════════════════════════════════════════════════════
   Vendor Track Import page
═══════════════════════════════════════════════════════════ */
function VendorImportPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ImportFile | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [openingExcel, setOpeningExcel] = useState(false);
  const [applying, setApplying] = useState(false);
  const [exportingProposals, setExportingProposals] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [proposalResult, setProposalResult] = useState("");
  const [openExcelResult, setOpenExcelResult] = useState("");
  const [error, setError] = useState("");
  const [submittedFinalDateFolders, setSubmittedFinalDateFolders] = useState<SubmittedFinalDateFolder[]>([]);
  const [loadingSubmittedFolders, setLoadingSubmittedFolders] = useState(false);
  const [deletingSubmittedFolder, setDeletingSubmittedFolder] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    setError("");
    try {
      const res = await fetch(`${API}/vendor-track/import/discover`);
      if (!res.ok) throw new Error("Failed to discover vendor files.");
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files.");
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const loadSubmittedFinalDateFolders = useCallback(async () => {
    setLoadingSubmittedFolders(true);
    try {
      const res = await fetch(`${API}/vendor-track/import/submitted-final-date`);
      if (res.ok) {
        const data = await res.json();
        setSubmittedFinalDateFolders(data.folders ?? []);
      }
    } catch { /* non-blocking */ }
    finally { setLoadingSubmittedFolders(false); }
  }, []);

  useEffect(() => { loadFiles(); loadSubmittedFinalDateFolders(); }, [loadFiles, loadSubmittedFinalDateFolders]);

  const handlePreview = async (file: ImportFile) => {
    setSelectedFile(file);
    setPreviewing(true);
    setPreview(null);
    setApplyResult(null);
    setProposalResult("");
    setOpenExcelResult("");
    setError("");
    try {
      const res = await fetch(`${API}/vendor-track/import/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: file.absolute_path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Preview failed.");
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  };

  const refreshFilesAndPreview = async () => {
    await Promise.all([loadFiles(), loadSubmittedFinalDateFolders()]);
    if (selectedFile) await handlePreview(selectedFile);
  };

  const deleteSubmittedFinalDateFolder = async (folder: SubmittedFinalDateFolder) => {
    if (!window.confirm(`Delete Submitted Final Date/${folder.name} and its archived response files? Import history will remain.`)) return;
    setDeletingSubmittedFolder(folder.name);
    setError("");
    try {
      const res = await fetch(`${API}/vendor-track/import/submitted-final-date/${encodeURIComponent(folder.name)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not delete the archived folder.");
      setApplyResult({ success: true, message: data.message || `Deleted Submitted Final Date/${folder.name}.` });
      await loadSubmittedFinalDateFolders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the archived folder.");
    } finally {
      setDeletingSubmittedFolder("");
    }
  };

  const handleOpenExcel = async () => {
    if (!selectedFile) return;
    setOpeningExcel(true);
    setError("");
    setOpenExcelResult("");
    try {
      const res = await fetch(`${API}/vendor-track/import/open-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: selectedFile.absolute_path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not open the workbook.");
      setOpenExcelResult(data.message || `Opened ${selectedFile.filename}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the workbook.");
    } finally {
      setOpeningExcel(false);
    }
  };

  const handleApply = async () => {
    if (!selectedFile) return;
    setShowConfirm(false);
    setApplying(true);
    setError("");
    setApplyResult(null);
    try {
      const res = await fetch(`${API}/vendor-track/import/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: selectedFile.absolute_path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Apply failed.");
      setApplyResult(data);
      setProposalResult("");
      if (data.archived_path) {
        setSelectedFile(null);
        setPreview(null);
      }
      await Promise.all([loadFiles(), loadSubmittedFinalDateFolders()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setApplying(false);
    }
  };

  const handleExportProposals = async () => {
    if (!selectedFile) return;
    setExportingProposals(true);
    setError("");
    setProposalResult("");
    try {
      const res = await fetch(`${API}/vendor-track/import/export-proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: selectedFile.absolute_path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not export proposed dates.");
      setProposalResult(data.message || `Exported ${data.filename}.`);
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export proposed dates.");
    } finally {
      setExportingProposals(false);
    }
  };

  const incomingFiles = files.filter(f => !f.is_outgoing);
  const filesByVendor = incomingFiles.reduce<Record<string, ImportFile[]>>((groups, file) => {
    (groups[file.vendor_folder] ??= []).push(file);
    return groups;
  }, {});
  const proposalRows = preview?.items.filter(item =>
    item.proposed_date.trim() && item.proposed_date.trim().toLowerCase() !== item.vendor_date.trim().toLowerCase()
  ) ?? [];
  const canExportProposals = Boolean(
    preview && proposalRows.length > 0 && proposalRows.every(item => item.matched && !item.ambiguous)
  );
  const canApplyVendorDates = Boolean(
    preview && preview.changed_dates_count > 0 && preview.unmatched_rows === 0 && preview.ambiguous_rows === 0
  );

  return (
    <div className={`vt-page${sidebarOpen ? "" : " vt-page-sidebar-collapsed"}`}>
      {/* ── Sidebar: file list ─────────────────────────── */}
      <div className="vt-sidebar">
        <button className="vt-local-sidebar-toggle" onClick={() => setSidebarOpen(o => !o)}
          title={sidebarOpen ? "Collapse import sidebar" : "Expand import sidebar"}>
          <Menu size={15} />
          {sidebarOpen && <span>Collapse</span>}
        </button>
        {sidebarOpen && <>
        <div className="vt-sidebar-section">
          <div className="vt-section-head">
            <FolderOpen size={13} />
            <span>VENDOR RESPONSE FILES</span>
          </div>
          <div className="vt-project-controls">
            <button className="vt-ctrl-btn" onClick={refreshFilesAndPreview} title="Refresh files and preview the selected workbook">
              <RefreshCw size={11} className={loadingFiles ? "spin" : ""} />
            </button>
          </div>

          {loadingFiles ? (
            <div className="vt-empty-hint"><LoaderCircle size={14} className="spin" /> Scanning…</div>
          ) : incomingFiles.length === 0 ? (
            <div className="vt-empty-hint">
              <FolderOpen size={20} style={{ margin: "4px auto 8px", display: "block", color: "#888" }} />
              No vendor response files found.<br />
              Place vendor workbooks in <code>Vendor Date Registers/</code> or <code>Vendor Registers/</code>.
            </div>
          ) : (
            <div className="vt-project-list">
              {Object.entries(filesByVendor).map(([vendor, vendorFiles]) => (
                <div key={vendor} className="response-vendor-group">
                  <div className="response-vendor-heading"><FolderOpen size={12} /> {vendor}</div>
                  {vendorFiles.map(f => (
                    <div
                      key={f.absolute_path}
                      className={`vt-project-item${selectedFile?.absolute_path === f.absolute_path ? " vt-project-checked" : ""}`}
                      onClick={() => handlePreview(f)} role="button" tabIndex={0}
                      onKeyDown={e => e.key === "Enter" && handlePreview(f)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="file-name" style={{ wordBreak: "break-all" }}>{f.filename}</div>
                        <div className="file-label">{f.modified_at}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="vt-sidebar-section">
          <div className="vt-section-head">
            <FolderOpen size={13} />
            <span>SUBMITTED FINAL DATE</span>
          </div>
          <div className="vt-project-controls">
            <button className="vt-ctrl-btn" onClick={loadSubmittedFinalDateFolders} title="Refresh submitted final date folders" disabled={loadingSubmittedFolders}>
              <RefreshCw size={11} className={loadingSubmittedFolders ? "spin" : ""} />
            </button>
          </div>
          {loadingSubmittedFolders && submittedFinalDateFolders.length === 0 ? (
            <div className="vt-empty-hint"><LoaderCircle size={14} className="spin" /> Scanning…</div>
          ) : submittedFinalDateFolders.length === 0 ? (
            <div className="vt-empty-hint">No archived vendor folders yet. A folder appears here after a response workbook is successfully applied.</div>
          ) : (
            <div className="vt-project-list submitted-final-date-list">
              {submittedFinalDateFolders.map(folder => (
                <div key={folder.name} className="submitted-final-date-row">
                  <div className="vt-project-item submitted-final-date-item" style={{ cursor: "default" }}>
                    <FolderOpen size={13} style={{ color: "#8a8d95", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="file-name" style={{ wordBreak: "break-word" }}>{folder.name}</div>
                      <div className="file-label">{folder.file_count} workbook{folder.file_count === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                  <button
                    className="workspace-project-delete"
                    onClick={() => deleteSubmittedFinalDateFolder(folder)}
                    title={`Delete Submitted Final Date/${folder.name}`}
                    aria-label={`Delete Submitted Final Date/${folder.name}`}
                    disabled={Boolean(deletingSubmittedFolder)}
                  >
                    {deletingSubmittedFolder === folder.name ? <LoaderCircle size={14} className="spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        </>}
      </div>

      {/* ── Main content ──────────────────────────── */}
      <div className="vt-main">
        {error && (
          <DismissibleNotice key={error} className="upload-message error-text" style={{ marginBottom: 16 }}>
            <AlertTriangle size={14} /> {error}
          </DismissibleNotice>
        )}
        {applyResult && (
          <DismissibleNotice key={`${applyResult.success}-${applyResult.message}`}
            className={`upload-message ${applyResult.success ? "success-text" : "error-text"}`} style={{ marginBottom: 16 }}>
            {applyResult.success ? <CheckCircle size={14} /> : <AlertTriangle size={14} />} {applyResult.message}
          </DismissibleNotice>
        )}
        {proposalResult && (
          <DismissibleNotice key={proposalResult} className="upload-message success-text" style={{ marginBottom: 16 }}>
            <CheckCircle size={14} /> {proposalResult}
          </DismissibleNotice>
        )}
        {openExcelResult && (
          <DismissibleNotice key={openExcelResult} className="upload-message success-text" style={{ marginBottom: 16 }}>
            <CheckCircle size={14} /> {openExcelResult} Edit and save Proposed Date in Excel, close the workbook, then refresh this preview.
          </DismissibleNotice>
        )}

        <section className="table-card vt-register-card">
          <div className="table-heading">
            <div>
              <h2>Vendor Response Import</h2>
              <p>
                {selectedFile
                  ? `Previewing: ${selectedFile.filename}`
                  : "Select a vendor response file to preview and import dates."}
              </p>
            </div>
            <div className="table-actions">
              <button className="primary-button excel-button" onClick={handleOpenExcel}
                disabled={!selectedFile || openingExcel}
                title={!selectedFile ? "Select a vendor response workbook first" : "Open the selected response workbook in Excel"}>
                {openingExcel
                  ? <><LoaderCircle size={14} className="spin" /> Opening…</>
                  : <><FileSpreadsheet size={14} /> Open Excel</>}
              </button>
              <button className="primary-button" onClick={handleExportProposals}
                disabled={!selectedFile || !canExportProposals || exportingProposals}
                title={!selectedFile ? "Select a vendor response workbook first"
                  : !canExportProposals ? "Add Proposed Date values for matched, unambiguous rows to enable export"
                  : "Save the proposed dates in the vendor's Proposed Date folder"}>
                {exportingProposals
                  ? <><LoaderCircle size={14} className="spin" /> Exporting…</>
                  : <><FileDown size={14} /> Export Vendor Date Request</>}
              </button>
              <button className="primary-button success-button" onClick={() => setShowConfirm(true)}
                disabled={!selectedFile || !canApplyVendorDates || applying}
                title={!selectedFile ? "Select a vendor response workbook first"
                  : !canApplyVendorDates ? "Requires accepted Vendor Dates with no unmatched or ambiguous rows"
                  : "Copy accepted Vendor Dates into the matched projects' Final Date fields"}>
                {applying
                  ? <><LoaderCircle size={14} className="spin" /> Applying…</>
                  : <><CheckCircle size={14} /> Update Material Shortage Registers</>}
              </button>
            </div>
          </div>

          {preview && (
            <div className="table-toolbar">
              <div className="result-count">
                {preview.total_rows} rows · {preview.matched_rows} matched ·{" "}
                <strong style={{ color: "#217a4d" }}>{preview.changed_dates_count} accepted Vendor Dates</strong> ·{" "}
                {preview.proposed_dates_count} proposed · {preview.unmatched_rows} unmatched · {preview.ambiguous_rows} ambiguous
              </div>
            </div>
          )}

          <div className="table-scroll vt-table-scroll">
            <table className="vt-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Matched Project</th>
                  {preview?.headers.map(header => <th key={header}>{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {previewing ? (
                  <tr><td colSpan={(preview?.headers.length ?? 0) + 2} className="empty-cell">
                    <LoaderCircle className="spin" size={22} /> Validating and previewing…
                  </td></tr>
                ) : !preview ? (
                  <tr><td colSpan={(preview?.headers.length ?? 0) + 2} className="empty-cell">
                    <FileSpreadsheet size={28} style={{ display: "block", margin: "0 auto 10px" }} />
                    Select a vendor response file from the sidebar to preview changes.
                  </td></tr>
                ) : preview.items.length === 0 ? (
                  <tr><td colSpan={(preview?.headers.length ?? 0) + 2} className="empty-cell">
                    No data rows found in the file.
                  </td></tr>
                ) : preview.items.map((item, idx) => (
                  <tr key={idx}>
                    <td />
                    <td>{item.project_id || "—"}</td>
                    {preview?.headers.map(header => (
                      <td key={header} className={header.toLowerCase().includes("date") ? "date-cell" : undefined}>
                        {header.trim().toLowerCase() === "status" ? "" : item.workbook_values[header] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ── Confirmation dialog ── */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">
                <AlertTriangle size={18} style={{ color: "#e07000" }} />
                <span>Confirm Import</span>
              </div>
              <button className="modal-close" onClick={() => setShowConfirm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p>
                This will copy <strong>Vendor Date</strong> into Final Date for <strong>{preview?.changed_dates_count ?? 0}</strong> matched row(s)
                in the shortage database and refresh affected Material Shortage Registers.
              </p>
              <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                File: <strong>{selectedFile?.filename}</strong>
              </p>
            </div>
            <div className="modal-foot">
              <button className="outline-button" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="primary-button" onClick={handleApply}>
                <CheckCircle size={14} /> Apply Dates
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Vendor Track page (Export)
═══════════════════════════════════════════════════════════ */
function VendorTrackPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Project selection state
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [processMsg, setProcessMsg] = useState("");
  const [processError, setProcessError] = useState("");

  // Filter state
  const [vendorOptions, setVendorOptions] = useState<string[]>([]);
  const [wbsOptions, setWbsOptions] = useState<string[]>([]);
  const [selectedVendor, setSelectedVendor] = useState("All Vendors");
  const [selectedWbs, setSelectedWbs] = useState<string[]>([]);

  // Table state
  const [vtPayload, setVtPayload] = useState<VtPayload | null>(null);
  const [vtLoading, setVtLoading] = useState(false);
  const [vtError, setVtError] = useState("");
  const [vtPage, setVtPage] = useState(1);
  const [vtPageSize, setVtPageSize] = useState(50);

  // Track which project_ids are currently displayed
  const [processedProjectIds, setProcessedProjectIds] = useState<string[]>([]);

  /* ── Load projects on mount ── */
  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`${API}/vendor-track/projects`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects ?? []);
      }
    } catch { /* non-blocking */ }
    finally { setLoadingProjects(false); }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  /* ── Load vendor filter options ── */
  const loadVendors = useCallback(async (pids: string[]) => {
    try {
      const params = pids.length ? `?project_ids=${pids.join(",")}` : "";
      const res = await fetch(`${API}/vendor-track/vendors${params}`);
      if (res.ok) {
        const data = await res.json();
        setVendorOptions(data.vendors ?? []);
        // Reset vendor selection if no longer available
        setSelectedVendor(prev => {
          if (prev !== "All Vendors" && !(data.vendors ?? []).includes(prev)) return "All Vendors";
          return prev;
        });
      }
    } catch { /* non-blocking */ }
  }, []);

  /* ── Load WBS filter options (vendor-aware) ── */
  const loadWbs = useCallback(async (pids: string[], vendor: string) => {
    try {
      const params = new URLSearchParams();
      if (pids.length) params.set("project_ids", pids.join(","));
      if (vendor && vendor !== "All Vendors") params.set("vendor", vendor);
      const res = await fetch(`${API}/vendor-track/wbs-elements?${params}`);
      if (res.ok) {
        const data = await res.json();
        setWbsOptions(data.wbs_elements ?? []);
        // Remove any selected WBS elements no longer available
        setSelectedWbs(prev => prev.filter(w => (data.wbs_elements ?? []).includes(w)));
      }
    } catch { /* non-blocking */ }
  }, []);

  /* ── Load VT records ── */
  const loadVtData = useCallback(async (
    pids: string[], vendor: string, wbs: string[], page: number, pageSize: number,
  ) => {
    setVtLoading(true);
    setVtError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (pids.length) params.set("project_ids", pids.join(","));
      if (vendor && vendor !== "All Vendors") params.set("vendor", vendor);
      if (wbs.length) params.set("wbs_elements", wbs.join(","));
      const res = await fetch(`${API}/vendor-track/records?${params}`);
      if (!res.ok) throw new Error("Failed to load vendor track records.");
      setVtPayload(await res.json());
    } catch (e) {
      setVtError(e instanceof Error ? e.message : "Failed to load records.");
    } finally {
      setVtLoading(false);
    }
  }, []);

  /* Reload data when filters/pagination changes */
  useEffect(() => {
    if (processedProjectIds.length === 0) return;
    loadVtData(processedProjectIds, selectedVendor, selectedWbs, vtPage, vtPageSize);
  }, [processedProjectIds, selectedVendor, selectedWbs, vtPage, vtPageSize, loadVtData]);

  /* Reload WBS options when vendor changes */
  useEffect(() => {
    if (processedProjectIds.length === 0) return;
    loadWbs(processedProjectIds, selectedVendor);
    setSelectedWbs([]);
    setVtPage(1);
  }, [selectedVendor, processedProjectIds, loadWbs]);

  /* ── Toggle project selection ── */
  const toggleProject = (id: string) => {
    setExportedRequestPath("");
    setSelectedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => { setExportedRequestPath(""); setSelectedProjects(new Set(projects)); };
  const clearSelection = () => { setExportedRequestPath(""); setSelectedProjects(new Set()); };

  /* ── Run Vendor Track processing ── */
  const runVendorTrack = async () => {
    if (selectedProjects.size === 0) {
      setProcessError("Select at least one project before running Vendor Track.");
      return;
    }
    setProcessing(true);
    setExportedRequestPath("");
    setProcessMsg("");
    setProcessError("");
    try {
      const res = await fetch(`${API}/vendor-track/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_ids: Array.from(selectedProjects) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Processing failed.");
      setProcessMsg(data.message || "Vendor Track processed successfully.");

      // Update which project IDs are now displayed
      const pids = Array.from(selectedProjects);
      setProcessedProjectIds(pids);

      // Reload filter options and table
      await loadVendors(pids);
      await loadWbs(pids, "All Vendors");
      setSelectedVendor("All Vendors");
      setSelectedWbs([]);
      setVtPage(1);
      await loadVtData(pids, "All Vendors", [], 1, vtPageSize);
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : "Processing failed.");
    } finally {
      setProcessing(false);
    }
  };

  const [exporting, setExporting] = useState(false);
  const [exportModalData, setExportModalData] = useState<ExportModalData | null>(null);
  const [exportedRequestPath, setExportedRequestPath] = useState("");
  const [openingExportExcel, setOpeningExportExcel] = useState(false);

  const handleExportDateRequest = async () => {
    setProcessError("");
    setProcessMsg("");
    if (!selectedVendor || selectedVendor === "All Vendors") {
      setProcessError("Please select a specific vendor from the Vendor filter before exporting. Multi-vendor export is not allowed.");
      return;
    }
    if (processedProjectIds.length === 0) {
      setProcessError("Load Vendor Track records before exporting.");
      return;
    }
    setExporting(true);
    setExportedRequestPath("");
    try {
      const res = await fetch(`${API}/vendor-track/export-date-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor: selectedVendor,
          project_ids: processedProjectIds,
          wbs_elements: selectedWbs.length ? selectedWbs : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Export failed.");
      setExportModalData(data);
      setExportedRequestPath(data.output_path || "");
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const handleOpenExportExcel = async () => {
    if (!exportedRequestPath) return;
    setOpeningExportExcel(true);
    setProcessError("");
    setProcessMsg("");
    try {
      const res = await fetch(`${API}/vendor-track/import/open-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: exportedRequestPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not open the Vendor Date Request.");
      setProcessMsg(data.message || "Opened the Vendor Date Request in Excel.");
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : "Could not open the Vendor Date Request.");
    } finally {
      setOpeningExportExcel(false);
    }
  };

  const vtColumns = [
    { key: "vendor_detail", label: "Vendor Detail" },
    { key: "wbs_element", label: "WBS Element" },
    { key: "material_code", label: "Material Code" },
    { key: "description", label: "Description" },
    { key: "quantity", label: "Quantity", numeric: true },
    { key: "vendor_date", label: "Vendor Date" },
    { key: "proposed_date", label: "Proposed Date" },
    { key: "final_date", label: "Final Date" },
  ] as const;

  return (
    <div className={`vt-page${sidebarOpen ? "" : " vt-page-sidebar-collapsed"}`}>
      {/* ── VT Sidebar ─────────────────────────────── */}
      <div className="vt-sidebar">
        <button className="vt-local-sidebar-toggle" onClick={() => setSidebarOpen(o => !o)}
          title={sidebarOpen ? "Collapse export sidebar" : "Expand export sidebar"}>
          <Menu size={15} />
          {sidebarOpen && <span>Collapse</span>}
        </button>
        {sidebarOpen && <>
        {/* Project selection */}
        <div className="vt-sidebar-section">
          <div className="vt-section-head">
            <FolderOpen size={13} />
            <span>PROJECTS</span>
            <span style={{ fontSize: 9, fontWeight: 500, color: "#8d8f97", marginLeft: "auto" }}>
              from Material Shortage Registers/
            </span>
          </div>
          <div className="vt-project-controls">
            <button className="vt-ctrl-btn" onClick={selectAll} disabled={projects.length === 0}>
              All
            </button>
            <button className="vt-ctrl-btn" onClick={clearSelection} disabled={selectedProjects.size === 0}>
              None
            </button>
            <button className="vt-ctrl-btn" onClick={loadProjects} title="Refresh project registers">
              <RefreshCw size={11} className={loadingProjects ? "spin" : ""} />
            </button>
          </div>

          {loadingProjects ? (
            <div className="vt-empty-hint"><LoaderCircle size={14} className="spin" /> Loading…</div>
          ) : projects.length === 0 ? (
            <div className="vt-empty-hint">
              <FolderOpen size={20} style={{ margin: "4px auto 8px", display: "block", color: "#888" }} />
              No register files found in <code>Material Shortage Registers/</code>.<br />
              Generate a project register in <strong>Input &amp; Imports</strong> first.
            </div>
          ) : (
            <div className="vt-project-list">
              {projects.map(id => (
                <div
                  key={id}
                  className={`vt-project-item${selectedProjects.has(id) ? " vt-project-checked" : ""}`}
                  onClick={() => toggleProject(id)}
                  role="checkbox"
                  aria-checked={selectedProjects.has(id)}
                  tabIndex={0}
                  onKeyDown={e => e.key === "Enter" && toggleProject(id)}
                >
                  <span className="vt-checkbox">
                    {selectedProjects.has(id)
                      ? <CheckSquare size={14} className="vt-check-icon checked" />
                      : <Square size={14} className="vt-check-icon" />}
                  </span>
                  <span className="vt-project-name">{id}</span>
                </div>
              ))}
            </div>
          )}

          {/* Vendor Track button */}
          <button
            id="vendor-track-btn"
            className="vt-run-btn"
            disabled={selectedProjects.size === 0 || processing}
            onClick={runVendorTrack}
          >
            {processing
              ? <><LoaderCircle size={14} className="spin" /> Processing…</>
              : <><Truck size={14} /> Vendor Track</>}
          </button>
          {selectedProjects.size > 0 && !processing && (
            <div className="vt-selection-count">
              {selectedProjects.size} project{selectedProjects.size !== 1 ? "s" : ""} selected
            </div>
          )}
        </div>

        {/* Filters — only show once data is loaded */}
        {processedProjectIds.length > 0 && (
          <div className="vt-sidebar-section vt-filters-section">
            <button className="vt-section-head vt-section-toggle" onClick={() => setFiltersOpen(open => !open)}
              aria-expanded={filtersOpen} aria-controls="vendor-track-export-filters">
              <Filter size={13} />
              <span>FILTERS</span>
              <ChevronDown size={14} className={`section-chevron${filtersOpen ? " open" : ""}`} />
            </button>

            {filtersOpen && <div id="vendor-track-export-filters" className="vt-filter-controls">
            {/* Vendor filter — single select */}
            <label className="vt-filter-field">
              <span>Vendor</span>
              <Combobox
                value={selectedVendor}
                options={vendorOptions}
                onChange={v => { setExportedRequestPath(""); setSelectedVendor(v === "All" ? "All Vendors" : v); setVtPage(1); }}
                placeholder="All Vendors"
              />
            </label>

            {/* WBS Element filter — multi select */}
            <label className="vt-filter-field">
              <span>WBS Element</span>
              <MultiCombobox
                values={selectedWbs}
                options={wbsOptions}
                onChange={v => { setExportedRequestPath(""); setSelectedWbs(v); setVtPage(1); }}
                placeholder="All"
              />
            </label>

            {(selectedVendor !== "All Vendors" || selectedWbs.length > 0) && (
              <button className="reset-button" style={{ marginTop: 4 }} onClick={() => {
                setExportedRequestPath("");
                setSelectedVendor("All Vendors");
                setSelectedWbs([]);
                setVtPage(1);
              }}>
                <RefreshCw size={13} /> Reset filters
              </button>
            )}
            </div>}
          </div>
        )}
        </>}
      </div>

      {/* ── VT Main content ──────────────────────────── */}
      <div className="vt-main">
        {/* Status messages */}
        {processMsg && (
          <DismissibleNotice key={processMsg} className="upload-message success-text" style={{ marginBottom: 16 }}>
            <CheckCircle size={14} /> {processMsg}
          </DismissibleNotice>
        )}
        {processError && (
          <DismissibleNotice key={processError} className="upload-message error-text" style={{ marginBottom: 16 }}>
            <AlertTriangle size={14} /> {processError}
          </DismissibleNotice>
        )}

        {/* Table card */}
        <section className="table-card vt-register-card">
          <div className="table-heading">
            <div>
              <h2>Vendor Track Register</h2>
              <p>
                {processedProjectIds.length > 0
                  ? `Consolidated records from: ${processedProjectIds.join(", ")}`
                  : "Select projects and click Vendor Track to load data."}
              </p>
            </div>
            <div className="table-actions">
              <button className="primary-button excel-button" onClick={handleOpenExportExcel}
                disabled={!exportedRequestPath || openingExportExcel}
                title={!exportedRequestPath ? "Export a Vendor Date Request first" : "Open the exported Vendor Date Request in Excel"}>
                {openingExportExcel
                  ? <><LoaderCircle size={14} className="spin" /> Opening…</>
                  : <><FileSpreadsheet size={14} /> Open Excel</>}
              </button>
              <button
                id="export-vendor-date-request-btn"
                className="primary-button"
                onClick={handleExportDateRequest}
                disabled={processedProjectIds.length === 0 || vtLoading || exporting || selectedVendor === "All Vendors"}
                title={
                  processedProjectIds.length === 0
                    ? "Load Vendor Track records first"
                    : selectedVendor === "All Vendors"
                    ? "Select a specific vendor from the Vendor filter before exporting"
                    : `Export Vendor Date Request for ${selectedVendor}`
                }
              >
                {exporting ? (
                  <><LoaderCircle size={14} className="spin" /> Exporting…</>
                ) : (
                  <><FileSpreadsheet size={14} /> Export Vendor Date Request</>
                )}
              </button>
              <label className="page-size">
                Rows <select value={vtPageSize} onChange={e => { setVtPageSize(Number(e.target.value)); setVtPage(1); }}>
                  <option>25</option><option>50</option><option>100</option><option>200</option>
                </select>
              </label>
            </div>
          </div>

          <div className="table-toolbar">
            <div className="result-count">
              {vtLoading ? "Loading records…" : `${vtPayload?.total ?? 0} records`}
            </div>
          </div>

          <div className="table-scroll vt-table-scroll">
            <table className="vt-table">
              <thead>
                <tr>
                  {vtColumns.map(col => (
                    <th key={col.key} className={`${col.numeric ? "numeric" : ""} vt-col-${col.key}`}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vtLoading ? (
                  <tr><td colSpan={vtColumns.length} className="empty-cell">
                    <LoaderCircle className="spin" size={22} /> Loading vendor track data…
                  </td></tr>
                ) : vtError ? (
                  <tr><td colSpan={vtColumns.length} className="empty-cell" style={{ color: "#b5121b" }}>
                    <AlertTriangle size={18} /> {vtError}
                  </td></tr>
                ) : processedProjectIds.length === 0 ? (
                  <tr><td colSpan={vtColumns.length} className="empty-cell">
                    <Truck size={28} style={{ display: "block", margin: "0 auto 10px" }} />
                    Select one or more projects and click <strong>Vendor Track</strong> to load data.
                  </td></tr>
                ) : vtPayload?.items.length === 0 ? (
                  <tr><td colSpan={vtColumns.length} className="empty-cell">
                    No records match your filters.
                  </td></tr>
                ) : vtPayload?.items.map((row, idx) => (
                  <tr key={`${row.material_code}-${row.wbs_element}-${idx}`}>
                    {vtColumns.map(col => (
                      <td key={col.key} className={`${col.numeric ? "numeric" : ""} vt-col-${col.key}`}>
                        {col.key === "quantity"
                          ? <span className={`shortage-pill ${Number(row.quantity) > 0 ? "has-shortage" : "no-shortage"}`}>
                              {fmt(row.quantity)}
                            </span>
                          : col.key === "material_code"
                          ? <span className="material-code">{row[col.key] || "—"}</span>
                          : <span>{row[col.key] || "—"}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            <span>Page {vtPayload?.page ?? vtPage} of {vtPayload?.pages ?? 1}</span>
            <div className="pagination">
              <button disabled={vtPage <= 1 || vtLoading} onClick={() => setVtPage(p => Math.max(1, p - 1))}>
                <ChevronLeft size={16} />
              </button>
              <span>{vtPage}</span>
              <button disabled={vtPage >= (vtPayload?.pages ?? 1) || vtLoading} onClick={() => setVtPage(p => p + 1)}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>

        <div className="footnote">
          <Truck size={14} /> Vendor Track shows consolidated shortage records per vendor across selected projects.
          Data is read-only — modify source project files and reprocess to update.
        </div>
      </div>

      {/* ── Export Result Modal ──────────────────────── */}
      {exportModalData && (
        <div className="modal-overlay" onClick={() => setExportModalData(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">
                <CheckCircle size={18} style={{ color: "#217a4d" }} />
                <span>Vendor Date Request Exported</span>
              </div>
              <button className="modal-close" onClick={() => setExportModalData(null)} title="Close">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <DismissibleNotice key={exportModalData.message} className="upload-message success-text">
                <CheckCircle size={15} />
                <span>{exportModalData.message}</span>
              </DismissibleNotice>

              <div className="export-meta-grid">
                <div className="meta-label">Vendor Name:</div>
                <div className="meta-val">{exportModalData.vendor}</div>

                <div className="meta-label">Selected Projects:</div>
                <div className="meta-val">
                  {exportModalData.project_count} project{exportModalData.project_count !== 1 ? "s" : ""}
                  {Array.isArray(exportModalData.projects) && exportModalData.projects.length > 0 && (
                    <span style={{ color: "#777", fontWeight: 400, marginLeft: 6 }}>
                      ({exportModalData.projects.join(", ")})
                    </span>
                  )}
                </div>

                <div className="meta-label">WBS Elements:</div>
                <div className="meta-val">
                  {Array.isArray(exportModalData.wbs_elements)
                    ? exportModalData.wbs_elements.join(", ")
                    : exportModalData.wbs_elements}
                </div>

                <div className="meta-label">Exported Rows:</div>
                <div className="meta-val">{exportModalData.row_count}</div>

                <div className="meta-label">Calculated Remark:</div>
                <div className="meta-val">
                  <span className={`remark-badge ${exportModalData.remark.toLowerCase()}`}>
                    {exportModalData.remark}
                  </span>
                </div>

                <div className="meta-label">Saved Filename:</div>
                <div className="meta-val">{exportModalData.filename}</div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 5 }}>
                  Exact Output File Location:
                </div>
                <div className="path-box">{exportModalData.output_path}</div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="primary-button" onClick={() => setExportModalData(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Root App component
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [page, setPage] = useState<"shortage" | "input" | "vendortrack">(() => {
    try {
      const savedPage = window.localStorage.getItem("abb-sm:selected-page");
      return savedPage === "shortage" || savedPage === "input" || savedPage === "vendortrack"
        ? savedPage
        : "input";
    } catch { return "input"; }
  });
  const [vtSubPage, setVtSubPage] = useState<"export" | "import">(() => {
    try {
      return window.localStorage.getItem("abb-sm:vendor-track-subpage") === "import" ? "import" : "export";
    } catch { return "export"; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [shortageSidebarOpen, setShortageSidebarOpen] = useState(true);
  const [shortageFiltersOpen, setShortageFiltersOpen] = useState(false);
  const [registerProjects, setRegisterProjects] = useState<string[]>([]);
  const [registerExporting, setRegisterExporting] = useState(false);
  const [registerOpening, setRegisterOpening] = useState(false);
  const [deletingRegisterProject, setDeletingRegisterProject] = useState("");
  const [registerExportMessage, setRegisterExportMessage] = useState("");

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

  /* Input/shortage project context; each page provides its own project list. */
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");

  useEffect(() => {
    try { window.localStorage.setItem("abb-sm:selected-page", page); } catch { /* storage may be unavailable */ }
  }, [page]);
  useEffect(() => {
    try { window.localStorage.setItem("abb-sm:vendor-track-subpage", vtSubPage); } catch { /* storage may be unavailable */ }
  }, [vtSubPage]);

  /* ── Data loaders ── */
  const loadFilters = useCallback(async () => {
    const params = new URLSearchParams();
    const projectFilter = page === "shortage" ? (selectedProject || "__no_project__") : selectedProject;
    if (projectFilter) params.set("project_id", projectFilter);
    const res = await fetch(`${API}/filters?${params}`);
    if (!res.ok) throw new Error("Could not load filter values.");
    setFilters(await res.json());
  }, [selectedProject, page]);

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({
        page: String(pageNum), page_size: String(pageSize),
        sort_by: sort.by, sort_dir: sort.dir,
      });
      const projectFilter = page === "shortage" ? (selectedProject || "__no_project__") : selectedProject;
      if (projectFilter) params.set("project_id", projectFilter);
      (Object.keys(selected) as (keyof typeof selected)[])
        .forEach(k => { if (selected[k] !== "All") params.set(k, selected[k]); });
      const res = await fetch(`${API}/shortages?${params}`);
      if (!res.ok) throw new Error("API error");
      setPayload(await res.json());
    } catch {
      setError("Cannot connect to the backend. Start this project's backend and refresh.");
    } finally { setLoading(false); }
  }, [selected, pageNum, pageSize, sort, selectedProject, page]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API}/projects`);
      if (res.ok) setProjects((await res.json()).projects ?? []);
    } catch { /* non-blocking */ }
  }, []);

  const loadRegisterProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API}/projects/registers`);
      if (res.ok) {
        const available = (await res.json()).projects ?? [];
        setRegisterProjects(available);
        setSelectedProject(current => current && available.includes(current) ? current : (available[0] ?? ""));
      }
    } catch { /* non-blocking */ }
  }, []);

  const deleteProjectRegister = async (projectId: string) => {
    const confirmed = window.confirm(
      `Delete the generated Material Shortage Register for ${projectId}?\n\nThis removes its register workbook and the folder if empty. Source reports and database records will remain.`
    );
    if (!confirmed) return;

    setDeletingRegisterProject(projectId);
    setRegisterExportMessage("");
    try {
      const res = await fetch(`${API}/projects/${encodeURIComponent(projectId)}/register`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not delete this project register.");
      if (selectedProject === projectId) {
        setSelectedProject("");
        setSelected({ material_ref_code: "All", wbs_element: "All", material_code: "All", scope: "All" });
        setPageNum(1);
      }
      setRegisterExportMessage(data.message || `Deleted the register for ${projectId}.`);
      await loadRegisterProjects();
    } catch (e) {
      setRegisterExportMessage(e instanceof Error ? e.message : "Could not delete this project register.");
    } finally {
      setDeletingRegisterProject("");
    }
  };

  const exportProjectRegister = async () => {
    if (!selectedProject) return;
    setRegisterExporting(true);
    setRegisterExportMessage("");
    try {
      const res = await fetch(`${API}/projects/${encodeURIComponent(selectedProject)}/export-register`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Register export failed.");
      setRegisterExportMessage(`Saved ${data.filename} in ${selectedProject}.`);
      await loadRegisterProjects();
    } catch (e) {
      setRegisterExportMessage(e instanceof Error ? e.message : "Register export failed.");
    } finally {
      setRegisterExporting(false);
    }
  };

  const openProjectRegister = async () => {
    if (!selectedProject) return;
    setRegisterOpening(true);
    setRegisterExportMessage("");
    try {
      const res = await fetch(`${API}/projects/${encodeURIComponent(selectedProject)}/open-register`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not open the project workbook.");
      setRegisterExportMessage(data.message || `Opened ${selectedProject}'s register in Excel.`);
    } catch (e) {
      setRegisterExportMessage(e instanceof Error ? e.message : "Could not open the project workbook.");
    } finally {
      setRegisterOpening(false);
    }
  };

  useEffect(() => {
    loadFilters().catch(() => setError("Backend is not running. Start FastAPI first."));
    loadProjects();
  }, [loadFilters, loadProjects]);
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (page === "input") loadProjects(); }, [page, loadProjects]);
  useEffect(() => { if (page === "shortage") loadRegisterProjects(); }, [page, loadRegisterProjects]);

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

  const pageTitle: Record<typeof page, string> = {
    shortage: "Material Shortage Register",
    input: "Input & Imports",
    vendortrack: "Vendor Track",
  };
  const pageSubtitle: Record<typeof page, string> = {
    shortage: "Material-level inventory and procurement position.",
    input: "Select a project, verify required reports, and run shortage calculations.",
    vendortrack: "Consolidate and track vendor-wise shortage records across multiple projects.",
  };

  return (
    <div className={`app-shell${sidebarOpen ? "" : " sidebar-collapsed"} app-shell-${page}`}>
      {/* ── Sidebar ───────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? "" : " collapsed"}`}>
        <div className="brand">
          {sidebarOpen && <>
            <img className="abb-logo-image" src="/ABB_logo.svg" alt="ABB" />
            <div><div className="brand-title">ABB Shortage and Vendor Management</div></div>
          </>}
          <button className="sidebar-toggle"
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}>
            <Menu size={18} />
          </button>
        </div>

        {sidebarOpen && <>
          <div className="sidebar-caption">WORKSPACE</div>
          <button className={`nav-item ${page === "input" ? "active" : ""}`}
            onClick={() => setPage("input")}>
            <FileSpreadsheet size={18} /> Input &amp; Imports
          </button>
          <button className={`nav-item ${page === "shortage" ? "active" : ""}`}
            onClick={() => setPage("shortage")}>
            <LayoutDashboard size={18} /> Material Shortage Register
          </button>
          <button className={`nav-item ${page === "vendortrack" ? "active" : ""}`}
            onClick={() => setPage("vendortrack")}>
            <Truck size={18} /> Vendor Track
          </button>
          {page === "vendortrack" && (
            <div className="nav-submenu" aria-label="Vendor Track pages">
              <button className={`nav-subitem${vtSubPage === "export" ? " active" : ""}`}
                onClick={() => setVtSubPage("export")} aria-current={vtSubPage === "export" ? "page" : undefined}>
                <FileDown size={16} /> Export
              </button>
              <button className={`nav-subitem${vtSubPage === "import" ? " active" : ""}`}
                onClick={() => setVtSubPage("import")} aria-current={vtSubPage === "import" ? "page" : undefined}>
                <UploadCloud size={16} /> Import
              </button>
            </div>
          )}

          <div className="sidebar-bottom">
            <div className="status-dot" /> Local workspace <span className="version">v1.0</span>
          </div>
        </>}

        {!sidebarOpen && (
          <div className="sidebar-icons-collapsed">
            <button className={`nav-icon${page === "input" ? " active" : ""}`}
              onClick={() => setPage("input")} title="Input &amp; Imports">
              <FileSpreadsheet size={20} />
            </button>
            <button className={`nav-icon${page === "shortage" ? " active" : ""}`}
              onClick={() => setPage("shortage")} title="Material Shortage Register">
              <LayoutDashboard size={20} />
            </button>
            <button className={`nav-icon${page === "vendortrack" ? " active" : ""}`}
              onClick={() => setPage("vendortrack")} title="Vendor Track">
              <Truck size={20} />
            </button>
            {page === "vendortrack" && (
              <div className="sidebar-sub-icons" aria-label="Vendor Track pages">
                <button className={`nav-sub-icon${vtSubPage === "export" ? " active" : ""}`}
                  onClick={() => setVtSubPage("export")} title="Export" aria-current={vtSubPage === "export" ? "page" : undefined}>
                  <FileDown size={17} />
                </button>
                <button className={`nav-sub-icon${vtSubPage === "import" ? " active" : ""}`}
                  onClick={() => setVtSubPage("import")} title="Import" aria-current={vtSubPage === "import" ? "page" : undefined}>
                  <UploadCloud size={17} />
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ── Main content ─────────────────────────────── */}
      <main className={`main main-${page}`}>
        <header className="topbar">
          <div>
            <div className="eyebrow">ABB · MATERIAL PLANNING</div>
            <h1>{pageTitle[page]}</h1>
            <p>{pageSubtitle[page]}</p>
          </div>
          <div className="topbar-actions">
            <div className="system-status"><span className="status-dot" /> API workspace</div>
            <div className="avatar">AM</div>
          </div>
        </header>

        {error && (
          <DismissibleNotice key={error} className="alert error">
            <AlertTriangle size={18} />
            <span>{error}</span>
            <button onClick={() => { loadFilters().catch(() => {}); loadData(); }}>
              <RefreshCw size={14} /> Retry
            </button>
          </DismissibleNotice>
        )}

        {/* ── Shortage page ── */}
        {page === "shortage" ? (
          <div className={`shortage-workspace${shortageSidebarOpen ? "" : " shortage-workspace-collapsed"}`}>
            <aside className="shortage-workspace-sidebar">
              <div className="workspace-sidebar-heading">
                {shortageSidebarOpen && <strong>WORKSPACE</strong>}
                <button className="workspace-sidebar-toggle" onClick={() => setShortageSidebarOpen(o => !o)}
                  title={shortageSidebarOpen ? "Collapse Material Shortage Register sidebar" : "Expand Material Shortage Register sidebar"}>
                  <Menu size={16} />
                </button>
              </div>
              {shortageSidebarOpen && <>
                <div className="workspace-sidebar-section workspace-projects-section">
                  <div className="workspace-sidebar-label">PROCESSED PROJECTS</div>
                  <button className="reset-button workspace-refresh" onClick={loadRegisterProjects}>
                    <RefreshCw size={13} /> Refresh projects
                  </button>
                  <div className="workspace-project-list">
                    {registerProjects.map(project => (
                      <div key={project} className="workspace-project-row">
                        <button
                          className={`workspace-project-item${selectedProject === project ? " selected" : ""}`}
                          onClick={() => {
                            setSelectedProject(project);
                            setPageNum(1);
                            setSelected({ material_ref_code: "All", wbs_element: "All", material_code: "All", scope: "All" });
                            setRegisterExportMessage("");
                          }}>
                          <FolderOpen size={14} /> <span>{project}</span>
                        </button>
                        <button className="workspace-project-delete" onClick={() => deleteProjectRegister(project)}
                          disabled={deletingRegisterProject !== ""} title={`Delete ${project} register`}
                          aria-label={`Delete ${project} register`}>
                          {deletingRegisterProject === project
                            ? <LoaderCircle size={14} className="spin" />
                            : <Trash2 size={14} />}
                        </button>
                      </div>
                    ))}
                    {registerProjects.length === 0 && <div className="workspace-empty">No project registers found.</div>}
                  </div>
                </div>
                <div className="workspace-sidebar-section">
                  <button className="workspace-sidebar-label section-toggle" onClick={() => setShortageFiltersOpen(open => !open)}
                    aria-expanded={shortageFiltersOpen} aria-controls="shortage-register-filters">
                    <Filter size={13} /> <span>FILTERS</span>
                    <ChevronDown size={14} className={`section-chevron${shortageFiltersOpen ? " open" : ""}`} />
                  </button>
                  {shortageFiltersOpen && <div id="shortage-register-filters">
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
                  }}><RefreshCw size={14} /> Reset filters</button>
                  </div>}
                </div>
              </>}
            </aside>
            <div className="shortage-workspace-main">
            <section className="table-card">
              <div className="table-heading">
                <div>
                  <h2>Material Shortage Register</h2>
                  <p>Material-level inventory and procurement position</p>
                </div>
                <div className="table-actions">
                  <button className="primary-button excel-button" onClick={openProjectRegister}
                    disabled={!selectedProject || registerOpening}
                    title={!selectedProject ? "Select a processed project first" : "Open this project's Material Shortage Register in Excel"}>
                    {registerOpening
                      ? <><LoaderCircle size={14} className="spin" /> Opening…</>
                      : <><FileSpreadsheet size={14} /> Open Excel</>}
                  </button>
                  <button className="outline-button" onClick={exportProjectRegister}
                    disabled={!selectedProject || registerExporting}>
                    {registerExporting
                      ? <><LoaderCircle size={14} className="spin" /> Exporting…</>
                      : <><FileSpreadsheet size={14} /> Export Project Excel</>}
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
            {registerExportMessage && (
              <DismissibleNotice key={registerExportMessage} className="upload-message success-text">
                <CheckCircle size={14} /> {registerExportMessage}
              </DismissibleNotice>
            )}
            <div className="footnote">
              <Activity size={14} /> Data shown from the local shortage database. Verify imported values against source SAP reports.
            </div>
            </div>
          </div>
        ) : page === "input" ? (
          /* ── Input & Imports page ── */
          <InputPage
            selectedProject={selectedProject}
            setSelectedProject={setSelectedProject}
            projects={projects}
            onRefreshProjects={loadProjects}
            onProcessSuccess={() => setPage("shortage")}
          />
        ) : (
          /* ── Vendor Track pages ── */
          vtSubPage === "export" ? <VendorTrackPage /> : <VendorImportPage />
        )}
      </main>
    </div>
  );
}
