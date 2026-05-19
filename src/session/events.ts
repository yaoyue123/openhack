export type HackEvent =
  | { type: "FLAG_FOUND"; flag: string; source: string }
  | { type: "VULN_DISCOVERED"; vuln: string; severity: string; detail: string }
  | { type: "PHASE_CHANGE"; from: string; to: string }
  | { type: "TOOL_EXEC"; tool: string; args: string[]; exitCode: number }
  | { type: "SKILL_LOADED"; skill: string; mcpStarted: boolean }
  | { type: "AGENT_SWITCH"; from: string; to: string; reason: string }

export type EventCallback = (event: HackEvent) => void

export class EventBus {
  private listeners: EventCallback[] = []

  on(cb: EventCallback): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb)
    }
  }

  emit(event: HackEvent): void {
    for (const cb of this.listeners) cb(event)
  }
}
