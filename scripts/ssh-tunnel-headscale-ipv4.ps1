# SSH Tunnel Auto-Reconnect Script (IPv4 Version)
$RemoteHost = "root@47.109.45.147"
$SshKeyPath = "$env:USERPROFILE\.ssh\id_ed25519"

# Port forwarding config (443 and 8443)
# 443 -> DERP server
# 8443 -> Headscale control plane
$PortForwards = @(
    @{Local=443; Remote=443},
    @{Local=8443; Remote=443}
)

$LogFile = Join-Path $PSScriptRoot "ssh-tunnel-ipv4.log"
$TailscaleIPN = Join-Path "C:\Program Files\Tailscale" "tailscale-ipn.exe"

function Write-Log {
    param([string]$Message)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "[$Timestamp] $Message"
    Write-Output $LogMessage
    Add-Content -Path $LogFile -Value $LogMessage
}

function Test-SSH-Tunnel {
    # Check if SSH process is running
    $sshCount = (Get-Process ssh -ErrorAction SilentlyContinue).Count
    if ($sshCount -gt 0) {
        return $true
    }
    return $false
}

Write-Log "SSH tunnel IPv4 script started"

while ($true) {
    # Check if SSH tunnel is running
    if (-not (Test-SSH-Tunnel)) {
        Write-Log "Tunnel not running, starting..."

        # Start SSH tunnel
        $sshArgs = @("-N")
        foreach ($pf in $PortForwards) {
            $sshArgs += "-L"
            $sshArgs += "$($pf.Local):localhost:$($pf.Remote)"
        }
        $sshArgs += @("-i", $SshKeyPath, $RemoteHost)

        Start-Process -FilePath "ssh" -ArgumentList $sshArgs -WindowStyle Hidden
        Write-Log "SSH tunnel started"

        Start-Sleep -Seconds 5

        # Start tailscale-ipn if not running
        $ipn = Get-Process tailscale-ipn -ErrorAction SilentlyContinue
        if (-not $ipn) {
            Write-Log "Starting tailscale-ipn.exe..."
            Start-Process -FilePath $TailscaleIPN -WindowStyle Hidden
            Write-Log "tailscale-ipn.exe started"
        }
    }

    # Check every 30 seconds
    Start-Sleep -Seconds 30

    # Check tailscale-ipn
    $ipn = Get-Process tailscale-ipn -ErrorAction SilentlyContinue
    if (-not $ipn) {
        Write-Log "tailscale-ipn not running, restarting..."
        Start-Process -FilePath $TailscaleIPN -WindowStyle Hidden
    }
}
