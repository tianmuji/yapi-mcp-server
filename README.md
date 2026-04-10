# YApi MCP Server

用于在 Claude Code 中查询和管理 YApi 接口文档的 MCP Server。

## 功能

| 工具 | 说明 |
|------|------|
| `yapi-auth` | 浏览器登录 YApi |
| `yapi-logout` | 退出登录 |
| `list_projects` | 列出所有项目 |
| `get_project_info` | 获取项目信息 |
| `list_apis` | 列出项目下所有接口（按分类） |
| `get_api_detail` | 获取接口详情 |
| `search_api` | 搜索接口 |
| `create_api` | 创建新接口 |
| `update_api` | 修改接口 |
| `export_swagger` | 导出 Swagger 文档 |
| `import_api_docs` | 批量导出接口文档 |

## 安装

```bash
# 1. 添加插件市场（仅首次）
claude plugin marketplace add tianmuji/camscanner-plugins

# 2. 安装插件
claude plugin install yapi@camscanner-plugins
```

安装后重启 Claude Code 即可使用。插件会自动注册 MCP Server 和 `/yapi` Skill。

### 前提条件

- Node.js >= 18
- Playwright Chromium（用于浏览器登录）：`npx playwright install chromium`

## 认证

首次使用时调用 `yapi-auth` 工具，会打开浏览器进行 SSO 登录（扫码验证 + 密码）。

- 浏览器数据持久化在 `~/.yapi-mcp/browser-data/`，保存的密码下次自动填充
- 认证信息保存在 `~/.yapi-mcp/credentials.json`，有效期 7 天
