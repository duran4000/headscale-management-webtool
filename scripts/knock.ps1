param(
    [Parameter(Mandatory=$true)]
    [string]$Target,

    [int[]]$Ports = @(1234, 4567, 7890),

    [int]$DelayMs = 500
)

foreach ($port in $Ports) {
    $udp = [Net.Sockets.UdpClient]::new()
    $udp.Connect($Target, $port)
    $udp.Send(@(0), 1) | Out-Null
    $udp.Close()
    Write-Host "Knocked UDP ${Target}:$port"
    Start-Sleep -Milliseconds $DelayMs
}

Write-Host "`nDone."
