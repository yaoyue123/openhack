import { streamText, stepCountIs, type ModelMessage } from "ai";
import type { Provider } from "./provider.js";
import type { ToolRegistry } from "../tool/registry.js";
import type { ToolContext } from "../tool/types.js";
import type { PermissionRule } from "../config/schema.js";
import { detectFlags } from "../tool/flag.js";
import { evaluate, type PermissionAction } from "../permission/evaluate.js"

function getTargetPattern(toolId: string, args: Record<string, any>): string {
  if (toolId === "bash") return args.command ?? ""
  if (args.filePath) return args.filePath
  if (args.pattern) return args.pattern
  if (args.url) return args.url
  return "*"
}

export interface AgentLoopOptions {
  provider: Provider;
  messages: ModelMessage[];
  system?: string;
  tools: ToolRegistry;
  toolContext: ToolContext;
  maxIterations?: number;
  permissions?: PermissionRule[];
  onToken?: (token: string) => void;
  onToolCall?: (tool: string, args: any) => void;
  onFlag?: (flag: string) => void;
}

export async function runAgentLoop(
  options: AgentLoopOptions,
): Promise<ModelMessage[]> {
  const {
    provider,
    system,
    tools,
    toolContext,
    maxIterations = 20,
    permissions = [],
    onToken,
    onToolCall,
    onFlag,
  } = options;

  const allFlags = new Set<string>();

  const emitFlags = (text: string) => {
    const found = detectFlags(text);
    for (const f of found) {
      if (!allFlags.has(f)) {
        allFlags.add(f);
        onFlag?.(f);
      }
    }
  };

  const aiTools: Record<string, any> = {};
  for (const tool of tools.all()) {
    aiTools[tool.id] = {
      description: tool.description,
      parameters: tool.parameters,
      execute: async (args: Record<string, any>) => {
        onToolCall?.(tool.id, args);
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
        if (result.output) {
          emitFlags(result.output);
        }
        return result.output;
      },
    };
  }

  const result = streamText({
    model: provider.languageModel(),
    system,
    messages: options.messages,
    tools: aiTools,
    stopWhen: stepCountIs(maxIterations),
  });

  let fullText = "";
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      fullText += part.text;
      onToken?.(part.text);
    }
  }

  if (fullText) {
    emitFlags(fullText);
  }

  const response = await result.response;
  return response.messages;
}
