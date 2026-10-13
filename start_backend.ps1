$ErrorActionPreference = "Stop"
if (!(Test-Path ".venv\Scripts\python.exe")) { throw "Create the .venv and install requirements first. See README.md." }
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
