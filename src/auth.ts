import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import https from "https";
import { URL } from "url";
import { chromium } from "playwright-core";

export interface SsoConfig {
  yapiBaseUrl: string;
  ssoLoginUrl: string;
  ssoPlatformId: string;
}

export interface Credentials {
  yapiToken: string;
  yapiUid: string;
  ssoToken: string;
  expiresAt: number;
}

// --- Credentials persistence ---

const CREDS_DIR = path.join(os.homedir(), ".yapi-mcp");
const CREDS_FILE = path.join(CREDS_DIR, "credentials.json");
const BROWSER_DATA_DIR = path.join(CREDS_DIR, "browser-data");

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    if (!fs.existsSync(CREDS_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CREDS_FILE, "utf-8"));
    if (data && data.expiresAt > Date.now()) return data;
    return null;
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  if (!fs.existsSync(CREDS_DIR)) fs.mkdirSync(CREDS_DIR, { recursive: true });
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
}

export async function clearCredentials(): Promise<void> {
  try { fs.unlinkSync(CREDS_FILE); } catch { /* ignore */ }
}

// --- Find system Chromium installed by Playwright ---

function findChromium(): string | undefined {
  const cacheDir = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (!fs.existsSync(cacheDir)) return undefined;

  const dirs = fs.readdirSync(cacheDir)
    .filter(d => d.startsWith("chromium-"))
    .sort()
    .reverse();

  for (const dir of dirs) {
    const candidates = [
      path.join(cacheDir, dir, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
      path.join(cacheDir, dir, "chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
      path.join(cacheDir, dir, "chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"),
      path.join(cacheDir, dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      path.join(cacheDir, dir, "chrome-linux", "chrome"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return undefined;
}

/**
 * Launch browser for SSO login, capture the sso_token from redirect,
 * then exchange it with YApi for _yapi_token + _yapi_uid.
 */
export async function startSsoLogin(config: SsoConfig): Promise<Credentials> {
  const execPath = findChromium();
  if (!execPath) {
    throw new Error(
      "Cannot find Chromium. Please install Playwright browsers: npx playwright install chromium"
    );
  }

  if (!fs.existsSync(BROWSER_DATA_DIR)) fs.mkdirSync(BROWSER_DATA_DIR, { recursive: true });

  // SSO login page with redirect back to YApi — YApi will receive the token via URL
  const ssoUrl = `${config.ssoLoginUrl}?platform_id=${config.ssoPlatformId}&redirect=${encodeURIComponent(config.yapiBaseUrl)}`;

  console.error("[Auth] Launching browser for SSO login...");
  const context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    headless: false,
    executablePath: execPath,
    ignoreHTTPSErrors: true,
  });

  try {
    const page = context.pages()[0] || await context.newPage();

    // Listen for the redirect to YApi that carries the sso_token
    const ssoTokenPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("SSO login timed out (180s)")), 180000);

      context.on("page", async (newPage) => {
        const url = newPage.url();
        if (url.includes("login_by_token") || url.includes("token=")) {
          const parsed = new URL(url);
          const token = parsed.searchParams.get("token");
          if (token) { clearTimeout(timeout); resolve(token); }
        }
      });

      page.on("response", (response) => {
        const url = response.url();
        // Capture when YApi's login_by_token is called (redirect or direct)
        if (url.includes("/api/user/login_by_token")) {
          const parsed = new URL(url);
          const token = parsed.searchParams.get("token");
          if (token) { clearTimeout(timeout); resolve(token); }
        }
      });

      page.on("framenavigated", (frame) => {
        if (frame !== page.mainFrame()) return;
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
  } finally {
    await context.close();
  }
}

/**
 * Call YApi's login_by_token endpoint with the SSO token,
 * capture the Set-Cookie headers to get _yapi_token and _yapi_uid.
 */
function exchangeTokenWithYApi(yapiBaseUrl: string, ssoToken: string): Promise<Credentials> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${yapiBaseUrl}/api/user/login_by_token?token=${encodeURIComponent(ssoToken)}`);
    const mod = url.protocol === "https:" ? https : http;

    const req = mod.get(url.toString(), { timeout: 10000 }, (res) => {
      const cookies = res.headers["set-cookie"] || [];
      let yapiToken = "";
      let yapiUid = "";

      for (const cookie of cookies) {
        const match = cookie.match(/^([^=]+)=([^;]*)/);
        if (match) {
          if (match[1] === "_yapi_token") yapiToken = match[2];
          if (match[1] === "_yapi_uid") yapiUid = match[2];
        }
      }

      if (!yapiToken || !yapiUid) {
        let body = "";
        res.on("data", (chunk: string) => (body += chunk));
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
