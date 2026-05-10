# Install SSH Tunnel Scheduled Task (IPv4)
# Requires admin privileges

$TaskName = "SSH-Tunnel-Headscale-IPv4"
$ScriptPath = Join-Path $PSScriptRoot "ssh-tunnel-headscale-ipv4.ps1"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "SSH Tunnel Task Installer (IPv4)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check admin rights
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Must run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    pause
    exit 1
}

# Check if script file exists
if (-not (Test-Path $ScriptPath)) {
    Write-Host "ERROR: Script file not found: $ScriptPath" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "Script path: $ScriptPath" -ForegroundColor Green

# Remove existing task
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Removing existing task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Create task with AtLogon trigger
Write-Host "Creating scheduled task..." -ForegroundColor Yellow

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""
$trigger = New-ScheduledTaskTrigger -AtLogon
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "SSH Tunnel to Headscale Server (IPv4) for bypassing GFW" | Out-Null

Write-Host "Task created successfully!" -ForegroundColor Green

# Start task immediately
Start-ScheduledTask -TaskName $TaskName
Write-Host "Task started!" -ForegroundColor Green

Start-Sleep -Seconds 5

# Verify tunnel (IPv4)
Write-Host "Verifying tunnel connection..." -ForegroundColor Yellow
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $tcpClient.Connect("127.0.0.1", 8443)
    $tcpClient.Close()
    Write-Host "Tunnel connected! Local 127.0.0.1:8443 is ready." -ForegroundColor Green
} catch {
    Write-Host "Tunnel connection failed: $_" -ForegroundColor Yellow
    Write-Host "Check log: $PSScriptRoot\ssh-tunnel-ipv4.log" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Installation complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Common commands:" -ForegroundColor White
Write-Host "  Start:   Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host "  Stop:    Stop-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host "  Status:  Get-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host "  Log:     Get-Content '$PSScriptRoot\ssh-tunnel-ipv4.log' -Tail 50" -ForegroundColor Gray
Write-Host "  Delete:  Unregister-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Cyan
pause
