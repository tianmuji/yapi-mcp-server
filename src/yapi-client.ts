import http from "http";
import https from "https";
import { URL } from "url";
import type { Credentials } from "./auth.js";

export interface YApiResponse<T = any> {
  errcode: number;
  errmsg: string;
  data: T;
}

export class YApiClient {
  private baseUrl: string;
  private credentials: Credentials | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  setCredentials(creds: Credentials): void {
    this.credentials = creds;
  }

  isAuthenticated(): boolean {
    return !!(this.credentials && Date.now() < this.credentials.expiresAt);
  }

  private requestOnce<T>(path: string, params: Record<string, string> = {}): Promise<YApiResponse<T>> {
    return new Promise((resolve, reject) => {
      if (!this.credentials) {
        reject(new Error("Not authenticated. Please call the 'authenticate' tool first."));
        return;
      }

      const url = new URL(this.baseUrl + path);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }

      const mod = url.protocol === "https:" ? https : http;
      const options: http.RequestOptions = {
        timeout: 30000,
        headers: {
          Cookie: `_yapi_token=${this.credentials.yapiToken}; _yapi_uid=${this.credentials.yapiUid}`,
        },
      };

      const req = mod.get(url.toString(), options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Invalid JSON response from ${path}`));
          }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Request timeout: ${path}`));
      });
    });
  }

  private async request<T>(path: string, params: Record<string, string> = {}, retries = 2): Promise<YApiResponse<T>> {
    for (let i = 0; i <= retries; i++) {
      try {
        return await this.requestOnce<T>(path, params);
      } catch (err: any) {
        if (i === retries || !err.message?.includes("timeout")) throw err;
        console.error(`[YApi] Retry ${i + 1}/${retries} for ${path}: ${err.message}`);
      }
    }
    throw new Error(`Request failed after ${retries} retries: ${path}`);
  }

  private postRequestOnce<T>(path: string, body: Record<string, any>): Promise<YApiResponse<T>> {
    return new Promise((resolve, reject) => {
      if (!this.credentials) {
        reject(new Error("Not authenticated. Please call the 'authenticate' tool first."));
        return;
      }

      const url = new URL(this.baseUrl + path);
      const mod = url.protocol === "https:" ? https : http;
      const data = JSON.stringify(body);

      const options: http.RequestOptions = {
        method: "POST",
        timeout: 30000,
        headers: {
          Cookie: `_yapi_token=${this.credentials.yapiToken}; _yapi_uid=${this.credentials.yapiUid}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      };

      const req = mod.request(url.toString(), options, (res) => {
        let respBody = "";
        res.on("data", (chunk) => (respBody += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(respBody));
          } catch {
            reject(new Error(`Invalid JSON response from ${path}: ${respBody.substring(0, 200)}`));
          }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Request timeout: ${path}`));
      });
      req.write(data);
      req.end();
    });
  }

  private async postRequest<T>(path: string, body: Record<string, any>, retries = 2): Promise<YApiResponse<T>> {
    for (let i = 0; i <= retries; i++) {
      try {
        return await this.postRequestOnce<T>(path, body);
      } catch (err: any) {
        if (i === retries || !err.message?.includes("timeout")) throw err;
        console.error(`[YApi] Retry ${i + 1}/${retries} for ${path}: ${err.message}`);
      }
    }
    throw new Error(`Request failed after ${retries} retries: ${path}`);
  }

  /** Add a new interface */
  async addInterface(body: Record<string, any>): Promise<YApiResponse> {
    return this.postRequest("/api/interface/add", body);
  }

  /** Update an existing interface */
  async updateInterface(body: Record<string, any>): Promise<YApiResponse> {
    return this.postRequest("/api/interface/up", body);
  }

  /** Get project info */
  async getProject(projectId: string): Promise<YApiResponse> {
    return this.request("/api/project/get", { id: projectId });
  }

  /** Get interface list with categories */
  async getInterfaceListMenu(projectId: string): Promise<YApiResponse> {
    return this.request("/api/interface/list_menu", { project_id: projectId });
  }

  /** Get single interface detail */
  async getInterfaceDetail(interfaceId: string): Promise<YApiResponse> {
    return this.request("/api/interface/get", { id: interfaceId });
  }

  /** Get interface list (paginated) */
  async getInterfaceList(projectId: string, page = 1, limit = 20, catId?: string): Promise<YApiResponse> {
    const params: Record<string, string> = {
      project_id: projectId,
      page: String(page),
      limit: String(limit),
    };
    if (catId) params.catid = catId;
    return this.request("/api/interface/list", params);
  }

  /** Export Swagger/OpenAPI */
  async exportSwagger(projectId: string): Promise<YApiResponse> {
    return this.request("/api/plugin/exportSwagger", {
      project_id: projectId,
      type: "OpenAPIV2",
    });
  }

  /** List all projects the user has access to */
  async getGroupList(): Promise<YApiResponse> {
    return this.request("/api/group/list");
  }

  /** List projects in a group */
  async getProjectList(groupId: string, page = 1, limit = 100): Promise<YApiResponse> {
    return this.request("/api/project/list", {
      group_id: groupId,
      page: String(page),
      limit: String(limit),
    });
  }
}
