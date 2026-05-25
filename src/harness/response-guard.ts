import { createHash } from "node:crypto";
import type { ResponseGuardConfig, ResponseGuardResult } from "./types.js";

interface OutputSignature {
  toolId: string;
  outputHash: string;
  contentLength: number;
}

/**
 * Normalizes output for similarity comparison:
 * - Strips dynamic content (timestamps, random tokens)
 * - Collapses whitespace
 * - Truncates to first 2000 chars
 */
function normalizeOutput(output: string): string {
  return output
    .slice(0, 2000)
    .replace(/\d{10,}/g, "N")          // long numbers (timestamps, tokens)
    .replace(/\s+/g, " ")               // collapse whitespace
    .replace(/nonce="[^"]+"/gi, "")     // nonce values
    .replace(/csrf[^&\s"']+/gi, "")     // CSRF tokens
    .trim()
    .toLowerCase();
}

/**
 * Tool-specific suggestion templates for stuck detection.
 */
const TOOL_SUGGESTIONS: Record<string, string[]> = {
  webfetch: [
    "Use bash with curl -v for verbose HTTP headers and redirect chains",
    "Check HTML comments, CSS comments, and JavaScript for hidden clues",
    "Try different URL parameters (e.g., ?source, ?debug, ?show_source)",
    "Use python to construct specific payloads (serialized data, encoded strings)",
  ],
  bash: [
    "Try a different command or add -v/--verbose flags for more information",
    "Check if the command output contains useful error messages",
    "Use python for more complex processing of the data",
  ],
  python: [
    "Check for syntax errors or import failures in your script",
    "Try a different approach to the problem",
    "Use bash to install missing packages (pip install)",
  ],
};

export class ResponseGuard {
  private readonly config: ResponseGuardConfig;
  private readonly window: OutputSignature[] = [];

  constructor(config: ResponseGuardConfig) {
    this.config = config;
  }

  /**
   * Check if recent tool outputs indicate the agent is stuck.
   * Call after each tool execution with the tool ID and output.
   */
  check(toolId: string, output: string): ResponseGuardResult {
    const normalized = normalizeOutput(output);
    const hash = createHash("sha256").update(normalized).digest("hex");

    this.window.push({ toolId, outputHash: hash, contentLength: output.length });
    while (this.window.length > this.config.windowSize) {
      this.window.shift();
    }

    // Count consecutive identical outputs for the same tool
    const recentSame = this.window.filter(
      (w) => w.toolId === toolId && w.outputHash === hash,
    );

    if (recentSame.length >= this.config.maxIdenticalOutputs) {
      return {
        isStuck: true,
        suggestion: this.generateSuggestion(toolId, recentSame.length),
      };
    }

    return { isStuck: false };
  }

  private generateSuggestion(toolId: string, repeatCount: number): string {
    const suggestions = TOOL_SUGGESTIONS[toolId] ?? [
      "Try a completely different approach",
      "Use the reflect tool to reconsider your strategy",
    ];

    const picked = suggestions.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join("\n");

    return [
      `[STUCK DETECTED] Your last ${repeatCount} ${toolId} calls returned nearly identical responses.`,
      "You are likely repeating the same action. Try a different approach:",
      picked,
    ].join("\n");
  }
}
