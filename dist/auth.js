"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
// Dynamic import for ESM module (mcp-sso-auth)
let _ssoAuth = null;
async function getSsoAuth() {
    if (!_ssoAuth) {
        _ssoAuth = await Promise.resolve().then(() => __importStar(require("mcp-sso-auth")));
    }
    return _ssoAuth;
}
let _credsMgr = null;
async function getCredsMgr() {
    if (!_credsMgr) {
        const { createCredentialsManager } = await getSsoAuth();
        _credsMgr = createCredentialsManager("yapi-mcp");
    }
    return _credsMgr;
}
async function loadCredentials() {
    const mgr = await getCredsMgr();
    return mgr.load();
}
async function saveCredentials(creds) {
    const mgr = await getCredsMgr();
    mgr.save(creds);
}
async function clearCredentials() {
    const mgr = await getCredsMgr();
    mgr.clear();
}
/**
 * Start SSO login flow using shared mcp-sso-auth module.
 */
async function startSsoLogin(config) {
    const { startSsoLogin: ssoLogin } = await getSsoAuth();
    return ssoLogin({
        ssoLoginUrl: config.ssoLoginUrl,
        platformId: config.platformId,
        callbackDomain: config.callbackDomain,
        callbackPort: config.callbackPort,
        serverName: "YApi MCP Server",
        async exchangeToken(ssoToken) {
            return exchangeTokenWithYApi(config.yapiBaseUrl, ssoToken);
        },
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
            const creds = {
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
