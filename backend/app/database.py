import os
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROJECTS_DIR = ROOT / "projects"
GLOBAL_DIR = ROOT / "global"
SERVICES_DB = DATA_DIR / "services.db"
SHORTAGE_REGISTERS_DIR = Path(os.getenv("SHORTAGE_REGISTERS_DIR", str(ROOT / "Material Shortage Registers")))
VENDOR_REGISTERS_DIR = Path(os.getenv("VENDOR_REGISTERS_DIR", str(ROOT / "Vendor Registers")))
VENDOR_DATE_REGISTERS_DIR = Path(os.getenv("VENDOR_DATE_REGISTERS_DIR", str(ROOT / "Vendor Date Registers")))

# Columns produced by services/shortage_service.py in data/services.db.
# Required order around affected columns: Free Stock | Vendor Detail | Final Date | Remarks
DB_COLUMNS = [
    "Material Ref Code", "WBS Element", "Material Code", "Material Description",
    "ZPP7 Quantity", "Project Stock Quantity", "PO Quantity", "Open PO Quantity",
    "PR Quantity", "Net Shortage", "Free Stock", "Vendor Detail", "Final Date",
    "Remarks", "Scope",
]
API_COLUMNS = [
    "material_ref_code", "wbs_element", "material_code", "material_description",
    "zpp7_quantity", "project_stock_quantity", "po_quantity", "open_po_quantity",
    "pr_quantity", "net_shortage", "free_stock", "vendor_detail", "final_date",
    "remarks", "scope",
]
DB_TO_API = dict(zip(DB_COLUMNS, API_COLUMNS))
API_TO_DB = dict(zip(API_COLUMNS, DB_COLUMNS))

REPORTS = {
    "mb25": {"label": "MB25 — WBS Mapping", "stem": "MB25", "extensions": {".xls", ".xlsx", ".xlsm"}},
    "mb52": {"label": "MB52 — Warehouse Stock", "stem": "MB52", "extensions": {".htm", ".html", ".xls", ".xlsx", ".xlsm"}},
    "me2j": {"label": "ME2J — Purchase Orders", "stem": "ME2J", "extensions": {".xls", ".xlsx", ".xlsm"}},
    "me2m": {"label": "ME2M — Vendor / Material Details", "stem": "ME2M", "extensions": {".xls", ".xlsx", ".xlsm", ".xlsb"}},
    "pr": {"label": "PR — Purchase Requisitions", "stem": "PR", "extensions": {".xls", ".xlsx", ".xlsm", ".txt", ".tsv", ".csv"}},
    "scopelist": {"label": "Scope List", "stem": "MATERIAL_SCOPE_LIST", "extensions": {".xls", ".xlsx", ".xlsm"}},
    "zpp7": {"label": "ZPP7 — Requirements", "stem": "ZPP7", "extensions": {".xls", ".xlsx", ".xlsm", ".txt", ".csv"}},
}


def connect_services():
    if not SERVICES_DB.exists():
        raise FileNotFoundError("Shortage output database does not exist yet. Upload all SAP reports and run processing first.")
    conn = sqlite3.connect(f"file:{SERVICES_DB.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def get_output_table(conn):
    tables = {r[0].casefold(): r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    table = tables.get("net_shortage")
    if not table:
        raise RuntimeError("Table net_shortage not found. Run report processing first.")
    return '"' + table.replace('"', '""') + '"'
