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
  private readonly usedApproaches: string[] = [];

  constructor(config: LoopGuardConfig) {
    this.config = config;
  }

  check(
    messages: ModelMessage[],
    failedPaths?: string | null,
    findings?: string | null,
  ): LoopGuardResult {
    const allSignatures = extractToolCallSignatures(messages);
    const currentTools = new Set<string>();
    let currentApproachDesc = "";

    this.signatureWindow.push(...allSignatures);
    while (this.signatureWindow.length > this.config.windowSize) {
      this.signatureWindow.shift();
    }

    // Track current tools used in this check
    for (const sig of allSignatures) {
      currentTools.add(sig.toolName);
    }
    // Build an approach description based on current tool calls
    const toolList = [...currentTools].join(", ");
    const approachKey = toolsToApproachKey([...currentTools], allSignatures);

    if (allSignatures.length > 0) {
      this.usedApproaches.push(approachKey);
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

    let suggestion: string | undefined;
    if (isLoop) {
      suggestion = buildLoopSuggestion(toolList, failedPaths, findings, this.usedApproaches);
    }

    return {
      isLoop,
      repeatCount: maxRepeatCount,
      suggestion,
    };
  }
}

/**
 * Convert a set of tools + args into an approach key for deduplication.
 */
function toolsToApproachKey(
  toolNames: string[],
  signatures: ToolCallSignature[],
): string {
  const sorted = [...toolNames].sort();
  const sigSuffix = signatures.length > 0
    ? signatures[signatures.length - 1].rawArgs.slice(0, 60)
    : "";
  return `${sorted.join(",")}:${sigSuffix}`;
}

/**
 * Build a context-aware suggestion when a loop is detected.
 * Cross-references failed-paths and findings to suggest untried approaches.
 */
function buildLoopSuggestion(
  currentTools: string,
  failedPaths: string | null | undefined,
  findings: string | null | undefined,
  usedApproaches: string[],
): string {
  const parts: string[] = [
    "WARNING: You appear to be repeating the same approach. Please try a completely different method.",
    "",
    `Current tool pattern: ${currentTools}`,
    `Attempts made so far: ${usedApproaches.length}`,
    "",
  ];

  // Parse failed paths for specific URLs or approaches to avoid
  const failedUrls: string[] = [];
  const failedMethods: string[] = [];
  if (failedPaths && failedPaths !== "(empty)") {
    const lines = failedPaths.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const content = trimmed.slice(2);
        if (content.startsWith("http")) {
          failedUrls.push(content);
        } else {
          failedMethods.push(content);
        }
      }
    }
  }

  if (failedUrls.length > 0) {
    parts.push("**URLs/PATHS already checked (avoid repeating):**");
    for (const url of failedUrls.slice(0, 5)) {
      parts.push(`  - ${url}`);
    }
    parts.push("");
  }

  if (failedMethods.length > 0) {
    parts.push("**Methods already tried (avoid repeating):**");
    for (const method of failedMethods.slice(0, 5)) {
      parts.push(`  - ${method}`);
    }
    parts.push("");
  }

  // Parse findings to suggest alternative attack vectors from extracted values
  if (findings && findings !== "(empty)") {
    const findingLines = findings.split("\n");
    const techFindings = findingLines.filter(
      l => l.includes("PHP") || l.includes("SQL") || l.includes("injection")
        || l.includes("XSS") || l.includes("LFI") || l.includes("RCE")
        || l.includes("SSRF") || l.includes("SSTI") || l.includes("IDOR")
        || l.includes("deserialize") || l.includes("upload"),
    );
    if (techFindings.length > 0) {
      parts.push("**Potential attack vectors from findings (untried?):**");
      for (const f of techFindings.slice(0, 3)) {
        parts.push(`  - ${f.trim()}`);
      }
      parts.push("");
    }
  }

  parts.push("**Suggested strategy change:**");
  parts.push("  1. If you've been brute-forcing → switch to analyzing source code");
  parts.push("  2. If you've been reading source → switch to probing endpoints");
  parts.push("  3. If you've been probing one endpoint → try a different attack surface");
  parts.push("  4. Use `memory-query(name='extracted-values')` to review auto-extracted data");
  parts.push("  5. Use `memory-write(name='attack-plan', ...)` to create a structured plan");

  return parts.join("\n");
}
