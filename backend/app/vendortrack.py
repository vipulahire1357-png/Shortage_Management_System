"""
Vendor Track API for ABB Shortage Management System.

Provides:
  GET  /api/vendor-track/projects            — available project register files from Material Shortage Registers/
  POST /api/vendor-track/process             — process selected project register files into Vendor Track
  GET  /api/vendor-track/records             — paginated/filtered 8-column records
  GET  /api/vendor-track/vendors             — distinct vendor values
  GET  /api/vendor-track/wbs-elements        — distinct WBS element values
  POST /api/vendor-track/export-date-request — export filtered records to Vendor Registers/<vendor>/...
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .database import ROOT, SERVICES_DB, SHORTAGE_REGISTERS_DIR, VENDOR_REGISTERS_DIR, VENDOR_DATE_REGISTERS_DIR
from services.vendortrack_service import refresh_vendor_track_from_registers
from services.vendor_request_export import export_vendor_date_request
from services.vendor_import_service import (
    discover_vendor_response_files,
    preview_vendor_response,
    apply_vendor_response,
    get_import_history,
)

router = APIRouter(prefix="/api/vendor-track", tags=["vendor-track"])

# ── Safety guard: only alphanumerics and hyphens in project IDs ──────────────
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\-]{0,63}$")


def _valid_project_id(project_id: str) -> bool:
    return bool(_SAFE_ID.match(project_id))


def _connect_services_ro():
    """Open services.db read-only."""
    import sqlite3
    if not SERVICES_DB.exists():
        raise FileNotFoundError("Shortage database does not exist. Process a project first.")
    conn = sqlite3.connect(f"file:{SERVICES_DB.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


# ── Pydantic request bodies ───────────────────────────────────────────────────

class VendorTrackProcessRequest(BaseModel):
    project_ids: list[str]


class VendorDateRequestExportModel(BaseModel):
    vendor: str
    project_ids: list[str] | None = None
    wbs_elements: list[str] | None = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/projects")
def list_vt_projects():
    """
    Return all project IDs available in Material Shortage Registers/.
    The input source for Vendor Track is the files in Material Shortage Registers/.
    """
    SHORTAGE_REGISTERS_DIR.mkdir(parents=True, exist_ok=True)
    projects: list[str] = []
    files: list[dict[str, str]] = []
    seen: set[str] = set()

    # Strategy 1: Nested directories — Material Shortage Registers/<project_id>/<project_id>_*.xlsx
    for entry in sorted(SHORTAGE_REGISTERS_DIR.iterdir()):
        if entry.is_dir() and _valid_project_id(entry.name):
            for xls in sorted(entry.iterdir()):
                if (
                    xls.is_file()
                    and xls.suffix.lower() in (".xlsx", ".xls", ".xlsm")
                    and not xls.name.startswith("~$")
                ):
                    pid = entry.name
                    if pid not in seen:
                        seen.add(pid)
                        projects.append(pid)
                        files.append({
                            "project_id": pid,
                            "filename": xls.name,
                        })
                    break  # One register per project folder

    # Strategy 2: Flat files — Material Shortage Registers/<project_id>.xlsx (backward compat)
    for entry in sorted(SHORTAGE_REGISTERS_DIR.iterdir()):
        if (
            entry.is_file()
            and entry.suffix.lower() in (".xlsx", ".xls", ".xlsm")
            and not entry.name.startswith("~$")
            and _valid_project_id(entry.stem)
            and entry.stem not in seen
        ):
            seen.add(entry.stem)
            projects.append(entry.stem)
            files.append({
                "project_id": entry.stem,
                "filename": entry.name,
            })

    return {
        "projects": projects,
        "files": files,
        "folder": SHORTAGE_REGISTERS_DIR.name,
    }


@router.post("/process")
def process_vendor_track(body: VendorTrackProcessRequest):
    """
    Process selected project Material Shortage Register files for Vendor Track.
    Validates register files, combines records from all selected projects into
    one Vendor Track Register, and preserves existing date values.
    """
    if not body.project_ids:
        raise HTTPException(status_code=422, detail="At least one project must be selected.")

    # Deduplicate while preserving order
    seen: set[str] = set()
    validated_pids: list[str] = []
    for pid in body.project_ids:
        clean = pid.strip()
        if not _valid_project_id(clean):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid project ID {pid!r}. Use only alphanumerics and hyphens.",
            )
        if clean not in seen:
            seen.add(clean)
            validated_pids.append(clean)

    try:
        result = refresh_vendor_track_from_registers(
            project_ids=validated_pids,
            registers_dir=SHORTAGE_REGISTERS_DIR,
            db_path=SERVICES_DB,
        )
        return result
    except FileNotFoundError as fnf_err:
        raise HTTPException(status_code=404, detail=str(fnf_err)) from fnf_err
    except ValueError as val_err:
        raise HTTPException(status_code=422, detail=str(val_err)) from val_err
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Vendor track refresh failed: {exc}",
        ) from exc


@router.get("/records")
def get_vt_records(
    project_ids: str | None = None,
    vendor: str | None = None,
    wbs_elements: str | None = None,
    page: int = 1,
    page_size: int = 50,
):
    """
    Return paginated Vendor Track records with the required 8 columns:
      1. Vendor Detail
      2. WBS Element
      3. Material Code
      4. Description
      5. Quantity
      6. Vendor Date
      7. Proposed Date
      8. Final Date
    """
    page = max(1, page)
    page_size = min(200, max(1, page_size))

    conditions: list[str] = []
    values: list[Any] = []

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
                    "Quantity",
                    "Vendor Date",
                    "Proposed Date",
                    "Final Date"
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
                    "vendor_date": r["Vendor Date"] or "",
                    "proposed_date": r["Proposed Date"] or "",
                    "final_date": r["Final Date"] or "",
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

            nonempty_clause = (
                " AND TRIM(COALESCE(\"WBS Element\",\"\")) <> \"\""
                if conditions else
                " WHERE TRIM(COALESCE(\"WBS Element\",\"\")) <> \"\""
            )
            rows = conn.execute(
                f'SELECT DISTINCT "WBS Element" FROM "vendor_track"{where}{nonempty_clause} '
                'ORDER BY "WBS Element"',
                values,
            ).fetchall()
            return {"wbs_elements": [r[0] for r in rows if r[0]]}
    except FileNotFoundError:
        return {"wbs_elements": []}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/export-date-request")
def export_vendor_date_request_endpoint(body: VendorDateRequestExportModel):
    """
    Export currently filtered Vendor Track records for a single vendor to:
    Vendor Registers/<vendor>/Outgoing/Vendor_Date_Request/<Remark>.xlsx
    """
    clean_vendor = body.vendor.strip() if body.vendor else ""
    if not clean_vendor or clean_vendor in ("All Vendors", "All"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Please select a specific vendor from the Vendor filter before exporting. "
                "Multi-vendor export is not allowed."
            ),
        )

    try:
        result = export_vendor_date_request(
            vendor=clean_vendor,
            project_ids=body.project_ids,
            wbs_elements=body.wbs_elements,
            db_path=SERVICES_DB,
            output_root=VENDOR_REGISTERS_DIR,
        )
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err)) from val_err
    except FileNotFoundError as fnf_err:
        raise HTTPException(status_code=404, detail=str(fnf_err)) from fnf_err
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Vendor Date Request export failed: {exc}",
        ) from exc


def _empty_vt(page: int, page_size: int) -> dict:
    return {
        "items": [],
        "total": 0,
        "page": page,
        "page_size": page_size,
        "pages": 1,
    }


# ── Vendor Track Import endpoints ─────────────────────────────────────────────

class VendorImportApplyModel(BaseModel):
    file_path: str


@router.get("/import/discover")
def discover_import_files():
    """
    Scan Vendor Registers/ and Vendor Date Registers/ for candidate
    vendor response workbooks that can be imported.
    """
    try:
        candidates = discover_vendor_response_files(
            vendor_registers_dir=VENDOR_REGISTERS_DIR,
            vendor_date_registers_dir=VENDOR_DATE_REGISTERS_DIR,
        )
        return {
            "files": candidates,
            "total": len(candidates),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/import/preview")
def preview_import_file(body: VendorImportApplyModel):
    """
    Validate and preview a vendor response workbook.
    Shows which rows match existing records and which Final Dates would change.
    """
    file_path = Path(body.file_path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path.name}")

    # Security: ensure path is within allowed directories
    resolved = file_path.resolve()
    allowed_roots = [VENDOR_REGISTERS_DIR.resolve(), VENDOR_DATE_REGISTERS_DIR.resolve()]
    if not any(str(resolved).startswith(str(root)) for root in allowed_roots):
        raise HTTPException(
            status_code=403,
            detail="File is outside the allowed Vendor Registers directories.",
        )

    try:
        result = preview_vendor_response(file_path, db_path=SERVICES_DB)
        return result
    except (ValueError, FileNotFoundError) as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/import/apply")
def apply_import_file(body: VendorImportApplyModel):
    """
    Apply accepted Final Dates from a vendor response workbook to durable storage
    (net_shortage + vendor_track) and refresh affected Material Shortage Registers.
    """
    file_path = Path(body.file_path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path.name}")

    resolved = file_path.resolve()
    allowed_roots = [VENDOR_REGISTERS_DIR.resolve(), VENDOR_DATE_REGISTERS_DIR.resolve()]
    if not any(str(resolved).startswith(str(root)) for root in allowed_roots):
        raise HTTPException(
            status_code=403,
            detail="File is outside the allowed Vendor Registers directories.",
        )

    try:
        result = apply_vendor_response(
            file_path,
            db_path=SERVICES_DB,
            registers_dir=SHORTAGE_REGISTERS_DIR,
        )
        return result
    except (ValueError, FileNotFoundError) as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/import/history")
def get_import_history_endpoint():
    """Return the import audit log (last 50 entries)."""
    try:
        return {"history": get_import_history(db_path=SERVICES_DB)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
