# YApi MCP Server

用于在 Claude Code 中查询和管理 YApi 接口文档的 MCP Server，支持 SSO 扫码认证。

## 功能

| 工具 | 说明 |
|------|------|
| `yapi-auth` | SSO 扫码登录（支持扫码 + 密码两步认证） |
| `yapi-logout` | 退出登录 |
| `list_projects` | 列出所有项目 |
| `get_project_info` | 获取项目信息 |
| `list_apis` | 列出项目下所有接口（按分类） |
| `get_api_detail` | 获取接口详情 |
| `search_api` | 搜索接口 |
| `create_api` | 创建新接口（支持结构化 headers/query/body） |
| `update_api` | 修改接口（支持结构化 headers/query/body） |
| `export_swagger` | 导出 Swagger 文档 |
| `import_api_docs` | 批量导出接口文档 |

## 安装

> 前提条件：需要安装 [Node.js](https://nodejs.org/)（自带 npx）

### Mac / Linux（插件安装，推荐）

通过插件安装可同时获得 MCP 工具和 `/yapi` skill：

```bash
# 1. 添加插件市场（仅首次需要）
claude plugin marketplace add tianmuji/camscanner-plugins

# 2. 安装 YApi 插件
claude plugin install yapi@camscanner-plugins
```

安装完成后重启 Claude Code，即可使用：
- **MCP 工具**：自动注册所有 YApi 工具（查询、创建、更新接口等）
- **Skill**：输入 `/yapi` 激活 YApi 助手，自动引导完成认证和操作

### Windows（手动配置）

Windows 上 `npx` 需要 `cmd /c` 包装，请直接编辑配置文件 `%USERPROFILE%\.claude\.mcp.json`：

```json
{
  "mcpServers": {
    "yapi": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "git+https://gitlab.intsig.net/cs-templates/skills/yapi-mcp-server.git"],
      "env": {
        "YAPI_BASE_URL": "https://web-api.intsig.net",
        "SSO_LOGIN_URL": "https://web-sso.intsig.net/login",
        "SSO_PLATFORM_ID": "odVOyexj6maKIHAXv9LflO8tw7WNOI4I",
        "SSO_CALLBACK_DOMAIN": "https://www-sandbox.camscanner.com/activity/mcp-auth-callback",
        "SSO_CALLBACK_PORT": "9876"
      }
    }
  }
}
```

> 如果文件中已有其他 MCP 配置，将 `yapi` 部分合并到 `mcpServers` 对象中即可。

重启 Claude Code，在对话中调用 `yapi-auth` 完成 SSO 扫码登录即可使用。

无需克隆仓库、无需配置 hosts 文件，开箱即用。

## 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `YAPI_BASE_URL` | 是 | - | YApi 服务地址 |
| `SSO_LOGIN_URL` | 否 | `https://web-sso.intsig.net/login` | SSO 登录页 |
| `SSO_PLATFORM_ID` | 否 | `odVOyexj6maKIHAXv9LflO8tw7WNOI4I` | SSO 平台 ID |
| `SSO_CALLBACK_DOMAIN` | 是 | - | 中转页 URL 或本地回调域名 |
| `SSO_CALLBACK_PORT` | 否 | `9876` | 回调端口 |

## 使用示例

```
# 列出项目
> 列出我能访问的所有 YApi 项目

# 查看接口
> 查看项目 3470 的所有接口

# 搜索接口
> 搜索项目 3470 中包含 "脱敏" 的接口

# 创建接口（支持完整的结构化定义）
> 在项目 3959 分类 69247 下创建一个 POST /api/test 接口，
> 包含 Content-Type header、token query 参数、JSON body 和响应体

# 复制接口
> 把项目 3470 的批量脱敏接口复制到项目 3959

# 批量导出
> 导出项目 3470 的所有接口文档
```

## 认证信息

- 认证信息保存在 `~/.yapi-mcp/credentials.json`
- 有效期 7 天，过期后重新 `yapi-auth`
- SSO 支持两步认证（扫码验证 + 密码输入）
