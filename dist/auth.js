"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCredentials = loadCredentials;
exports.saveCredentials = saveCredentials;
exports.clearCredentials = clearCredentials;
exports.startSsoLogin = startSsoLogin;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const url_1 = require("url");
const playwright_core_1 = require("playwright-core");
// --- Credentials persistence ---
const CREDS_DIR = path_1.default.join(os_1.default.homedir(), ".yapi-mcp");
const CREDS_FILE = path_1.default.join(CREDS_DIR, "credentials.json");
const BROWSER_DATA_DIR = path_1.default.join(CREDS_DIR, "browser-data");
async function loadCredentials() {
    try {
        if (!fs_1.default.existsSync(CREDS_FILE))
            return null;
        const data = JSON.parse(fs_1.default.readFileSync(CREDS_FILE, "utf-8"));
        if (data && data.expiresAt > Date.now())
            return data;
        return null;
    }
    catch {
        return null;
    }
}
async function saveCredentials(creds) {
    if (!fs_1.default.existsSync(CREDS_DIR))
        fs_1.default.mkdirSync(CREDS_DIR, { recursive: true });
    fs_1.default.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
}
async function clearCredentials() {
    try {
        fs_1.default.unlinkSync(CREDS_FILE);
    }
    catch { /* ignore */ }
}
// --- Find system Chromium installed by Playwright ---
function findChromium() {
    const cacheDir = path_1.default.join(os_1.default.homedir(), "Library", "Caches", "ms-playwright");
    if (!fs_1.default.existsSync(cacheDir))
        return undefined;
    const dirs = fs_1.default.readdirSync(cacheDir)
        .filter(d => d.startsWith("chromium-"))
        .sort()
        .reverse();
    for (const dir of dirs) {
        const candidates = [
            path_1.default.join(cacheDir, dir, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
            path_1.default.join(cacheDir, dir, "chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
            path_1.default.join(cacheDir, dir, "chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"),
            path_1.default.join(cacheDir, dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
            path_1.default.join(cacheDir, dir, "chrome-linux", "chrome"),
        ];
        for (const c of candidates) {
            if (fs_1.default.existsSync(c))
                return c;
        }
    }
    return undefined;
}
/**
 * Launch browser for SSO login, capture the sso_token from redirect,
 * then exchange it with YApi for _yapi_token + _yapi_uid.
 */
async function startSsoLogin(config) {
    const execPath = findChromium();
    if (!execPath) {
        throw new Error("Cannot find Chromium. Please install Playwright browsers: npx playwright install chromium");
    }
    if (!fs_1.default.existsSync(BROWSER_DATA_DIR))
        fs_1.default.mkdirSync(BROWSER_DATA_DIR, { recursive: true });
    // SSO login page with redirect back to YApi — YApi will receive the token via URL
    const ssoUrl = `${config.ssoLoginUrl}?platform_id=${config.ssoPlatformId}&redirect=${encodeURIComponent(config.yapiBaseUrl)}`;
    console.error("[Auth] Launching browser for SSO login...");
    const context = await playwright_core_1.chromium.launchPersistentContext(BROWSER_DATA_DIR, {
        headless: false,
        executablePath: execPath,
        ignoreHTTPSErrors: true,
    });
    try {
        const page = context.pages()[0] || await context.newPage();
        // Listen for the redirect to YApi that carries the sso_token
        const ssoTokenPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("SSO login timed out (180s)")), 180000);
            context.on("page", async (newPage) => {
                const url = newPage.url();
                if (url.includes("login_by_token") || url.includes("token=")) {
                    const parsed = new url_1.URL(url);
                    const token = parsed.searchParams.get("token");
                    if (token) {
                        clearTimeout(timeout);
                        resolve(token);
                    }
                }
            });
            page.on("response", (response) => {
                const url = response.url();
                // Capture when YApi's login_by_token is called (redirect or direct)
                if (url.includes("/api/user/login_by_token")) {
                    const parsed = new url_1.URL(url);
                    const token = parsed.searchParams.get("token");
                    if (token) {
                        clearTimeout(timeout);
                        resolve(token);
                    }
                }
            });
            page.on("framenavigated", (frame) => {
                if (frame !== page.mainFrame())
                    return;
                const url = frame.url();
                // YApi SSO redirect: the SSO redirects to yapiBaseUrl with sso_token as cookie
                // or the URL contains the token
                if (url.startsWith(config.yapiBaseUrl)) {
                    // Extract token from cookies set by SSO on .intsig.net domain
                    context.cookies().then(cookies => {
                        const ssoTokenCookie = cookies.find(c => c.name === "sso_token");
                        if (ssoTokenCookie) {
                            clearTimeout(timeout);
                            resolve(ssoTokenCookie.value);
                        }
                    });
                }
            });
        });
        await page.goto(ssoUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        // Check if already logged in (SSO cookie valid, redirected directly to YApi)
        if (page.url().startsWith(config.yapiBaseUrl)) {
            const cookies = await context.cookies();
            const ssoTokenCookie = cookies.find(c => c.name === "sso_token");
            if (ssoTokenCookie) {
                console.error("[Auth] Already logged in via SSO, exchanging token...");
                const creds = await exchangeTokenWithYApi(config.yapiBaseUrl, ssoTokenCookie.value);
                await context.close();
                return creds;
            }
        }
        console.error("[Auth] Waiting for user to complete SSO login (up to 180s)...");
        const ssoToken = await ssoTokenPromise;
        console.error("[Auth] SSO token captured, exchanging with YApi...");
        const creds = await exchangeTokenWithYApi(config.yapiBaseUrl, ssoToken);
        console.error("[Auth] Authentication successful!");
        return creds;
    }
    finally {
        await context.close();
    }
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
                let body = "";
                res.on("data", (chunk) => (body += chunk));
                res.on("end", () => {
                    reject(new Error(`YApi login failed: no cookies received. Status: ${res.statusCode}, Body: ${body.substring(0, 200)}`));
                });
                return;
            }
            resolve({
                yapiToken,
                yapiUid,
                ssoToken,
                expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
            });
        });
        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("YApi login request timed out"));
        });
    });
}
