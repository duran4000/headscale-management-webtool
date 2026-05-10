# 开机自启动配置（SSH 隧道 + Tailscale）

本文档记录了 Windows 环境下，通过计划任务实现 SSH 隧道和 Tailscale 在**用户登录前自动连接**的配置方案。

## 背景

Headscale 控制服务器部署在阿里云（47.109.45.147），DERP 中继和 Headscale 控制面板均通过 SSH 隧道暴露到本地端口：
- 本地 443 → 远程 443（DERP 服务器）
- 本地 8443 → 远程 443（Headscale 控制面板）

Tailscale 连接 Headscale 的 ControlURL 为 `https://ohmyheadscale.duckdns.org:8443`，依赖 SSH 隧道先建好。

## 启动依赖链

```
系统启动 → 网络就绪 → SSH 隧道建立(8443) → Tailscale 连接 Headscale
```

Tailscale 必须在 SSH 隧道之后启动，否则无法连接 Headscale 控制服务器。

## 计划任务配置

### 1. SSH 隧道任务：`SSH-Tunnel-Headscale`

| 配置项 | 值 |
|---|---|
| 触发器 | 系统启动时（AtStartup / BootTrigger） |
| 运行用户 | 当前用户（duran） |
| 登录类型 | Password（存储凭据，开机无需登录） |
| 运行权限 | Limited（普通权限） |
| 脚本 | `scripts/ssh-tunnel-headscale.ps1` |

脚本功能：
- 无限循环，每 30 秒检测 443 和 8443 端口是否通
- 不通则杀旧 SSH 进程、重新建立隧道
- 内置重连机制，首次因网络未就绪失败时会自动重试

### 2. Tailscale 任务：`Tailscale-After-Tunnel`

| 配置项 | 值 |
|---|---|
| 触发器 | 系统启动时（AtStartup / BootTrigger） |
| 运行用户 | 当前用户（duran） |
| 登录类型 | Password（存储凭据，开机无需登录） |
| 运行权限 | Highest（需要启动 Tailscale 服务） |
| 脚本 | `scripts/start-tailscale-after-tunnel.ps1` |

脚本功能：
- 轮询 8443 端口（最长等待 5 分钟，每 5 秒检测一次）
- 端口通后启动 `tailscale-ipn.exe`（Tailscale GUI）
- 等待 15 秒后验证 Tailscale 是否成功连接

### 3. Tailscale Windows 服务

| 配置项 | 值 |
|---|---|
| 服务名称 | Tailscale |
| 启动类型 | **Manual**（手动） |
| 运行身份 | LocalSystem |

**必须设为 Manual**，由计划任务脚本控制启动时机。原因：
- Tailscale 服务（`tailscaled`）即使启动了也不会主动连接 Headscale
- 必须由 `tailscale-ipn.exe`（GUI）触发实际连接
- 如果服务设为 Automatic，会以 SYSTEM 身份启动 `tailscaled`，与计划任务启动的 `tailscale-ipn`（以 duran 身份运行）产生权限冲突（401 Unauthorized）

## 关键踩坑记录

### 1. `tailscaled` 服务单独启动不会连接控制服务器

即使配置了 `WantRunning: true`，`tailscaled` 服务启动后状态仍为 `NoState`，必须 `tailscale-ipn.exe` 启动后才会触发连接。因此启动脚本中需要启动的是 `tailscale-ipn.exe` 而非 `tailscaled` 服务。

### 2. LogonType 必须是 Password 才能在登录前运行

计划任务以特定用户身份在登录前运行，LogonType 必须设为 `Password`（存储了凭据）。其他类型：
- `Interactive`：需要交互式登录会话，开机时没有登录所以跑不了
- `S4U`：不需要密码，但注册时如果没有密码可能导致任务创建失败
- `ServiceAccount`：仅用于 SYSTEM 账户

### 3. 不能用 SYSTEM 运行 Tailscale 启动脚本

以 SYSTEM 身份启动 `tailscale-ipn.exe` 后，用户登录时打开 Tailscale GUI 会报 `401 Unauthorized: Tailscale already in use by NT AUTHORITY\SYSTEM`。必须以普通用户身份（duran）运行。

### 4. 开机时网络未就绪导致首次隧道失败

系统启动后 20 秒左右 SSH 隧道脚本就会尝试连接，但 Wi-Fi 可能还没完全就绪，首次验证会失败。脚本的内置重连机制（10 秒后重试）可以自动解决这个问题，不影响最终结果。

### 5. 删除了 Startup 文件夹中的 Tailscale 快捷方式

`C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\Tailscale.lnk` 已删除，避免计划任务和 Startup 快捷方式重复启动 Tailscale。

## 实际启动时间线（参考）

```
22:21:13  系统启动
22:21:20  Wi-Fi 连上
22:21:32  SSH 隧道脚本启动，首次验证失败
22:21:55  SSH 隧道重试启动
22:22:00  隧道验证成功（8443 端口通）
22:22:00  Tailscale 脚本检测到 8443 通了，启动 tailscale-ipn.exe
22:22:15  Tailscale 连接成功
22:24:xx  用户登录
```

从开机到 Tailscale 连上总共约 1 分钟，全部在用户登录前完成。

## 维护命令

```powershell
# 查看任务状态
Get-ScheduledTask -TaskName 'SSH-Tunnel-Headscale'
Get-ScheduledTask -TaskName 'Tailscale-After-Tunnel'

# 查看任务上次运行结果
Get-ScheduledTaskInfo -TaskName 'SSH-Tunnel-Headscale'
Get-ScheduledTaskInfo -TaskName 'Tailscale-After-Tunnel'

# 手动运行任务
Start-ScheduledTask -TaskName 'SSH-Tunnel-Headscale'
Start-ScheduledTask -TaskName 'Tailscale-After-Tunnel'

# 查看日志
Get-Content scripts\ssh-tunnel.log -Tail 20
Get-Content scripts\tailscale-boot.log -Tail 20

# 重新注册任务（需要管理员 PowerShell，会提示输入密码）
schtasks /Delete /TN "Tailscale-After-Tunnel" /F
schtasks /Create /TN "Tailscale-After-Tunnel" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"E:\MyCode\python\headscale-management-webtool\scripts\start-tailscale-after-tunnel.ps1`"" /SC ONSTART /RL HIGHEST /RU duran /RP 你的密码 /F
```
