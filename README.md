# ABB Shortage Management System — Complete React + FastAPI Project

This project combines the existing ABB report parsers and shortage calculation with the React dashboard and FastAPI API. It uses the original SQLite outputs (`data/global.db`, `data/zpp7_breakdown.db`, `data/services.db`) and the existing processing entry point `main.py`.

## 1. Requirements
- Python 3.10 or 3.11 recommended
- Node.js 20 LTS (npm included)
- Windows PowerShell is supported

## 2. Set up Python environment (PowerShell, from this folder)
```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```
If PowerShell blocks activation for this terminal, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` and activate again.

## 3. Upload the six raw SAP reports
Start the API and frontend, open **Input & Imports**, and upload one file for each report type:
- MB25 — WBS mapping
- MB52 — warehouse stock
- ME2J — purchase orders
- PR — purchase requisitions
- Scope List (`MATERIAL_SCOPE_LIST`)
- ZPP7 — requirements

Uploads are saved to `data/raw/` with filenames recognized by the existing parsers. You can also copy the original report files directly into `data/raw/` if preferred. Do not keep multiple versions of the same report type in that folder; each parser expects one matching source file.

## 4. Start the backend
In PowerShell terminal 1, from the project root:
```powershell
.\.venv\Scripts\Activate.ps1
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

## 5. Start the React dashboard
In PowerShell terminal 2, from the project root:
```powershell
cd frontend
npm install
npm run dev
```
Open the URL printed by Vite (normally `http://127.0.0.1:5173`).

## 6. Process reports and open the dashboard
1. Upload all six SAP reports on **Input & Imports**.
2. Click **Process all reports**. The API calls the existing `main.py --report all`, runs the original parsers, and refreshes `data/services.db` → `net_shortage` only when all parsers succeed.
3. Open **Shortage Management**. The dashboard reads the actual `net_shortage` table and provides exactly three sidebar dropdown filters: **Material Ref Code**, **WBS Element**, **Material Code**.

You can also run processing from the terminal:
```powershell
python main.py --report all
```

## Database files
- `data/global.db` — MB25, MB52, ME2J, PR and Scope List parsed tables
- `data/zpp7_breakdown.db` — ZPP7-derived material tables
- `data/services.db` — calculated `net_shortage` table used by the dashboard

The databases are created/updated by the parsers and shortage service. This package intentionally does not include any private/current production database contents; upload your current SAP exports and let the parsers generate the local databases. Existing parser and calculation source files are preserved from the supplied optimized project archive.

## Troubleshooting
- `No filename containing ... found`: upload the missing report type or copy it into `data/raw/`.
- `Multiple ... files found`: remove stale/duplicate files for that report type from `data/raw/`.
- `No rows qualified for net_shortage`: verify WBS-to-reference mapping and the ABB scope values in the Scope List; the calculation logic has not been replaced by demo logic.
- Backend health check: `http://127.0.0.1:8000/api/health`
