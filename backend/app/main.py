
from contextlib import asynccontextmanager
from pathlib import Path
import subprocess
import sys

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

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

            # Expose strictly these three filters.
            for api_col in (
                "material_ref_code",
                "wbs_element",
                "material_code",
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

    # Apply only the three supported filters.
    for field, value in (
        ("material_ref_code", material_ref_code),
        ("wbs_element", wbs_element),
        ("material_code", material_code),
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
