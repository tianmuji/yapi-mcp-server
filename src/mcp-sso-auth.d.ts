declare module "mcp-sso-auth" {
  export function createCredentialsManager(appName: string): {
    load(): any;
    save(creds: any): void;
    clear(): void;
  };

  export function startSsoLogin(config: {
    ssoLoginUrl: string;
    platformId: string;
    callbackDomain: string;
    callbackPort: number;
    serverName?: string;
    exchangeToken: (ssoToken: string) => Promise<any>;
  }): Promise<any>;

  export function getFrontmostApp(): Promise<string | null>;
  export function activateApp(appName: string | null): void;
  export function openBrowser(url: string): void;
}
