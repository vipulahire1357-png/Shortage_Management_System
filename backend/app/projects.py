"""
Project-management API for ABB Shortage Management System.

Provides:
  GET  /api/projects                       — list project folders
  GET  /api/projects/{project_id}/files    — classified files for a project
  GET  /api/projects/{project_id}/status   — readiness check
  POST /api/projects/{project_id}/process  — stage + run pipeline
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from .database import GLOBAL_DIR, PROJECTS_DIR, RAW_DIR, REPORTS, ROOT, SHORTAGE_REGISTERS_DIR
from services.shortage_export import export_material_shortage_register
from services.lock import processing_lock

router = APIRouter(prefix="/api/projects", tags=["projects"])

# ── Regex guard: only alphanumerics and hyphens are safe project IDs ──────────
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\-]{0,63}$")

# ── Report classification rules (applied to files inside a project folder) ──
#    Each entry: (report_key, detection_fn) where detection_fn(path) -> bool
#    Order matters: MB52 check must NOT match "zpp7" etc. — most-specific first.

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

def _is_me2m(p: Path) -> bool:
    return "me2m" in p.name.casefold() and p.suffix.lower() in {".xls", ".xlsx", ".xlsm", ".xlsb"}

def _is_scopelist(p: Path) -> bool:
    return "material_scope_list" in p.name.casefold()

PROJECT_REPORT_CLASSIFIERS: list[tuple[str, Any]] = [
    ("zpp7", _is_zpp7),
    ("mb25", _is_mb25),
    ("me2j", _is_me2j),
    ("pr", _is_pr),
    ("me2m", _is_me2m),
]

GLOBAL_REPORT_CLASSIFIERS: list[tuple[str, Any]] = [
    ("mb52", _is_mb52),
    ("scopelist", _is_scopelist),
]

# The project-specific reports that must be present before processing.
REQUIRED_PROJECT_KEYS = {"zpp7", "mb25", "me2j", "pr", "me2m"}
# The two global reports required for processing.
REQUIRED_GLOBAL_KEYS = {"mb52", "scopelist"}


def _valid_project_id(project_id: str) -> bool:
    return bool(_SAFE_ID.match(project_id))


def _project_dir(project_id: str) -> Path:
    """Resolve the project directory safely, preventing path traversal."""
    if not _valid_project_id(project_id):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid project ID {project_id!r}. "
                "Use only alphanumerics and hyphens."
            ),
        )
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    path = (PROJECTS_DIR / project_id).resolve()
    # Prevent path traversal outside PROJECTS_DIR.
    if not str(path).startswith(str(PROJECTS_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid project path.")
    return path


def _classify_files(
    folder: Path,
    classifiers: list[tuple[str, Any]],
    allowed_extensions: set[str] | None = None,
) -> dict[str, Path | None]:
    """
    Scan *folder* and return a dict mapping each report key to the first matching file.
    Returns None for keys that have no matching file.
    """
    found: dict[str, Path | None] = {key: None for key, _ in classifiers}
    if not folder.exists():
        return found

    for p in sorted(folder.iterdir()):
        if not p.is_file():
            continue
        if p.name.startswith("~$"):          # skip Office lock files
            continue
        if allowed_extensions and p.suffix.lower() not in allowed_extensions:
            continue
        for key, fn in classifiers:
            if found[key] is None and fn(p):
                found[key] = p
                break
    return found


def _file_info(p: Path | None, report_key: str) -> dict[str, Any]:
    """Serialise a matched (or missing) file for the API response."""
    report_meta = REPORTS.get(report_key, {})
    if p is None:
        return {
            "report_key": report_key,
            "label": report_meta.get("label", report_key.upper()),
            "filename": None,
            "extension": None,
            "available": False,
        }
    return {
        "report_key": report_key,
        "label": report_meta.get("label", report_key.upper()),
        "filename": p.name,
        "extension": p.suffix.lower(),
        "available": True,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@router.get("")
def list_projects():
    """Return all project IDs (subdirectory names inside projects/)."""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    projects = []
    for entry in sorted(PROJECTS_DIR.iterdir()):
        if entry.is_dir() and _valid_project_id(entry.name):
            projects.append(entry.name)
    return {"projects": projects}


@router.get("/registers")
def list_project_registers():
    """List projects with their canonical Material Shortage Register workbook."""
    SHORTAGE_REGISTERS_DIR.mkdir(parents=True, exist_ok=True)
    projects = []
    for entry in sorted(SHORTAGE_REGISTERS_DIR.iterdir()):
        if not entry.is_dir() or not _valid_project_id(entry.name):
            continue
        workbook = entry / f"{entry.name}_Net_shortage_Table.xlsx"
        if workbook.is_file() and not workbook.name.startswith("~$"):
            projects.append(entry.name)
    return {"projects": projects}


@router.get("/{project_id}/files")
def project_files(project_id: str):
    """Return classified file listings for both the project and global folders."""
    proj_dir = _project_dir(project_id)
    if not proj_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Project folder '{project_id}' does not exist.",
        )

    GLOBAL_DIR.mkdir(parents=True, exist_ok=True)

    proj_matches = _classify_files(proj_dir, PROJECT_REPORT_CLASSIFIERS)
    glob_matches = _classify_files(GLOBAL_DIR, GLOBAL_REPORT_CLASSIFIERS)

    project_files_list = [
        _file_info(proj_matches[key], key) for key, _ in PROJECT_REPORT_CLASSIFIERS
    ]
    global_files_list = [
        _file_info(glob_matches[key], key) for key, _ in GLOBAL_REPORT_CLASSIFIERS
    ]

    # Count unrecognised files in the project folder.
    classified_paths = {p for p in proj_matches.values() if p}
    other_files = [
        f.name for f in sorted(proj_dir.iterdir())
        if f.is_file() and f not in classified_paths and not f.name.startswith("~$")
    ]

    return {
        "project_id": project_id,
        "project_files": project_files_list,
        "global_files": global_files_list,
        "other_files": other_files,
    }


@router.get("/{project_id}/status")
def project_status(project_id: str):
    """Return readiness status for a project (all required files present?)."""
    proj_dir = _project_dir(project_id)
    GLOBAL_DIR.mkdir(parents=True, exist_ok=True)

    if not proj_dir.exists():
        return {
            "project_id": project_id,
            "ready": False,
            "missing_project": list(REQUIRED_PROJECT_KEYS),
            "missing_global": list(REQUIRED_GLOBAL_KEYS),
            "error": f"Project folder '{project_id}' does not exist.",
        }

    proj_matches = _classify_files(proj_dir, PROJECT_REPORT_CLASSIFIERS)
    glob_matches = _classify_files(GLOBAL_DIR, GLOBAL_REPORT_CLASSIFIERS)

    missing_project = [k for k in REQUIRED_PROJECT_KEYS if not proj_matches.get(k)]
    missing_global = [k for k in REQUIRED_GLOBAL_KEYS if not glob_matches.get(k)]
    ready = not missing_project and not missing_global

    return {
        "project_id": project_id,
        "ready": ready,
        "missing_project": sorted(missing_project),
        "missing_global": sorted(missing_global),
    }


@router.post("/{project_id}/process")
def process_project(project_id: str):
    """
    Stage project + global files into data/raw/ and run the existing pipeline.

    Staging rules:
    - Never moves source files; always copies.
    - Clears data/raw/ of known-report files before staging to prevent
      stale data from a previous project contaminating the current run.
    - Uses the stem names expected by each parser (from REPORTS[key]['stem']).
    """
    proj_dir = _project_dir(project_id)
    GLOBAL_DIR.mkdir(parents=True, exist_ok=True)

    if not proj_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Project folder '{project_id}' does not exist.",
        )

    proj_matches = _classify_files(proj_dir, PROJECT_REPORT_CLASSIFIERS)
    glob_matches = _classify_files(GLOBAL_DIR, GLOBAL_REPORT_CLASSIFIERS)

    # Validate completeness.
    missing_project = [k for k in REQUIRED_PROJECT_KEYS if not proj_matches.get(k)]
    missing_global = [k for k in REQUIRED_GLOBAL_KEYS if not glob_matches.get(k)]

    if missing_project or missing_global:
        detail_parts = []
        if missing_project:
            labels = [REPORTS.get(k, {}).get("label", k.upper()) for k in missing_project]
            detail_parts.append(
                "Missing project reports: " + ", ".join(labels)
            )
        if missing_global:
            labels = [REPORTS.get(k, {}).get("label", k.upper()) for k in missing_global]
            detail_parts.append(
                "Missing global reports: " + ", ".join(labels)
            )
        raise HTTPException(
            status_code=422,
            detail=" | ".join(detail_parts),
        )

    # ── Prepare staging area ──────────────────────────────────────────────────
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    # Remove any previously staged report files (by known stems) to avoid mixing
    # files from different projects. README.md and other non-report files are kept.
    known_stems = {v["stem"].casefold() for v in REPORTS.values()}
    for existing in list(RAW_DIR.iterdir()):
        if existing.is_file() and (existing.stem.casefold() in known_stems or "me2m" in existing.stem.casefold()):
            existing.unlink()

    # ── Stage files ───────────────────────────────────────────────────────────
    all_matches: dict[str, Path | None] = {**proj_matches, **glob_matches}
    all_keys = list(REQUIRED_PROJECT_KEYS | REQUIRED_GLOBAL_KEYS)

    staged: list[str] = []
    for key in all_keys:
        source = all_matches.get(key)
        if source is None:
            continue
        report_meta = REPORTS[key]
        dest = RAW_DIR / f"{report_meta['stem']}{source.suffix}"
        shutil.copy2(source, dest)
        staged.append(dest.name)

    # ── Run existing pipeline ─────────────────────────────────────────────────
    command = [sys.executable, "main.py", "--report", "all", "--project-id", project_id]

    try:
        with processing_lock(project_id):
            result = subprocess.run(
                command,
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=600,
            )
    except RuntimeError as lock_err:
        raise HTTPException(
            status_code=409,
            detail=str(lock_err),
        ) from lock_err
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                "Report processing exceeded 10 minutes. "
                "Check backend logs and try again."
            ),
        ) from exc

    output = result.stdout or ""
    if result.stderr:
        output += "\n--- STDERR ---\n" + result.stderr

    if result.returncode != 0:
        raise HTTPException(
            status_code=400,
            detail=output[-12000:] or "Processing failed.",
        )

    # Export Material Shortage Register workbook
    register_info = None
    try:
        register_info = export_material_shortage_register(project_id)
    except Exception as exc:
        output += f"\n[Warning] Material Shortage Register export failed: {exc}"

    return {
        "project_id": project_id,
        "staged_files": sorted(staged),
        "message": (
            f"Project '{project_id}' processed successfully. "
            "All report parsers and shortage calculation completed."
        ),
        "register_file": register_info["filename"] if register_info else None,
        "register_path": register_info["path"] if register_info else None,
        "register_rows": register_info["rows"] if register_info else 0,
        "output": output[-12000:],
    }


@router.post("/{project_id}/export-register")
def export_project_register_endpoint(project_id: str):
    """Generate or update the Material Shortage Register Excel file for this project."""
    if not _valid_project_id(project_id):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid project ID {project_id!r}.",
        )
    try:
        info = export_material_shortage_register(project_id)
        return {
            "message": f"Material Shortage Register exported to {info['filename']}.",
            **info,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{project_id}/register-info")
def get_project_register_info(project_id: str):
    """Check if the Material Shortage Register workbook exists for this project."""
    if not _valid_project_id(project_id):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid project ID {project_id!r}.",
        )
    # Check nested path first, then flat path for backward compatibility
    nested_target = SHORTAGE_REGISTERS_DIR / project_id / f"{project_id}_Net_shortage_Table.xlsx"
    flat_target = SHORTAGE_REGISTERS_DIR / f"{project_id}.xlsx"
    target = nested_target if nested_target.is_file() else flat_target
    exists = target.is_file()
    return {
        "project_id": project_id,
        "exists": exists,
        "filename": target.name if exists else None,
        "path": str(target.resolve()) if exists else None,
        "size_bytes": target.stat().st_size if exists else 0,
    }

