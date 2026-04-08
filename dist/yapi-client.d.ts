import type { Credentials } from "./auth.js";
export interface YApiResponse<T = any> {
    errcode: number;
    errmsg: string;
    data: T;
}
export declare class YApiClient {
    private baseUrl;
    private credentials;
    constructor(baseUrl: string);
    setCredentials(creds: Credentials): void;
    isAuthenticated(): boolean;
    private requestOnce;
    private request;
    private postRequestOnce;
    private postRequest;
    /** Add a new interface */
    addInterface(body: Record<string, any>): Promise<YApiResponse>;
    /** Update an existing interface */
    updateInterface(body: Record<string, any>): Promise<YApiResponse>;
    /** Get project info */
    getProject(projectId: string): Promise<YApiResponse>;
    /** Get interface list with categories */
    getInterfaceListMenu(projectId: string): Promise<YApiResponse>;
    /** Get single interface detail */
    getInterfaceDetail(interfaceId: string): Promise<YApiResponse>;
    /** Get interface list (paginated) */
    getInterfaceList(projectId: string, page?: number, limit?: number, catId?: string): Promise<YApiResponse>;
    /** Export Swagger/OpenAPI */
    exportSwagger(projectId: string): Promise<YApiResponse>;
    /** List all projects the user has access to */
    getGroupList(): Promise<YApiResponse>;
    /** List projects in a group */
    getProjectList(groupId: string, page?: number, limit?: number): Promise<YApiResponse>;
}
