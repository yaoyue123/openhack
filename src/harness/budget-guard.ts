import type { ModelMessage } from "ai";
import type { BudgetConfig, BudgetGuardResult } from "./types.js";
import { estimateTokens } from "../llm/token-counter.js";

export class BudgetGuard {
  private readonly config: BudgetConfig;

  constructor(config: BudgetConfig) {
    this.config = config;
  }

  /** The tokenizer model name used for token estimation (from config or default). */
  get tokenizerModel(): string {
    return this.config.tokenizerModel ?? "gpt-4o";
  }

  check(messages: ModelMessage[], usageTokens?: number): BudgetGuardResult {
    const currentUsage =
      usageTokens ?? this.estimateTokens(messages);

    const proactiveLimit = this.config.proactiveThreshold
      ? Math.floor(this.config.maxTokens * this.config.proactiveThreshold)
      : 0;

    let action: BudgetGuardResult["action"];
    if (currentUsage >= this.config.maxTokens) {
      action = "terminate";
    } else if (currentUsage >= this.config.compressThreshold) {
      action = "compress";
    } else if (proactiveLimit > 0 && currentUsage >= proactiveLimit) {
      action = "proactive";
    } else {
      action = "continue";
    }

    return {
      shouldCompress: action === "compress" || action === "terminate" || action === "proactive",
      currentUsage,
      action,
    };
  }

  private estimateTokens(messages: ModelMessage[]): number {
    const texts: string[] = [];
    for (const msg of messages) {
      const content: string | Array<unknown> = msg.content as string | Array<unknown>;
      if (typeof content === "string") {
        texts.push(content);
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part === "string") {
            texts.push(part);
          } else if (
            typeof part === "object" &&
            part !== null &&
            "text" in part &&
            typeof (part as Record<string, unknown>).text === "string"
          ) {
            texts.push((part as Record<string, unknown>).text as string);
          } else if (
            typeof part === "object" &&
            part !== null &&
            "input" in part
          ) {
            texts.push(JSON.stringify((part as Record<string, unknown>).input));
          } else if (
            typeof part === "object" &&
            part !== null &&
            "result" in part
          ) {
            texts.push(JSON.stringify((part as Record<string, unknown>).result));
          }
        }
      }
    }
    return estimateTokens(texts.join("\n"), this.tokenizerModel);
  }
}
