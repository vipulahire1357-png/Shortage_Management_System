"""
Vendor Track API for ABB Shortage Management System.

Provides:
  GET  /api/vendor-track/projects        — available project IDs
  POST /api/vendor-track/process         — process selected projects
  GET  /api/vendor-track/records         — paginated/filtered records
  GET  /api/vendor-track/vendors         — distinct vendor values
  GET  /api/vendor-track/wbs-elements    — distinct WBS element values
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .database import PROJECTS_DIR, RAW_DIR, REPORTS, ROOT, SERVICES_DB

router = APIRouter(prefix="/api/vendor-track", tags=["vendor-track"])

# ── Safety guard: only alphanumerics and hyphens in project IDs ──────────────
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\-]{0,63}$")

REQUIRED_PROJECT_KEYS = {"zpp7", "mb25", "me2j", "pr"}
REQUIRED_GLOBAL_KEYS = {"mb52", "scopelist"}

GLOBAL_DIR = ROOT / "global"


def _valid_project_id(project_id: str) -> bool:
    return bool(_SAFE_ID.match(project_id))


def _quote(v: str) -> str:
    return '"' + v.replace('"', '""') + '"'


def _connect_services_rw():
    """Open services.db for read-write (not URI mode)."""
    import sqlite3
    if not SERVICES_DB.exists():
        raise FileNotFoundError("Shortage database does not exist. Process a project first.")
    conn = sqlite3.connect(str(SERVICES_DB))
    conn.row_factory = sqlite3.Row
    return conn


def _connect_services_ro():
    """Open services.db read-only."""
    import sqlite3
    if not SERVICES_DB.exists():
        raise FileNotFoundError("Shortage database does not exist. Process a project first.")
    conn = sqlite3.connect(f"file:{SERVICES_DB.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


# ── File classifiers (mirrors projects.py) ───────────────────────────────────

def _is_zpp7(p: Path) -> bool:
    return "zpp7" in p.name.casefold()

def _is_mb25(p: Path) -> bool:
    return "mb25" in p.name.casefold()

def _is_mb52(p: Path) -> bool:
    n = p.name.casefold()
    return "in_mm_innr_mb52" in n or "mb52" in n

def _is_me2j(p: Path) -> bool:
    return "me2j" in p.stem.casefold()

def _is_pr(p: Path) -> bool:
    stem = p.stem.strip().casefold()
    return (
        stem in {"pr", "pr 1", "purchase requisition"}
        or stem.startswith("pr ")
        or stem.startswith("pr_")
        or "purchase requisition" in stem
    )

def _is_scopelist(p: Path) -> bool:
    return "material_scope_list" in p.name.casefold()

PROJECT_REPORT_CLASSIFIERS: list[tuple[str, Any]] = [
    ("zpp7", _is_zpp7), ("mb25", _is_mb25), ("me2j", _is_me2j), ("pr", _is_pr),
]
GLOBAL_REPORT_CLASSIFIERS: list[tuple[str, Any]] = [
    ("mb52", _is_mb52), ("scopelist", _is_scopelist),
]


def _classify_files(folder: Path, classifiers: list[tuple[str, Any]]) -> dict[str, Path | None]:
    found: dict[str, Path | None] = {key: None for key, _ in classifiers}
    if not folder.exists():
        return found
    for p in sorted(folder.iterdir()):
        if not p.is_file() or p.name.startswith("~$"):
            continue
        for key, fn in classifiers:
            if found[key] is None and fn(p):
                found[key] = p
                break
    return found


# ── Pydantic request body ─────────────────────────────────────────────────────

class VendorTrackProcessRequest(BaseModel):
    project_ids: list[str]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/projects")
def list_vt_projects():
    """Return all valid project IDs available for Vendor Track processing."""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    projects = []
    for entry in sorted(PROJECTS_DIR.iterdir()):
        if entry.is_dir() and _valid_project_id(entry.name):
            projects.append(entry.name)
    return {"projects": projects}


@router.post("/process")
def process_vendor_track(body: VendorTrackProcessRequest):
    """
    Process selected projects for Vendor Track.

    For each project:
      1. Validate project ID and file availability.
      2. Stage project + global files into data/raw/.
      3. Run main.py (parsers + shortage calc) to populate net_shortage.
      4. Build vendor_track rows from net_shortage tagged with project_id.
      5. Delete old rows for that project and insert fresh ones.

    Unselected projects' rows in vendor_track are NOT modified.
    """
    if not body.project_ids:
        raise HTTPException(status_code=422, detail="At least one project must be selected.")

    # Validate and deduplicate project IDs
    seen: set[str] = set()
    validated: list[str] = []
    for pid in body.project_ids:
        if not _valid_project_id(pid):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid project ID {pid!r}. Use only alphanumerics and hyphens.",
            )
        if pid not in seen:
            seen.add(pid)
            validated.append(pid)

    # Check all projects exist and have required files
    GLOBAL_DIR.mkdir(parents=True, exist_ok=True)
    glob_matches = _classify_files(GLOBAL_DIR, GLOBAL_REPORT_CLASSIFIERS)
    missing_global = [k for k in REQUIRED_GLOBAL_KEYS if not glob_matches.get(k)]
    if missing_global:
        labels = [REPORTS.get(k, {}).get("label", k.upper()) for k in missing_global]
        raise HTTPException(
            status_code=422,
            detail="Missing global reports: " + ", ".join(labels),
        )

    for pid in validated:
        proj_dir = (PROJECTS_DIR / pid).resolve()
        if not str(proj_dir).startswith(str(PROJECTS_DIR.resolve())):
            raise HTTPException(status_code=400, detail="Invalid project path.")
        if not proj_dir.exists():
            raise HTTPException(status_code=404, detail=f"Project folder '{pid}' does not exist.")
        proj_matches = _classify_files(proj_dir, PROJECT_REPORT_CLASSIFIERS)
        missing_project = [k for k in REQUIRED_PROJECT_KEYS if not proj_matches.get(k)]
        if missing_project:
            labels = [REPORTS.get(k, {}).get("label", k.upper()) for k in missing_project]
            raise HTTPException(
                status_code=422,
                detail=f"Project '{pid}' is missing reports: " + ", ".join(labels),
            )

    # Process each project in sequence
    from services.vendortrack_service import refresh_vendor_track_for_project

    results = []
    known_stems = {v["stem"].casefold() for v in REPORTS.values()}

    for pid in validated:
        proj_dir = PROJECTS_DIR / pid
        proj_matches = _classify_files(proj_dir, PROJECT_REPORT_CLASSIFIERS)
        all_matches = {**proj_matches, **glob_matches}

        # Clear previously staged report files
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        for existing in list(RAW_DIR.iterdir()):
            if existing.is_file() and existing.stem.casefold() in known_stems:
                existing.unlink()

        # Stage this project's files
        staged = []
        for key in list(REQUIRED_PROJECT_KEYS | REQUIRED_GLOBAL_KEYS):
            source = all_matches.get(key)
            if source is None:
                continue
            dest = RAW_DIR / f"{REPORTS[key]['stem']}{source.suffix}"
            shutil.copy2(source, dest)
            staged.append(dest.name)

        # Run the full pipeline (parsers + shortage_service)
        try:
            result = subprocess.run(
                [sys.executable, "main.py", "--report", "all"],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=600,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                status_code=504,
                detail=f"Processing project '{pid}' timed out after 10 minutes.",
            ) from exc

        output = result.stdout or ""
        if result.stderr:
            output += "\n--- STDERR ---\n" + result.stderr

        if result.returncode != 0:
            raise HTTPException(
                status_code=400,
                detail=f"Processing project '{pid}' failed:\n" + output[-8000:],
            )

        # Refresh vendor_track rows for this project (idempotent)
        try:
            row_count = refresh_vendor_track_for_project(pid, SERVICES_DB)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Vendor track refresh failed for project '{pid}': {exc}",
            ) from exc

        results.append({
            "project_id": pid,
            "rows": row_count,
            "staged_files": sorted(staged),
        })

    total_rows = sum(r["rows"] for r in results)
    return {
        "message": (
            f"Vendor Track processing complete for {len(validated)} project(s). "
            f"{total_rows} vendor track rows refreshed."
        ),
        "projects": results,
    }


@router.get("/records")
def get_vt_records(
    project_ids: str | None = None,
    vendor: str | None = None,
    wbs_elements: str | None = None,
    page: int = 1,
    page_size: int = 50,
):
    """
    Return paginated Vendor Track records.

    Query params:
      project_ids  — comma-separated project IDs to include (all if omitted)
      vendor       — single vendor filter ('All Vendors' or omit for all)
      wbs_elements — comma-separated WBS elements (all if omitted)
      page / page_size — pagination
    """
    page = max(1, page)
    page_size = min(200, max(1, page_size))

    conditions: list[str] = []
    values: list[Any] = []

    # Vendor Track records are project-scoped; if no project_ids given show all
    pid_list: list[str] = []
    if project_ids:
        pid_list = [p.strip() for p in project_ids.split(",") if p.strip() and _valid_project_id(p.strip())]
    if pid_list:
        placeholders = ",".join("?" for _ in pid_list)
        conditions.append(f'"project_id" IN ({placeholders})')
        values.extend(pid_list)

    if vendor and vendor not in ("All Vendors", "All"):
        conditions.append('"Vendor Detail" = ?')
        values.append(vendor)

    wbs_list: list[str] = []
    if wbs_elements:
        wbs_list = [w.strip() for w in wbs_elements.split(",") if w.strip()]
    if wbs_list:
        placeholders = ",".join("?" for _ in wbs_list)
        conditions.append(f'"WBS Element" IN ({placeholders})')
        values.extend(wbs_list)

    where = " WHERE " + " AND ".join(conditions) if conditions else ""

    try:
        with _connect_services_ro() as conn:
            # Check table exists
            tables = {r[0].casefold(): r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )}
            if "vendor_track" not in tables:
                return _empty_vt(page, page_size)

            total = conn.execute(
                f'SELECT COUNT(*) FROM "vendor_track"{where}', values
            ).fetchone()[0]

            rows = conn.execute(
                f'''SELECT
                    "Vendor Detail",
                    "WBS Element",
                    "Material Code",
                    "Description",
                    "Quantity"
                  FROM "vendor_track"{where}
                  ORDER BY "Vendor Detail", "WBS Element", "Material Code"
                  LIMIT ? OFFSET ?''',
                values + [page_size, (page - 1) * page_size],
            ).fetchall()

            items = [
                {
                    "vendor_detail": r["Vendor Detail"] or "",
                    "wbs_element": r["WBS Element"] or "",
                    "material_code": r["Material Code"] or "",
                    "description": r["Description"] or "",
                    "quantity": r["Quantity"] if r["Quantity"] is not None else 0,
                }
                for r in rows
            ]

            return {
                "items": items,
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": max(1, (total + page_size - 1) // page_size),
            }

    except FileNotFoundError:
        return _empty_vt(page, page_size)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/vendors")
def get_vt_vendors(project_ids: str | None = None):
    """Return distinct Vendor Detail values from the vendor_track table."""
    conditions: list[str] = []
    values: list[Any] = []

    if project_ids:
        pid_list = [p.strip() for p in project_ids.split(",") if p.strip() and _valid_project_id(p.strip())]
        if pid_list:
            placeholders = ",".join("?" for _ in pid_list)
            conditions.append(f'"project_id" IN ({placeholders})')
            values.extend(pid_list)

    where = " WHERE " + " AND ".join(conditions) if conditions else ""

    try:
        with _connect_services_ro() as conn:
            tables = {r[0].casefold() for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )}
            if "vendor_track" not in tables:
                return {"vendors": []}
            # Add non-empty filter, chaining with existing WHERE if present
            nonempty_clause = (
                " AND TRIM(COALESCE(\"Vendor Detail\",\"\")) <> \"\""
                if conditions else
                " WHERE TRIM(COALESCE(\"Vendor Detail\",\"\")) <> \"\""
            )
            rows = conn.execute(
                f'SELECT DISTINCT "Vendor Detail" FROM "vendor_track"{where}{nonempty_clause} '
                'ORDER BY "Vendor Detail"',
                values,
            ).fetchall()
            return {"vendors": [r[0] for r in rows if r[0]]}
    except FileNotFoundError:
        return {"vendors": []}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/wbs-elements")
def get_vt_wbs_elements(
    project_ids: str | None = None,
    vendor: str | None = None,
):
    """Return distinct WBS Element values, optionally filtered by vendor."""
    conditions: list[str] = []
    values: list[Any] = []

    if project_ids:
        pid_list = [p.strip() for p in project_ids.split(",") if p.strip() and _valid_project_id(p.strip())]
        if pid_list:
            placeholders = ",".join("?" for _ in pid_list)
            conditions.append(f'"project_id" IN ({placeholders})')
            values.extend(pid_list)

    if vendor and vendor not in ("All Vendors", "All"):
        conditions.append('"Vendor Detail" = ?')
        values.append(vendor)

    where = " WHERE " + " AND ".join(conditions) if conditions else ""

    try:
        with _connect_services_ro() as conn:
            tables = {r[0].casefold() for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )}
            if "vendor_track" not in tables:
                return {"wbs_elements": []}
            rows = conn.execute(
                f'SELECT DISTINCT "WBS Element" FROM "vendor_track"{where} '
                'ORDER BY "WBS Element"',
                values,
            ).fetchall()
            return {"wbs_elements": [r[0] for r in rows if r[0]]}
    except FileNotFoundError:
        return {"wbs_elements": []}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _empty_vt(page: int, page_size: int) -> dict:
    return {
        "items": [],
        "total": 0,
        "page": page,
        "page_size": page_size,
        "pages": 1,
    }
