# Tailscale 自定义服务器配置脚本
# 此脚本用于配置 Tailscale 使用自定义服务器地址
# 请以管理员身份运行 PowerShell 后执行

param(
    [string]$ControlURL = "https://YOUR_SERVER_IP:65437"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Tailscale 自定义服务器配置脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "错误：此脚本需要管理员权限运行！" -ForegroundColor Red
    Write-Host "请右键点击 PowerShell，选择 '以管理员身份运行'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "按任意键退出"
    exit 1
}

Write-Host "1. 检查 Tailscale 服务状态..." -ForegroundColor Yellow
$service = Get-Service -Name "Tailscale" -ErrorAction SilentlyContinue
if (-not $service) {
    Write-Host "   警告：未找到 Tailscale 服务，请先安装 Tailscale" -ForegroundColor Red
    Write-Host ""
    Read-Host "按任意键退出"
    exit 1
}
Write-Host "   ✓ Tailscale 服务已安装" -ForegroundColor Green
Write-Host ""

Write-Host "2. 停止 Tailscale 服务..." -ForegroundColor Yellow
try {
    Stop-Service -Name "Tailscale" -Force -ErrorAction Stop
    Write-Host "   ✓ Tailscale 服务已停止" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 停止服务失败: $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "按任意键退出"
    exit 1
}
Write-Host ""

Write-Host "3. 配置注册表..." -ForegroundColor Yellow
try {
    $registryPath = "HKLM:\SOFTWARE\Tailscale"
    
    # 创建注册表项（如果不存在）
    if (-not (Test-Path $registryPath)) {
        New-Item -Path $registryPath -Force | Out-Null
        Write-Host "   ✓ 创建注册表项" -ForegroundColor Green
    }
    
    # 设置自定义服务器地址
    Set-ItemProperty -Path $registryPath -Name "ControlURL" -Value $ControlURL -Force
    Write-Host "   ✓ 设置自定义服务器地址: $ControlURL" -ForegroundColor Green
    
    # 验证设置
    $currentValue = Get-ItemProperty -Path $registryPath -Name "ControlURL" -ErrorAction SilentlyContinue
    if ($currentValue -and $currentValue.ControlURL -eq $ControlURL) {
        Write-Host "   ✓ 注册表配置验证成功" -ForegroundColor Green
    } else {
        Write-Host "   ✗ 注册表配置验证失败" -ForegroundColor Red
        Write-Host ""
        Read-Host "按任意键退出"
        exit 1
    }
} catch {
    Write-Host "   ✗ 配置注册表失败: $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "按任意键退出"
    exit 1
}
Write-Host ""

Write-Host "4. 启动 Tailscale 服务..." -ForegroundColor Yellow
try {
    Start-Service -Name "Tailscale" -ErrorAction Stop
    Write-Host "   ✓ Tailscale 服务已启动" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 启动服务失败: $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "按任意键退出"
    exit 1
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  配置完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步操作：" -ForegroundColor Yellow
Write-Host "1. 执行以下命令注册服务器：" -ForegroundColor White
Write-Host "   tailscale up --login-server=$ControlURL" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. 或者点击系统托盘中的 Tailscale 图标，选择 'Log in...'" -ForegroundColor White
Write-Host ""
Write-Host "3. 浏览器会自动打开登录页面，按照提示完成注册" -ForegroundColor White
Write-Host ""
Write-Host "4. 注册完成后，使用以下命令查看状态：" -ForegroundColor White
Write-Host "   tailscale status" -ForegroundColor Cyan
Write-Host ""
Write-Host "5. 获取您的 Tailscale IP 地址：" -ForegroundColor White
Write-Host "   tailscale ip -4" -ForegroundColor Cyan
Write-Host ""
Read-Host "按任意键退出"
