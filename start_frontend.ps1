$ErrorActionPreference = "Stop"
if (!(Test-Path "frontend\node_modules")) { Push-Location frontend; npm install; Pop-Location }
Push-Location frontend; npm run dev; Pop-Location
