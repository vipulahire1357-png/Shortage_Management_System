ABB Shortage System
A modular Python application for processing ABB/SAP reports,
consolidating material requirements, stock, purchase orders and purchase
requisitions, and generating a net-shortage table for dashboard
reporting.
The application uses SQLite for local data storage and a Streamlit
dashboard for report upload and shortage-table review. It is designed to
keep source report databases separate from calculated output.
Data safety: Run the application against a backup first when
working with production reports or databases. The shortage service is
intended to refresh only netshortage_table in data/services.db;
source tables in global.db and zpp7_breakdown.db should remain
unchanged.

Contents
- Features
- Project structure
- Requirements
- Setup on Windows
- Configuration and file
  locations
- Input reports
- Run the application
- Shortage calculation rules
- Database design
- Netshortage output schema
- Dashboard guide
- Testing and verification
- Troubleshooting
- Git and data handling
- Known implementation notes
Features
- Separate parser modules for each report type.
- Central parser registry and command-line entry point.
- SQLite databases for source data and calculated output.
- ZPP7 requirement extraction into material-reference tables.
- Quantity aggregation before joins to reduce duplicate-row
  multiplication.
- Net-shortage calculation based on stock and purchase-order
  quantities.
- Purchase requisition quantity display and a separate "Still to be
  ordered" calculation.
- Streamlit dashboard with report upload and processing controls.
- Filters for Material Ref Code, WBS Element and Material Code.
- Positive/negative/zero filters for Net Shortage and Still to be
  ordered.
- Read-only output columns, with editable Remarks.
- CSV export of the currently visible table.
Project structure
The expected structure is:
ABB_Shortage_System_0.3/
├── main.py
├── requirements.txt
├── parsers/
│   ├── __init__.py
│   ├── mb25_parser.py
│   ├── mb52_parser.py
│   ├── me2j_parser.py
│   ├── pr_parser.py
│   ├── scopelist_parser.py
│   └── zpp7_parser.py
├── database/
│   └── db.py
├── services/
│   └── shortage_service.py
├── dashboard/
│   └── app.py
├── data/
│   ├── raw/
│   ├── processed/
│   ├── global.db
│   ├── zpp7_breakdown.db
│   └── services.db
├── tests/
├── logs/
└── README.md
Some folders and files may be absent in a local checkout until they are
created. Do not replace existing parser implementations with placeholder
versions just to match this tree.
Main modules
  Path                                Responsibility
  main.py                           CLI orchestration: runs selected
                                      parsers and, for a successful full
                                      run, calls the shortage service.
  parsers/__init__.py               Registers parser names and provides
                                      available_parsers(),
                                      run_parser() and
                                      run_all_parsers().
  parsers/mb25_parser.py            Parses MB25 WBS/material-reference
                                      mapping data.
  parsers/mb52_parser.py            Parses MB52 stock data.
  parsers/me2j_parser.py            Parses ME2J purchase-order data.
  parsers/pr_parser.py              Parses PR purchase-requisition
                                      data.
  parsers/scopelist_parser.py       Parses the material scope list.
  parsers/zpp7_parser.py            Parses ZPP7 requirements into
                                      material-reference tables.
  services/shortage_service.py      Reads parsed data, calculates and
                                      refreshes netshortage_table.
  dashboard/app.py                  Streamlit interface for uploading
                                      reports and reviewing the
                                      calculated table.
  database/db.py                    Shared SQLite connection helper, if
                                  used by the current implementation.
Requirements
- Windows with PowerShell.
- Python version compatible with the project's parser dependencies.
- The report files required by the parsers.
- SQLite (included with standard Python builds).
- Python packages used by the project.
The dashboard requires at least streamlit and pandas. Some report
parsers may also require Excel/HTML-reading libraries such as
openpyxl, xlrd or lxml. The exact dependencies depend on the
parser implementations and file formats.
Keep requirements.txt aligned with the imports in the actual project.
A typical starting set may look like:
pandas
streamlit
openpyxl
xlrd
lxml
pytest
This list is a starting point, not a guarantee that every parser is
covered. Do not install every package blindly if the project has a
reviewed, pinned requirements file.
Setup on Windows
Open PowerShell in the project root.
1. Create and activate the virtual environment
py -m venv .venv
.\.venv\Scripts\Activate.ps1
If PowerShell blocks activation due to the execution policy, use the
approved execution-policy procedure for your machine, or invoke the
environment's Python directly:
.\.venv\Scripts\python.exe -m pip --version
2. Upgrade pip and install dependencies
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
If requirements.txt does not yet include Streamlit, install it in the
activated environment and add it to the file:
python -m pip install streamlit pandas
Verify that Python points to the project's virtual environment:
python -c "import sys; print(sys.executable)"
python -m pip --version
Both paths should refer to the .venv directory in this project.
3. Verify the command-line interface
python main.py --help
The help output should list the report choices registered in
parsers/__init__.py.
Configuration and file locations
Paths below are the expected project-relative locations. Check the
current parser source before moving or renaming input files, because
parser implementations may use their own specific paths or filenames.
  Path                                Purpose
  data/raw/                         Local source reports uploaded
                                      through the dashboard or copied
                                      manually.
  data/processed/                   Optional intermediate outputs.
  data/global.db                    Parsed shared report data such as
                                      WBS mapping, stock, orders, PR and
                                      scope.
  data/zpp7_breakdown.db            ZPP7 requirement tables, generally
                                      one table per Material Ref Code,
                                      plus parser metadata.
  data/services.db                  Derived service output, including
                                      netshortage_table.
  logs/                             Optional local log files.
The databases are local runtime data and should not be committed to Git.
Keep a backup before replacing report data or running a new parser
version.
Input reports
The parser registry currently includes the following report types:
  CLI name          Report            Purpose           Expected parsed
                                                        destination
  mb25            MB25              Maps Material Ref global.db →
                                      Code to WBS       wbs_element
                                      Element and
                                      reference
                                      description.      
  mb52            MB52              Supplies          global.db →
                                      unrestricted      Storage
                                      stock by WBS
                                      Element and
                                      Material Code.    
  me2j            ME2J              Supplies          global.db → ME2J
                                      purchase-order
                                      quantities.       
  pr              PR                Supplies purchase global.db → PR
                                      requisition
                                      quantity.         
  scopelist       Scope List        Identifies the    global.db →
                                      material scope.   scopelist
                                      Only ABB is
                                      included in
                                      shortage output.  
  zpp7            ZPP7              Supplies required zpp7_breakdown.db →
                                      quantities by     material-reference
                                      material          tables
                                  reference.        
Input-file handling
1. Obtain the current export for each report.
2. Place each file in data/raw/ or upload it from the dashboard.
3. Confirm that the selected report type matches the uploaded file.
4. Use the file formats supported by the specific parser.
5. Run the full pipeline only after all required reports are present
   and correspond to the same intended reporting period.
The dashboard saves uploaded reports using canonical report stems.
Review the parser's expected filenames and extensions before using
uploads in a production run. If your parser expects a different name,
update the upload mapping or parser path deliberately rather than
keeping multiple ambiguous copies of the same report.
Run the application
Run commands from the project root with the virtual environment
activated.
Run one parser
python main.py --report mb25
python main.py --report mb52
python main.py --report me2j
python main.py --report pr
python main.py --report scopelist
python main.py --report zpp7
Running one parser updates that report's parsed data only. The main
entry point does not regenerate the full shortage table after a
single-parser run, because other source tables may be stale.
Run all parsers and generate the shortage table
python main.py --report all
all is the default, so this is also valid:
python main.py
The normal sequence is:
1. Run every registered parser.
2. Record any parser failures.
3. Stop with a non-zero exit code if any parser fails.
4. If all parsers succeed, run the shortage service.
5. Refresh netshortage_table in data/services.db.
A parser returning None or 0 is treated as successful; a non-zero
integer return value is treated as failure.
Run parsers without shortage generation
python main.py --report all --skip-shortage
This is useful when validating parser output before regenerating the
derived table.
Run the shortage service directly
If all source databases have already been parsed and checked:
python services/shortage_service.py
Running the service directly skips parser execution. Do this only when
the source tables are current and internally consistent.
Shortage calculation rules
The shortage service applies the following rules.
1. Keep ZPP7 rows with a valid Material Ref Code.
2. Map Material Ref Code to WBS Element using global.db →
   wbs_element.
3. Match the Material Code to the Scope List and retain only records
   with Scope = ABB.
4. Join stock and purchase-order quantities using the composite key
   (WBS Element, Material Code).
5. Aggregate source quantity rows before joining them to ZPP7 data,
   preventing duplicated source rows from multiplying totals.
6. Treat missing quantities as zero for calculations while keeping each
   quantity field in the output.
7. Refresh only netshortage_table in services.db; do not modify
   source database tables.
Formulas
Net Shortage
Net Shortage = Order Quantity - Unrestricted Quantity
Still to be ordered
Still to be ordered = PR Quantity - Order Quantity
The second formula is kept exactly as specified for this project. It can
produce a negative result when Order Quantity exceeds PR Quantity.
Remarks
Remarks are generated from Net Shortage during a shortage-table refresh:
  Net Shortage Default Remarks
Greater than 0 `Shortage`
   Less than 0 `Surplus`
    Equal to 0 `Balanced`
The dashboard allows Remarks to be edited and saved. A subsequent full
shortage-table refresh may regenerate Remarks according to the rules
above, depending on the current service implementation. Export or
preserve manually reviewed remarks before a refresh if they must be
retained.
Database design
global.db
This database contains parsed report tables. The shortage service
expects these logical tables and fields:
  Table           Join key                      Fields used
  wbs_element   Material Ref Code             WBS Element
  scopelist     Material Code                 Scope
  Storage       WBS Element + Material Code   Unrestricted
  ME2J          WBS Element + Material Code   Order Quantity, Open Quantity
  PR            WBS Element + Material Code   PR Quantity
The exact column names, including spaces and capitalization, must match
the schema produced by the parsers and consumed by the service.
zpp7_breakdown.db
ZPP7 requirements are stored in material-reference tables. Each material
table is expected to expose:
- Material Ref Code
- Material Code
- Material Description
- Req
A parser_metadata table may also be present and is not treated as a
material requirement table.
services.db
The shortage service writes the derived netshortage_table. It should
not alter source tables in global.db or zpp7_breakdown.db.
Join and aggregation safeguards
- Material Ref Code is used to map ZPP7 records to WBS Element.
- WBS Element plus Material Code is used for stock and purchasing
  quantities.
- Stock, ME2J and PR records are aggregated before joining to the ZPP7
  requirement rows.
- This avoids a one-to-many join from multiplying quantities when
  multiple stock or purchasing rows exist for the same key.
- Only records in ABB scope are retained.
Do not run manual schema resets, drop source tables, or delete working
databases as a troubleshooting shortcut.
Netshortage output schema
The expected netshortage_table output order is:
                        \# Column                    Meaning
                         1 `Material Ref Code`       ZPP7 material
                                                     reference used to map
                                                     to WBS.

                         2 `WBS Element`             WBS associated with
                                                     the material
                                                     reference.

                         3 `Scope`                   Scope-list
                                                     classification; only
                                                     `ABB` rows are
                                                     retained.

                         4 `Material Code`           Material identifier
                                                     used for stock and
                                                     purchasing joins.

                         5 `Material Description`    Description from ZPP7
                                                     requirement data.

                         6 `Req Quantity`            Aggregated ZPP7
                                                     required quantity.

                         7 `Unrestricted Quantity`   Aggregated
                                                     unrestricted stock
                                                     quantity.

                         8 `Order Quantity`          Aggregated ME2J order
                                                     quantity.

                         9 `Open Quantity`           Aggregated ME2J open
                                                     quantity.

                        10 `PR Quantity`             Aggregated purchase
                                                     requisition quantity.

                        11 `Net Shortage`            Order Quantity minus
                                                     Unrestricted
                                                     Quantity.

                        12 `Still to be ordered`     PR Quantity minus
                                                     Order Quantity.

                        13 `Remarks`                 Shortage status;
                                                     editable from the
                                                     dashboard.
Missing quantity values are treated as zero for calculations. The
individual quantity columns remain visible so that users can review the
contributing values.
Dashboard guide
The dashboard is implemented with Streamlit in dashboard/app.py.
Start the dashboard
python -m streamlit run dashboard/app.py
Open the local URL printed in the terminal, commonly
http://localhost:8501.
If Streamlit is missing from the active environment:
python -m pip install streamlit pandas
Add the installed dependencies to requirements.txt so the project can
be set up consistently on another machine.
Input Page
The Input Page is used to:
- Select a report type.
- Upload a report file.
- Save it into data/raw/ using a canonical report filename.
- View files currently present in data/raw/.
- Run all report parsers and regenerate the shortage table.
- Inspect the processing log if a run fails.
A full refresh requires all six report types: MB25, MB52, ME2J, PR,
Scope List and ZPP7. Ensure they represent the intended reporting period
before processing.
Netshortage Dashboard
The dashboard reads netshortage_table from data/services.db and
provides:
- A complete output table.
- Dropdown/multiselect filters for Material Ref Code and WBS Element.
- A Material Code combobox and case-insensitive text search.
- Net Shortage filters: Positive, Negative, Zero or All.
- Still to be ordered filters: Positive, Negative, Zero or
  All.
- Summary counts for rows and positive/negative/zero Net Shortage.
- CSV export of the visible filtered rows.
Editing Remarks
All displayed fields except Remarks are configured as read-only. To
update remarks:
1. Apply any required filters.
2. Edit the Remarks cell for the visible row.
3. Click Save Remarks.
4. Confirm the success message.
The dashboard writes only the Remarks field in services.db. The
current save implementation identifies rows using
(Material Ref Code, WBS Element, Material Code). If this key
combination is not unique in the table, saving is blocked to avoid an
ambiguous update.
The dashboard is intended for local internal use. Authentication,
role-based access, concurrent-user coordination and production
deployment controls are not described by this starter README and should
be designed before exposing it beyond a trusted environment.
Testing and verification
Run tests from the project root:
python -m pip install pytest
python -m pytest
If no tests have been added yet, pytest may report that no tests were
collected. Add tests for parser input variations, joins, aggregation,
formula boundaries and output refresh behaviour.
Recommended validation checklist:
- [ ] Each parser can find its input file and complete independently.
- [ ] MB25 creates the expected Material Ref Code-to-WBS mapping.
- [ ] Scope List values are normalized as expected and only ABB is
  retained.
- [ ] Multiple Storage rows for one WBS/material key aggregate
  correctly.
- [ ] Multiple ME2J rows for one WBS/material key aggregate correctly.
- [ ] Multiple PR rows for one WBS/material key aggregate correctly.
- [ ] ZPP7 rows without a valid material reference or WBS mapping are
  excluded.
- [ ] Non-ABB rows are excluded.
- [ ] Missing quantities are treated as zero.
- [ ] Net Shortage equals Order Quantity minus Unrestricted Quantity.
- [ ] Still to be ordered equals PR Quantity minus Order Quantity.
- [ ] Remarks map positive, negative and zero Net Shortage correctly.
- [ ] Refreshing netshortage_table preserves unrelated tables in
  services.db.
- [ ] Source tables in global.db and zpp7_breakdown.db are
  unchanged.
- [ ] Dashboard filters return expected rows.
- [ ] Editing Remarks does not alter any other output column.
Use a copy of the databases for testing refresh and migration behaviour.
Troubleshooting
No module named streamlit
Install Streamlit in the active project environment:
python -m pip install streamlit
python -m streamlit --version
Confirm that python points to .venv\Scripts\python.exe.
Parser reports that an input file is missing
- Check the expected filename and extension in the parser source.
- Check that the file is in the directory the parser reads.
- Check for duplicate exports with different extensions.
- Ensure the dashboard upload mapping uses the filename the parser
  expects.
lxml or Excel-engine import errors
Install the dependency required by the report format, for example:
python -m pip install lxml openpyxl xlrd
Then update requirements.txt with the dependencies actually used.
Shortage table not generated
- Check the logs for any failed parser.
- Confirm all six reports were parsed successfully.
- Confirm global.db and zpp7_breakdown.db exist at the expected
  paths.
- Confirm the expected source tables and columns exist.
- Run the shortage service directly only after validating the source
  databases.
The CLI deliberately skips shortage generation when any parser in a full
run fails.
Dashboard says netshortage_table is missing
Run a successful full processing pass:
python main.py --report all
Then reload the dashboard. If the error remains, verify that the
dashboard and shortage service point to the same project directory and
data/services.db.
Quantities appear unexpectedly high
Check whether source rows are duplicated and whether aggregation happens
before joins. Verify that stock and purchasing quantities use both WBS
Element and Material Code, rather than Material Code alone.
Remarks changes do not persist
- Click Save Remarks after editing.
- Check that services.db is writable.
- Check whether the row key
  (Material Ref Code, WBS Element, Material Code) is unique.
- Remember that a later shortage refresh may recalculate default
  remarks.
Git and data handling
Keep source reports, local databases, virtual environments and generated
cache files out of Git. A typical .gitignore should cover at least:
.venv/
__pycache__/
*.py[cod]
.pytest_cache/
.streamlit/secrets.toml

data/raw/*
data/processed/*
data/*.db
data/*.sqlite
data/*.sqlite3

logs/*
If a folder must remain visible in Git, add a .gitkeep or a
README.md within it. Do not ignore the main project README.md,
source code, tests or requirements.txt.
Before committing, check:
git status
git diff --check
Do not commit sensitive business data or actual SAP exports.
Known implementation notes
- Parser input filenames and column names are implementation-specific;
  confirm them in the current parser code.
- requirements.txt must reflect the imports used by the actual
  parser implementations and dashboard.
- The dashboard's report upload map must remain consistent with parser
  filename conventions.
- The Still to be ordered calculation is intentionally
  PR Quantity - Order Quantity, as specified for this project.
- Remarks are generated by the shortage service from Net Shortage and
  can be manually edited in the dashboard. A later refresh may replace
  manual values.
- This README describes the intended workflow and current interface
  contract. Validate against actual SAP exports and working databases
  before using the output for operational decisions.