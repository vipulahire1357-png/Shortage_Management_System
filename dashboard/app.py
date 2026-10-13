"""ABB Shortage System - Streamlit dashboard."""

from __future__ import annotations

import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
SERVICES_DB = DATA_DIR / "services.db"
MAIN_SCRIPT = PROJECT_ROOT / "main.py"
TABLE_NAME = "net_shortage"

ABB_RED = "#E60000"
ABB_DARK = "#1C1C1C"
ABB_GREY = "#F2F3F4"

st.set_page_config(
    page_title="ABB | Shortage Management",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Upload labels map to canonical filenames recognised by the existing parsers.
REPORTS = {
    "MB25 — WBS Mapping": ("MB25", {".xls", ".xlsx", ".xlsm"}),
    "MB52 — Warehouse Stock": ("MB52", {".htm", ".html", ".xls", ".xlsx", ".xlsm"}),
    "ME2J — Purchase Orders": ("ME2J", {".xls", ".xlsx", ".xlsm"}),
    "PR — Purchase Requisitions": ("PR", {".xls", ".xlsx", ".xlsm", ".txt", ".tsv", ".csv"}),
    "Scope List": ("MATERIAL_SCOPE_LIST", {".xls", ".xlsx", ".xlsm"}),
    "ZPP7 — Requirements": ("ZPP7", {".xls", ".xlsx", ".xlsm", ".txt", ".csv"}),
}

DISPLAY_COLUMNS = [
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
]
REQUIRED_COLUMNS = DISPLAY_COLUMNS + ["Material Ref Code", "WBS Element"]


def apply_style() -> None:
    st.markdown(
        f"""
        <style>
        .stApp {{ background: #F7F8F9; color: {ABB_DARK}; }}
        [data-testid="stHeader"] {{ background: rgba(247,248,249,0.96); }}
        [data-testid="stSidebar"] {{ background: #202124; }}
        [data-testid="stSidebar"] * {{ color: #FFFFFF !important; }}
        .abb-banner {{
            background: linear-gradient(100deg, #E60000 0%, #B00000 100%);
            color: white; padding: 1.15rem 1.4rem; border-radius: 10px;
            margin-bottom: 1rem;
        }}
        .abb-banner h1 {{ color: white; margin: 0; font-size: 1.75rem; }}
        .abb-banner p {{ color: white; margin: .35rem 0 0 0; opacity: .94; }}
        div[data-testid="stMetric"] {{
            background: white; border: 1px solid #E3E5E8;
            padding: 1rem; border-radius: 8px;
        }}
        div.stButton > button[kind="primary"] {{
            background: {ABB_RED}; border-color: {ABB_RED}; color: white;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def banner(title: str, subtitle: str) -> None:
    st.markdown(
        f'<div class="abb-banner"><h1>{title}</h1><p>{subtitle}</p></div>',
        unsafe_allow_html=True,
    )


def canonical_filename(report_label: str, uploaded_name: str) -> str:
    stem, extensions = REPORTS[report_label]
    suffix = Path(uploaded_name).suffix.lower()
    if suffix not in extensions:
        raise ValueError(
            f"Unsupported file extension {suffix or '(none)'} for {report_label}. "
            f"Allowed: {', '.join(sorted(extensions))}"
        )
    return f"{stem}{suffix}"


def save_uploaded_report(report_label: str, uploaded_file: Any) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    filename = canonical_filename(report_label, uploaded_file.name)
    destination = RAW_DIR / filename

    # Remove prior files for this report type to avoid parser ambiguity.
    canonical_stem = REPORTS[report_label][0].casefold()
    for existing in RAW_DIR.iterdir():
        if (
            existing.is_file()
            and existing.stem.casefold() == canonical_stem
            and existing.suffix.lower() in REPORTS[report_label][1]
            and existing != destination
        ):
            existing.unlink()

    destination.write_bytes(uploaded_file.getvalue())
    return destination


def load_shortage_table() -> pd.DataFrame:
    if not SERVICES_DB.exists():
        raise FileNotFoundError(
            f"Database not found: {SERVICES_DB}. Upload reports and run processing first."
        )

    with sqlite3.connect(f"file:{SERVICES_DB.as_posix()}?mode=ro", uri=True) as conn:
        tables = {
            row[0].casefold(): row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        actual_table = tables.get(TABLE_NAME.casefold())
        if not actual_table:
            raise RuntimeError(
                f"Table '{TABLE_NAME}' was not found in {SERVICES_DB.name}. Run report processing first."
            )
        quoted = '"' + actual_table.replace('"', '""') + '"'
        frame = pd.read_sql_query(f"SELECT * FROM {quoted}", conn)

    missing = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing:
        raise RuntimeError("The shortage table is missing expected columns: " + ", ".join(missing))

    for column in ["ZPP7 Quantity", "Project Stock Quantity", "PO Quantity", "Open PO Quantity", "PR Quantity", "Net Shortage", "Free Stock"]:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)
    frame["Remarks"] = frame["Remarks"].fillna("").astype(str)
    frame["Material Ref Code"] = frame["Material Ref Code"].fillna("").astype(str)
    frame["WBS Element"] = frame["WBS Element"].fillna("").astype(str)
    return frame




def run_processing() -> tuple[int, str]:
    """Run the existing main.py pipeline without shell interpolation."""
    if not MAIN_SCRIPT.exists():
        return 1, f"Could not find project entry point: {MAIN_SCRIPT}"

    result = subprocess.run(
        [sys.executable, str(MAIN_SCRIPT), "--report", "all"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        timeout=900,
        check=False,
    )
    combined = "\n".join(part for part in [result.stdout, result.stderr] if part).strip()
    return result.returncode, combined or "Processing completed without console output."


def render_upload_page() -> None:
    banner("ABB Shortage Management", "Input page • Upload SAP reports and refresh shortage calculations")
    st.subheader("Upload Reports")
    st.write(
        "Choose the report type for each file. Uploads are saved in "
        "`data/raw/` using filenames recognised by the existing parsers."
    )

    with st.container(border=True):
        selected_report = st.selectbox("Report type", list(REPORTS.keys()))
        accepted_extensions = sorted(REPORTS[selected_report][1])
        uploaded = st.file_uploader(
            "Select report file",
            type=[ext.lstrip(".") for ext in accepted_extensions],
            key=f"upload_{selected_report}",
            help=f"Accepted file types: {', '.join(accepted_extensions)}",
        )
        if uploaded is not None:
            st.caption(f"Selected file: {uploaded.name} • {uploaded.size:,} bytes")
            if st.button("Save uploaded report", type="primary", use_container_width=True):
                try:
                    path = save_uploaded_report(selected_report, uploaded)
                    st.success(f"Saved report to `{path.relative_to(PROJECT_ROOT)}`")
                except Exception as exc:
                    st.error(str(exc))

    st.subheader("Reports currently in data/raw")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    report_files = sorted(
        [p for p in RAW_DIR.iterdir() if p.is_file() and not p.name.startswith(".")],
        key=lambda p: p.name.lower(),
    )
    if report_files:
        st.dataframe(
            pd.DataFrame(
                [{"File": p.name, "Size": f"{p.stat().st_size:,} bytes"} for p in report_files]
            ),
            hide_index=True,
            use_container_width=True,
        )
    else:
        st.info("No reports uploaded yet.")

    st.warning(
        "A complete refresh requires all six report types: MB25, MB52, ME2J, PR, "
        "Scope List, and ZPP7. Upload the intended version of each report before processing."
    )
    if st.button("Process Reports & Generate Netshortage Table", type="primary", use_container_width=True):
        with st.spinner("Running report parsers and calculating shortage table..."):
            try:
                return_code, output = run_processing()
                if output:
                    with st.expander("Processing log", expanded=(return_code != 0)):
                        st.code(output)
                if return_code == 0:
                    st.success("Reports processed and net_shortage refreshed.")
                    st.cache_data.clear()
                else:
                    st.error("Processing failed. Review the log above; the dashboard was not refreshed.")
            except subprocess.TimeoutExpired:
                st.error("Processing exceeded the 15-minute timeout.")
            except Exception as exc:
                st.error(f"Could not run processing: {exc}")


def render_shortage_page(data: pd.DataFrame) -> None:
    st.markdown("# Shortage Management")
    st.dataframe(
        data[DISPLAY_COLUMNS],
        use_container_width=True,
        hide_index=True,
        height=680,
        column_config={
            "Material Code": st.column_config.TextColumn("Material Code", width="medium"),
            "Material Description": st.column_config.TextColumn("Material Description", width="large"),
            "ZPP7 Quantity": st.column_config.NumberColumn("ZPP7 Quantity", format="%.2f"),
            "Project Stock Quantity": st.column_config.NumberColumn("Project Stock Quantity", format="%.2f"),
            "PO Quantity": st.column_config.NumberColumn("PO Quantity", format="%.2f"),
            "Open PO Quantity": st.column_config.NumberColumn("Open PO Quantity", format="%.2f"),
            "PR Quantity": st.column_config.NumberColumn("PR Quantity", format="%.2f"),
            "Net Shortage": st.column_config.NumberColumn("Net Shortage", format="%.2f"),
            "Free Stock": st.column_config.NumberColumn("Free Stock", format="%.2f"),
            "Remarks": st.column_config.TextColumn("Remarks"),
        },
    )


def main() -> None:
    apply_style()
    data = None
    page = "Shortage Management page"
    with st.sidebar:
        st.markdown("<div style='font-size:2rem;font-weight:900;letter-spacing:.08em;color:#E60000'>ABB</div>", unsafe_allow_html=True)
        st.caption("Shortage Management System")
        page = st.radio(
            "Page",
            ["Input page", "Shortage Management page"],
            index=1,
        )
        if page == "Shortage Management page":
            try:
                data = load_shortage_table()
                st.divider()
                st.markdown("### Filters")
                ref_values = sorted(v for v in data["Material Ref Code"].unique().tolist() if v)
                wbs_values = sorted(v for v in data["WBS Element"].unique().tolist() if v)
                ref_search = st.text_input("Material Ref Code — search", placeholder="Type reference code")
                selected_ref = st.selectbox("Material Ref Code", ["All", *ref_values])
                wbs_search = st.text_input("WBS Element — search", placeholder="Type WBS element")
                selected_wbs = st.selectbox("WBS Element", ["All", *wbs_values])
                if ref_search.strip():
                    data = data[data["Material Ref Code"].str.contains(ref_search.strip(), case=False, regex=False, na=False)]
                if selected_ref != "All":
                    data = data[data["Material Ref Code"] == selected_ref]
                if wbs_search.strip():
                    data = data[data["WBS Element"].str.contains(wbs_search.strip(), case=False, regex=False, na=False)]
                if selected_wbs != "All":
                    data = data[data["WBS Element"] == selected_wbs]
            except Exception as exc:
                st.warning(f"Shortage table unavailable: {exc}")
        st.divider()
        st.caption("Data source: data/services.db")

    if page == "Input page":
        render_upload_page()
    elif data is not None:
        render_shortage_page(data)
    else:
        st.markdown("# Shortage Management")
        st.info("Open **Input page**, upload all required reports, and run processing.")


if __name__ == "__main__":
    main()
