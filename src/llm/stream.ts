import type { LanguageModelV3 } from "@ai-sdk/provider";
import { streamText } from "ai";

export interface StreamOptions {
  model: LanguageModelV3;
  system?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

export interface StreamEvent {
  type: "text" | "tool-call" | "done";
  content?: string;
  tool?: string;
  args?: unknown;
}

export async function* streamLLMResponse(
  options: StreamOptions,
): AsyncGenerator<StreamEvent> {
  const result = streamText({
    model: options.model,
    system: options.system,
    messages: options.messages,
  });

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      yield { type: "text", content: part.text };
    } else if (part.type === "tool-call") {
      yield {
        type: "tool-call",
        tool: part.toolName,
        args: part.input,
      };
    }
  }

  yield { type: "done" };
}
