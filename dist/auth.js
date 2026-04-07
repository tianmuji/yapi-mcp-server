"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCredentials = loadCredentials;
exports.saveCredentials = saveCredentials;
exports.clearCredentials = clearCredentials;
exports.startSsoLogin = startSsoLogin;
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const url_1 = require("url");
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CREDENTIALS_DIR = path_1.default.join(process.env.HOME || process.env.USERPROFILE || "/tmp", ".yapi-mcp");
const CREDENTIALS_FILE = path_1.default.join(CREDENTIALS_DIR, "credentials.json");
/** Load saved credentials from disk */
function loadCredentials() {
    try {
        if (!fs_1.default.existsSync(CREDENTIALS_FILE))
            return null;
        const data = JSON.parse(fs_1.default.readFileSync(CREDENTIALS_FILE, "utf-8"));
        if (data.expiresAt && Date.now() < data.expiresAt) {
            return data;
        }
        // expired
        return null;
    }
    catch {
        return null;
    }
}
/** Save credentials to disk */
function saveCredentials(creds) {
    if (!fs_1.default.existsSync(CREDENTIALS_DIR)) {
        fs_1.default.mkdirSync(CREDENTIALS_DIR, { recursive: true });
    }
    fs_1.default.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
}
/** Clear saved credentials */
function clearCredentials() {
    try {
        if (fs_1.default.existsSync(CREDENTIALS_FILE))
            fs_1.default.unlinkSync(CREDENTIALS_FILE);
    }
    catch { }
}
/**
 * Start SSO login flow:
 * 1. Start local HTTP server to receive callback
 * 2. Open browser to SSO login page
 * 3. Wait for SSO to redirect back with token
 * 4. Use token to login to YApi and capture cookies
 * 5. Save credentials
 */
function startSsoLogin(config) {
    return new Promise(async (resolve, reject) => {
        // Remember which app was active before opening browser
        const previousApp = await getFrontmostApp();
        console.error(`[AUTH] Previous frontmost app: ${previousApp || "unknown"}`);
        // SSO redirects to: redirect_url?token=xxx (root path, not /callback)
        const callbackUrl = config.callbackDomain;
        const encodedCallback = encodeURIComponent(callbackUrl);
        const ssoUrl = `${config.ssoLoginUrl}?platform_id=${config.platformId}&redirect=${encodedCallback}`;
        const server = http_1.default.createServer(async (req, res) => {
            const reqUrl = new url_1.URL(req.url || "/", `http://localhost:${config.callbackPort}`);
            if (reqUrl.pathname === "/") {
                const ssoToken = reqUrl.searchParams.get("token");
                if (!ssoToken) {
                    // First redirect from SSO without token — redirect back to SSO for password input
                    console.error("[AUTH] Callback received without token, redirecting back to SSO for password...");
                    res.writeHead(302, { Location: ssoUrl });
                    res.end();
                    return;
                }
                // Exchange SSO token for YApi session
                try {
                    const creds = await exchangeTokenWithYApi(config.yapiBaseUrl, ssoToken);
                    saveCredentials(creds);
                    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                    res.end(`
            <html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
              <div style="text-align:center;">
                <h1 style="color:#52c41a;">&#10003; 登录成功</h1>
                <p>YApi MCP Server 已获取认证信息，正在返回应用…</p>
              </div>
            </body></html>
            <script>setTimeout(function(){ window.close(); }, 1000);</script>
          `);
                    server.close();
                    // Switch back to the original app
                    activateApp(previousApp);
                    resolve(creds);
                }
                catch (err) {
                    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
                    res.end(`<h2>登录失败：${err.message}</h2>`);
                    server.close();
                    reject(err);
                }
            }
            else {
                res.writeHead(404);
                res.end("Not found");
            }
        });
        server.listen(config.callbackPort, () => {
            console.error(`Auth callback server listening on port ${config.callbackPort}`);
            console.error(`Opening browser for SSO login...`);
            openBrowser(ssoUrl);
        });
        server.on("error", (err) => {
            reject(new Error(`Failed to start auth server: ${err.message}`));
        });
        // Timeout after 5 minutes
        setTimeout(() => {
            server.close();
            reject(new Error("SSO login timed out (5 minutes)"));
        }, 5 * 60 * 1000);
    });
}
/**
 * Call YApi's login_by_token endpoint with the SSO token,
 * capture the Set-Cookie headers to get _yapi_token and _yapi_uid.
 */
function exchangeTokenWithYApi(yapiBaseUrl, ssoToken) {
    return new Promise((resolve, reject) => {
        const url = new url_1.URL(`${yapiBaseUrl}/api/user/login_by_token?token=${encodeURIComponent(ssoToken)}`);
        const mod = url.protocol === "https:" ? https_1.default : http_1.default;
        const req = mod.get(url.toString(), { timeout: 10000 }, (res) => {
            // YApi responds with a 302 redirect + Set-Cookie headers
            const cookies = res.headers["set-cookie"] || [];
            let yapiToken = "";
            let yapiUid = "";
            for (const cookie of cookies) {
                const match = cookie.match(/^([^=]+)=([^;]*)/);
                if (match) {
                    if (match[1] === "_yapi_token")
                        yapiToken = match[2];
                    if (match[1] === "_yapi_uid")
                        yapiUid = match[2];
                }
            }
            if (!yapiToken || !yapiUid) {
                // Maybe YApi returned an error page. Read the body for diagnostics.
                let body = "";
                res.on("data", (chunk) => (body += chunk));
                res.on("end", () => {
                    reject(new Error(`YApi login failed: no cookies received. Status: ${res.statusCode}, Body: ${body.substring(0, 200)}`));
                });
                return;
            }
            const creds = {
                yapiToken,
                yapiUid,
                ssoToken,
                expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
            };
            resolve(creds);
        });
        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("YApi login request timed out"));
        });
    });
}
/** Get the frontmost app name (macOS only) */
function getFrontmostApp() {
    if (process.platform !== "darwin")
        return Promise.resolve(null);
    return new Promise((resolve) => {
        (0, child_process_1.exec)(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`, (err, stdout) => resolve(err ? null : stdout.trim()));
    });
}
/** Activate an app by name (macOS only) */
function activateApp(appName) {
    if (!appName || process.platform !== "darwin")
        return;
    (0, child_process_1.exec)(`osascript -e 'tell application "${appName}" to activate'`, (err) => {
        if (err)
            console.error(`Failed to activate app "${appName}": ${err.message}`);
    });
}
function openBrowser(url) {
    const cmd = process.platform === "darwin"
        ? `open "${url}"`
        : process.platform === "win32"
            ? `start "" "${url}"`
            : `xdg-open "${url}"`;
    (0, child_process_1.exec)(cmd, (err) => {
        if (err)
            console.error(`Failed to open browser: ${err.message}`);
    });
}
