#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v3";
import { YApiClient } from "./yapi-client.js";
import { loadCredentials, startSsoLogin, clearCredentials, type SsoConfig } from "./auth.js";
import {
  formatListMenu,
  formatInterfaceDetail,
  formatProjectInfo,
} from "./formatters.js";

// --- Config from env ---
const YAPI_BASE_URL = process.env.YAPI_BASE_URL;
const SSO_LOGIN_URL = process.env.SSO_LOGIN_URL || "https://web-sso.intsig.net/login";
const SSO_PLATFORM_ID = process.env.SSO_PLATFORM_ID || "odVOyexj6maKIHAXv9LflO8tw7WNOI4I";
const SSO_CALLBACK_DOMAIN = process.env.SSO_CALLBACK_DOMAIN; // e.g. http://yapi-mcp.example.com:9876
const SSO_CALLBACK_PORT = parseInt(process.env.SSO_CALLBACK_PORT || "9876", 10);

if (!YAPI_BASE_URL) {
  console.error("Error: YAPI_BASE_URL environment variable is required");
  process.exit(1);
}
if (!SSO_CALLBACK_DOMAIN) {
  console.error("Error: SSO_CALLBACK_DOMAIN environment variable is required (e.g. http://yapi-mcp.example.com:9876)");
  process.exit(1);
}

const ssoConfig: SsoConfig = {
  ssoLoginUrl: SSO_LOGIN_URL,
  platformId: SSO_PLATFORM_ID,
  callbackDomain: SSO_CALLBACK_DOMAIN,
  callbackPort: SSO_CALLBACK_PORT,
  yapiBaseUrl: YAPI_BASE_URL,
};

const client = new YApiClient(YAPI_BASE_URL);

// Try to restore saved credentials on startup
const savedCreds = loadCredentials();
if (savedCreds) {
  client.setCredentials(savedCreds);
  console.error("Restored saved credentials (valid until " + new Date(savedCreds.expiresAt).toLocaleString() + ")");
}

// --- Helper: check auth before API call ---
function requireAuth(): string | null {
  if (!client.isAuthenticated()) {
    return "Not authenticated. Please call the 'authenticate' tool first to login via SSO.";
  }
  return null;
}

// --- MCP Server ---
const server = new McpServer({
  name: "yapi",
  version: "1.0.0",
});

// Tool 0: authenticate
server.tool(
  "authenticate",
  "Login to YApi via SSO QR code scan. Opens browser for authentication.",
  {},
  async () => {
    if (client.isAuthenticated()) {
      return { content: [{ type: "text", text: "Already authenticated. Use 'logout' tool to re-authenticate." }] };
    }
    try {
      const creds = await startSsoLogin(ssoConfig);
      client.setCredentials(creds);
      return { content: [{ type: "text", text: "Authentication successful! You can now use all YApi tools." }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Authentication failed: ${err.message}` }] };
    }
  }
);

// Tool: logout
server.tool(
  "logout",
  "Clear saved YApi credentials and logout.",
  {},
  async () => {
    clearCredentials();
    client.setCredentials(null as any);
    return { content: [{ type: "text", text: "Logged out. Call 'authenticate' to login again." }] };
  }
);

// Tool 1: list_apis
server.tool(
  "list_apis",
  "List all API interfaces grouped by category for a YApi project",
  {
    project_id: z.string().describe("YApi project ID"),
  },
  async ({ project_id }) => {
    const authErr = requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    const res = await client.getInterfaceListMenu(project_id);
    if (res.errcode !== 0) {
      return { content: [{ type: "text", text: `Error: ${res.errmsg}` }] };
    }
    return { content: [{ type: "text", text: formatListMenu(res.data) }] };
  }
);

// Tool 2: get_api_detail
server.tool(
  "get_api_detail",
  "Get detailed definition of a single API interface (params, request body, response schema)",
  {
    interface_id: z.string().describe("YApi interface ID (from list_apis result)"),
  },
  async ({ interface_id }) => {
    const authErr = requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    const res = await client.getInterfaceDetail(interface_id);
    if (res.errcode !== 0) {
      return { content: [{ type: "text", text: `Error: ${res.errmsg}` }] };
    }

    // Fetch project info to get environment domains
    let envInfo = "";
    if (res.data?.project_id) {
      try {
        const projRes = await client.getProject(String(res.data.project_id));
        if (projRes.errcode === 0 && projRes.data?.env?.length > 0) {
          const basePath = projRes.data.basepath || "";
          const apiPath = res.data.path || "";
          const lines = ["\n## Full URLs"];
          for (const e of projRes.data.env) {
            lines.push(`  - **${e.name}**: ${e.domain}${basePath}${apiPath}`);
          }
          envInfo = lines.join("\n");
        }
      } catch {}
    }

    return { content: [{ type: "text", text: formatInterfaceDetail(res.data) + envInfo }] };
  }
);

// Tool 3: search_api
server.tool(
  "search_api",
  "Search API interfaces by path or title keyword within a YApi project",
  {
    project_id: z.string().describe("YApi project ID"),
    keyword: z.string().describe("Search keyword (matches against path and title)"),
  },
  async ({ project_id, keyword }) => {
    const authErr = requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    const res = await client.getInterfaceListMenu(project_id);
    if (res.errcode !== 0) {
      return { content: [{ type: "text", text: `Error: ${res.errmsg}` }] };
    }
    const kw = keyword.toLowerCase();
    const matches: any[] = [];
    for (const cat of res.data || []) {
      for (const item of cat.list || []) {
        if (
          (item.path && item.path.toLowerCase().includes(kw)) ||
          (item.title && item.title.toLowerCase().includes(kw))
        ) {
          matches.push({ ...item, _catName: cat.name });
        }
      }
    }
    if (matches.length === 0) {
      return { content: [{ type: "text", text: `No APIs matching "${keyword}" found.` }] };
    }
    const lines = matches.map(
      (m) =>
        `[${m.method?.toUpperCase() || "?"}] ${m.path} — ${m.title} (id: ${m._id}, category: ${m._catName})`
    );
    return {
      content: [{ type: "text", text: `Found ${matches.length} matching APIs:\n\n${lines.join("\n")}` }],
    };
  }
);

// Tool 4: get_project_info
server.tool(
  "get_project_info",
  "Get basic information about a YApi project",
  {
    project_id: z.string().describe("YApi project ID"),
  },
  async ({ project_id }) => {
    const authErr = requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    const res = await client.getProject(project_id);
    if (res.errcode !== 0) {
      return { content: [{ type: "text", text: `Error: ${res.errmsg}` }] };
    }
    return { content: [{ type: "text", text: formatProjectInfo(res.data) }] };
  }
);

// Tool 5: export_swagger
server.tool(
  "export_swagger",
  "Export the project's API documentation in Swagger/OpenAPI format",
  {
    project_id: z.string().describe("YApi project ID"),
  },
  async ({ project_id }) => {
    const authErr = requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    const res = await client.exportSwagger(project_id);
    if (res.errcode !== 0) {
      return { content: [{ type: "text", text: `Error: ${res.errmsg}` }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
    };
  }
);

// Tool 6: import_api_docs — bulk import full API documentation
server.tool(
  "import_api_docs",
  "Batch import full API documentation for a YApi project. Returns complete details (params, request body, response schema) for all matching APIs. Supports filtering by category or keyword. Use this to get comprehensive API docs in one call.",
  {
    project_id: z.string().describe("YApi project ID"),
    cat_id: z.string().optional().describe("Filter by category ID (from list_apis). If omitted, imports all categories."),
    keyword: z.string().optional().describe("Filter APIs by keyword (matches path or title). If omitted, imports all APIs."),
    save_to_file: z.string().optional().describe("Optional: absolute file path to save the documentation as markdown (e.g. /tmp/api-docs.md)"),
  },
  async ({ project_id, cat_id, keyword, save_to_file }) => {
    const authErr = requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    // Step 1: Get all interfaces
    const menuRes = await client.getInterfaceListMenu(project_id);
    if (menuRes.errcode !== 0) {
      return { content: [{ type: "text", text: `Error: ${menuRes.errmsg}` }] };
    }

    // Step 2: Collect interface IDs to fetch, applying filters
    const kw = keyword?.toLowerCase();
    const toFetch: { id: string; catName: string; title: string; method: string; path: string }[] = [];

    for (const cat of menuRes.data || []) {
      if (cat_id && String(cat._id) !== cat_id) continue;
      for (const item of cat.list || []) {
        if (kw) {
          const matchPath = item.path?.toLowerCase().includes(kw);
          const matchTitle = item.title?.toLowerCase().includes(kw);
          if (!matchPath && !matchTitle) continue;
        }
        toFetch.push({
          id: String(item._id),
          catName: cat.name || "Uncategorized",
          title: item.title || "Untitled",
          method: item.method?.toUpperCase() || "?",
          path: item.path || "/",
        });
      }
    }

    if (toFetch.length === 0) {
      return { content: [{ type: "text", text: "No APIs found matching the given filters." }] };
    }

    // Step 3: Fetch details in parallel (batches of 5 to avoid overload)
    const docs: string[] = [];
    const projectRes = await client.getProject(project_id);
    const projectName = projectRes.data?.name || `Project ${project_id}`;
    const basePath = projectRes.data?.basepath || "";

    docs.push(`# ${projectName} API Documentation`);
    docs.push(`**Project ID:** ${project_id}`);
    if (basePath) docs.push(`**Base Path:** ${basePath}`);
    docs.push(`**Total APIs:** ${toFetch.length}`);
    docs.push(`**Generated:** ${new Date().toISOString()}\n`);
    docs.push("---\n");

    let currentCat = "";
    const batchSize = 5;
    for (let i = 0; i < toFetch.length; i += batchSize) {
      const batch = toFetch.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (item) => {
          try {
            const detail = await client.getInterfaceDetail(item.id);
            return { item, detail: detail.errcode === 0 ? detail.data : null };
          } catch {
            return { item, detail: null };
          }
        })
      );

      for (const { item, detail } of results) {
        if (item.catName !== currentCat) {
          currentCat = item.catName;
          docs.push(`\n## ${currentCat}\n`);
        }

        if (!detail) {
          docs.push(`### ${item.method} ${item.path} — ${item.title}\n`);
          docs.push(`*Failed to fetch details (id: ${item.id})*\n`);
          continue;
        }

        docs.push(formatInterfaceDetail(detail));
        docs.push("\n---\n");
      }
    }

    const markdown = docs.join("\n");

    // Step 4: Optionally save to file
    if (save_to_file) {
      try {
        const fs = await import("fs");
        fs.writeFileSync(save_to_file, markdown, "utf-8");
        return {
          content: [{
            type: "text",
            text: `Imported ${toFetch.length} APIs from "${projectName}" and saved to:\n${save_to_file}\n\n${markdown}`,
          }],
        };
      } catch (err: any) {
        return {
          content: [{
            type: "text",
            text: `Imported ${toFetch.length} APIs but failed to save file: ${err.message}\n\n${markdown}`,
          }],
        };
      }
    }

    return {
      content: [{
        type: "text",
        text: `Imported ${toFetch.length} APIs from "${projectName}":\n\n${markdown}`,
      }],
    };
  }
);

// Tool 7: list_projects
server.tool(
  "list_projects",
  "List all YApi groups and projects the current user has access to",
  {},
  async () => {
    const authErr = requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    const groupRes = await client.getGroupList();
    if (groupRes.errcode !== 0) {
      return { content: [{ type: "text", text: `Error: ${groupRes.errmsg}` }] };
    }

    const lines: string[] = [];
    for (const group of groupRes.data || []) {
      lines.push(`\n## ${group.group_name} (group_id: ${group._id})`);
      const projRes = await client.getProjectList(String(group._id));
      if (projRes.errcode === 0 && projRes.data?.list) {
        for (const proj of projRes.data.list) {
          lines.push(`  - ${proj.name} (project_id: ${proj._id}) ${proj.desc ? `— ${proj.desc}` : ""}`);
        }
      }
    }
    return {
      content: [{ type: "text", text: lines.length > 0 ? lines.join("\n") : "No projects found." }],
    };
  }
);

// Tool 8: create_api
server.tool(
  "create_api",
  "Create a new API interface in a YApi project",
  {
    project_id: z.string().describe("YApi project ID"),
    cat_id: z.string().describe("Category ID where the interface will be created"),
    title: z.string().describe("API interface title"),
    path: z.string().describe("API path (e.g. /api/hello)"),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]).describe("HTTP method"),
    desc: z.string().optional().describe("Interface description (supports markdown)"),
    req_body_type: z.enum(["json", "form", "raw"]).optional().describe("Request body type"),
    req_body_other: z.string().optional().describe("Request body JSON schema or example"),
    res_body_type: z.enum(["json", "raw"]).optional().describe("Response body type"),
    res_body: z.string().optional().describe("Response body JSON schema or example"),
    status: z.enum(["undone", "done"]).optional().describe("Interface status (default: undone)"),
  },
  async ({ project_id, cat_id, title, path, method, desc, req_body_type, req_body_other, res_body_type, res_body, status }) => {
    const authErr = requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    try {
      const body: Record<string, any> = {
        project_id,
        catid: cat_id,
        title,
        path,
        method: method.toUpperCase(),
      };

      if (desc) body.desc = desc;
      if (status) body.status = status;
      if (req_body_type) body.req_body_type = req_body_type;
      if (req_body_other) body.req_body_other = req_body_other;
      if (res_body_type) body.res_body_type = res_body_type;
      if (res_body) body.res_body = res_body;

      const res = await client.addInterface(body);
      if (res.errcode !== 0) {
        return { content: [{ type: "text", text: `Error creating API: ${res.errmsg}` }] };
      }

      const data = res.data;
      return {
        content: [{
          type: "text",
          text: `API interface created successfully!\n\n` +
            `- **Title:** ${data?.title || title}\n` +
            `- **Method:** ${method.toUpperCase()}\n` +
            `- **Path:** ${path}\n` +
            `- **Interface ID:** ${data?._id || "unknown"}\n` +
            `- **Category ID:** ${cat_id}\n` +
            `- **Project ID:** ${project_id}`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error creating API: ${err.message}` }] };
    }
  }
);

// Tool 9: update_api
server.tool(
  "update_api",
  "Update an existing API interface. Only provided fields will be modified, others remain unchanged.",
  {
    interface_id: z.string().describe("Interface ID to update (from list_apis or search_api)"),
    title: z.string().optional().describe("New title"),
    path: z.string().optional().describe("New API path"),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]).optional().describe("New HTTP method"),
    cat_id: z.string().optional().describe("Move to a different category ID"),
    desc: z.string().optional().describe("New description (supports markdown)"),
    req_body_type: z.enum(["json", "form", "raw"]).optional().describe("Request body type"),
    req_body_other: z.string().optional().describe("Request body JSON schema or example"),
    res_body_type: z.enum(["json", "raw"]).optional().describe("Response body type"),
    res_body: z.string().optional().describe("Response body JSON schema or example"),
    status: z.enum(["undone", "done"]).optional().describe("Interface status"),
  },
  async ({ interface_id, title, path, method, cat_id, desc, req_body_type, req_body_other, res_body_type, res_body, status }) => {
    const authErr = requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    try {
      // First get the current interface to preserve existing fields
      const current = await client.getInterfaceDetail(interface_id);
      if (current.errcode !== 0) {
        return { content: [{ type: "text", text: `Error fetching interface: ${current.errmsg}` }] };
      }

      const body: Record<string, any> = { id: Number(interface_id) };

      // Only set fields that are explicitly provided
      if (title !== undefined) body.title = title;
      if (path !== undefined) body.path = path;
      if (method !== undefined) body.method = method.toUpperCase();
      if (cat_id !== undefined) body.catid = cat_id;
      if (desc !== undefined) body.desc = desc;
      if (status !== undefined) body.status = status;
      if (req_body_type !== undefined) body.req_body_type = req_body_type;
      if (req_body_other !== undefined) body.req_body_other = req_body_other;
      if (res_body_type !== undefined) body.res_body_type = res_body_type;
      if (res_body !== undefined) body.res_body = res_body;

      const res = await client.updateInterface(body);
      if (res.errcode !== 0) {
        return { content: [{ type: "text", text: `Error updating API: ${res.errmsg}` }] };
      }

      // Build a summary of what was changed
      const changes: string[] = [];
      if (title !== undefined) changes.push(`title → "${title}"`);
      if (path !== undefined) changes.push(`path → ${path}`);
      if (method !== undefined) changes.push(`method → ${method.toUpperCase()}`);
      if (cat_id !== undefined) changes.push(`category → ${cat_id}`);
      if (desc !== undefined) changes.push(`description updated`);
      if (status !== undefined) changes.push(`status → ${status}`);
      if (req_body_type !== undefined) changes.push(`req_body_type → ${req_body_type}`);
      if (req_body_other !== undefined) changes.push(`request body updated`);
      if (res_body_type !== undefined) changes.push(`res_body_type → ${res_body_type}`);
      if (res_body !== undefined) changes.push(`response body updated`);

      return {
        content: [{
          type: "text",
          text: `API interface updated successfully!\n\n` +
            `- **Interface ID:** ${interface_id}\n` +
            `- **Changes:** ${changes.join(", ")}`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error updating API: ${err.message}` }] };
    }
  }
);

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("YApi MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
