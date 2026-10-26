param(
    [switch]$DevelopmentMode,
    [switch]$Background,
    [switch]$NoBrowser,
    [string]$PythonPath,
    [int]$PreferredPort = 8000
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stateDirectory = Join-Path $root '.runtime'
$stateFile = Join-Path $stateDirectory 'backend-state.json'
$stopFile = Join-Path $stateDirectory 'backend-stop.request'
$logDirectory = Join-Path $root 'logs'
$logOut = Join-Path $logDirectory 'backend.log'
$logErr = Join-Path $logDirectory 'backend-error.log'

if (-not (Test-Path (Join-Path $root 'backend\app\main.py')) -or -not (Test-Path (Join-Path $root 'backend\launcher.py'))) {
    throw "This project folder is missing the backend application or dynamic port launcher: $root"
}
if (-not $DevelopmentMode -and -not (Test-Path (Join-Path $root 'frontend\dist\index.html'))) {
    throw 'The built frontend is missing. Build frontend/dist before launching this project.'
}

$pythonCandidates = if ($PythonPath) {
    @($PythonPath)
} else {
    @(
        (Join-Path $root 'runtime\python.exe'),
        (Join-Path $root '.venv\Scripts\python.exe'),
        (Join-Path $root 'portable_windows\ABB_Shortage_System\runtime\python.exe')
    ) | Select-Object -Unique
}
$python = $null
foreach ($candidate in $pythonCandidates) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    & $candidate -c 'import uvicorn, fastapi, pandas, openpyxl, multipart, pyxlsb, xlrd, lxml' *> $null
    if ($LASTEXITCODE -eq 0) { $python = $candidate; break }
}
if (-not $python) {
    throw 'No runnable Python environment with the application dependencies was found. Install the requirements in this project .venv or restore its bundled runtime.'
}

function Get-LiveProjectState {
    if (-not (Test-Path -LiteralPath $stateFile)) { return $null }
    try {
        $candidateState = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
        $process = Get-Process -Id ([int]$candidateState.pid) -ErrorAction Stop
        $expectedRoot = [IO.Path]::GetFullPath($root).TrimEnd([char]'\')
        if ([IO.Path]::GetFullPath([string]$candidateState.project_root).TrimEnd([char]'\') -ine $expectedRoot) { return $null }
        $health = Invoke-RestMethod -Uri "$($candidateState.url)/api/health" -TimeoutSec 2
        if ([IO.Path]::GetFullPath([string]$health.project_root).TrimEnd([char]'\') -ine $expectedRoot) { return $null }
        return $candidateState
    }
    catch { return $null }
}

function Stop-OwnedProjectBackend([int]$ProcessId, $State) {
    if (-not $State -or [int]$State.pid -ne $ProcessId) { return }
    try {
        Set-Content -LiteralPath ([string]$State.stop_file) -Value 'stop' -Encoding ascii
        $deadline = (Get-Date).AddSeconds(12)
        do {
            Start-Sleep -Milliseconds 250
            $stillRunning = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        } while ($stillRunning -and (Get-Date) -lt $deadline)
        if ($stillRunning) { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue }
    }
    catch { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue }
}

New-Item -ItemType Directory -Force -Path $stateDirectory, $logDirectory | Out-Null
$existing = Get-LiveProjectState
if ($existing) {
    Write-Host "This project is already running at $($existing.url)"
    if (-not $NoBrowser -and -not $Background) { Start-Process ([string]$existing.url) }
    return
}

$arguments = @('-m', 'backend.launcher', '--state-file', "`"$stateFile`"", '--preferred-port', "$PreferredPort")
if ($DevelopmentMode) { $arguments += '--reload' }
$process = Start-Process -FilePath $python `
    -ArgumentList $arguments `
    -WorkingDirectory $root `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logOut `
    -RedirectStandardError $logErr

$state = $null
$ownsProcess = $false
$deadline = (Get-Date).AddSeconds(45)
try {
    do {
        Start-Sleep -Milliseconds 300
        $state = Get-LiveProjectState
        if ($state) {
            $ownsProcess = ([int]$state.pid -eq $process.Id)
            break
        }
        if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) { break }
    } while ((Get-Date) -lt $deadline)

    if (-not $state) {
        $details = if (Test-Path $logErr) { Get-Content -LiteralPath $logErr -Tail 30 | Out-String } else { 'No backend log was written.' }
        throw "This project's backend did not become ready. $details"
    }

    $url = [string]$state.url
    if (-not $Background -and -not $NoBrowser) { Start-Process $url }
    Write-Host "This project is running at $url"

    if ($Background) { $ownsProcess = $false; return }
    if (-not $ownsProcess) { return }
    Read-Host 'Press Enter to stop this project'
}
finally {
    if ($ownsProcess) { Stop-OwnedProjectBackend -ProcessId $process.Id -State $state }
}
