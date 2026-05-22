import type { AgentDef } from "./types.js";
import { BUILTIN_AGENTS } from "./definitions.js";
import { loadUserAgents } from "./loader.js";

export class AgentRegistry {
  private agents: Map<string, AgentDef> = new Map();

  static create(): AgentRegistry {
    const reg = new AgentRegistry();
    for (const def of BUILTIN_AGENTS) reg.agents.set(def.name, def);
    return reg;
  }

  static async createWithUserAgents(baseDir?: string): Promise<AgentRegistry> {
    const reg = AgentRegistry.create();
    const userAgents = await loadUserAgents(baseDir);
    for (const def of userAgents) {
      reg.agents.set(def.name, def);
    }
    return reg;
  }

  register(def: AgentDef): void {
    this.agents.set(def.name, def);
  }

  get(name: string): AgentDef | undefined {
    return this.agents.get(name);
  }

  list(): AgentDef[] {
    return [...this.agents.values()];
  }

  specialists(): AgentDef[] {
    return this.list().filter((a) => a.mode === "specialist");
  }

  getDefault(): AgentDef {
    const triage = this.agents.get("triage");
    if (!triage) throw new Error("No triage agent registered");
    return triage;
  }
}
