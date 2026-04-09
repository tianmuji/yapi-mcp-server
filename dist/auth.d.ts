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
export declare function loadCredentials(): Promise<Credentials | null>;
export declare function saveCredentials(creds: Credentials): Promise<void>;
export declare function clearCredentials(): Promise<void>;
/**
 * Launch browser for SSO login, capture the sso_token from redirect,
 * then exchange it with YApi for _yapi_token + _yapi_uid.
 */
export declare function startSsoLogin(config: SsoConfig): Promise<Credentials>;
