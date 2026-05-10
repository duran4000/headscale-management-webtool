try {
    $s = New-Object System.Net.Sockets.Socket(
        [System.Net.Sockets.AddressFamily]::InternetworkV6,
        [System.Net.Sockets.SocketType]::Stream,
        [System.Net.Sockets.ProtocolType]::Tcp
    )
    $s.Bind([System.Net.IPEndPoint]::new([System.Net.IPAddress]::IPv6Loopback, 443))
    $s.Listen(1)
    Write-Host "Listening on [::1]:443"
    Write-Host "Press Ctrl+C to stop"
    while ($true) {
        Start-Sleep -Seconds 60
    }
} catch {
    Write-Host $_.Exception.Message
} finally {
    if ($s) { $s.Close() }
}
