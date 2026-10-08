export declare const CONFIG_FILE = ".harness-config.json";
export type AgentConfig = {
    command: string;
    model?: string;
};
export type ServerConfig = {
    directory: string;
    command: string[];
    address: string;
};
export type RuntimeConfig = {
    command: string;
    server: ServerConfig;
    clients: string[];
    world: string;
};
export type HarnessConfig = {
    gradle: {
        compile: string;
        build: string;
    };
    agents: {
        implementation: AgentConfig;
        review: AgentConfig;
    };
    runtime: RuntimeConfig;
};
export declare function loadConfig(root: string): Promise<HarnessConfig>;
export declare function checkConfig(value: unknown): string[];
export declare function defaultConfig(): HarnessConfig;
