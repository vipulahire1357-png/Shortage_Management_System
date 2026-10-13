"""
Build the ABB net-shortage table from the existing report databases.

Inputs:
    data/global.db
        - wbs_element
        - scopelist
        - Storage
        - ME2J
        - PR
    data/zpp7_breakdown.db
        - one table per Material Ref Code, plus parser_metadata

Output:
    data/services.db -> net_shortage

The source databases are read only. Only net_shortage is refreshed.
"""

from __future__ import annotations

import sqlite3
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"

GLOBAL_DB_PATH = DATA_DIR / "global.db"
ZPP7_DB_PATH = DATA_DIR / "zpp7_breakdown.db"
SERVICES_DB_PATH = DATA_DIR / "services.db"

OUTPUT_TABLE = "net_shortage"

OUTPUT_COLUMNS = [
    "Material Code",
    "Material Description",
    "ZPP7 Quantity",
    "Project Stock Quantity",
    "PO Quantity",
    "Open PO Quantity",
    "PR Quantity",
    "Net Shortage",
    "Free Stock",
    "Remarks",
    # Retained as supporting fields for sidebar filters; dashboard hides them.
    "Material Ref Code",
    "WBS Element",
    # Scope classification from scopelist (e.g. 'ABB', 'Vendor Scope').
    "Scope",
]


def quote_identifier(value: str) -> str:
    """Safely quote an SQLite table or column name."""
    return '"' + value.replace('"', '""') + '"'


def list_tables(connection: sqlite3.Connection) -> dict[str, str]:
    """Return a case-insensitive map of table names to actual names."""
    rows = connection.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {str(row[0]).casefold(): str(row[0]) for row in rows}


def resolve_table(
    connection: sqlite3.Connection,
    requested_name: str,
) -> str:
    """Resolve a table name case-insensitively or raise a useful error."""
    tables = list_tables(connection)
    actual_name = tables.get(requested_name.casefold())
    if actual_name is None:
        available = ", ".join(sorted(tables.values())) or "(no tables found)"
        raise RuntimeError(
            f"Required table {requested_name!r} was not found in the database. "
            f"Available tables: {available}"
        )
    return actual_name


def table_columns(
    connection: sqlite3.Connection,
    table_name: str,
) -> dict[str, str]:
    """Return a case-insensitive map of column names to actual names."""
    rows = connection.execute(
        f"PRAGMA table_info({quote_identifier(table_name)})"
    ).fetchall()
    return {str(row[1]).strip().casefold(): str(row[1]) for row in rows}


def resolve_columns(
    connection: sqlite3.Connection,
    table_name: str,
    required_columns: list[str],
) -> dict[str, str]:
    """Resolve required columns case-insensitively."""
    existing = table_columns(connection, table_name)
    missing = [name for name in required_columns if name.casefold() not in existing]
    if missing:
        raise RuntimeError(
            f"Table {table_name!r} is missing required columns: "
            f"{', '.join(missing)}. Found: {', '.join(existing.values())}"
        )
    return {name: existing[name.casefold()] for name in required_columns}


def read_table(
    connection: sqlite3.Connection,
    table_name: str,
    columns: list[str],
) -> list[dict[str, Any]]:
    """Read selected columns into dictionaries using actual database names."""
    resolved = resolve_columns(connection, table_name, columns)
    sql_columns = ", ".join(quote_identifier(resolved[c]) for c in columns)
    sql = f"SELECT {sql_columns} FROM {quote_identifier(table_name)}"
    cursor = connection.execute(sql)
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def clean_text(value: Any) -> str:
    """Normalize a join-key/text value without changing its case."""
    if value is None:
        return ""
    return str(value).strip()


def normalize_scope(value: Any) -> str:
    """Normalize scope for exact ABB matching."""
    return clean_text(value).upper()


def to_number(value: Any, *, context: str) -> float:
    """Convert report quantities to float, treating blank values as zero."""
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return float(value)

    text = str(value).strip()
    if not text:
        return 0.0

    # Source parsers store quantities as text. Remove standard thousands
    # separators and accept ordinary decimal quantities.
    text = text.replace(",", "").replace(" ", "")
    try:
        return float(text)
    except ValueError as exc:
        raise ValueError(
            f"Non-numeric quantity {value!r} encountered in {context}."
        ) from exc


def read_zpp7_rows(db_path: Path) -> list[dict[str, Any]]:
    """
    Read material rows from each ZPP7 reference table.

    Tables are identified by their columns, not by hardcoded reference codes,
    so new Material Ref Codes can be handled without editing this service.
    """
    if not db_path.is_file():
        raise FileNotFoundError(f"ZPP7 database not found: {db_path}")

    required = [
        "Material Ref Code",
        "Material Code",
        "Material Description",
        "Req",
    ]
    extracted: list[dict[str, Any]] = []

    with sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True) as conn:
        tables = list_tables(conn)
        candidates = [
            actual_name for folded, actual_name in tables.items()
            if folded != "parser_metadata"
        ]

        for table_name in candidates:
            available = table_columns(conn, table_name)
            if not all(column.casefold() in available for column in required):
                continue

            rows = read_table(conn, table_name, required)
            for row in rows:
                ref_code = clean_text(row["Material Ref Code"])
                material_code = clean_text(row["Material Code"])
                if not ref_code or not material_code:
                    continue

                extracted.append({
                    "Material Ref Code": ref_code,
                    "Material Code": material_code,
                    "Material Description": clean_text(
                        row["Material Description"]
                    ),
                    "Req Quantity": to_number(
                        row["Req"],
                        context=f"ZPP7 table {table_name!r}, material {material_code!r}",
                    ),
                })

    if not extracted:
        raise RuntimeError(
            f"No ZPP7 material tables with the required columns were found in {db_path}."
        )

    return extracted


def build_rows(
    global_db_path: Path,
    zpp7_db_path: Path,
) -> list[tuple[Any, ...]]:
    """Join report data and calculate shortage from ZPP7 requirements less project stock."""
    if not global_db_path.is_file():
        raise FileNotFoundError(f"Global database not found: {global_db_path}")

    with sqlite3.connect(global_db_path.resolve().as_uri() + "?mode=ro", uri=True) as conn:
        wbs_table = resolve_table(conn, "wbs_element")
        scope_table = resolve_table(conn, "scopelist")
        storage_table = resolve_table(conn, "Storage")
        me2j_table = resolve_table(conn, "ME2J")

        wbs_rows = read_table(
            conn, wbs_table, ["Material Ref Code", "WBS Element"]
        )
        scope_rows = read_table(
            conn, scope_table, ["Material Code", "Scope"]
        )
        storage_rows = read_table(
            conn, storage_table,
            ["Material Code", "Unrestricted", "WBS Element"],
        )
        me2j_rows = read_table(
            conn, me2j_table,
            ["Material Code", "Order Quantity", "Open Quantity", "WBS Element"],
        )
        pr_table = resolve_table(conn, "PR")
        pr_rows = read_table(
            conn, pr_table, ["Material Code", "PR Quantity", "WBS Element"]
        )

    # One Material Ref Code may theoretically map to multiple WBS elements.
    wbs_by_ref: dict[str, set[str]] = defaultdict(set)
    for row in wbs_rows:
        ref_code = clean_text(row["Material Ref Code"])
        wbs = clean_text(row["WBS Element"])
        if ref_code and wbs:
            wbs_by_ref[ref_code].add(wbs)

    # Build a material-to-scope lookup from scopelist.
    # When a material appears more than once, prefer 'ABB' over 'Vendor Scope'
    # over any other value (consistent with existing ABB-first business rule).
    SCOPE_PRIORITY = {"ABB": 0, "VENDOR SCOPE": 1}
    material_scope: dict[str, str] = {}
    for row in scope_rows:
        material = clean_text(row["Material Code"])
        scope_raw = clean_text(row["Scope"])
        if not material or not scope_raw:
            continue
        scope_upper = normalize_scope(scope_raw)
        # Only track ABB and Vendor Scope materials; skip Header / Not Required.
        if scope_upper not in SCOPE_PRIORITY:
            continue
        existing = material_scope.get(material)
        if existing is None:
            material_scope[material] = scope_raw
        else:
            # Keep the higher-priority (lower numeric) scope.
            if SCOPE_PRIORITY[scope_upper] < SCOPE_PRIORITY.get(
                normalize_scope(existing), 99
            ):
                material_scope[material] = scope_raw

    # Convenience sets for the two supported filter values.
    abb_materials = {
        m for m, s in material_scope.items() if normalize_scope(s) == "ABB"
    }
    vendor_materials = {
        m for m, s in material_scope.items() if normalize_scope(s) == "VENDOR SCOPE"
    }
    # All materials that belong to either scope (used for BOM filtering).
    scoped_materials = abb_materials | vendor_materials

    # Aggregate before joining to avoid multiplying stock/orders when a source
    # contains multiple rows for the same WBS + Material Code.
    storage_totals: dict[tuple[str, str], float] = defaultdict(float)
    free_stock_totals: dict[str, float] = defaultdict(float)
    for row in storage_rows:
        wbs = clean_text(row["WBS Element"])
        material = clean_text(row["Material Code"])
        unrestricted_qty = to_number(
            row["Unrestricted"],
            context=f"Storage, WBS {wbs!r}, material {material!r}",
        )
        if wbs and material:
            storage_totals[(wbs, material)] += unrestricted_qty
        elif not wbs and material:
            # Free stock is unrestricted MB52/Storage stock not assigned to a WBS.
            free_stock_totals[material] += unrestricted_qty

    order_totals: dict[tuple[str, str], list[float]] = defaultdict(
        lambda: [0.0, 0.0]
    )
    for row in me2j_rows:
        wbs = clean_text(row["WBS Element"])
        material = clean_text(row["Material Code"])
        if wbs and material:
            totals = order_totals[(wbs, material)]
            totals[0] += to_number(
                row["Order Quantity"],
                context=f"ME2J Order Quantity, WBS {wbs!r}, material {material!r}",
            )
            totals[1] += to_number(
                row["Open Quantity"],
                context=f"ME2J Open Quantity, WBS {wbs!r}, material {material!r}",
            )

    # Aggregate PR quantities by WBS Element + Material Code before joining.
    # A material can have multiple requisition rows, so sum them at the join grain.
    pr_totals: dict[tuple[str, str], float] = defaultdict(float)
    for row in pr_rows:
        wbs = clean_text(row["WBS Element"])
        material = clean_text(row["Material Code"])
        if wbs and material:
            pr_totals[(wbs, material)] += to_number(
                row["PR Quantity"],
                context=f"PR, WBS {wbs!r}, material {material!r}",
            )

    zpp7_rows = read_zpp7_rows(zpp7_db_path)

    # Aggregate repeated ZPP7 occurrences to the intended output grain:
    # Material Ref Code + WBS Element + Material Code.
    bom_totals: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in zpp7_rows:
        ref_code = row["Material Ref Code"]
        material = row["Material Code"]

        # Enforce scope membership (ABB or Vendor Scope) and WBS mapping.
        if material not in scoped_materials:
            continue
        mapped_wbs = wbs_by_ref.get(ref_code)
        if not mapped_wbs:
            continue

        for wbs in sorted(mapped_wbs):
            key = (ref_code, wbs, material)
            if key not in bom_totals:
                bom_totals[key] = {
                    "description": row["Material Description"],
                    "req": 0.0,
                }
            elif (
                not bom_totals[key]["description"]
                and row["Material Description"]
            ):
                bom_totals[key]["description"] = row["Material Description"]

            bom_totals[key]["req"] += row["Req Quantity"]

    output: list[tuple[Any, ...]] = []
    for (ref_code, wbs, material), bom in sorted(bom_totals.items()):
        unrestricted = storage_totals.get((wbs, material), 0.0)
        order_qty, open_qty = order_totals.get((wbs, material), [0.0, 0.0])
        pr_qty = pr_totals.get((wbs, material), 0.0)

        net_shortage = max(bom["req"] - unrestricted, 0.0)
        free_stock = free_stock_totals.get(material, 0.0)
        remarks = ""
        scope = material_scope.get(material, "")

        output.append((
            material,
            bom["description"] or None,
            bom["req"],
            unrestricted,
            order_qty,
            open_qty,
            pr_qty,
            net_shortage,
            free_stock,
            remarks,
            ref_code,
            wbs,
            scope,
        ))

    if not output:
        raise RuntimeError(
            "No rows qualified for net_shortage. Check that ZPP7 Material "
            "Ref Codes match wbs_element and that scopelist Scope values "
            "contain 'ABB' or 'Vendor Scope'."
        )

    return output


def write_output(
    rows: list[tuple[Any, ...]],
    db_path: Path = SERVICES_DB_PATH,
) -> None:
    """
    Atomically refresh net_shortage.

    This table is derived output, so it is rebuilt from the source databases.
    Existing unrelated tables in services.db are preserved.
    """
    db_path.parent.mkdir(parents=True, exist_ok=True)

    expected_types = {
        "Material Code": "TEXT",
        "Material Description": "TEXT",
        "ZPP7 Quantity": "REAL",
        "Project Stock Quantity": "REAL",
        "PO Quantity": "REAL",
        "Open PO Quantity": "REAL",
        "PR Quantity": "REAL",
        "Net Shortage": "REAL",
        "Free Stock": "REAL",
        "Remarks": "TEXT",
        "Material Ref Code": "TEXT",
        "WBS Element": "TEXT",
        "Scope": "TEXT",
    }
    definitions = ", ".join(
        f"{quote_identifier(column)} {kind}"
        for column, kind in expected_types.items()
    )
    quoted_columns = ", ".join(
        quote_identifier(column) for column in OUTPUT_COLUMNS
    )
    placeholders = ", ".join("?" for _ in OUTPUT_COLUMNS)

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA busy_timeout = 5000")

        # Stage the new output in a temporary table within a transaction.
        # If insertion fails, rollback leaves the existing output untouched.
        with conn:
            conn.execute(
                f"DROP TABLE IF EXISTS {quote_identifier('_netshortage_table_new')}"
            )
            conn.execute(
                f"CREATE TABLE {quote_identifier('_netshortage_table_new')} "
                f"({definitions})"
            )
            conn.executemany(
                f"INSERT INTO {quote_identifier('_netshortage_table_new')} "
                f"({quoted_columns}) VALUES ({placeholders})",
                rows,
            )

            tables = list_tables(conn)
            old_table = tables.get(OUTPUT_TABLE.casefold())
            if old_table is not None:
                conn.execute(f"DROP TABLE {quote_identifier(old_table)}")

            conn.execute(
                f"ALTER TABLE {quote_identifier('_netshortage_table_new')} "
                f"RENAME TO {quote_identifier(OUTPUT_TABLE)}"
            )


def main() -> int:
    """Build and refresh the net-shortage table."""
    try:
        print("Building ABB net_shortage table...")
        print(f"Global database: {GLOBAL_DB_PATH}")
        print(f"ZPP7 database:   {ZPP7_DB_PATH}")
        print(f"Output database: {SERVICES_DB_PATH}")

        rows = build_rows(GLOBAL_DB_PATH, ZPP7_DB_PATH)
        write_output(rows, SERVICES_DB_PATH)

        print(f"\nRows written: {len(rows)}")
        print(f"Output table: {OUTPUT_TABLE}")
        print("\nPreview:")
        with sqlite3.connect(SERVICES_DB_PATH) as conn:
            preview = conn.execute(
                f"SELECT * FROM {quote_identifier(OUTPUT_TABLE)} LIMIT 10"
            ).fetchall()
            for row in preview:
                print(row)

        return 0

    except Exception as error:
        print(f"Shortage service failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
