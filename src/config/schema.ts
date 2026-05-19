export interface LLMConfig {
  baseURL: string;
  model: string;
  apiKey: string;
}

export type PermissionAction = "allow" | "deny" | "ask";

export interface PermissionRule {
  tool: string;
  pattern: string;
  action: PermissionAction;
}

export interface PermissionsConfig {
  default: PermissionAction[];
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
      { tool: "read", pattern: "*", action: "allow" },
      { tool: "glob", pattern: "*", action: "allow" },
      { tool: "grep", pattern: "*", action: "allow" },
      { tool: "write", pattern: "*", action: "allow" },
      { tool: "bash", pattern: "*", action: "allow" },
    ],
  },
  mcpServers: {},
  docker: {
    enabled: true,
    preferContainer: true,
  },
};
