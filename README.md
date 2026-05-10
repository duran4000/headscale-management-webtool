# Headscale Management Webtool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Headscale](https://img.shields.io/badge/Headscale-Compatible-blue.svg)](https://github.com/juanfont/headscale)

🛠️ 一个基于 Web 的 Headscale 管理工具，提供直观的用户界面来管理 Headscale 服务器。

## ✨ 功能特性

- 🖥️ **Web 管理界面** - 现代化的单页应用
- 🌐 **网络拓扑可视化** - 真实 P2P 连接探测、延迟显示、直连/DERP 判断
- 🔐 **API 代理服务器** - 解决浏览器 CORS 限制
- 👥 **节点管理** - 查看、删除节点
- 🗝️ **PreAuth Key 管理** - 创建、查看、删除认证密钥
- 📱 **跨平台支持** - Windows、macOS、Linux、iOS、Android

## 📦 快速开始

### 前置要求

- Node.js 16+
- Headscale 服务器
- 有效的 Headscale API Key

### 安装

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/headscale-management-webtool.git
cd headscale-management-webtool

# 安装依赖
npm install

# 配置
cp config/config.example.json config/config.json
# 编辑 config.json，填入你的服务器地址
```

### 启动

```bash
# 启动 API 代理服务器
node tools/rest-api-proxy-v2.cjs

# 打开浏览器访问
# 直接打开 tools/headscale-tool-v2.html
# 或访问 http://localhost:3006
```

## 📁 项目结构

```
headscale-management-webtool/
├── config/                 # 配置文件
│   ├── config.example.json
│   ├── docker-compose-headscale.yml
│   └── headscale-config.yaml
├── docs/                   # 文档
│   ├── P2P网络搭建部署指南.md
│   └── PROJECT_STRUCTURE.md
├── scripts/                # 脚本
│   └── configure-tailscale.ps1
├── tools/                  # 工具
│   ├── headscale-tool-v2.html
│   └── rest-api-proxy-v2.cjs
├── CHANGELOG.md
├── LICENSE
├── README.md
└── package.json
```

## 📖 文档

| 文档 | 说明 |
|------|------|
| [P2P网络搭建部署指南](docs/P2P网络搭建部署指南.md) | 完整的 P2P 网络部署指南 |
| [项目结构](docs/PROJECT_STRUCTURE.md) | 项目结构和文件说明 |
| [更新日志](CHANGELOG.md) | 版本历史和变更记录 |

## 🔧 配置说明

### config.json

```json
{
  "serverUrl": "https://YOUR_SERVER_IP:65437",
  "apiKey": "",
  "proxyPort": 3006
}
```

### 环境变量

| 变量 | 说明 |
|------|------|
| `HEADSCALE_SERVER` | Headscale 服务器地址 |
| `HEADSCALE_API_KEY` | API Key |
| `PROXY_PORT` | 代理端口 (默认 3006) |

## 🔗 相关链接

- [Headscale 官方文档](https://headscale.net/)
- [Headscale GitHub](https://github.com/juanfont/headscale)
- [Tailscale 官方文档](https://tailscale.com/kb/)
- [Headscale REST API 文档](https://headscale.net/stable/ref/api/)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 📄 许可证

本项目基于 [MIT](LICENSE) 许可证开源。

## ⚠️ 免责声明

本项目是一个独立的管理工具，需要配合 Headscale 服务器使用。请确保你已经正确部署和配置了 Headscale 服务器。
