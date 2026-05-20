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

export interface AgentConfig {
  maxSteps: number;
  timeout: number;
}

export interface SkillsConfig {
  maxCompanionBytes: number;
}

export interface HarnessConfig {
  loop: {
    windowSize: number;
    similarityThreshold: number;
    maxRepeats: number;
  };
  budget: {
    maxTokens: number;
    compressThreshold: number;
    preserveRecentSteps: number;
  };
  terminator: {
    maxStepsWithoutProgress: number;
  };
}

export interface MemoryConfig {
  enabled: boolean;
  autoLog: boolean;
}

export interface OpenhackConfig {
  llm: LLMConfig;
  agent: AgentConfig;
  harness: HarnessConfig;
  memory: MemoryConfig;
  skills: SkillsConfig;
  permissions: PermissionsConfig;
  mcpServers: Record<string, MCPServerConfig>;
  docker: DockerConfig;
}

export const DEFAULT_CONFIG: OpenhackConfig = {
  llm: {
    baseURL: "http://localhost:11434/v1",
    model: "default",
    apiKey: "",
  },
  agent: {
    maxSteps: 25,
    timeout: 300,
  },
  harness: {
    loop: {
      windowSize: 5,
      similarityThreshold: 0.8,
      maxRepeats: 3,
    },
    budget: {
      maxTokens: 100000,
      compressThreshold: 70000,
      preserveRecentSteps: 5,
    },
    terminator: {
      maxStepsWithoutProgress: 10,
    },
  },
  memory: {
    enabled: true,
    autoLog: true,
  },
  skills: {
    maxCompanionBytes: 15000,
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
