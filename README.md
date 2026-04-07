# YApi MCP Server

用于在 Claude Code 中查询和管理 YApi 接口文档的 MCP Server，支持 SSO 扫码认证。

## 功能

| 工具 | 说明 |
|------|------|
| `authenticate` | SSO 扫码登录 |
| `logout` | 退出登录 |
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

### 1. 克隆并构建

```bash
git clone https://github.com/tianmuji/yapi-mcp-server.git ~/yapi-mcp-server
cd ~/yapi-mcp-server
npm install
npm run build
```

### 2. 配置 DNS 解析

回调域名需要解析到 `127.0.0.1`，在 `/etc/hosts` 中添加：

```
127.0.0.1 yapi-mcp-auth.camscanner.com
```

### 3. 注册到 Claude Code

编辑 `~/.claude/.mcp.json`，在 `mcpServers` 中添加：

```json
{
  "mcpServers": {
    "yapi": {
      "command": "node",
      "args": ["${HOME}/yapi-mcp-server/dist/index.js"],
      "env": {
        "YAPI_BASE_URL": "https://web-api.intsig.net",
        "SSO_LOGIN_URL": "https://web-sso.intsig.net/login",
        "SSO_PLATFORM_ID": "odVOyexj6maKIHAXv9LflO8tw7WNOI4I",
        "SSO_CALLBACK_DOMAIN": "http://yapi-mcp-auth.camscanner.com:9876",
        "SSO_CALLBACK_PORT": "9876"
      }
    }
  }
}
```

> 如果文件中已有其他 MCP 配置，将 `yapi` 部分合并到 `mcpServers` 对象中即可。

### 4. 重启 Claude Code

重启后在对话中输入 `authenticate` 完成 SSO 扫码登录即可使用。

## 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `YAPI_BASE_URL` | 是 | - | YApi 服务地址 |
| `SSO_LOGIN_URL` | 否 | `https://web-sso.intsig.net/login` | SSO 登录页 |
| `SSO_PLATFORM_ID` | 否 | `odVOyexj6maKIHAXv9LflO8tw7WNOI4I` | SSO 平台 ID |
| `SSO_CALLBACK_DOMAIN` | 是 | - | 回调域名（需解析到 127.0.0.1） |
| `SSO_CALLBACK_PORT` | 否 | `9876` | 回调端口 |

## 使用示例

```
# 列出项目
> 列出我能访问的所有 YApi 项目

# 查看接口
> 查看项目 3470 的所有接口

# 创建接口
> 在项目 3959 分类 69247 下创建一个 POST /api/test 接口

# 复制接口
> 把项目 3470 的批量脱敏接口复制到项目 3959
```

## 认证信息

- 认证信息保存在 `~/.yapi-mcp/credentials.json`
- 有效期 7 天，过期后重新 `authenticate`
