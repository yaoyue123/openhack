/** Agent status for the spinner display */
export type AgentStatus =
  | "idle"
  | "thinking"
  | "reading"
  | "executing"
  | "writing"
  | "analyzing";

/** Tool call display status */
export type ToolCallStatus = "pending" | "success" | "error";

/** Maps tool IDs to their display status */
export const TOOL_STATUS_MAP: Record<string, AgentStatus> = {
  read: "reading",
  glob: "reading",
  grep: "reading",
  bash: "executing",
  python: "executing",
  write: "writing",
  edit: "writing",
};

/** Get the agent status for a given tool ID */
export function getToolStatus(toolId: string): AgentStatus {
  return TOOL_STATUS_MAP[toolId] ?? "analyzing";
}

/**
 * Agent run state — discriminated union.
 * Replaces the previous dual-boolean (isStreaming + isPaused) approach.
 * Impossible states are unrepresentable by construction.
 */
export type AgentRunState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "paused"; stepIndex: number; maxSteps: number }
  | { state: "error"; error: string };

/** Step context data for the status bar */
export interface StepContext {
  iteration: number;
  maxSteps: number;
  toolCallCount: number;
  phase?: string;
}
