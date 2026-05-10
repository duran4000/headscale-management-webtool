# 项目结构

Headscale Management Web Tool 的项目结构说明。

## 目录结构

```
headscale-management-webtool/
│
├── docs/                                  # 文档目录
│   ├── headscale-derp-setup-guide.md     # 主文档：部署操作手册
│   └── PROJECT_STRUCTURE.md              # 本文件
│
├── tools/                                 # 工具目录
│   ├── headscale-tool-v2.html            # Web 管理界面
│   └── rest-api-proxy-v2.cjs             # API 代理服务器
│
├── scripts/                               # 脚本目录
│   ├── ssh-tunnel-headscale.ps1          # SSH Tunnel 自动重连脚本
│   ├── install-ssh-tunnel-task.ps1       # 安装 SSH Tunnel 自启动任务
│   └── configure-tailscale.ps1           # Tailscale 配置脚本
│
├── config/                                # 配置目录
│   └── config.example.json               # API 代理配置示例
│
├── README.md                              # 项目说明
├── CHANGELOG.md                           # 变更日志
└── package.json                           # Node.js 项目配置
```

## 核心文件说明

| 文件 | 说明 | 用途 |
|------|------|------|
| `headscale-derp-setup-guide.md` | 部署操作手册 | 完整部署指南 |
| `headscale-tool-v2.html` | Web 管理界面 | 节点、用户、密钥管理 |
| `rest-api-proxy-v2.cjs` | API 代理服务器 | 解决 CORS 限制 |
| `ssh-tunnel-headscale.ps1` | SSH Tunnel 脚本 | 绕过 GFW 访问服务器 |
| `install-ssh-tunnel-task.ps1` | 安装自启动任务 | 配置 SSH Tunnel 开机自启 |

## 使用流程

1. **阅读主文档** - [headscale-derp-setup-guide.md](headscale-derp-setup-guide.md)
2. **部署服务器** - 按文档配置 Headscale + Caddy
3. **配置客户端** - 安装 SSH Tunnel（国内环境）
4. **启动代理** - `node tools/rest-api-proxy-v2.cjs`
5. **打开界面** - 浏览器打开 `tools/headscale-tool-v2.html`

---

**详细说明请参考**：[headscale-derp-setup-guide.md](headscale-derp-setup-guide.md)
