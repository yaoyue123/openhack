export interface LLMConfig {
  baseURL: string;
  model: string;
  apiKey: string;
}

export interface PermissionRule {
  tool: string;
  patterns: string[];
}

export interface PermissionsConfig {
  default: ("allow" | "deny" | "ask")[];
  rules: PermissionRule[];
}

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface DockerConfig {
  enabled: boolean;
  preferContainer: boolean;
  image?: string;
}

export interface OpenhackConfig {
  llm: LLMConfig;
  permissions: PermissionsConfig;
  mcpServers: Record<string, MCPServerConfig>;
  docker: DockerConfig;
}

export const DEFAULT_CONFIG: OpenhackConfig = {
  llm: {
    baseURL: process.env.OPENHACK_LLM_BASE_URL ?? "http://localhost:11434/v1",
    model: process.env.OPENHACK_LLM_MODEL ?? "default",
    apiKey: process.env.OPENHACK_LLM_API_KEY ?? "",
  },
  permissions: {
    default: ["ask"],
    rules: [
      { tool: "read", patterns: ["**/*"] },
      { tool: "glob", patterns: ["**/*"] },
      { tool: "grep", patterns: ["**/*"] },
      { tool: "write", patterns: ["**/*"] },
      { tool: "bash", patterns: ["*"] },
    ],
  },
  mcpServers: {},
  docker: {
    enabled: true,
    preferContainer: true,
  },
};
