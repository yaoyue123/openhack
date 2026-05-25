import type { ModelMessage } from "ai";

export interface PlanGuardResult {
  needsPlan: boolean;
  suggestion?: string;
}

/**
 * PlanGuard forces the agent to create an attack plan after initial recon.
 * If the agent has completed reconnaissance (checked 1+ URLs or read challenge files)
 * but has no attack plan, it injects a message asking for a structured plan.
 */
export class PlanGuard {
  check(messages: ModelMessage[], planContent: string | null): PlanGuardResult {
    // If plan already exists, don't interfere
    if (planContent && planContent.length > 50 && planContent.includes("## Attack Steps")) {
      return { needsPlan: false };
    }

    // Count iterations: if agent has made tool calls but no plan exists
    let toolCallCount = 0;
    let webfetchCount = 0;
    let readCount = 0;

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const content = typeof msg.content === "string" ? [] :
        Array.isArray(msg.content) ? msg.content : [];

      for (const part of content) {
        if (typeof part === "object" && part !== null && "type" in part && part.type === "tool-call") {
          toolCallCount++;
          const tc = part as { toolName: string };
          if (tc.toolName === "webfetch") webfetchCount++;
          if (tc.toolName === "read") readCount++;
        }
      }
    }

    // After 3+ tool calls (recon phase completed), if no plan exists, suggest one
    const hasDoneRecon = webfetchCount >= 1 || readCount >= 1;
    if (hasDoneRecon && toolCallCount >= 3) {
      return {
        needsPlan: true,
        suggestion: [
          "[PLAN REQUIRED] You've completed initial reconnaissance. Before continuing with exploitation, create a structured attack plan using memory-write.",
          "",
          "Write a plan to `attack-plan` (use memory-write(name='attack-plan', content=...)) with this structure:",
          "  # Attack Plan",
          "  ## Hypothesis",
          "  [Your best guess about the vulnerability type]",
          "  ## Attack Steps",
          "  1. [ ] Step 1: [description] → expected: [what success looks like]",
          "  2. [ ] Step 2: [description] → expected: [...]",
          "  ## Fallback Strategies",
          "  - If [X] fails: try [Y]",
          "  - If [Y] fails: try [Z]",
          "  ## Extracted Values",
          "  - [key: value]",
        ].join("\n"),
      };
    }

    return { needsPlan: false };
  }
}
