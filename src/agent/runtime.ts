import * as os from "node:os";
import * as path from "node:path";
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
  onFlag?: (flag: string) => void;
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
  let prompt = `You are openhack, an AI agent specializing in CTF (Capture The Flag) security challenges.
You are currently running as the ${agentDef.name} specialist agent.

## State Management

You have a state file (state.md) that tracks your current objective, phase, and findings.
Update it after every significant action using the state-write tool.

Phases: recon → exploit → lateral → escalate → done
- recon: Gather information, enumerate targets, identify attack surface
- exploit: Attack specific vulnerabilities
- lateral: Move through the network to new targets
- escalate: Escalate privileges
- done: Challenge solved or all approaches exhausted

## Memory

You have persistent memory files:
- attack-log.md: Your actions are logged here automatically
- findings.md: Update this with key discoveries using memory-write
- failed-paths.md: Record failed approaches to avoid repeating them using memory-write

Read these files at the start of each session with memory-query and update them as you work.

## Methodology

For EVERY challenge, follow this structured approach:

1. **Reconnaissance**: List files with \`glob\`, run \`file\` on binaries, \`strings\` for clues
2. **Analysis**: Based on the category, apply appropriate techniques
3. **Exploitation**: Write a Python script to solve/decrypt/extract the flag
4. **Verification**: Use the \`flag\` tool to check your result

## Key Rules

- NEVER read challenge.json for the flag — that's the answer key, not the challenge
- ALWAYS update state.md after each significant step using state-write
- ALWAYS record failed approaches in failed-paths.md using memory-write
- ALWAYS record discoveries in findings.md using memory-write
- If stuck after 3 similar attempts, use the \`reflect\` tool to rethink your approach
- Keep tool outputs small — use \`head\`, \`tail\`, \`grep\` to filter large outputs
- When you find the flag, set Phase to "done" in state.md using state-write`;

  prompt += `\n\n## Agent-Specific Instructions\n\n${agentDef.basePrompt}`;

  if (agentDef.skills.length > 0) {
    for (const skillName of agentDef.skills) {
      const skillContent = skillRegistry.toPromptWithCompanions(skillName);
      if (skillContent) {
        prompt += `\n\n${skillContent}`;
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
  };

  const delegateInterceptor = onDelegate
    ? async (tool: string, rawArgs: unknown) => {
        onToolCall?.(tool, rawArgs);
        if (tool === "delegate" && onDelegate) {
          const args = rawArgs as { targetAgent: string; objective: string; context?: string };
          const req: DelegateRequest = {
            targetAgent: args.targetAgent,
            objective: args.objective,
            context: args.context ?? "",
          };
          const result = await onDelegate(req);
          return result;
        }
      }
    : onToolCall;

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
    onToolCall: typeof delegateInterceptor === "function" ? delegateInterceptor : onToolCall,
    onFlag,
  });
}
