import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, CheckCircle, ChevronDown,
  ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Filter, FolderOpen,
  LayoutDashboard, LoaderCircle, Menu, RefreshCw, Search, UploadCloud, X,
  XCircle, Truck, CheckSquare, Square,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────
   API base — relative so dev proxy + production both work.
───────────────────────────────────────────────────────────── */
const API = "/api";

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
  { key: "remarks", label: "Remarks" },
  { key: "final_date", label: "Final Date" },
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
  const [exportingReg, setExportingReg] = useState(false);
  const [exportRegSuccess, setExportRegSuccess] = useState("");

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
              <div className="upload-message success-text">
                <CheckCircle size={14} /> {exportRegSuccess}
              </div>
            )}
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
   Vendor Track page
═══════════════════════════════════════════════════════════ */
function VendorTrackPage() {
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
    setSelectedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedProjects(new Set(projects));
  const clearSelection = () => setSelectedProjects(new Set());

  /* ── Run Vendor Track processing ── */
  const runVendorTrack = async () => {
    if (selectedProjects.size === 0) {
      setProcessError("Select at least one project before running Vendor Track.");
      return;
    }
    setProcessing(true);
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
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
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
    <div className="vt-page">
      {/* ── VT Sidebar ─────────────────────────────── */}
      <div className="vt-sidebar">
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
            <div className="vt-section-head">
              <Filter size={13} />
              <span>FILTERS</span>
            </div>

            {/* Vendor filter — single select */}
            <label className="vt-filter-field">
              <span>Vendor</span>
              <Combobox
                value={selectedVendor}
                options={vendorOptions}
                onChange={v => { setSelectedVendor(v === "All" ? "All Vendors" : v); setVtPage(1); }}
                placeholder="All Vendors"
              />
            </label>

            {/* WBS Element filter — multi select */}
            <label className="vt-filter-field">
              <span>WBS Element</span>
              <MultiCombobox
                values={selectedWbs}
                options={wbsOptions}
                onChange={v => { setSelectedWbs(v); setVtPage(1); }}
                placeholder="All"
              />
            </label>

            {(selectedVendor !== "All Vendors" || selectedWbs.length > 0) && (
              <button className="reset-button" style={{ marginTop: 4 }} onClick={() => {
                setSelectedVendor("All Vendors");
                setSelectedWbs([]);
                setVtPage(1);
              }}>
                <RefreshCw size={13} /> Reset filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── VT Main content ──────────────────────────── */}
      <div className="vt-main">
        {/* Status messages */}
        {processMsg && (
          <div className="upload-message success-text" style={{ marginBottom: 16 }}>
            <CheckCircle size={14} /> {processMsg}
          </div>
        )}
        {processError && (
          <div className="upload-message error-text" style={{ marginBottom: 16 }}>
            <AlertTriangle size={14} /> {processError}
          </div>
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
              <button
                id="export-vendor-date-request-btn"
                className="primary-button"
                onClick={handleExportDateRequest}
                disabled={processedProjectIds.length === 0 || vtLoading || exporting}
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
              <div className="upload-message success-text">
                <CheckCircle size={15} />
                <span>{exportModalData.message}</span>
              </div>

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
  const [page, setPage] = useState<"shortage" | "input" | "vendortrack">("input");
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
                  <h2>Material Shortage Register</h2>
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
        ) : page === "input" ? (
          /* ── Input & Imports page ── */
          <InputPage
            selectedProject={selectedProject}
            setSelectedProject={setSelectedProject}
            projects={projects}
            onRefreshProjects={loadProjects}
          />
        ) : (
          /* ── Vendor Track page ── */
          <VendorTrackPage />
        )}
      </main>
    </div>
  );
}
