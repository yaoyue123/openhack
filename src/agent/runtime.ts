import type { ModelMessage } from "ai";
import type { AgentDef, DelegateRequest } from "./types.js";
import type { Provider } from "../llm/provider.js";
import { ToolRegistry } from "../tool/registry.js";
import type { ToolContext } from "../tool/types.js";
import type { OpenhackConfig } from "../config/schema.js";
import type { HarnessConfig } from "../harness/types.js";
import type { MemoryConfig } from "../memory/types.js";
import { runAgentLoop, type AgentLoopOptions, type AgentLoopResult } from "../agent-loop.js";
import { SkillRegistry } from "../skill/registry.js";
import { MCPLifecycle } from "../mcp/lifecycle.js";
import { getSystemPrompt } from "../llm/system-prompt.js";
import { evaluate, type PermissionAction } from "../permission/evaluate.js";

export interface AgentRunContext {
  agentDef: AgentDef;
  provider: Provider;
  tools: ToolRegistry;
  toolContext: ToolContext;
  config: OpenhackConfig;
  skillRegistry: SkillRegistry;
  memoryDir: string;
  initialObjective: string;
  messages?: ModelMessage[];
  harnessConfig?: Partial<HarnessConfig>;
  memoryConfig?: Partial<MemoryConfig>;
  mcpLifecycle?: MCPLifecycle;
  onDelegate?: (req: DelegateRequest) => Promise<AgentLoopResult>;
  onToken?: (token: string) => void;
  onToolCall?: (tool: string, args: unknown) => void;
  onFlag?: (flag: string) => void | Promise<void>;
  abortSignal?: AbortSignal;
}

export function buildPermissionCheck(
  agentDef: AgentDef,
  config: OpenhackConfig,
): (tool: string, target: string) => PermissionAction {
  const rules = [...agentDef.permissions, ...(config.permissions?.rules ?? [])];
  return (tool: string, target: string): PermissionAction => {
    return evaluate(tool, target, rules);
  };
}

export function filterToolsForAgent(
  registry: ToolRegistry,
  agentDef: AgentDef,
  includeDelegate: boolean = false,
): ToolRegistry {
  const filtered = new ToolRegistry();
  const exclude = new Set(agentDef.excludeTools ?? []);

  for (const tool of registry.all()) {
    if (exclude.has(tool.id)) continue;
    if (tool.id === "delegate" && !includeDelegate) continue;
    filtered.register(tool);
  }

  return filtered;
}

export async function buildAgentSystemPrompt(
  agentDef: AgentDef,
  skillRegistry: SkillRegistry,
  memoryDir?: string,
): Promise<string> {
  // Use the canonical system prompt from system-prompt.ts as base
  let prompt = getSystemPrompt(agentDef.name);

  // Add agent-specific instructions on top
  prompt += `\n\n## Agent-Specific Instructions\n\n${agentDef.basePrompt}`;

  // Inject skill knowledge using two-tier architecture:
  // Tier 1: Skill SKILL.md body + compact index of companion files (always present)
  // Tier 2: On-demand retrieval via skill-query tool (no budget limit)
  if (agentDef.skills.length > 0) {
    for (const skillName of agentDef.skills) {
      const skillBody = skillRegistry.toPrompt(skillName);
      if (skillBody) {
        prompt += `\n\n${skillBody}`;
      }
      const index = skillRegistry.buildIndex(skillName);
      if (index) {
        prompt += `\n\n${index}`;
      }
    }
  }

  return prompt;
}

export async function runAgent(ctx: AgentRunContext): Promise<AgentLoopResult> {
  const {
    agentDef,
    provider,
    tools,
    toolContext,
    config,
    skillRegistry,
    initialObjective,
    onDelegate,
    onToken,
    onToolCall,
    onFlag,
    abortSignal,
    mcpLifecycle,
  } = ctx;

  const isPrimary = agentDef.mode === "primary";
  let filteredTools = filterToolsForAgent(tools, agentDef, isPrimary);

  if (mcpLifecycle && agentDef.mcpServers && agentDef.mcpServers.length > 0) {
    const allMcpTools = await mcpLifecycle.startAll(config);
    const agentMcpPrefixes = agentDef.mcpServers.map((s) => `${s}__`);
    for (const mcpTool of allMcpTools) {
      if (agentMcpPrefixes.some((prefix) => mcpTool.id.startsWith(prefix))) {
        filteredTools.register(mcpTool);
      }
    }
  }

  const system = await buildAgentSystemPrompt(agentDef, skillRegistry, ctx.memoryDir);

  const permissionCheck = buildPermissionCheck(agentDef, config);
  const fullToolContext: ToolContext = {
    ...toolContext,
    permissionCheck: async (tool: string, target: string) => {
      const action = permissionCheck(tool, target);
      return action !== "deny";
    },
    skillRegistry,
    activeSkills: agentDef.skills,
  };

  const delegateInterceptor = onDelegate
    ? async (tool: string, rawArgs: unknown): Promise<AgentLoopResult | void> => {
        if (tool === "delegate") {
          const args = rawArgs as { targetAgent: string; objective: string; context?: string };
          const req: DelegateRequest = {
            targetAgent: args.targetAgent,
            objective: args.objective,
            context: args.context ?? "",
          };
          return onDelegate(req);
        }
      }
    : undefined;

  const maxIterations = agentDef.maxSteps ?? config.agent.maxSteps;

  return runAgentLoop({
    provider,
    messages: ctx.messages ?? [{ role: "user", content: initialObjective }],
    system,
    tools: filteredTools,
    toolContext: fullToolContext,
    maxIterations,
    permissions: [...agentDef.permissions, ...(config.permissions?.rules ?? [])],
    harnessConfig: ctx.harnessConfig ?? config.harness,
    memoryConfig: ctx.memoryConfig ?? config.memory,
    initialObjective,
    onToken,
    onToolCall,
    onToolCallAsync: delegateInterceptor,
    onFlag,
    abortSignal,
  });
}
