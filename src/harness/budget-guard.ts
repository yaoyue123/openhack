import type { ModelMessage } from "ai";
import type { BudgetConfig, BudgetGuardResult } from "./types.js";

export class BudgetGuard {
  private readonly config: BudgetConfig;

  constructor(config: BudgetConfig) {
    this.config = config;
  }

  check(messages: ModelMessage[], usageTokens?: number): BudgetGuardResult {
    const currentUsage =
      usageTokens ?? this.estimateTokens(messages);

    let action: BudgetGuardResult["action"];
    if (currentUsage >= this.config.maxTokens) {
      action = "terminate";
    } else if (currentUsage >= this.config.compressThreshold) {
      action = "compress";
    } else {
      action = "continue";
    }

    return {
      shouldCompress: action === "compress" || action === "terminate",
      currentUsage,
      action,
    };
  }

  private estimateTokens(messages: ModelMessage[]): number {
    let totalLength = 0;
    for (const msg of messages) {
      const content: string | Array<unknown> = msg.content as string | Array<unknown>;
      if (typeof content === "string") {
        totalLength += content.length;
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part === "string") {
            totalLength += part.length;
          } else if (
            typeof part === "object" &&
            part !== null &&
            "text" in part &&
            typeof (part as Record<string, unknown>).text === "string"
          ) {
            totalLength += ((part as Record<string, unknown>).text as string).length;
          } else if (
            typeof part === "object" &&
            part !== null &&
            "input" in part
          ) {
            totalLength += JSON.stringify((part as Record<string, unknown>).input).length;
          } else if (
            typeof part === "object" &&
            part !== null &&
            "result" in part
          ) {
            totalLength += JSON.stringify((part as Record<string, unknown>).result).length;
          }
        }
      }
    }
    return Math.ceil(totalLength / 4);
  }
}
