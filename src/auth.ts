import http from "http";
import https from "https";
import { URL } from "url";

export interface SsoConfig {
  ssoLoginUrl: string;
  platformId: string;
  callbackDomain: string;
  callbackPort: number;
  yapiBaseUrl: string;
}

export interface Credentials {
  yapiToken: string;
  yapiUid: string;
  ssoToken: string;
  expiresAt: number;
}

// Dynamic import for ESM module (mcp-sso-auth)
let _ssoAuth: any = null;
async function getSsoAuth() {
  if (!_ssoAuth) {
    _ssoAuth = await import("mcp-sso-auth");
  }
  return _ssoAuth;
}

let _credsMgr: any = null;
async function getCredsMgr() {
  if (!_credsMgr) {
    const { createCredentialsManager } = await getSsoAuth();
    _credsMgr = createCredentialsManager("yapi-mcp");
  }
  return _credsMgr;
}

export async function loadCredentials(): Promise<Credentials | null> {
  const mgr = await getCredsMgr();
  return mgr.load() as Credentials | null;
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  const mgr = await getCredsMgr();
  mgr.save(creds);
}

export async function clearCredentials(): Promise<void> {
  const mgr = await getCredsMgr();
  mgr.clear();
}

/**
 * Start SSO login flow using shared mcp-sso-auth module.
 */
export async function startSsoLogin(config: SsoConfig): Promise<Credentials> {
  const { startSsoLogin: ssoLogin } = await getSsoAuth();
  return ssoLogin({
    ssoLoginUrl: config.ssoLoginUrl,
    platformId: config.platformId,
    callbackDomain: config.callbackDomain,
    callbackPort: config.callbackPort,
    serverName: "YApi MCP Server",
    async exchangeToken(ssoToken: string): Promise<Credentials> {
      return exchangeTokenWithYApi(config.yapiBaseUrl, ssoToken);
    },
  });
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

      const creds: Credentials = {
        yapiToken,
        yapiUid,
        ssoToken,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
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
