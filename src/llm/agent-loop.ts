import { streamText, type ModelMessage } from "ai";
import type { ToolCallPart, ToolResultPart } from "@ai-sdk/provider-utils";
import type { Provider } from "./provider.js";
import type { ToolRegistry } from "../tool/registry.js";
import type { ToolContext } from "../tool/types.js";
import { detectFlags } from "../tool/flag.js";

export interface AgentLoopOptions {
  provider: Provider;
  messages: ModelMessage[];
  system?: string;
  tools: ToolRegistry;
  toolContext: ToolContext;
  maxIterations?: number;
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
    onToken,
    onToolCall,
    onFlag,
  } = options;

  const messages = [...options.messages];
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

  for (let i = 0; i < maxIterations; i++) {
    const aiTools: Record<string, any> = {};
    for (const tool of tools.all()) {
      aiTools[tool.id] = {
        description: tool.description,
        parameters: tool.parameters,
        execute: async (args: Record<string, any>) => {
          onToolCall?.(tool.id, args);
          const result = await tool.execute(args, toolContext);
          if (result.output) {
            emitFlags(result.output);
          }
          return result;
        },
      };
    }

    const result = streamText({
      model: provider.languageModel(),
      system,
      messages,
      tools: aiTools,
    });

    let assistantText = "";
    const toolCallParts: ToolCallPart[] = [];
    const toolResultParts: ToolResultPart[] = [];

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        assistantText += part.text;
        onToken?.(part.text);
      } else if (part.type === "tool-call") {
        toolCallParts.push({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
      } else if (part.type === "tool-result") {
        toolResultParts.push({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.output,
        } as ToolResultPart);
      }
    }

    if (assistantText) {
      emitFlags(assistantText);
    }

    const assistantContent: any[] = [];
    if (assistantText) {
      assistantContent.push({ type: "text", text: assistantText });
    }
    assistantContent.push(...toolCallParts);

    messages.push({
      role: "assistant",
      content: assistantContent,
    });

    if (toolCallParts.length === 0) {
      break;
    }

    for (const tr of toolResultParts) {
      messages.push({
        role: "tool",
        content: [tr],
      });
    }
  }

  return messages;
}
