'''Build vendor-wise tracking data from data/services.db -> net_shortage.'''
from __future__ import annotations
import sqlite3
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVICES_DB_PATH = PROJECT_ROOT / "data" / "services.db"
SOURCE_TABLE = "net_shortage"
OUTPUT_TABLE = "vendor_track"
OUTPUT_COLUMNS = [
    "Vendor Detail", "WBS Element", "Material Code", "Description",
    "Quantity", "Vendor Date", "Proposed Date", "Final Date", "Status",
]

def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'

def resolve_table(conn: sqlite3.Connection, name: str) -> str:
    tables = {str(r[0]).casefold(): str(r[0]) for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )}
    actual = tables.get(name.casefold())
    if actual is None:
        raise RuntimeError(f"Required table {name!r} not found in {SERVICES_DB_PATH}.")
    return actual

def resolve_columns(conn: sqlite3.Connection, table: str, required: list[str]) -> dict[str, str]:
    available = {str(r[1]).strip().casefold(): str(r[1]) for r in conn.execute(
        f"PRAGMA table_info({quote_identifier(table)})"
    )}
    missing = [c for c in required if c.casefold() not in available]
    if missing:
        raise RuntimeError(f"Table {table!r} is missing columns {missing}. Found: {list(available.values())}")
    return {c: available[c.casefold()] for c in required}

def clean_text(value: Any) -> str:
    return "" if value is None else str(value).strip()

def _ensure_vendor_track_schema(conn: sqlite3.Connection) -> None:
    """Create vendor_track table with project_id column if it does not exist.
    If it exists but lacks project_id, add the column non-destructively."""
    tables = {str(r[0]).casefold(): str(r[0]) for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    if OUTPUT_TABLE.casefold() not in tables:
        conn.execute(
            f'CREATE TABLE {quote_identifier(OUTPUT_TABLE)} ('
            '"project_id" TEXT, '
            '"Vendor Detail" TEXT, "WBS Element" TEXT, "Material Code" TEXT, '
            '"Description" TEXT, "Quantity" REAL, "Vendor Date" TEXT, '
            '"Proposed Date" TEXT, "Final Date" TEXT, "Status" TEXT'
            ')'
        )
        return
    # Table exists - check for project_id column
    cols = {str(r[1]).casefold() for r in conn.execute(
        f'PRAGMA table_info({quote_identifier(OUTPUT_TABLE)})'
    )}
    if 'project_id' not in cols:
        # Add column; existing rows will get NULL (treated as legacy)
        conn.execute(
            f'ALTER TABLE {quote_identifier(OUTPUT_TABLE)} ADD COLUMN "project_id" TEXT'
        )

def build_rows_from_net_shortage(
    db_path: Path,
    project_id: str,
) -> list[tuple[Any, ...]]:
    """Read net_shortage from db_path and produce vendor_track rows tagged with project_id."""
    if not db_path.is_file():
        raise FileNotFoundError(f"Services database not found: {db_path}")
    required = ["Vendor Detail", "WBS Element", "Material Code", "Material Description", "Net Shortage"]
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        table = resolve_table(conn, SOURCE_TABLE)
        columns = resolve_columns(conn, table, required)
        selection = ", ".join(
            f"{quote_identifier(columns[c])} AS {quote_identifier(c)}" for c in required
        )
        source_rows = conn.execute(f"SELECT {selection} FROM {quote_identifier(table)}").fetchall()

    output = []
    for row in source_rows:
        vendors = sorted({v.strip() for v in clean_text(row["Vendor Detail"]).split(" | ") if v.strip()})
        for vendor in vendors:
            output.append((
                project_id,
                vendor,
                clean_text(row["WBS Element"]),
                clean_text(row["Material Code"]),
                clean_text(row["Material Description"]),
                row["Net Shortage"] if row["Net Shortage"] is not None else 0,
                "", "", "", "",
            ))
    return output

def refresh_vendor_track_for_project(
    project_id: str,
    db_path: Path = SERVICES_DB_PATH,
) -> int:
    """Idempotent: delete existing rows for project_id, then insert fresh rows.

    Only rows belonging to project_id are touched.
    Other projects' rows are preserved untouched.
    """
    rows = build_rows_from_net_shortage(db_path, project_id)
    all_columns = ["project_id"] + OUTPUT_COLUMNS
    columns_sql = ", ".join(quote_identifier(c) for c in all_columns)
    placeholders = ", ".join("?" for _ in all_columns)

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA busy_timeout = 5000")
        with conn:
            _ensure_vendor_track_schema(conn)
            # Delete only this project's rows - other projects are untouched
            conn.execute(
                f'DELETE FROM {quote_identifier(OUTPUT_TABLE)} WHERE "project_id" = ?',
                (project_id,),
            )
            if rows:
                conn.executemany(
                    f'INSERT INTO {quote_identifier(OUTPUT_TABLE)} ({columns_sql}) VALUES ({placeholders})',
                    rows,
                )
    print(f"Vendor tracking refreshed for project '{project_id}': {len(rows)} rows.")
    return len(rows)

# ---------------------------------------------------------------------------
# Legacy compatibility: original full-replace path (called by main.py after
# single-project processing). Tags rows without project_id.
# ---------------------------------------------------------------------------
def build_rows(db_path: Path = SERVICES_DB_PATH) -> list[tuple[Any, ...]]:
    '''Expand each Vendor Detail into a vendor-specific row (legacy, no project_id).'''
    if not db_path.is_file():
        raise FileNotFoundError(f"Services database not found: {db_path}")
    required = ["Vendor Detail", "WBS Element", "Material Code", "Material Description", "Net Shortage"]
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        table = resolve_table(conn, SOURCE_TABLE)
        columns = resolve_columns(conn, table, required)
        selection = ", ".join(
            f"{quote_identifier(columns[c])} AS {quote_identifier(c)}" for c in required
        )
        source_rows = conn.execute(f"SELECT {selection} FROM {quote_identifier(table)}").fetchall()

    output = []
    for row in source_rows:
        vendors = sorted({v.strip() for v in clean_text(row["Vendor Detail"]).split(" | ") if v.strip()})
        for vendor in vendors:
            output.append((
                vendor,
                clean_text(row["WBS Element"]),
                clean_text(row["Material Code"]),
                clean_text(row["Material Description"]),
                row["Net Shortage"] if row["Net Shortage"] is not None else 0,
                "", "", "", "",
            ))
    return output

def refresh_vendor_track(db_path: Path = SERVICES_DB_PATH) -> int:
    '''Refresh vendor_track and preserve all other tables in services.db.

    Legacy entry point: replaces all vendor_track rows (no project isolation).
    Called by main.py after single-project processing pipeline.
    '''
    rows = build_rows(db_path)
    definitions = (
        '"Vendor Detail" TEXT, "WBS Element" TEXT, "Material Code" TEXT, '
        '"Description" TEXT, "Quantity" REAL, "Vendor Date" TEXT, '
        '"Proposed Date" TEXT, "Final Date" TEXT, "Status" TEXT'
    )
    columns = ", ".join(quote_identifier(c) for c in OUTPUT_COLUMNS)
    placeholders = ", ".join("?" for _ in OUTPUT_COLUMNS)
    temp = "_vendor_track_new"
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA busy_timeout = 5000")
        with conn:
            conn.execute(f"DROP TABLE IF EXISTS {quote_identifier(temp)}")
            conn.execute(f"CREATE TABLE {quote_identifier(temp)} ({definitions})")
            if rows:
                conn.executemany(
                    f"INSERT INTO {quote_identifier(temp)} ({columns}) VALUES ({placeholders})", rows
                )
            tables = {str(r[0]).casefold(): str(r[0]) for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )}
            old = tables.get(OUTPUT_TABLE.casefold())
            if old:
                conn.execute(f"DROP TABLE {quote_identifier(old)}")
            conn.execute(f"ALTER TABLE {quote_identifier(temp)} RENAME TO {quote_identifier(OUTPUT_TABLE)}")
    print(f"Vendor tracking table refreshed: {OUTPUT_TABLE} ({len(rows)} rows)")
    return len(rows)

def main() -> int:
    try:
        print(f"Services database: {SERVICES_DB_PATH}")
        refresh_vendor_track(SERVICES_DB_PATH)
        return 0
    except Exception as exc:
        print(f"Vendor tracking service failed: {exc}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
