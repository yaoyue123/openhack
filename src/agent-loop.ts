import { streamText, stepCountIs, type ModelMessage } from "ai";
import * as os from "node:os";
import * as path from "node:path";
import type { Provider } from "./llm/provider.js";
import type { ToolRegistry } from "./tool/registry.js";
import type { ToolContext } from "./tool/types.js";
import type { PermissionRule } from "./config/schema.js";
import type { HarnessConfig } from "./harness/types.js";
import type { MemoryConfig } from "./memory/types.js";
import { detectFlags } from "./tool/flag.js";
import { evaluate, type PermissionAction } from "./permission/evaluate.js";
import { Harness } from "./harness/index.js";
import { MemoryManager } from "./memory/index.js";
import { DEFAULT_HARNESS_CONFIG } from "./harness/types.js";
import { DEFAULT_MEMORY_CONFIG } from "./memory/types.js";

function getTargetPattern(toolId: string, args: Record<string, any>): string {
  if (toolId === "bash") return args.command ?? "";
  if (args.filePath) return String(args.filePath);
  if (args.pattern) return String(args.pattern);
  if (args.url) return String(args.url);
  return "*";
}

export interface AgentLoopOptions {
  provider: Provider;
  messages: ModelMessage[];
  system?: string;
  tools: ToolRegistry;
  toolContext: ToolContext;
  maxIterations?: number;
  permissions?: PermissionRule[];
  harnessConfig?: Partial<HarnessConfig>;
  memoryConfig?: Partial<MemoryConfig>;
  initialObjective?: string;
  onToken?: (token: string) => void;
  onToolCall?: (tool: string, args: unknown) => void;
  onToolCallAsync?: (tool: string, args: unknown) => Promise<AgentLoopResult | void>;
  onFlag?: (flag: string) => void;
}

export interface AgentLoopResult {
  messages: ModelMessage[];
  flags: string[];
  iterations: number;
  terminationReason: string;
}

export async function runAgentLoop(
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const {
    provider,
    system,
    tools,
    toolContext,
    maxIterations = 20,
    permissions = [],
    initialObjective,
    onToken,
    onToolCall,
    onToolCallAsync,
    onFlag,
  } = options;

  const harness = new Harness(options.harnessConfig);
  const memoryConfig = { ...DEFAULT_MEMORY_CONFIG, ...options.memoryConfig };

  const sessionId = toolContext.sessionId;
  const sessionDir = path.join(os.homedir(), ".openhack", "sessions");

  let memory: MemoryManager | null = null;
  if (memoryConfig.enabled) {
    memory = new MemoryManager(sessionDir, options.memoryConfig);
    await memory.ensureDir();
    if (initialObjective) {
      await memory.initState(initialObjective);
    }
  }

  const allFlags = new Set<string>();
  let iteration = 0;
  let shouldTerminate = false;
  let terminationReason = "";
  let pendingLoopWarning: string | null = null;

  const emitFlags = (text: string) => {
    const found = detectFlags(text);
    for (const f of found) {
      if (!allFlags.has(f)) {
        allFlags.add(f);
        onFlag?.(f);
      }
    }
  };

  const buildSystemPrompt = async (): Promise<string> => {
    let prompt = system ?? "";
    if (memory) {
      const state = await memory.readState();
      const findings = await memory.readFile("findings");
      const failedPaths = await memory.readFile("failed-paths");
      prompt += `\n\n## Current State\n${state}`;
      if (findings !== "(empty)") {
        prompt += `\n\n## Known Findings\n${findings}`;
      }
      if (failedPaths !== "(empty)") {
        prompt += `\n\n## Failed Paths (DO NOT retry these)\n${failedPaths}`;
      }
    }
    return prompt;
  };

  const buildAITools = (): Record<string, any> => {
    const aiTools: Record<string, any> = {};
    for (const tool of tools.all()) {
      aiTools[tool.id] = {
        description: tool.description,
        parameters: tool.parameters,
        execute: async (args: Record<string, unknown>) => {
          onToolCall?.(tool.id, args);

          if (onToolCallAsync && tool.id === "delegate") {
            const asyncResult = await onToolCallAsync(tool.id, args);
            if (asyncResult) {
              const delegateOutput = asyncResult.flags.length > 0
                ? `Delegation complete. Flags found: ${asyncResult.flags.join(", ")}`
                : `Delegation complete after ${asyncResult.iterations} iterations (${asyncResult.terminationReason})`;
              emitFlags(delegateOutput);
              shouldTerminate = true;
              terminationReason = "delegation_complete";
              return delegateOutput;
            }
          }

          if (permissions.length > 0) {
            const target = getTargetPattern(tool.id, args);
            const action: PermissionAction = evaluate(tool.id, target, permissions);
            if (action === "deny") {
              return "Permission denied";
            }
            if (action === "ask") {
              return "Permission requires confirmation (ask mode)";
            }
          }
          const result = await tool.execute(args, toolContext);
          let output = result.output ?? "";
          if (output.length > 10000) {
            output =
              output.slice(0, 10000) +
              `\n...(truncated, ${output.length} total bytes. Use grep/head/tail to get specific parts)`;
          }
          if (output) {
            emitFlags(output);
          }
          return output;
        },
      };
    }
    return aiTools;
  };

  let messages = [...options.messages];

  while (!shouldTerminate && iteration < maxIterations) {
    const systemPrompt = await buildSystemPrompt();
    const aiTools = buildAITools();

    let stepMessages: ModelMessage[] = [];
    let stepFullText = "";

    const result = streamText({
      model: provider.languageModel(),
      system: systemPrompt,
      messages,
      tools: aiTools,
      stopWhen: stepCountIs(Math.min(maxIterations - iteration, 10)),
      onStepFinish: async ({ response: stepResponse }) => {
        iteration++;
        stepMessages = stepResponse.messages;

        if (harness && memory) {
          const loopResult = harness.checkLoop(stepResponse.messages);
          if (loopResult.isLoop && loopResult.repeatCount >= harness.config.loop.maxRepeats) {
            pendingLoopWarning = loopResult.suggestion ?? null;
          }

          const stateContent = await memory.readState().catch(() => null);
          const termResult = harness.checkTermination(stepResponse.messages, stateContent);
          if (termResult.shouldTerminate) {
            shouldTerminate = true;
            terminationReason = termResult.reason ?? "unknown";
            return;
          }

          const budgetResult = harness.checkBudget(messages);
          if (budgetResult.shouldCompress && memory) {
            const compressed = await memory.compress(messages, harness.config.budget.preserveRecentSteps);
            messages = compressed.messages;
            await memory.appendLog(`Compressed: saved ${compressed.tokensSaved} tokens`);
          }
          if (budgetResult.action === "terminate") {
            shouldTerminate = true;
            terminationReason = "budget_exhausted";
            return;
          }
        }

        if (memory?.store) {
          const textParts = stepResponse.messages
            .filter((m: ModelMessage) => typeof m.content === "string")
            .map((m: ModelMessage) => (m.content as string).slice(0, 100))
            .join("; ");
          await memory.appendLog(`Step ${iteration}: ${textParts || "(tool call)"}`);
        }

        const fullText = stepResponse.messages
          .map((m: ModelMessage) => (typeof m.content === "string" ? m.content : ""))
          .join(" ");
        if (fullText) {
          stepFullText = fullText;
          emitFlags(fullText);
        }
      },
    });

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        onToken?.(part.text);
      }
    }

    const response = await result.response;
    messages = response.messages;

    if (pendingLoopWarning) {
      messages.push({
        role: "system",
        content: pendingLoopWarning,
      } as ModelMessage);
      pendingLoopWarning = null;
    }
  }

  if (!terminationReason) {
    terminationReason = `max_iterations_${iteration}`;
  }

  if (memory) {
    await memory.appendLog(`Terminated: ${terminationReason}`);
  }

  return {
    messages,
    flags: [...allFlags],
    iterations: iteration,
    terminationReason,
  };
}
