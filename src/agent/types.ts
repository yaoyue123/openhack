import type { PermissionRule } from "../config/schema.js";

export type AgentMode = "primary" | "specialist";

export interface AgentDef {
  name: string;
  mode: AgentMode;
  description: string;
  basePrompt: string;
  permissions: PermissionRule[];
  skills: string[];
  excludeTools?: string[];
  mcpServers?: string[];
  maxSteps?: number;
}

export interface DelegateRequest {
  targetAgent: string;
  objective: string;
  context: string;
}
