export type HackEvent =
  | { type: "FLAG_FOUND"; flag: string; source: string }
  | { type: "VULN_DISCOVERED"; vuln: string; severity: string; detail: string }
  | { type: "PHASE_CHANGE"; from: string; to: string }
  | { type: "TOOL_EXEC"; tool: string; args: string[]; exitCode: number }
  | { type: "SKILL_LOADED"; skill: string; mcpStarted: boolean }
  | { type: "AGENT_SWITCH"; from: string; to: string; reason: string }
  | { type: "LOOP_DETECTED"; repeatCount: number; suggestion: string }
  | { type: "CONTEXT_COMPRESSED"; tokensSaved: number; messagesBefore: number; messagesAfter: number }
  | { type: "BUDGET_WARNING"; currentTokens: number; maxTokens: number }
  | { type: "HARNESS_TERMINATED"; reason: string; iteration: number }
  | { type: "STATE_UPDATED"; phase: string }
  | { type: "MEMORY_FILE_WRITTEN"; file: string; bytesWritten: number }

export type EventCallback = (event: HackEvent) => void
