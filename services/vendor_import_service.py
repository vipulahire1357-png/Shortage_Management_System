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
import tempfile
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


def _cell_text(value: Any) -> str:
    """Return stable display/storage text for Excel values, including dates."""
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.date().isoformat() if isinstance(value, datetime.datetime) else value.isoformat()
    return clean_text(value)


def _normalize_date(value: Any) -> str:
    """Normalize common vendor date formats to ISO for comparison and storage."""
    text = _cell_text(value)
    if not text:
        return ""
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return datetime.datetime.strptime(text[:10], fmt).date().isoformat()
        except ValueError:
            continue
    return text


def _first_column(col_map: dict[str, int], *names: str) -> int | None:
    """Return the first present column index, including valid index zero."""
    for name in names:
        idx = col_map.get(name)
        if idx is not None:
            return idx
    return None


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

    # Incoming workbooks first, newest response first within each group.
    candidates.sort(key=lambda x: x["modified_at"], reverse=True)
    candidates.sort(key=lambda x: x["is_outgoing"])
    return candidates


def preview_vendor_response(
    file_path: Path,
    db_path: Path = SERVICES_DB,
) -> dict[str, Any]:
    """Validate candidate workbook and preview changes against live database."""
    if not file_path.is_file():
        raise FileNotFoundError(f"File not found: {file_path}")

    wb = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
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
    project_idx = col_map.get("project id")
    if project_idx is None:
        project_idx = col_map.get("project_id")
    desc_idx = _first_column(col_map, "material description", "description")
    vd_idx = _first_column(col_map, "vendor detail", "vendor")
    v_date_idx = col_map.get("vendor date")
    p_date_idx = col_map.get("proposed date")
    f_date_idx = col_map.get("final date")
    qty_idx = _first_column(col_map, "net shortage", "quantity", "open po quantity")

    # Index database records by the full business key. WBS + material alone is
    # not safe across multiple projects or vendors.
    existing_records: dict[tuple[str, str], list[dict[str, Any]]] = {}
    if db_path.is_file():
        with sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                'SELECT project_id, "WBS Element", "Material Code", "Vendor Detail", "Final Date" FROM net_shortage'
            ).fetchall()
            for r in rows:
                k = (clean_text(r["WBS Element"]), clean_text(r["Material Code"]))
                existing_records.setdefault(k, []).append({
                    "project_id": r["project_id"],
                    "vendor": clean_text(r["Vendor Detail"]),
                    "current_final_date": clean_text(r["Final Date"]),
                })

    preview_rows: list[dict[str, Any]] = []
    matched_count = 0
    changed_count = 0
    proposed_count = 0
    ambiguous_count = 0

    for r_idx, r in enumerate(rows_iter, start=2):
        if not r or all(c is None for c in r):
            continue
        wbs = _cell_text(r[wbs_idx]) if wbs_idx < len(r) else ""
        mat = _cell_text(r[mat_idx]) if mat_idx < len(r) else ""
        if not wbs and not mat:
            continue

        desc = _cell_text(r[desc_idx]) if desc_idx is not None and desc_idx < len(r) else ""
        vendor = _cell_text(r[vd_idx]) if vd_idx is not None and vd_idx < len(r) else ""
        v_date = _normalize_date(r[v_date_idx]) if v_date_idx is not None and v_date_idx < len(r) else ""
        p_date = _normalize_date(r[p_date_idx]) if p_date_idx is not None and p_date_idx < len(r) else ""
        f_date = _normalize_date(r[f_date_idx]) if f_date_idx is not None and f_date_idx < len(r) else ""
        qty_val = r[qty_idx] if qty_idx is not None and qty_idx < len(r) else 0.0
        pid_from_file = _cell_text(r[project_idx]) if project_idx is not None and project_idx < len(r) else ""

        candidates = existing_records.get((wbs, mat), [])
        if vendor:
            candidates = [c for c in candidates if c["vendor"].casefold() == vendor.casefold()]
        if pid_from_file:
            candidates = [c for c in candidates if str(c["project_id"] or "").casefold() == pid_from_file.casefold()]
        db_match = candidates[0] if len(candidates) == 1 else None
        matched = db_match is not None and bool(vendor)
        ambiguous = len(candidates) > 1
        current_final = db_match["current_final_date"] if db_match else ""
        project_id = db_match["project_id"] if db_match else ""

        is_counteroffer = bool(p_date and p_date.casefold() != v_date.casefold())
        has_new_date = bool(matched and v_date and not is_counteroffer and v_date != current_final)
        if matched:
            matched_count += 1
            if has_new_date:
                changed_count += 1
        if is_counteroffer:
            proposed_count += 1
        if ambiguous:
            ambiguous_count += 1

        workbook_values = {
            clean_text(header): _cell_text(r[idx]) if idx < len(r) else ""
            for idx, header in enumerate(header_row)
            if header is not None
        }

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
            "matched": matched,
            "ambiguous": ambiguous,
            # Keep the import grid's Status column intentionally blank. Match
            # counts are available in the summary above the workbook preview.
            "status": "",
            "workbook_values": workbook_values,
        })

    wb.close()
    return {
        "filename": file_path.name,
        "total_rows": len(preview_rows),
        "matched_rows": matched_count,
        "unmatched_rows": len(preview_rows) - matched_count,
        "changed_dates_count": changed_count,
        "proposed_dates_count": proposed_count,
        "ambiguous_rows": ambiguous_count,
        "headers": [clean_text(h) for h in header_row if h is not None],
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

                f_date = item["vendor_date"]
                wbs = item["wbs_element"]
                mat = item["material_code"]
                v_date = item["vendor_date"]
                p_date = item["proposed_date"]
                pid = item["project_id"]
                vendor = item["vendor"]

                # A populated Proposed Date marks a counteroffer. Only rows
                # with a Vendor Date and no counteroffer are accepted here.
                if (
                    not item["matched"]
                    or not f_date
                    or (p_date and p_date.casefold() != f_date.casefold())
                    or not pid
                    or not vendor
                    or item["ambiguous"]
                ):
                    continue

                # Update only the uniquely matched project/vendor/material row.
                cur = conn.execute(
                    '''UPDATE net_shortage SET "Final Date" = ?
                       WHERE "project_id" = ? AND "WBS Element" = ?
                         AND "Material Code" = ? AND lower("Vendor Detail") = lower(?)''',
                    (f_date, pid, wbs, mat, vendor),
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
                            "Proposed Date" = ''
                        WHERE "project_id" = ?
                          AND "WBS Element" = ? AND "Material Code" = ?
                          AND lower("Vendor Detail") = lower(?)
                        """,
                        (f_date, v_date, v_date, pid, wbs, mat, vendor),
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
    refresh_errors = []
    for pid in sorted(affected_projects):
        try:
            reg_res = export_material_shortage_register(pid, db_path=db_path, output_dir=registers_dir)
            refreshed_registers.append(reg_res["filename"])
        except Exception as exc:
            refresh_errors.append({"project_id": pid, "error": str(exc)})

    return {
        "success": not refresh_errors,
        "filename": file_path.name,
        "rows_updated": updated_count,
        "affected_projects": sorted(affected_projects),
        "refreshed_registers": refreshed_registers,
        "refresh_errors": refresh_errors,
        "message": (
            f"Applied {updated_count} Vendor Dates across {len(affected_projects)} projects."
            if not refresh_errors else
            f"Applied dates to the database, but {len(refresh_errors)} project register(s) could not be refreshed."
        ),
    }


def export_proposed_response(
    file_path: Path,
    vendor_registers_dir: Path = DEFAULT_VENDOR_REGISTERS_DIR,
) -> dict[str, Any]:
    """Export proposed rows to the same First/Second request path as Export.

    A repeated counteroffer replaces the canonical request workbook so the
    vendor folder does not accumulate competing versions of the same cycle.
    """
    preview = preview_vendor_response(file_path)
    rows = [
        item for item in preview["items"]
        if item["proposed_date"] and item["proposed_date"].casefold() != item["vendor_date"].casefold()
    ]
    if not rows:
        raise ValueError("No Proposed Date values were found to send back to the vendor.")
    vendors = {item["vendor"] for item in rows if item["vendor"]}
    if len(vendors) != 1:
        raise ValueError("The proposed response must contain rows for exactly one vendor.")
    if any(item["ambiguous"] or not item["matched"] for item in rows):
        raise ValueError("Resolve unmatched or ambiguous rows before exporting proposed dates.")

    from services.vendor_request_export import (
        build_vendor_request_workbook,
        calculate_batch_remark,
        sanitize_vendor_folder_name,
    )

    vendor = next(iter(vendors))
    export_rows = [{
        "Project ID": item["project_id"],
        "Vendor Detail": item["vendor"],
        "WBS Element": item["wbs_element"],
        "Material Code": item["material_code"],
        "Description": item["description"],
        "Quantity": item["quantity"],
        "Vendor Date": item["vendor_date"],
        "Proposed Date": item["proposed_date"],
        # Final Date is populated only by the explicit Update action.
        "Final Date": "",
    } for item in rows]
    dest_dir = Path(vendor_registers_dir) / sanitize_vendor_folder_name(vendor) / "Outgoing" / "Vendor_Date_Request"
    dest_dir.mkdir(parents=True, exist_ok=True)
    remark = calculate_batch_remark(export_rows)
    output = dest_dir / f"{remark}.xlsx"
    wb = build_vendor_request_workbook(export_rows, vendor_name=vendor, table_name_suffix=remark)
    # Save beside the destination and replace atomically after the workbook is
    # complete. This preserves the previous request if workbook generation fails.
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=f".{remark}_", suffix=".xlsx", dir=dest_dir, delete=False
        ) as temp_file:
            temp_name = temp_file.name
        wb.save(temp_name)
        wb.close()
        os.replace(temp_name, output)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)
    return {
        "success": True,
        "vendor": vendor,
        "filename": output.name,
        "output_path": str(output.resolve()),
        "row_count": len(export_rows),
        "remark": remark,
        "message": f"Exported {len(export_rows)} proposed date(s) for {vendor} as {output.name}, replacing the previous request.",
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
