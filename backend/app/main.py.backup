
from contextlib import asynccontextmanager
import io
from pathlib import Path
import subprocess
import sys

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

from .database import (
    API_COLUMNS,
    API_TO_DB,
    DB_COLUMNS,
    DB_TO_API,
    RAW_DIR,
    REPORTS,
    ROOT,
    connect_services,
    get_output_table,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="ABB Shortage Management API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def quote_identifier(identifier: str) -> str:
    """Safely quote a SQLite column or table identifier."""
    return '"' + identifier.replace('"', '""') + '"'


def empty_filters():
    return {
        "material_ref_code": [],
        "wbs_element": [],
        "material_code": [],
        "scope": [],
    }


def empty_shortages(page: int = 1, page_size: int = 10):
    return {
        "items": [],
        "total": 0,
        "page": page,
        "page_size": page_size,
        "pages": 1,
        "summary": {
            "materials": 0,
            "net_shortage": 0,
            "demand": 0,
        },
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "ABB Shortage Management API",
        "project_root": str(ROOT),
    }


@app.get("/api/reports")
def reports():
    return [
        {
            "key": key,
            "label": val["label"],
            "extensions": sorted(val["extensions"]),
        }
        for key, val in REPORTS.items()
    ]


@app.get("/api/raw-files")
def raw_files():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    return {
        "files": sorted(
            path.name
            for path in RAW_DIR.iterdir()
            if path.is_file()
        )
    }


@app.post("/api/reports/{report_key}")
async def upload_report(
    report_key: str,
    file: UploadFile = File(...),
):
    key = report_key.strip().lower()

    if key not in REPORTS:
        raise HTTPException(
            status_code=404,
            detail="Unknown report type.",
        )

    report = REPORTS[key]
    original = Path(file.filename or "upload").name
    suffix = Path(original).suffix.lower()

    if suffix not in report["extensions"]:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported extension {suffix or '(none)'} "
                f"for {report['label']}. Allowed: "
                f"{', '.join(sorted(report['extensions']))}"
            ),
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    RAW_DIR.mkdir(parents=True, exist_ok=True)

    destination = RAW_DIR / f"{report['stem']}{suffix}"

    # Remove older files for this report type.
    # Keep unrelated reports untouched.
    for old in RAW_DIR.iterdir():
        if (
            old.is_file()
            and old != destination
            and old.stem.casefold() == report["stem"].casefold()
        ):
            old.unlink()

    destination.write_bytes(content)

    return {
        "message": f"Saved {original} as data/raw/{destination.name}.",
        "saved_as": destination.name,
    }


@app.post("/api/process")
def process_reports():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "main.py",
        "--report",
        "all",
    ]

    try:
        result = subprocess.run(
            command,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=600,
        )

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
            detail=(
                output[-12000:]
                or (
                    "Processing failed. Check that all required "
                    "SAP reports are present in data/raw/."
                )
            ),
        )

    return {
        "message": (
            "All report parsers and shortage calculation "
            "completed successfully."
        ),
        "output": output[-12000:],
    }


@app.get("/api/filters")
def filters():
    try:
        with connect_services() as conn:
            # IMPORTANT:
            # get_output_table() already returns a quoted SQL identifier.
            # Do not pass its result to quote_identifier() again.
            table = get_output_table(conn)

            result = {}

            # Expose strictly these four filters.
            for api_col in (
                "material_ref_code",
                "wbs_element",
                "material_code",
                "scope",
            ):
                db_col = quote_identifier(API_TO_DB[api_col])

                query = f"""
                    SELECT DISTINCT {db_col}
                    FROM {table}
                    WHERE TRIM(COALESCE({db_col}, '')) <> ''
                    ORDER BY {db_col}
                """

                rows = conn.execute(query).fetchall()

                result[api_col] = [
                    str(row[0])
                    for row in rows
                    if row[0] is not None
                ]

            return result

    except FileNotFoundError:
        return empty_filters()

    except RuntimeError:
        return empty_filters()


@app.get("/api/shortages")
def get_shortages(
    material_ref_code: str | None = None,
    wbs_element: str | None = None,
    material_code: str | None = None,
    scope: str | None = None,
    page: int = 1,
    page_size: int = 10,
    sort_by: str = "material_code",
    sort_dir: str = "asc",
):
    allowed = set(API_COLUMNS)

    if sort_by not in allowed:
        sort_by = "material_code"

    if sort_dir.lower() not in ("asc", "desc"):
        sort_dir = "asc"

    page = max(1, page)
    page_size = min(100, max(1, page_size))

    conditions = []
    values = []

    # Apply the four supported filters.
    for field, value in (
        ("material_ref_code", material_ref_code),
        ("wbs_element", wbs_element),
        ("material_code", material_code),
        ("scope", scope),
    ):
        if value and value != "All":
            db_col = quote_identifier(API_TO_DB[field])
            conditions.append(f"{db_col} = ?")
            values.append(value)

    where = (
        " WHERE " + " AND ".join(conditions)
        if conditions
        else ""
    )

    try:
        with connect_services() as conn:
            # IMPORTANT: use the returned table identifier directly.
            table = get_output_table(conn)

            total = conn.execute(
                f"SELECT COUNT(*) FROM {table}{where}",
                values,
            ).fetchone()[0]

            select_cols = ", ".join(
                quote_identifier(col)
                for col in DB_COLUMNS
            )

            order_col = quote_identifier(API_TO_DB[sort_by])
            direction = sort_dir.upper()

            rows = conn.execute(
                f"""
                    SELECT {select_cols}
                    FROM {table}{where}
                    ORDER BY {order_col} {direction}
                    LIMIT ? OFFSET ?
                """,
                values + [page_size, (page - 1) * page_size],
            ).fetchall()

            summary = conn.execute(
                f"""
                    SELECT
                        COUNT(*) AS materials,
                        COALESCE(SUM("Net Shortage"), 0)
                            AS net_shortage,
                        COALESCE(SUM("ZPP7 Quantity"), 0)
                            AS demand
                    FROM {table}{where}
                """,
                values,
            ).fetchone()

            items = [
                {
                    DB_TO_API[key]: row[key]
                    for key in DB_COLUMNS
                }
                for row in rows
            ]

            return {
                "items": items,
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": max(
                    1,
                    (total + page_size - 1) // page_size,
                ),
                "summary": {
                    "materials": summary["materials"],
                    "net_shortage": summary["net_shortage"],
                    "demand": summary["demand"],
                },
            }

    except FileNotFoundError:
        return empty_shortages(page, page_size)

    except RuntimeError:
        return empty_shortages(page, page_size)


@app.get("/api/export")
def export_shortages(
    material_ref_code: str | None = None,
    wbs_element: str | None = None,
    material_code: str | None = None,
    scope: str | None = None,
    format: str = "xlsx",
):
    """Export filtered net_shortage rows as XLSX or CSV."""
    conditions = []
    values = []

    for field, value in (
        ("material_ref_code", material_ref_code),
        ("wbs_element", wbs_element),
        ("material_code", material_code),
        ("scope", scope),
    ):
        if value and value != "All":
            db_col = quote_identifier(API_TO_DB[field])
            conditions.append(f"{db_col} = ?")
            values.append(value)

    where = " WHERE " + " AND ".join(conditions) if conditions else ""

    try:
        with connect_services() as conn:
            table = get_output_table(conn)
            select_cols = ", ".join(
                quote_identifier(col) for col in DB_COLUMNS
            )
            rows = conn.execute(
                f"SELECT {select_cols} FROM {table}{where} ORDER BY \"Material Code\"",
                values,
            ).fetchall()
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="Shortage database not ready. Run report processing first.",
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Human-readable column headers (same order as DB_COLUMNS).
    headers = [
        "Material Ref Code", "WBS Element", "Material Code",
        "Material Description", "ZPP7 Quantity", "Project Stock Quantity",
        "PO Quantity", "Open PO Quantity", "PR Quantity",
        "Net Shortage", "Free Stock", "Remarks", "Scope",
    ]

    fmt = format.lower().strip()

    # ── CSV ──────────────────────────────────────────────────────────────
    if fmt == "csv":
        def escape_csv(v: object) -> str:
            return '"' + str(v if v is not None else "").replace('"', '""') + '"'

        lines = []
        lines.append(",".join(escape_csv(h) for h in headers))
        for row in rows:
            lines.append(",".join(escape_csv(row[col]) for col in DB_COLUMNS))

        csv_bytes = ("\r\n".join(lines)).encode("utf-8-sig")
        return StreamingResponse(
            io.BytesIO(csv_bytes),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="abb-shortage-records.csv"'},
        )

    # ── XLSX ─────────────────────────────────────────────────────────────
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Net Shortage"

    # Header row styling.
    header_fill = PatternFill("solid", fgColor="B5121B")
    header_font = Font(bold=True, color="FFFFFF", name="Calibri", size=10)
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)

    ws.append(headers)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_align

    # Data rows.
    numeric_cols = {
        "ZPP7 Quantity", "Project Stock Quantity", "PO Quantity",
        "Open PO Quantity", "PR Quantity", "Net Shortage", "Free Stock",
    }
    for row in rows:
        data_row = []
        for col in DB_COLUMNS:
            val = row[col]
            # Keep numeric columns as numbers, everything else as text.
            if col in numeric_cols:
                try:
                    val = float(val) if val is not None else 0.0
                except (TypeError, ValueError):
                    val = 0.0
            else:
                val = str(val) if val is not None else ""
            data_row.append(val)
        ws.append(data_row)

    # Freeze header row, set reasonable column widths.
    ws.freeze_panes = "A2"
    col_widths = [
        22, 22, 22, 40, 12, 16, 12, 14, 12, 14, 12, 35, 14
    ]
    for i, width in enumerate(col_widths, start=1):
        ws.column_dimensions[
            openpyxl.utils.get_column_letter(i)
        ].width = width

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="abb-shortage-records.xlsx"'},
    )
