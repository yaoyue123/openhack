import { streamText, stepCountIs, type ModelMessage } from "ai";
import * as os from "node:os";
import * as path from "node:path";
import type { Provider } from "./llm/provider.js";
import type { ToolRegistry } from "./tool/registry.js";
import type { ToolContext } from "./tool/types.js";
import type { PermissionRule } from "./config/schema.js";
import type { HarnessConfig } from "./harness/types.js";
import type { MemoryConfig } from "./memory/types.js";
import { estimateTokens } from "./llm/token-counter.js";
import { detectFlags } from "./tool/flag.js";
import { evaluate, type PermissionAction } from "./permission/evaluate.js";
import { Harness } from "./harness/index.js";
import type { ExtractedValue } from "./harness/value-extractor.js";
import { MemoryManager } from "./memory/index.js";
import { DEFAULT_HARNESS_CONFIG } from "./harness/types.js";
import { DEFAULT_MEMORY_CONFIG } from "./memory/types.js";
import type { PauseController } from "./agent/pause-controller.js";
import type { HackEvent, EventCallback } from "./session/events.js";

/**
 * Sliding window trim: remove oldest user/assistant message pairs
 * when total pairs exceed maxPairs.
 * Preserves system messages, compressed summaries, and flag-containing messages.
 */
function trimMessages(
  messages: ModelMessage[],
  maxPairs: number,
  minPreserve: number,
): ModelMessage[] {
  // Count user messages (pairs)
  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") {
      userIndices.push(i);
    }
  }

  if (userIndices.length <= maxPairs) return messages;

  // Don't trim more than (userCount - minPreserve)
  const toRemove = userIndices.length - maxPairs;
  const actualRemove = Math.min(toRemove, userIndices.length - minPreserve);
  if (actualRemove <= 0) return messages;

  // Find the cutoff index: after the (actualRemove)-th user message
  const cutoffUserIndex = userIndices[actualRemove - 1];
  // Include the assistant response that follows the last removed user message
  const cutoffIndex = cutoffUserIndex + 1;
  // Ensure we don't cut in the middle of a pair (check if next message is assistant)
  const nextIsAssistant = cutoffIndex < messages.length && messages[cutoffIndex]?.role === "assistant";

  // Keep from cutoff (plus assistant response) onward + any non-pair system messages at the start
  const keepFrom = nextIsAssistant ? cutoffIndex - 1 : cutoffIndex;

  return messages.slice(keepFrom);
}

/**
 * Detect garbled DSML output from models that fail function calling.
 * DeepSeek models sometimes emit proprietary ＜｜DSML｜ tags instead of proper tool calls.
 * Matches fullwidth and ASCII variations: ＜｜DSML｜, <|DSML|, ＜|DSML|, <｜DSML｜
 */
function isGarbledDSML(text: string): boolean {
  return /＜｜DSML｜|<\|DSML\||＜\|DSML\||<｜DSML｜/u.test(text);
}

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
  onFlag?: (flag: string) => void | Promise<void>;
  abortSignal?: AbortSignal;
  /** Pause controller for REPL mode. When provided, the loop pauses after maxStepsPerRun iterations. */
  pauseController?: PauseController;
  /** If set, force tool choice on the first iteration (e.g. "none" for greetings). Cleared after first call. */
  initialToolChoice?: "none" | "auto" | "required";
  /** Event callback for session timeline events */
  onEvent?: EventCallback;
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
    initialToolChoice,
    onEvent,
  } = options;

  const harness = new Harness(options.harnessConfig);
  const memoryConfig = { ...DEFAULT_MEMORY_CONFIG, ...options.memoryConfig };

  const sessionId = toolContext.sessionId ?? "default";
  const sessionDir = path.join(os.homedir(), ".openhack", "sessions", sessionId);

  let memory: MemoryManager | null = null;
  if (memoryConfig.enabled) {
    memory = new MemoryManager(sessionDir, options.memoryConfig);
    await memory.ensureDir();
    if (initialObjective) {
      await memory.initState(initialObjective);
    }
  }

  const allFlags = new Set<string>();
  const allExtractedValues: ExtractedValue[] = [];
  let iteration = 0;
  let shouldTerminate = false;
  let terminationReason = "";
  let pendingLoopWarning: string | null = null;

  const emitFlags = async (text: string) => {
    const found = detectFlags(text);
    for (const f of found) {
      if (!allFlags.has(f)) {
        allFlags.add(f);
        await onFlag?.(f);
      }
    }
  };

  const buildSystemPrompt = async (): Promise<string> => {
    let prompt = system ?? "";
    if (memory) {
      const state = await memory.readState();
      const findings = await memory.readFile("findings");
      const failedPaths = await memory.readFile("failed-paths");
      const plan = await memory.readFile("attack-plan");
      prompt += `\n\n## Current State\n${state}`;
      if (findings !== "(empty)") {
        prompt += `\n\n## Known Findings\n${findings}`;
      }
      if (failedPaths !== "(empty)") {
        prompt += `\n\n## Failed Paths (DO NOT retry these)\n${failedPaths}`;
      }
      if (plan !== "(empty)" && plan.length > 50) {
        prompt += `\n\n## Attack Plan\n${plan}`;
      }
      if (allExtractedValues.length > 0) {
        const formatted = harness.valueExtractor.formatAsMarkdown(allExtractedValues);
        if (formatted) {
          prompt += `\n\n## Extracted Values (auto-extracted from tool outputs)\n${formatted}`;
        }
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
              await emitFlags(delegateOutput);
              shouldTerminate = true;
              terminationReason = "delegation_complete";
              return delegateOutput;
            }
          }

          if (permissions.length > 0) {
            const target = getTargetPattern(tool.id, args);
            const action: PermissionAction = evaluate(tool.id, target, permissions);
            if (action === "deny") {
              return `Permission denied: tool "${tool.id}" on "${target}" is not allowed`;
            }
            if (action === "ask") {
              // In REPL mode, try to prompt user for confirmation
              if (options.pauseController && typeof options.pauseController.askConfirm === "function") {
                try {
                  const confirmed = await options.pauseController.askConfirm(
                    `Allow ${tool.id}(${args.command ?? args.filePath ?? args.pattern ?? "..."})?`,
                  );
                  if (!confirmed) {
                    return `Permission denied by user: ${tool.id}`;
                  }
                } catch {
                  return `Permission requires interactive confirmation (${tool.id})`;
                }
              } else {
                return `Permission requires confirmation for: ${tool.id} on "${target}". Set permission rule to "allow" to skip this.`;
              }
            }
          }
           const result = await tool.execute(args, toolContext);

          // Special handling: skill-query needs the skill registry
          let output = result.output ?? "";
          if (tool.id === "skill-query" && toolContext.skillRegistry && toolContext.activeSkills) {
            const topics = args.topics as string[] | undefined;
            if (topics && Array.isArray(topics) && topics.length > 0) {
              let queryResult = "";
              for (const skillName of toolContext.activeSkills) {
                const section = toolContext.skillRegistry.query(skillName, topics);
                if (section) {
                  queryResult += (queryResult ? "\n\n---\n\n" : "") + section;
                }
              }
              output = queryResult || `No matching knowledge found for topics: ${topics.join(", ")}. Try different keywords or check the skill index in your system prompt.`;
            }
          }
          if (output.length > 10000) {
            output =
              output.slice(0, 10000) +
              `\n...(truncated, ${output.length} total bytes. Use grep/head/tail to get specific parts)`;
          }
          onEvent?.({ type: "TOOL_EXEC", tool: tool.id, args: Object.values(args).map(String), exitCode: 0 });
          if (output) {
            await emitFlags(output);

            // Response stuck detection
            if (harness) {
              const responseResult = harness.checkResponse(tool.id, output);
              if (responseResult.isStuck && responseResult.suggestion) {
                if (!pendingLoopWarning) {
                  pendingLoopWarning = responseResult.suggestion;
                }
              }
            }

            // Auto-extract values from tool output
            if (harness && output.length > 50) {
              const values = harness.extractValues(tool.id, args as Record<string, unknown>, output);
              for (const v of values) {
                // Deduplicate by (category, key)
                const exists = allExtractedValues.some(
                  e => e.category === v.category && e.key === v.key && e.value === v.value,
                );
                if (!exists) allExtractedValues.push(v);
              }
            }
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

    // Only apply initialToolChoice on iteration 0, then allow tools normally
    const toolChoice = iteration === 0 ? initialToolChoice : undefined;

    const result = streamText({
        model: provider.languageModel(),
        system: systemPrompt,
        messages,
        tools: aiTools,
        ...(toolChoice ? { toolChoice } : {}),
        abortSignal: options.abortSignal,
        stopWhen: stepCountIs(1),
        onStepFinish: async ({ response: stepResponse }) => {
          iteration++;
          stepMessages = stepResponse.messages;

        if (harness && memory) {
          const loopResult = harness.checkLoop(
            stepResponse.messages,
            await memory.readFile("failed-paths").catch(() => null),
            await memory.readFile("findings").catch(() => null),
          );
          if (loopResult.isLoop && loopResult.repeatCount >= harness.config.loop.maxRepeats) {
            pendingLoopWarning = loopResult.suggestion ?? null;
            onEvent?.({ type: "LOOP_DETECTED", repeatCount: loopResult.repeatCount, suggestion: loopResult.suggestion ?? "" });
          }

          const stateContent = await memory.readState().catch(() => null);
          const termResult = harness.checkTermination(stepResponse.messages, stateContent);
          if (termResult.shouldTerminate) {
            shouldTerminate = true;
            terminationReason = termResult.reason ?? "unknown";
            return;
          }

          // PlanGuard: recommend structured plan after recon phase
          if (memory) {
            const planContent = await memory.readFile("attack-plan").catch(() => null);
            const planResult = harness.checkPlan(stepResponse.messages, planContent);
            if (planResult.needsPlan && planResult.suggestion) {
              // Inject plan suggestion as assistant message
              messages.push({ role: "assistant", content: [{ type: "text", text: planResult.suggestion }] });
              onEvent?.({ type: "SYSTEM_MESSAGE", message: "PlanGuard: suggesting attack plan creation" });
            }
          }

          const budgetResult = harness.checkBudget(messages);
          if (budgetResult.action === "terminate") {
            shouldTerminate = true;
            terminationReason = "budget_exhausted";
            onEvent?.({ type: "HARNESS_TERMINATED", reason: "budget_exhausted", iteration });
            return;
          }
          if (budgetResult.action === "proactive" || budgetResult.action === "compress") {
            const estTokens = estimateTokens(messages.map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join(""));
            onEvent?.({ type: "BUDGET_WARNING", currentTokens: estTokens, maxTokens: harness.config.budget.maxTokens });
          }
          if ((budgetResult.action === "compress" || budgetResult.action === "proactive") && memory) {
            const compressed = await memory.compress(messages, harness.config.budget.preserveRecentSteps);
            const msgsBefore = messages.length;
            messages = compressed.messages;
            const actionLabel = budgetResult.action === "proactive" ? "Proactive compress" : "Compressed";
            await memory.appendLog(`${actionLabel}: saved ${compressed.tokensSaved} tokens (${compressed.messages.length} msgs)`);
            onEvent?.({ type: "CONTEXT_COMPRESSED", tokensSaved: compressed.tokensSaved, messagesBefore: msgsBefore, messagesAfter: compressed.messages.length });
          }
        }

        if (memory?.store) {
          // Extract tool call info for better logging
          const toolCalls = stepResponse.messages
            .filter((m: ModelMessage) => m.role === "tool")
            .map((m: ModelMessage) => {
              const content = typeof m.content === "string" ? m.content : "";
              const preview = content.slice(0, 80).replace(/\n/g, " ");
              return preview;
            });
          const textParts = stepResponse.messages
            .filter((m: ModelMessage) => typeof m.content === "string" && m.role !== "tool")
            .map((m: ModelMessage) => (m.content as string).slice(0, 100))
            .join("; ");

          const logEntry = toolCalls.length > 0
            ? `Step ${iteration}: [tool result] ${toolCalls.join("; ")}`
            : `Step ${iteration}: ${textParts || "(no output)"}`;
          await memory.appendLog(logEntry);
        }

        const fullText = stepResponse.messages
          .map((m: ModelMessage) => (typeof m.content === "string" ? m.content : ""))
          .join(" ");
        if (fullText) {
          stepFullText = fullText;
          await emitFlags(fullText);
        }
      },
    });

    try {
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          onToken?.(part.text);
        }
      }

      // --- DSML garbled output detection ---
      if (isGarbledDSML(stepFullText)) {
        if (memory) {
          await memory.appendLog(`DSML garbled output detected at iteration ${iteration}, injecting recovery message`);
        }
        // Discard the garbled response; inject a recovery message instead
        messages.push({
          role: "user",
          content: "Your last response contained garbled DSML tags instead of proper tool calls. This is a formatting error. Please retry your request using the standard tool call format. For computations, use the python tool with a `code` parameter.",
        } as ModelMessage);
        continue; // skip the rest of this iteration
      }
      // --- END DSML detection ---

      const response = await result.response;
      messages = response.messages;
    } catch (err: unknown) {
      const errName = (err as Error).name;
      // AbortError is expected when user stops
      if (errName === "AbortError") {
        shouldTerminate = true;
        terminationReason = "user_abort";
        break;
      }
      // Log the error and continue with what we have
      const errMsg = (err as Error).message || String(err);
      if (memory) {
        await memory.appendLog(`LLM error at iteration ${iteration}: ${errMsg}`);
      }
      // If we have no messages to continue with, terminate
      if (messages.length === 0) {
        shouldTerminate = true;
        terminationReason = `llm_error: ${errMsg}`;
      }
      continue;
    }

    // Apply sliding window trim if messages are too long
    const trimmedCount = messages.length;
    messages = trimMessages(
      messages,
      harness.config.budget.maxMessagePairs ?? 50,
      harness.config.budget.minPreservePairs ?? 10,
    );
    if (messages.length < trimmedCount && memory) {
      await memory.appendLog(`Trimmed: removed ${trimmedCount - messages.length} old messages (window: ${messages.length})`);
    }

    if (pendingLoopWarning) {
      messages.push({
        role: "system",
        content: pendingLoopWarning,
      } as ModelMessage);
      pendingLoopWarning = null;
    }

    // --- Pause checkpoint (REPL mode only) ---
    if (options.pauseController && !shouldTerminate) {
      if (options.pauseController.shouldPause()) {
        try {
          const action = await options.pauseController.waitForResume();
          if (action === "stop") {
            shouldTerminate = true;
            terminationReason = "user_stop";
          } else if (typeof action === "object" && "redirect" in action) {
            // Inject redirect message into conversation
            messages.push({ role: "user", content: action.redirect } as ModelMessage);
          }
          // "continue" → loop proceeds normally
        } catch (err) {
          // Abort during pause — propagate
          if ((err as Error).name === "AbortError") throw err;
          // Other errors during pause — terminate gracefully
          shouldTerminate = true;
          terminationReason = "pause_error";
        }
      }
    }
    // --- END pause checkpoint ---
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
