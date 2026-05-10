# Headscale 自建 DERP 操作手册

> 适用场景：国内网络环境，自建 Headscale 服务器和 DERP 中继

## 架构概述

```
┌─────────────────────────────────────────────────────────────────┐
│                        客户端 (Windows/手机)                      │
│                                                                 │
│  国内客户端 ──SSH Tunnel──▶ Headscale 服务器                      │
│            （绕过 GFW）                                          │
│                                                                 │
│  或（非 GFW 环境）                                               │
│                                                                 │
│  客户端 ─────────────────▶ Headscale 服务器                       │
│            （直连）                                              │
└─────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    服务器 (47.109.45.147)                         │
│                                                                 │
│  Caddy (443) → Headscale 容器 (443) + STUN (3478/UDP)           │
│       │              │              │                            │
│   Let's Encrypt   自签名证书     NAT 穿透                        │
└─────────────────────────────────────────────────────────────────┘
```

### 组件说明

| 组件 | 作用 | 端口 |
|------|------|------|
| Caddy 反向代理 | 提供 HTTPS 证书、反向代理 | 80, 443 |
| Headscale 服务器 | 控制平面、设备管理 | 443 (容器内) |
| DERP 服务器 | 中继连接、NAT 穿透 | 443 (WebSocket) |
| STUN 服务 | NAT 穿透、端点发现 | 3478/UDP |

---

## 一、服务器端部署

### 1.1 创建目录结构

```bash
ssh root@YOUR_SERVER_IP

# 创建目录
mkdir -p /etc/headscale /var/lib/headscale /opt/headscale /opt/caddy
```

### 1.2 生成证书和密钥

```bash
# 生成自签名证书（Headscale 内部使用）
cd /etc/headscale
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=Headscale/CN=headscale"

chmod 600 key.pem
chmod 644 cert.pem

# 生成 Noise 私钥（必需）
docker run --rm headscale/headscale:latest headscale generate private-key > /etc/headscale/private.key
chmod 600 /etc/headscale/private.key
```

### 1.3 Docker Compose 配置

创建 `/opt/headscale/docker-compose.yml`：

```yaml
services:
  headscale:
    image: headscale/headscale:latest
    container_name: headscale
    restart: unless-stopped
    command: serve
    read_only: true
    tmpfs:
      - /var/run/headscale
    ports:
      - "127.0.0.1:65437:443"      # ⚠️ 仅本地，由 Caddy 代理
      - "3478:3478/udp"            # STUN 必须暴露到公网
      - "3478:3478/tcp"
    volumes:
      - /etc/headscale:/etc/headscale:ro
      - /var/lib/headscale:/var/lib/headscale
    environment:
      - TZ=Asia/Shanghai
    healthcheck:
      test: ["CMD", "headscale", "health"]
```

> ⚠️ **关键**：`127.0.0.1:65437:443` 不是 `443:443`，因为 Caddy 占用宿主机 443 端口。

### 1.4 DERP Map 配置

创建 `/etc/headscale/derp-map.yaml`：

```yaml
regions:
  900:
    regionid: 900
    regioncode: myderp
    regionname: My DERP Server
    nodes:
      - name: 900a
        regionid: 900
        hostname: ohmyheadscale.duckdns.org
        stuntestip: 47.109.45.147        # ⚠️ 服务器公网 IP
        stunport: 3478
        derpport: 443
```

> ⚠️ **关键**：`stuntestip` 必须配置，STUN 在容器内不知道宿主机公网 IP。

### 1.5 Headscale 配置文件

创建 `/etc/headscale/config.yaml`：

```yaml
server_url: https://ohmyheadscale.duckdns.org
listen_addr: 0.0.0.0:443

tls_cert_path: /etc/headscale/cert.pem
tls_key_path: /etc/headscale/key.pem

noise:
  private_key_path: /etc/headscale/private.key
  verify_cert_names: []

disable_check_updates: true

log:
  format: text
  level: info

database:
  type: sqlite3
  sqlite:
    path: /var/lib/headscale/db.sqlite

prefixes:
  v4: 100.64.0.0/10
  v6: fd7a:115c:a1e0::/48
  allocation: sequential

dns:
  override_local_dns: false
  base_domain: headscale.internal
  nameservers:
    - 1.1.1.1

derp:
  server:
    enabled: true
    region_id: 900
    region_code: myderp
    region_name: "My DERP Server"
    stun_listen_addr: "[::]:3478"
    private_key_path: /var/lib/headscale/derp_server_private.key
    automatically_add_embedded_derp_region: false  # 2026-03-23: 改为 false 以保留 stuntestip（待验证）
  urls:
    - https://controlplane.tailscale.com/derpmap/default  # 方案B：启用官方 DERP
  # urls: []                        # 方案A：禁用官方 DERP（取消注释此行）
  paths:
    - /etc/headscale/derp-map.yaml
  auto_update_enabled: true         # 方案B
  # auto_update_enabled: false      # 方案A（取消注释此行）
```

### 1.6 DERP 方案对比

| 项目 | 方案 A（纯自建） | 方案 B（官方+自建） |
|------|-----------------|-------------------|
| `urls` | `[]` | 官方 DERP URL |
| `auto_update_enabled` | `false` | `true` |
| 实测效果 | 基准 | **手机直连改善 80ms→16ms** |
| 推荐场景 | 网络隔离环境 | **通用场景（推荐）** |

> ⚠️ **2026-03-23 实验性修改（待验证）**：
>
> 将 `automatically_add_embedded_derp_region: true` 改为 `false`，确保 `paths` 加载的 derp-map.yaml 中的 `stuntestip` 生效。
>
> - **现象**：`automatically_add_embedded_derp_region: true` 时，自动生成的 DERP 节点没有 STUNTestIP，导致 SSH Tunnel 环境下无法测量 myderp 延迟
> - **修改后**：DERP Map 中 myderp 节点包含 `STUNTestIP: "47.109.45.147"`，延迟测量正常
> - **状态**：✅ 当前有效，但需长期观察验证
> - **回滚**：`cp /etc/headscale/config.yaml.bak.20260323_221713 /etc/headscale/config.yaml && docker restart headscale`

> ⚠️ **实验结论**：之前认为"官方 DERP + 自建 DERP 会导致端点传播冲突"，但 **实测证明方案 B 效果更好**。

> 🔒 **重要原则**：**方案 B 是当前验证可用的方案，生产环境禁止随意修改 DERP 配置**。如需调整，必须先在测试环境验证。

### 1.7 启动 Headscale

```bash
cd /opt/headscale
docker compose up -d

# 验证
curl -k https://127.0.0.1:65437/health
# 预期: {"status":"pass"}
```

---

## 二、配置 Caddy 反向代理

### 2.1 为什么需要 Caddy？

| 场景 | 需要域名 + Caddy |
|-----|-----------------|
| Windows/Linux 桌面端 | ❌ 可以用 IP + 自签名证书 |
| **Android/iOS 手机端** | ✅ **必须**（只信任 CA 证书） |

### 2.2 注册免费域名（DuckDNS）

1. 访问 https://www.duckdns.org/
2. 使用 GitHub/Google 账号登录
3. 创建子域名（如 `ohmyheadscale`）
4. 填入服务器 IP，点击 "add domain"

### 2.3 Caddy 配置

创建 `/etc/caddy/Caddyfile`：

```caddy
{
    admin off
}

ohmyheadscale.duckdns.org {
    reverse_proxy https://127.0.0.1:65437 {
        transport http {
            tls_insecure_skip_verify
            read_timeout 0          # ⚠️ 必须：DERP WebSocket 长连接
            write_timeout 0         # ⚠️ 必须：DERP WebSocket 长连接
            dial_timeout 10s
        }
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

### 2.4 Caddy Docker Compose

创建 `/opt/caddy/docker-compose.yml`：

```yaml
services:
  caddy:
    image: caddy:latest
    container_name: caddy
    restart: unless-stopped
    network_mode: host
    volumes:
      - /etc/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./data:/data
```

### 2.5 启动 Caddy

```bash
cd /opt/caddy
docker compose up -d

# 验证证书
docker logs -f caddy
# 成功: "certificate obtained successfully"

# 验证 HTTPS
curl https://ohmyheadscale.duckdns.org/health
# 预期: {"status":"pass"}
```

---

## 三、防火墙和安全组配置

### 3.1 阿里云安全组

| 端口 | 协议 | 用途 |
|-----|------|------|
| 80 | TCP | Let's Encrypt 证书验证 |
| 443 | TCP | HTTPS / DERP WebSocket |
| 3478 | UDP | STUN (NAT 穿透) |

### 3.2 服务器防火墙

```bash
# Ubuntu/Debian (ufw)
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3478/udp
```

---

## 四、首次部署检查清单

```bash
# 1. 创建用户
ssh root@YOUR_SERVER_IP "docker exec headscale headscale users create default"

# 2. 创建 API Key（Web 工具用）
ssh root@YOUR_SERVER_IP "docker exec headscale headscale apikeys create --expiration 8760h"
# ⚠️ 只显示一次，立即保存！

# 3. 创建 PreAuth Key（设备连接用）
ssh root@YOUR_SERVER_IP "docker exec headscale headscale preauthkeys create --user default --reusable --expiration 8760h"
```

| 步骤 | 验证命令 | 预期结果 |
|------|---------|---------|
| 服务运行 | `curl https://域名/health` | `{"status":"pass"}` |
| 创建用户 | `docker exec headscale headscale users list` | 显示用户 |
| 创建 Key | 保存输出 | API Key + PreAuth Key |

---

## 五、客户端配置

### 场景 A：国内环境（需要 SSH Tunnel）

#### 5A.1 hosts 文件

**文件**: `C:\Windows\System32\drivers\etc\hosts`

```
127.0.0.1 ohmyheadscale.duckdns.org
```

#### 5A.2 SSH Tunnel

**转发规则**:

| 本地端口 | 远程端口 | 用途 |
|---------|---------|------|
| 8443 | 服务器:443 | 控制平面 |
| 443 | 服务器:443 | DERP WebSocket |

**创建 SSH Tunnel（Windows 计划任务）**:

```powershell
# 创建计划任务（以 SYSTEM 身份运行，开机自启）
$trigger = New-ScheduledTaskTrigger -AtStartup
$action = New-ScheduledTaskAction -Execute 'ssh.exe' -Argument '-N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -L 127.0.0.1:8443:127.0.0.1:443 -L 127.0.0.1:443:127.0.0.1:443 root@47.109.45.147'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'SSH-Tunnel-Headscale' -Trigger $trigger -Action $action -Settings $settings -RunLevel Highest -Force
```

**Linux (systemd)**:
```bash
# /etc/systemd/system/ssh-tunnel-headscale.service
[Unit]
Description=SSH Tunnel to Headscale Server
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/autossh -M 0 -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -L 8443:localhost:443 -L 443:localhost:443 root@47.109.45.147
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# 启用并启动
systemctl enable --now ssh-tunnel-headscale
```

**管理命令**:
```powershell
Start-ScheduledTask -TaskName 'SSH-Tunnel-Headscale'
Stop-ScheduledTask -TaskName 'SSH-Tunnel-Headscale'
Get-ScheduledTask -TaskName 'SSH-Tunnel-Headscale'
```

#### 5A.3 Tailscale 登录

```powershell
tailscale login --login-server=https://ohmyheadscale.duckdns.org:8443 --authkey=<authkey>
```

> ⚠️ 端口是 **8443**（走 SSH Tunnel），不是 443。

---

### 场景 B：非 GFW 环境（直连）

```powershell
tailscale login --login-server=https://ohmyheadscale.duckdns.org --authkey=<authkey>
```

---

## 六、手机端配置

1. 安装 Tailscale App（iOS App Store / Android Google Play）
2. 打开 App → 设置 → 自定义控制服务器
3. 输入：`https://ohmyheadscale.duckdns.org`
4. 使用 PreAuth Key 登录

> ⚠️ 手机端**必须使用域名**，不支持自签名证书。

---

## 七、连接状态（方案B实测）

> 测试时间：2026-03-20

### 连接矩阵

| 源 → 目标 | y9000p | dragon | 手机 |
|-----------|--------|--------|------|
| **y9000p** | - | myderp 62ms | ✅ **IPv6 直连 22ms** |
| **dragon** | myderp 34ms | - | myderp 79ms |
| **手机** | ✅ **IPv6 直连 16ms** | myderp ~79ms | - |

### 各节点网络情况

| 节点 | IPv4 | IPv6 | 直连能力 |
|------|------|------|----------|
| y9000p | 公网 NAT | ✅ 有 | **可 IPv6 直连** |
| dragon | 公网 IP | ❌ 无 | 只能中继 |
| 手机 | 公网 NAT | ✅ 有 | **可 IPv6 直连** |

### 方案A vs 方案B

| 节点对 | 方案A | 方案B | 变化 |
|--------|-------|-------|------|
| 本机↔手机 | DERP ~80ms | **IPv6 直连 16ms** | ✅ 显著改善 |
| 本机↔dragon | DERP ~65ms | DERP ~62ms | 持平 |

---

## 八、技术原理

### 为什么需要协调服务器（Headscale）？

| 功能 | 说明 |
|-----|------|
| **密钥交换** | WireGuard 需要双方公钥，Headscale 负责分发 |
| **端点发现** | 告诉节点"对方的地址是 x.x.x.x:41641" |
| **身份验证** | 防止中间人攻击 |
| **DERP 中继** | 直连失败时的备选方案 |

### 国内客户端的困境（原因链）

```
GFW 存在
    │
    ▼
需要 SSH Tunnel 绕过 GFW ─────────────────┐
    │                                     │
    ▼                                     ▼
TCP 正常转发                       UDP 被阻断
（控制平面、DERP WebSocket）        （SSH Tunnel 不支持 UDP）
    │                                     │
    │                                     ▼
    │                              STUN 测试失败
    │                                     │
    │                                     ▼
    │                              无法发现公网 IPv4 端点
    │                                     │
    │                                     ▼
    │                              无法 NAT 穿透
    │                                     │
    ▼                                     ▼
DERP 中继可用 ◀──────────────────── 只能走中继
```

### 为什么 IPv6 直连能工作？

**关键：IPv6 流量不经过 SSH Tunnel，直接走运营商公网**

```
TCP 流量（经过 SSH Tunnel）：
┌─────────┐    SSH Tunnel     ┌─────────┐
│  y9000p  │ ───────────────▶ │  服务器  │
│         │  控制平面/DERP     │         │
└─────────┘                   └─────────┘

IPv6 流量（不经过 SSH Tunnel）：
┌─────────┐    运营商 IPv6     ┌─────────┐
│  y9000p  │ ═══════════════▶ │  手机    │
│2409:8a4c│  点对点直连        │2409:894d│
└─────────┘                   └─────────┘
```

| 地址类型 | 需要 STUN？ | 原因 |
|---------|------------|------|
| IPv4 | ✅ 需要 | NAT 后面，需发现公网端点 |
| IPv6 | ❌ 不需要 | 本身就是公网地址 |

### 各节点直连能力对比

| 节点 | 有 IPv6 | SSH Tunnel | STUN 工作 | 直连能力 |
|------|---------|------------|-----------|----------|
| y9000p | ✅ 有 | ✅ 有 | ❌ 被阻断 | ✅ **IPv6 直连** |
| dragon | ❌ 无 | ✅ 有 | ❌ 被阻断 | ❌ 只能中继 |
| 手机 | ✅ 有 | ❌ 直连 | ✅ 正常 | ✅ **IPv6 直连** |

### dragon 为什么只能中继？

```
dragon 没有 IPv6
    │
    ▼
尝试 IPv4 NAT 穿透
    │
    ▼
需要 STUN 发现公网 IPv4 端点
    │
    ▼
STUN 使用 UDP 3478
    │
    ▼
UDP 被 SSH Tunnel 阻断 ❌
    │
    ▼
只能走 DERP 中继
```

### 实验观察：服务器 IPv6 对节点直连的影响

> ⚠️ **待验证**：以下为实验观察，非绝对结论

**观察现象**：
- y9000p ↔ 手机 在服务器开通 IPv6 之前就能 IPv6 直连
- 服务器昨天才开通 IPv6，但之前已有 IPv6 直连记录

**推测结论**：

| 服务器 IPv6 | 对节点间 IPv6 直连的影响 |
|------------|------------------------|
| 有 | 无影响（待验证） |
| 没有 | 无影响（待验证） |

**可能的原因**：
1. IPv6 直连是节点间点对点的，不经过服务器
2. 服务器只是协调端点信息（介绍人），不参与实际数据传输
3. 节点的 IPv6 端点是节点自己发现的，不是服务器分配的

**服务器 IPv6 的实际作用**（推测）：
- DERP 中继如果走 IPv6，可能延迟更低
- 对节点间直连（无论 IPv4/IPv6）没有直接影响

---

## 九、故障排查

### 问题 1：无法连接 Headscale

| 可能原因 | 解决方案 |
|---------|---------|
| SSH Tunnel 未启动 | `Start-ScheduledTask -TaskName 'SSH-Tunnel-Headscale'` |
| hosts 未配置 | 添加 `127.0.0.1 域名` 到 hosts |
| 节点状态异常 | `tailscale status` 检查是否 `NeedsLogin` |

### 问题 2：DERP 连接失败

| 可能原因 | 解决方案 |
|---------|---------|
| Caddy WebSocket 超时 | 检查 `read_timeout 0` 和 `write_timeout 0` |
| STUN 端口不通 | 检查防火墙 3478/UDP |

```bash
# 验证 WebSocket
curl -v --http1.1 -H "Upgrade: derp" -H "Connection: upgrade" \
  https://ohmyheadscale.duckdns.org/derp
# 正常: HTTP/1.1 101 Switching Protocols
```

### 问题 3：延迟很高或使用了错误的 DERP

**排查**：
```bash
tailscale status        # 检查是否 NeedsLogin
tailscale netcheck      # 查看 DERP 延迟
tailscale debug derp-map  # 检查 DERP Map
```

**解决**：
```bash
# 方案1：简单重启（保留凭据）
sudo tailscale down && sudo tailscale up

# 方案2：重新登录（清除凭据）
sudo tailscale logout
sudo tailscale login --login-server=https://xxx --authkey=xxx
```

| 操作 | 凭据 | 适用场景 |
|------|------|----------|
| `down` + `up` | 保留 | 网络波动 |
| `logout` + `login` | 清除 | 凭据异常 |

### 问题 4：myderp STUN 测试为空

**现象**：`tailscale netcheck` 显示 `myderp: (空)`

**原因**：STUN（UDP 3478）被 SSH Tunnel 阻断

**结论**：STUN 测试为空不影响 DERP 连接（WebSocket 用 TCP）

### 问题 5：myderp 延迟为空，Tailscale 选择官方 DERP

**现象**：`tailscale netcheck` 显示 `myderp: (空)`，连接走官方 DERP（hkg/tok）而不是 myderp

**原因**：
1. `paths: []` 为空，derp-map.yaml 未加载
2. `automatically_add_embedded_derp_region: true` 自动生成的 DERP 节点没有 STUNTestIP
3. 客户端无法测量 myderp 延迟，自动选择有延迟数据的官方 DERP

**排查**：
```bash
# 检查 DERP Map 是否有 STUNTestIP
tailscale debug derp-map | grep -A10 "myderp"

# 服务器端检查配置
grep -A3 'paths:' /etc/headscale/config.yaml
```

**解决**：
1. 确保 `paths` 配置正确：
   ```yaml
   paths:
     - /etc/headscale/derp-map.yaml
   ```
2. 禁用 `automatically_add_embedded_derp_region`（避免覆盖）：
   ```yaml
   automatically_add_embedded_derp_region: false
   ```
3. 重启 headscale：`docker restart headscale`
4. 所有客户端重启 tailscale：`tailscale down && tailscale up`

**验证**：DERP Map 中 myderp 节点应包含 `STUNTestIP: "47.109.45.147"`

---

## 十、快速参考命令

### Windows 客户端

```powershell
tailscale status                    # 查看状态
tailscale ping <节点>               # 测试连接
tailscale netcheck                  # 网络诊断
tailscale logout                    # 登出
tailscale login --login-server=https://xxx:8443 --authkey=xxx  # 登录
```

### Linux 客户端

```bash
sudo tailscale down                 # 停止（保留凭据）
sudo tailscale up                   # 启动
sudo tailscale logout               # 登出（清除凭据）
```

### 服务器端

```bash
docker logs -f headscale                              # 查看日志
docker exec headscale headscale nodes list            # 列出节点
docker exec headscale headscale preauthkeys list --user default  # 列出密钥
docker restart headscale                              # 重启服务
```

---

**文档版本**: 2.1
**最后更新**: 2026-03-20
**适用系统**: Windows 10/11, iOS, Android, Linux (Docker)
