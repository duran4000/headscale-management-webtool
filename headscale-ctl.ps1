param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "start",

    [switch]$Force = $false,

    [switch]$Foreground = $false
)

$Port = 3006
$ScriptPath = "tools/rest-api-proxy-v2.cjs"
$PidFile = "tools/proxy.pid"
$LogFile = "tools/proxy.log"

function Get-ProxyProcess {
    # First try by PID file
    if (Test-Path $PidFile) {
        $pidFromFile = Get-Content $PidFile -ErrorAction SilentlyContinue
        if ($pidFromFile) {
            $proc = Get-Process -Id $pidFromFile -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -eq "node") {
                return $proc
            }
        }
    }

    # Fallback: find by port
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
                  Where-Object { $_.State -eq "Listen" } |
                  Select-Object -First 1
    if ($connection) {
        return Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    }
    return $null
}

function Stop-Proxy {
    Write-Host "Stopping proxy server..." -ForegroundColor Yellow

    $process = Get-ProxyProcess
    if ($process) {
        Write-Host "Found process: PID=$($process.Id)" -ForegroundColor Cyan
        Stop-Process -Id $process.Id -Force
        Write-Host "Proxy server stopped" -ForegroundColor Green

        if (Test-Path $PidFile) {
            Remove-Item $PidFile -Force
        }
    } else {
        Write-Host "No running proxy found" -ForegroundColor Yellow
        if (Test-Path $PidFile) {
            Remove-Item $PidFile -Force
        }
    }
}

function Start-Proxy {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  Headscale REST API Proxy Server" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""

    # Check if already running
    $existingProcess = Get-ProxyProcess
    if ($existingProcess) {
        Write-Host "Proxy is already running:" -ForegroundColor Yellow
        Write-Host "  PID: $($existingProcess.Id)" -ForegroundColor Cyan
        Write-Host "  Port: $Port" -ForegroundColor Cyan
        Write-Host ""

        if ($Force) {
            Write-Host "Using -Force, stopping old process..." -ForegroundColor Yellow
            Stop-Process -Id $existingProcess.Id -Force
            Start-Sleep -Seconds 1
        } else {
            Write-Host "Use -Force to replace, or 'restart' command" -ForegroundColor Yellow
            exit 1
        }
    }

    # Check Node.js
    try {
        $nodeVersion = node --version 2>$null
        Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
    } catch {
        Write-Host "Error: Node.js not found" -ForegroundColor Red
        exit 1
    }

    # Check config
    if (Test-Path "tools/config.json") {
        Write-Host "Config: tools/config.json" -ForegroundColor Green
    } else {
        Write-Host "Config: not found (using defaults)" -ForegroundColor Yellow
    }

    Write-Host "Port: $Port" -ForegroundColor Cyan
    Write-Host ""

    # Start process
    if ($Foreground) {
        # Foreground mode - runs in current window
        Write-Host "Starting in foreground mode..." -ForegroundColor Green
        Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
        Write-Host "============================================" -ForegroundColor Cyan
        Write-Host ""
        node $ScriptPath
    } else {
        # Background mode
        Write-Host "Starting in background..." -ForegroundColor Green

        # Start process with output redirect
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "node"
        $psi.Arguments = $ScriptPath
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true
        $psi.WorkingDirectory = $PWD

        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $psi
        $process.Start() | Out-Null

        # Save PID
        $process.Id | Out-File -FilePath $PidFile -Force

        # Wait a moment and verify
        Start-Sleep -Milliseconds 500

        if (Get-Process -Id $process.Id -ErrorAction SilentlyContinue) {
            Write-Host "Proxy started successfully" -ForegroundColor Green
            Write-Host "  PID: $($process.Id)" -ForegroundColor Cyan
            Write-Host "  Port: $Port" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Commands:" -ForegroundColor Yellow
            Write-Host "  .\headscale-ctl.ps1 status  - Check status"
            Write-Host "  .\headscale-ctl.ps1 stop     - Stop server"
            Write-Host "  .\headscale-ctl.ps1 restart  - Restart server"
        } else {
            Write-Host "Failed to start proxy" -ForegroundColor Red
            exit 1
        }
    }

    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
}

function Get-ProxyStatus {
    Write-Host ""
    Write-Host "Headscale Proxy Status" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan

    $process = Get-ProxyProcess
    if ($process) {
        Write-Host "Status: " -NoNewline
        Write-Host "RUNNING" -ForegroundColor Green
        Write-Host "PID:    $($process.Id)"
        Write-Host "Port:   $Port"

        # Test health
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 2
            Write-Host "Health: OK ($($health.timestamp))"
        } catch {
            Write-Host "Health: " -NoNewline
            Write-Host "NO RESPONSE" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Status: " -NoNewline
        Write-Host "STOPPED" -ForegroundColor Red
        Write-Host "Port:   $Port (available)"
    }
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
}

# Main
switch ($Action) {
    "start"    { Start-Proxy }
    "stop"     { Stop-Proxy }
    "restart"  { Stop-Proxy; Start-Sleep -Seconds 1; Start-Proxy }
    "status"   { Get-ProxyStatus }
}
