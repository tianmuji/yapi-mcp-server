export interface SsoConfig {
    /** SSO login page, e.g. https://web-sso.intsig.net/login */
    ssoLoginUrl: string;
    /** SSO platform_id for YApi */
    platformId: string;
    /** Callback domain that DNS resolves to 127.0.0.1, e.g. https://yapi-mcp-auth.example.com */
    callbackDomain: string;
    /** Local port to listen on (must match the domain's port or default 443/80) */
    callbackPort: number;
    /** YApi base URL */
    yapiBaseUrl: string;
}
export interface Credentials {
    yapiToken: string;
    yapiUid: string;
    ssoToken: string;
    expiresAt: number;
}
/** Load saved credentials from disk */
export declare function loadCredentials(): Credentials | null;
/** Save credentials to disk */
export declare function saveCredentials(creds: Credentials): void;
/** Clear saved credentials */
export declare function clearCredentials(): void;
/**
 * Start SSO login flow:
 * 1. Start local HTTP server to receive callback
 * 2. Open browser to SSO login page
 * 3. Wait for SSO to redirect back with token
 * 4. Use token to login to YApi and capture cookies
 * 5. Save credentials
 */
export declare function startSsoLogin(config: SsoConfig): Promise<Credentials>;
