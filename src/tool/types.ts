import type { SkillRegistry } from "../skill/registry.js";

export interface ToolContext {
  workingDir: string;
  sessionId: string;
  permissionCheck: (tool: string, pattern: string) => Promise<boolean>;
  /** Skill registry for on-demand knowledge retrieval (skill-query tool). */
  skillRegistry?: SkillRegistry;
  /** Skill names available to the current agent (for skill-query scoping). */
  activeSkills?: string[];
}

export interface ToolDef {
  id: string;
  description: string;
  parameters: Record<string, any>;
  execute(args: Record<string, any>, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolResult {
  output: string;
  error?: boolean;
  metadata?: Record<string, any>;
}
