"""
Vendor Track Import service for ABB Shortage Management System.

Handles:
1. Discovery of vendor response workbooks in Vendor Registers/ and Vendor Date Registers/
2. Workbook structure validation and preview against database records
3. Applying accepted Final Dates to durable application storage (net_shortage, vendor_track)
4. Synchronizing Material Shortage Register Excel workbooks
5. Audit history tracking
"""

from __future__ import annotations

import datetime
import os
from pathlib import Path
import re
import sqlite3
from typing import Any

import openpyxl

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
SERVICES_DB = DATA_DIR / "services.db"
DEFAULT_SHORTAGE_REGISTERS_DIR = Path(
    os.getenv("SHORTAGE_REGISTERS_DIR", str(PROJECT_ROOT / "Material Shortage Registers"))
)
DEFAULT_VENDOR_REGISTERS_DIR = Path(
    os.getenv("VENDOR_REGISTERS_DIR", str(PROJECT_ROOT / "Vendor Registers"))
)
DEFAULT_VENDOR_DATE_REGISTERS_DIR = Path(
    os.getenv("VENDOR_DATE_REGISTERS_DIR", str(PROJECT_ROOT / "Vendor Date Registers"))
)

DATE_COLUMNS = {"vendor_date", "proposed_date", "final_date"}


def clean_text(v: Any) -> str:
    if v is None:
        return ""
    text = str(v).replace("\xa0", " ").strip()
    return "" if text.lower() in ("none", "nan", "null") else text


def discover_vendor_response_files(
    vendor_registers_dir: Path = DEFAULT_VENDOR_REGISTERS_DIR,
    vendor_date_registers_dir: Path = DEFAULT_VENDOR_DATE_REGISTERS_DIR,
) -> list[dict[str, Any]]:
    """Scan vendor directories for candidate response workbooks."""
    candidates: list[dict[str, Any]] = []
    roots = [vendor_registers_dir, vendor_date_registers_dir]

    for root in roots:
        if not root.is_dir():
            continue
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix.lower() not in (".xlsx", ".xls", ".xlsm"):
                continue
            if p.name.startswith("~$"):
                continue
            # Avoid picking up newly exported Date Requests inside Outgoing directories
            norm_parts = [part.lower() for part in p.parts]
            is_outgoing = "outgoing" in norm_parts

            # Relative path from root
            rel = p.relative_to(root)
            vendor_folder = rel.parts[0] if len(rel.parts) > 1 else "Root"

            stat = p.stat()
            candidates.append({
                "vendor_folder": vendor_folder,
                "filename": p.name,
                "relative_path": str(rel),
                "absolute_path": str(p.resolve()),
                "size_bytes": stat.st_size,
                "modified_at": datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                "is_outgoing": is_outgoing,
            })

    # Sort candidates: non-outgoing first, then by modified time descending
    candidates.sort(key=lambda x: (x["is_outgoing"], x["modified_at"]), reverse=False)
    return candidates


def preview_vendor_response(
    file_path: Path,
    db_path: Path = SERVICES_DB,
) -> dict[str, Any]:
    """Validate candidate workbook and preview changes against live database."""
    if not file_path.is_file():
        raise FileNotFoundError(f"File not found: {file_path}")

    wb = openpyxl.load_workbook(file_path, data_only=True)
    sheet = wb.active
    rows_iter = sheet.iter_rows(values_only=True)
    header_row = next(rows_iter, None)

    if not header_row:
        wb.close()
        raise ValueError(f"File '{file_path.name}' is empty.")

    # Match headers case-insensitively
    col_map: dict[str, int] = {}
    for idx, c in enumerate(header_row):
        if c is not None:
            col_map[clean_text(c).casefold()] = idx

    # Resolve required columns
    wbs_idx = None
    mat_idx = None
    for cand in ("wbs element", "wbs", "wbs_element"):
        if cand in col_map:
            wbs_idx = col_map[cand]
            break
    for cand in ("material code", "material", "material_code"):
        if cand in col_map:
            mat_idx = col_map[cand]
            break

    if wbs_idx is None or mat_idx is None:
        wb.close()
        raise ValueError(
            f"File '{file_path.name}' is missing required WBS Element or Material Code header."
        )

    # Optional columns
    desc_idx = col_map.get("material description") or col_map.get("description")
    vd_idx = col_map.get("vendor detail") or col_map.get("vendor")
    v_date_idx = col_map.get("vendor date")
    p_date_idx = col_map.get("proposed date")
    f_date_idx = col_map.get("final date")
    qty_idx = col_map.get("net shortage") or col_map.get("quantity") or col_map.get("open po quantity")

    # Connect to DB to check existing records
    existing_records: dict[tuple[str, str], dict[str, Any]] = {}
    if db_path.is_file():
        with sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                'SELECT project_id, "WBS Element", "Material Code", "Vendor Detail", "Final Date" FROM net_shortage'
            ).fetchall()
            for r in rows:
                k = (clean_text(r["WBS Element"]), clean_text(r["Material Code"]))
                existing_records[k] = {
                    "project_id": r["project_id"],
                    "vendor": clean_text(r["Vendor Detail"]),
                    "current_final_date": clean_text(r["Final Date"]),
                }

    preview_rows: list[dict[str, Any]] = []
    matched_count = 0
    changed_count = 0

    for r_idx, r in enumerate(rows_iter, start=2):
        if not r or all(c is None for c in r):
            continue
        wbs = clean_text(r[wbs_idx]) if wbs_idx < len(r) else ""
        mat = clean_text(r[mat_idx]) if mat_idx < len(r) else ""
        if not wbs and not mat:
            continue

        desc = clean_text(r[desc_idx]) if desc_idx is not None and desc_idx < len(r) else ""
        vendor = clean_text(r[vd_idx]) if vd_idx is not None and vd_idx < len(r) else ""
        v_date = clean_text(r[v_date_idx]) if v_date_idx is not None and v_date_idx < len(r) else ""
        p_date = clean_text(r[p_date_idx]) if p_date_idx is not None and p_date_idx < len(r) else ""
        f_date = clean_text(r[f_date_idx]) if f_date_idx is not None and f_date_idx < len(r) else ""
        qty_val = r[qty_idx] if qty_idx is not None and qty_idx < len(r) else 0.0

        key = (wbs, mat)
        db_match = existing_records.get(key)
        matched = db_match is not None
        current_final = db_match["current_final_date"] if db_match else ""
        project_id = db_match["project_id"] if db_match else ""

        has_new_date = bool(f_date and f_date != current_final)
        if matched:
            matched_count += 1
            if has_new_date:
                changed_count += 1

        status = "MATCHED_NEW_DATE" if (matched and has_new_date) else ("MATCHED" if matched else "UNMATCHED")

        preview_rows.append({
            "row_index": r_idx,
            "project_id": project_id,
            "wbs_element": wbs,
            "material_code": mat,
            "description": desc,
            "vendor": vendor or (db_match["vendor"] if db_match else ""),
            "quantity": qty_val,
            "vendor_date": v_date,
            "proposed_date": p_date,
            "final_date": f_date,
            "current_final_date": current_final,
            "matched": matched,
            "status": status,
        })

    wb.close()
    return {
        "filename": file_path.name,
        "total_rows": len(preview_rows),
        "matched_rows": matched_count,
        "unmatched_rows": len(preview_rows) - matched_count,
        "changed_dates_count": changed_count,
        "items": preview_rows,
    }


def apply_vendor_response(
    file_path: Path,
    db_path: Path = SERVICES_DB,
    registers_dir: Path = DEFAULT_SHORTAGE_REGISTERS_DIR,
) -> dict[str, Any]:
    """
    Apply accepted dates from vendor response file to durable storage (net_shortage, vendor_track)
    and refresh affected Material Shortage Registers.
    """
    preview = preview_vendor_response(file_path, db_path=db_path)
    items = preview["items"]

    updated_count = 0
    affected_projects: set[str] = set()

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA busy_timeout = 5000")
        with conn:
            # Ensure history table exists
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS import_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT,
                    imported_at TEXT,
                    rows_updated INTEGER,
                    affected_projects TEXT
                )
                """
            )

            tables = {r[0].casefold() for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            has_vt = "vendor_track" in tables

            for item in items:

                f_date = item["final_date"]
                wbs = item["wbs_element"]
                mat = item["material_code"]
                v_date = item["vendor_date"]
                p_date = item["proposed_date"]
                pid = item["project_id"]

                if not f_date:
                    continue

                # Update net_shortage Final Date
                cur = conn.execute(
                    'UPDATE net_shortage SET "Final Date" = ? WHERE "WBS Element" = ? AND "Material Code" = ?',
                    (f_date, wbs, mat),
                )
                if cur.rowcount > 0:
                    updated_count += cur.rowcount
                    if pid:
                        affected_projects.add(pid)

                # Update vendor_track dates if vendor_track table exists
                if has_vt:
                    conn.execute(
                        """
                        UPDATE vendor_track
                        SET "Final Date" = ?,
                            "Vendor Date" = CASE WHEN ? != '' THEN ? ELSE "Vendor Date" END,
                            "Proposed Date" = CASE WHEN ? != '' THEN ? ELSE "Proposed Date" END
                        WHERE "WBS Element" = ? AND "Material Code" = ?
                        """,
                        (f_date, v_date, v_date, p_date, p_date, wbs, mat),
                    )


            # Record history entry
            conn.execute(
                """
                INSERT INTO import_history (filename, imported_at, rows_updated, affected_projects)
                VALUES (?, ?, ?, ?)
                """,
                (
                    file_path.name,
                    datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    updated_count,
                    ", ".join(sorted(affected_projects)),
                ),
            )

    # Refresh affected Material Shortage Registers
    from services.shortage_export import export_material_shortage_register
    refreshed_registers = []
    for pid in sorted(affected_projects):
        try:
            reg_res = export_material_shortage_register(pid, db_path=db_path, output_dir=registers_dir)
            refreshed_registers.append(reg_res["filename"])
        except Exception:
            pass

    return {
        "success": True,
        "filename": file_path.name,
        "rows_updated": updated_count,
        "affected_projects": sorted(affected_projects),
        "refreshed_registers": refreshed_registers,
        "message": f"Successfully applied {updated_count} Final Dates across {len(affected_projects)} projects.",
    }


def get_import_history(db_path: Path = SERVICES_DB) -> list[dict[str, Any]]:
    """Return historical import log."""
    if not db_path.is_file():
        return []
    with sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True) as conn:
        conn.row_factory = sqlite3.Row
        tables = {r[0].casefold() for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "import_history" not in tables:
            return []
        rows = conn.execute("SELECT * FROM import_history ORDER BY id DESC LIMIT 50").fetchall()
        return [dict(r) for r in rows]
