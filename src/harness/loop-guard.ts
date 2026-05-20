import { createHash } from "node:crypto";
import type { ModelMessage } from "ai";
import type { LoopGuardConfig, LoopGuardResult } from "./types.js";

interface ToolCallSignature {
  toolName: string;
  argsHash: string;
  rawArgs: string;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s,.\-{}()[\]"';:<>\/\\|!@#$%^&*+=~`]+/)
      .filter((t) => t.length > 0),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function extractToolCallSignatures(
  messages: ModelMessage[],
): ToolCallSignature[] {
  const signatures: ToolCallSignature[] = [];

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const content =
      typeof msg.content === "string" ? [] : Array.isArray(msg.content) ? msg.content : [];

    for (const part of content) {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "tool-call"
      ) {
        const toolCall = part as {
          toolName: string;
          toolCallId: string;
          input: unknown;
        };
        const rawArgs = JSON.stringify(toolCall.input ?? {});
        const argsHash = createHash("sha256")
          .update(toolCall.toolName + ":" + rawArgs)
          .digest("hex");
        signatures.push({
          toolName: toolCall.toolName,
          argsHash,
          rawArgs,
        });
      }
    }
  }

  return signatures;
}

export class LoopGuard {
  private readonly config: LoopGuardConfig;
  private readonly signatureWindow: ToolCallSignature[] = [];

  constructor(config: LoopGuardConfig) {
    this.config = config;
  }

  check(messages: ModelMessage[]): LoopGuardResult {
    const allSignatures = extractToolCallSignatures(messages);

    this.signatureWindow.push(...allSignatures);
    while (this.signatureWindow.length > this.config.windowSize) {
      this.signatureWindow.shift();
    }

    if (this.signatureWindow.length === 0) {
      return { isLoop: false, repeatCount: 0 };
    }

    let maxRepeatCount = 1;
    const groups = new Map<string, ToolCallSignature[]>();

    for (const sig of this.signatureWindow) {
      const existing = groups.get(sig.toolName);
      if (existing) {
        existing.push(sig);
      } else {
        groups.set(sig.toolName, [sig]);
      }
    }

    for (const [, group] of groups) {
      if (group.length < 2) continue;

      let repeatCount = 1;
      for (let i = 1; i < group.length; i++) {
        const tokensA = tokenize(group[i - 1].rawArgs);
        const tokensB = tokenize(group[i].rawArgs);
        const sim = jaccardSimilarity(tokensA, tokensB);
        if (sim >= this.config.similarityThreshold) {
          repeatCount++;
        } else {
          repeatCount = 1;
        }
      }
      if (repeatCount > maxRepeatCount) {
        maxRepeatCount = repeatCount;
      }
    }

    const isLoop = maxRepeatCount >= this.config.maxRepeats;

    return {
      isLoop,
      repeatCount: maxRepeatCount,
      suggestion:
        isLoop
          ? "你似乎在重复相同的操作。请尝试完全不同的方法。"
          : undefined,
    };
  }
}
