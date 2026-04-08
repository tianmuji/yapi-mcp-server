"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.YApiClient = void 0;
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const url_1 = require("url");
class YApiClient {
    constructor(baseUrl) {
        this.credentials = null;
        this.baseUrl = baseUrl.replace(/\/+$/, "");
    }
    setCredentials(creds) {
        this.credentials = creds;
    }
    isAuthenticated() {
        return !!(this.credentials && Date.now() < this.credentials.expiresAt);
    }
    requestOnce(path, params = {}) {
        return new Promise((resolve, reject) => {
            if (!this.credentials) {
                reject(new Error("Not authenticated. Please call the 'authenticate' tool first."));
                return;
            }
            const url = new url_1.URL(this.baseUrl + path);
            for (const [key, value] of Object.entries(params)) {
                url.searchParams.set(key, value);
            }
            const mod = url.protocol === "https:" ? https_1.default : http_1.default;
            const options = {
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
                    }
                    catch {
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
    async request(path, params = {}, retries = 2) {
        for (let i = 0; i <= retries; i++) {
            try {
                return await this.requestOnce(path, params);
            }
            catch (err) {
                if (i === retries || !err.message?.includes("timeout"))
                    throw err;
                console.error(`[YApi] Retry ${i + 1}/${retries} for ${path}: ${err.message}`);
            }
        }
        throw new Error(`Request failed after ${retries} retries: ${path}`);
    }
    postRequestOnce(path, body) {
        return new Promise((resolve, reject) => {
            if (!this.credentials) {
                reject(new Error("Not authenticated. Please call the 'authenticate' tool first."));
                return;
            }
            const url = new url_1.URL(this.baseUrl + path);
            const mod = url.protocol === "https:" ? https_1.default : http_1.default;
            const data = JSON.stringify(body);
            const options = {
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
                    }
                    catch {
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
    async postRequest(path, body, retries = 2) {
        for (let i = 0; i <= retries; i++) {
            try {
                return await this.postRequestOnce(path, body);
            }
            catch (err) {
                if (i === retries || !err.message?.includes("timeout"))
                    throw err;
                console.error(`[YApi] Retry ${i + 1}/${retries} for ${path}: ${err.message}`);
            }
        }
        throw new Error(`Request failed after ${retries} retries: ${path}`);
    }
    /** Add a new interface */
    async addInterface(body) {
        return this.postRequest("/api/interface/add", body);
    }
    /** Update an existing interface */
    async updateInterface(body) {
        return this.postRequest("/api/interface/up", body);
    }
    /** Get project info */
    async getProject(projectId) {
        return this.request("/api/project/get", { id: projectId });
    }
    /** Get interface list with categories */
    async getInterfaceListMenu(projectId) {
        return this.request("/api/interface/list_menu", { project_id: projectId });
    }
    /** Get single interface detail */
    async getInterfaceDetail(interfaceId) {
        return this.request("/api/interface/get", { id: interfaceId });
    }
    /** Get interface list (paginated) */
    async getInterfaceList(projectId, page = 1, limit = 20, catId) {
        const params = {
            project_id: projectId,
            page: String(page),
            limit: String(limit),
        };
        if (catId)
            params.catid = catId;
        return this.request("/api/interface/list", params);
    }
    /** Export Swagger/OpenAPI */
    async exportSwagger(projectId) {
        return this.request("/api/plugin/exportSwagger", {
            project_id: projectId,
            type: "OpenAPIV2",
        });
    }
    /** List all projects the user has access to */
    async getGroupList() {
        return this.request("/api/group/list");
    }
    /** List projects in a group */
    async getProjectList(groupId, page = 1, limit = 100) {
        return this.request("/api/project/list", {
            group_id: groupId,
            page: String(page),
            limit: String(limit),
        });
    }
}
exports.YApiClient = YApiClient;
