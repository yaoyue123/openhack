import { AgentRegistry } from "./registry.js";
import type { AgentDef } from "./types.js";

const registry = AgentRegistry.create();

export function getAgent(name: string): AgentDef | undefined {
  return registry.get(name);
}

export function listAgents(): AgentDef[] {
  return registry.list();
}

export function getDefaultAgent(): AgentDef {
  return registry.getDefault();
}

export { registry };
