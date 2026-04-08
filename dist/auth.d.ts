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
export declare function loadCredentials(): Promise<Credentials | null>;
export declare function saveCredentials(creds: Credentials): Promise<void>;
export declare function clearCredentials(): Promise<void>;
/**
 * Start SSO login flow using shared mcp-sso-auth module.
 */
export declare function startSsoLogin(config: SsoConfig): Promise<Credentials>;
