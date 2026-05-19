import { AGENTS, type AgentDef } from "./types.js";

export function getAgent(name: string): AgentDef | undefined {
  return AGENTS[name];
}

export function listAgents(): AgentDef[] {
  return Object.values(AGENTS);
}

export function getDefaultAgent(): AgentDef {
  return AGENTS.triage;
}
