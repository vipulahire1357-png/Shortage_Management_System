# ABB Shortage Management System

A project-aware shortage management application combining React dashboard + FastAPI backend + SQLite databases. Users select a project, verify SAP reports, click **Process All Reports**, and instantly see the calculated shortage register — no manual file moving required.

---

## Project Structure

```
ABB_SM_0.5/
├── run_app.bat                  ← One-click launcher (double-click to start)
├── main.py                      ← Report processing entry point
├── requirements.txt
├── projects/                    ← One subfolder per project (auto-discovered)
│   └── IN-10026025/
│       ├── zpp7_IN-10026025.xls
│       ├── me2j_IN-10026025.XLSX
│       ├── mb25_IN-10026025.XLSX
│       └── pr_IN-10026025.XLSX
├── global/                      ← Shared reports (used by all projects)
│   ├── Job IN_MM_INNR_MB52_D_*.htm
│   └── MATERIAL_SCOPE_LIST.xlsx
├── data/
│   ├── raw/                     ← Staging area (auto-populated, do not edit)
│   ├── global.db                ← Parsed MB25 / MB52 / ME2J / PR / Scope List
│   ├── zpp7_breakdown.db        ← ZPP7-derived material tables
│   └── services.db              ← Calculated net_shortage output
├── backend/
│   └── app/
│       ├── main.py              ← FastAPI application + static file serving
│       ├── database.py          ← DB constants and connection helpers
│       └── projects.py          ← Project management API routes (new)
├── frontend/
│   └── src/
│       ├── App.tsx              ← React dashboard
│       └── styles.css
├── parsers/                     ← SAP report parsers (zpp7, mb25, mb52, me2j, pr, scopelist)
└── services/
    └── shortage_service.py      ← Net shortage calculation
```

---

## 1. Prerequisites

| Dependency | Required for | Where |
|------------|-------------|-------|
| Python 3.10 / 3.11 | Backend + parsers | Always |
| Virtual environment (`.venv`) | Isolates dependencies | Always |
| Node.js 20 LTS | Building the frontend | **Development machine only** |

> **Runtime note:** Node.js is **not** required on the target laptop. The frontend is pre-built into `frontend/dist/` and served directly by the FastAPI backend.

---

## 2. First-Time Setup (Development Machine)

### 2a. Create the Python virtual environment

```powershell
# From the project root
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

> If PowerShell blocks activation: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

### 2b. Build the React frontend

```powershell
cd frontend
npm install
npm run build     # produces frontend/dist/
cd ..
```

The `frontend/dist/` output is served by the FastAPI backend in production — no separate web server needed.

---

## 3. Add SAP Reports

### Project-specific reports
Place one copy of each file inside `projects/<PROJECT_ID>/`:

| Report | Parser key | Detection rule |
|--------|-----------|----------------|
| ZPP7 — Requirements | `zpp7` | filename contains `zpp7` |
| MB25 — WBS Mapping | `mb25` | filename contains `mb25` |
| ME2J — Purchase Orders | `me2j` | filename stem contains `me2j` |
| PR — Purchase Requisitions | `pr` | stem is `pr`, starts with `pr ` or `pr_` |

Example: `projects/IN-10026025/zpp7_IN-10026025.xls`

### Global shared reports
Place these in `global/` (shared across all projects):

| Report | Parser key | Detection rule |
|--------|-----------|----------------|
| MB52 — Warehouse Stock | `mb52` | filename contains `in_mm_innr_mb52` or `mb52` |
| Material Scope List | `scopelist` | filename contains `material_scope_list` |

> **Do not put global files inside a project folder.** They will not be found by the global scanner.

### Adding a new project
Simply create a new subfolder inside `projects/` — it is auto-discovered:
```
projects/
└── IN-10026019/
    ├── zpp7_IN-10026019.xls
    ├── mb25_IN-10026019.XLSX
    ├── me2j_IN-10026019.XLSX
    └── pr_IN-10026019.XLSX
```

---

## 4. Running the Application

### Option A — One-click launcher (recommended for end users)
Double-click **`run_app.bat`** in the project root.

What it does:
1. Verifies `.venv` Python and `frontend/dist/` exist
2. Stops any previous instance on port 8000
3. Starts the FastAPI backend (which also serves the frontend)
4. Waits for the health endpoint to respond
5. Opens `http://127.0.0.1:8000` in the default browser

Close the console window to stop the server.

### Option B — Development mode (two terminals)

**Terminal 1 — Backend with auto-reload:**
```powershell
.\.venv\Scripts\Activate.ps1
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — Frontend dev server with hot-reload:**
```powershell
cd frontend
npm run dev
```
Open `http://127.0.0.1:5173` (Vite proxies `/api` calls to port 8000 automatically).

---

## 5. Using the Application

### Input & Imports page
1. The **sidebar** shows a **Select Project** combobox — choose your project ID.
2. The **project list** on the left also lets you select a project by clicking a card.
3. Both controls are synchronized — selecting in either updates the other.
4. The **Project Reports** panel shows ZPP7 / MB25 / ME2J / PR availability for the selected project.
5. The **Global Reports** panel shows MB52 / Scope List availability from `global/`.
6. When all 6 reports are present, the **Process All Reports** button becomes active.

### Process All Reports
When clicked:
- Validates all required project and global reports are present
- Copies them into `data/raw/` using the exact filenames expected by each parser
- Purges any stale files from a previous project's run
- Runs `main.py --report all` (the existing pipeline — no modifications)
- Displays progress, success message, and full processing log
- **Source files in `projects/` and `global/` are never modified or deleted**

### Shortage Management page
- Sidebar filters: Material Ref Code, WBS Element, Material Code, Scope
- Sortable, paginated table with Net Shortage highlighting
- Export to CSV or Excel with active filters applied
- Inline editable Remarks column

---

## 6. API Reference

All endpoints are at `http://127.0.0.1:8000/api/`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Backend health check |
| `GET` | `/api/projects` | List all project IDs from `projects/` |
| `GET` | `/api/projects/{id}/files` | Classified file listing for a project |
| `GET` | `/api/projects/{id}/status` | Readiness check (missing reports) |
| `POST` | `/api/projects/{id}/process` | Stage files + run pipeline |
| `GET` | `/api/reports` | Available report type metadata |
| `GET` | `/api/raw-files` | Files currently in `data/raw/` |
| `POST` | `/api/reports/{key}` | Manual upload to `data/raw/` |
| `POST` | `/api/process` | Run pipeline directly (no staging) |
| `GET` | `/api/filters` | Distinct values for sidebar filters |
| `GET` | `/api/shortages` | Paginated shortage data |
| `GET` | `/api/export` | Download filtered data as XLSX or CSV |

---

## 7. Databases

| File | Contents | Rebuilt by |
|------|----------|-----------|
| `data/global.db` | MB25 `wbs_element`, MB52 `Storage`, ME2J, PR, `scopelist` tables | Individual parsers |
| `data/zpp7_breakdown.db` | One table per Material Ref Code | ZPP7 parser |
| `data/services.db` | `net_shortage` output table | Shortage service |

The databases are refreshed (not dropped/recreated) on each processing run. Each parser replaces only its own table; unrelated tables are preserved.

---

## 8. Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `No filename containing ... found` | Report missing from project or global folder | Add the file to the correct folder |
| `Multiple ... files found` | Duplicate report type in staging area | Remove stale files from `data/raw/` |
| `No rows qualified for net_shortage` | WBS/scope mismatch | Check ZPP7 Material Ref Codes match `wbs_element`; Scope List must contain `ABB` or `Vendor Scope` |
| `Port 8000 already in use` | Previous instance still running | `run_app.bat` auto-handles this; or kill the PID manually |
| Frontend not found | `frontend/dist/` missing | Run `npm run build` in `frontend/` |
| Python not found | `.venv` not created | Follow Section 2a setup steps |

**Backend health check:** `http://127.0.0.1:8000/api/health`
**Processing log:** `logs/app_launcher.log`

---

## 9. Security Notes

- Project IDs are validated against `^[A-Za-z0-9][A-Za-z0-9\-]{0,63}$` — path traversal is prevented.
- The backend only accesses files inside `projects/` and `global/` for project operations.
- Databases are opened read-only for queries; writes go through the parsers and shortage service only.
