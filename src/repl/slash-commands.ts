import { estimateTokens } from "../llm/token-counter.js";

export interface SlashContext {
  addOutput: (text: string) => void;
  getProvider: () => import("../llm/provider.js").Provider;
  setProvider: (provider: import("../llm/provider.js").Provider) => void;
  getSession: () => import("../session/store.js").Session | null;
  setSession: (session: import("../session/store.js").Session) => void;
  getAgentName: () => string;
  setAgentName: (name: string) => void;
  getMessages: () => unknown[];
  getConfig: () => import("../config/schema.js").OpenhackConfig;
  exit: () => void;
}

export interface SlashCommand {
  name: string;
  description: string;
  usage?: string;
  execute(ctx: SlashContext, args: string): Promise<void>;
}

export class SlashCommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd);
  }

  tryParse(input: string): SlashCommand | null {
    if (!input.startsWith("/")) return null;
    const name = input.slice(1).split(/\s+/)[0] ?? "";
    return this.commands.get(name) ?? null;
  }

  parseArgs(input: string): { command: string; args: string } | null {
    if (!input.startsWith("/")) return null;
    const parts = input.slice(1).split(/\s+/);
    const command = parts[0] ?? "";
    const args = parts.slice(1).join(" ");
    return { command, args };
  }

  list(): SlashCommand[] {
    return [...this.commands.values()];
  }
}

export function createBuiltinSlashCommands(): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();

  registry.register({
    name: "help",
    description: "Show available commands",
    async execute(ctx) {
      const commands = registry.list();
      ctx.addOutput("Available commands:");
      for (const cmd of commands) {
        const usage = cmd.usage ? ` ${cmd.usage}` : "";
        ctx.addOutput(`  /${cmd.name}${usage} \u2014 ${cmd.description}`);
      }
    },
  });

  registry.register({
    name: "clear",
    description: "Clear the screen",
    async execute(_ctx, _args) {
      // Clear handled by REPLHandle
    },
  });

  registry.register({
    name: "exit",
    description: "Exit the REPL",
    async execute(ctx) {
      ctx.exit();
    },
  });

  registry.register({
    name: "status",
    description: "Show current session status",
    async execute(ctx) {
      const session = ctx.getSession();
      const agent = ctx.getAgentName();
      const provider = ctx.getProvider();
      const messages = ctx.getMessages();
      const config = ctx.getConfig();

      const allText = messages
        .map((m: any) => (typeof m.content === "string" ? m.content : ""))
        .join("\n");
      const tokenEstimate = estimateTokens(allText);
      const maxTokens = config.harness.budget.maxTokens;
      const tokenStr = tokenEstimate > 1000
        ? `${(tokenEstimate / 1000).toFixed(1)}k`
        : String(tokenEstimate);

      ctx.addOutput("\u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E");
      ctx.addOutput(`\u2502  Agent:    ${agent.padEnd(22)}\u2502`);
      ctx.addOutput(`\u2502  Model:    ${provider.modelId.padEnd(22)}\u2502`);
      const sessStr = session ? `${session.id.slice(0, 8)} (${session.state})` : "none";
      ctx.addOutput(`\u2502  Session:  ${sessStr.padEnd(22)}\u2502`);
      ctx.addOutput(`\u2502  Context:  ${`${tokenStr} / ${(maxTokens / 1000).toFixed(0)}k tokens`.padEnd(22)}\u2502`);
      ctx.addOutput(`\u2502  Flags:    ${(session ? `${session.flags.length} found` : "0").padEnd(22)}\u2502`);
      ctx.addOutput("\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F");
    },
  });

  registry.register({
    name: "model",
    description: "Switch LLM model",
    usage: "<name>",
    async execute(ctx, args) {
      if (!args.trim()) {
        ctx.addOutput(`Current model: ${ctx.getProvider().modelId}`);
        ctx.addOutput("Usage: /model <name>");
        return;
      }
      const { createProvider } = await import("../llm/provider.js");
      const config = ctx.getConfig();
      const newProvider = createProvider({ ...config.llm, model: args.trim() });
      ctx.setProvider(newProvider);
      ctx.addOutput(`Switched model to: ${args.trim()}`);
    },
  });

  registry.register({
    name: "agent",
    description: "Switch agent category",
    usage: "<name>",
    async execute(ctx, args) {
      const validAgents = ["triage", "crypto", "pwn", "web", "reverse", "forensics", "misc"];
      if (!args.trim()) {
        ctx.addOutput(`Current agent: ${ctx.getAgentName()}`);
        ctx.addOutput(`Available: ${validAgents.join(", ")}`);
        return;
      }
      const name = args.trim().toLowerCase();
      if (!validAgents.includes(name)) {
        ctx.addOutput(`Unknown agent: ${name}. Available: ${validAgents.join(", ")}`);
        return;
      }
      ctx.setAgentName(name);
      ctx.addOutput(`Switched agent to: ${name}`);
    },
  });

  registry.register({
    name: "solve",
    description: "Solve a CTF challenge",
    usage: "[path]",
    async execute(ctx, args) {
      ctx.addOutput(`Solving: ${args.trim() || "current directory"}...`);
      ctx.addOutput("(Solve integration triggers via REPLHandle.startSolve)");
    },
  });

  registry.register({
    name: "sessions",
    description: "List sessions",
    async execute(ctx) {
      const { SessionStore } = await import("../session/store.js");
      const sessions = await SessionStore.list();
      if (sessions.length === 0) {
        ctx.addOutput("No sessions found.");
        return;
      }
      ctx.addOutput("ID                 Date                 State       Flags");
      for (const s of sessions.slice(0, 20)) {
        const date = s.createdAt.slice(0, 19);
        const flags = s.flags.length > 0 ? s.flags.join(", ") : "-";
        ctx.addOutput(`${s.id.slice(0, 18).padEnd(19)} ${date.padEnd(21)} ${s.state.padEnd(12)} ${flags}`);
      }
    },
  });

  registry.register({
    name: "resume",
    description: "Resume a session",
    usage: "<id>",
    async execute(ctx, args) {
      if (!args.trim()) {
        ctx.addOutput("Usage: /resume <session-id>");
        return;
      }
      const { SessionStore } = await import("../session/store.js");
      const session = await SessionStore.load(args.trim());
      if (!session) {
        ctx.addOutput(`Session not found: ${args.trim()}`);
        return;
      }
      ctx.setSession(session);
      ctx.addOutput(`Resumed session: ${session.id} (${session.state})`);
      ctx.addOutput(`Category: ${session.challenge.category ?? "unknown"}`);
      if (session.flags.length > 0) {
        ctx.addOutput(`Flags: ${session.flags.join(", ")}`);
      }
    },
  });

  registry.register({
    name: "skill",
    description: "List, show, or refresh skills",
    usage: "list | show <name> | refresh",
    async execute(ctx, args) {
      const trimmed = args.trim();
      const parts = trimmed.split(/\s+/);
      const subcmd = parts[0]?.toLowerCase() ?? "list";

      const { SkillRegistry } = await import("../skill/registry.js");
      const config = ctx.getConfig();

      if (subcmd === "refresh" || subcmd === "reload") {
        const reg = await SkillRegistry.create(process.cwd());
        ctx.addOutput(`Refreshed skills: ${reg.list().length} skill(s) loaded`);
        return;
      }

      if (subcmd === "show" && parts[1]) {
        const reg = await SkillRegistry.create(process.cwd());
        const skillName = parts.slice(1).join(" ");
        const skill = reg.get(skillName);
        if (!skill) {
          ctx.addOutput(`Skill not found: ${skillName}`);
          return;
        }
        const companionCount = skill.fileNames.length;
        ctx.addOutput(`\u2502  Name:    ${skill.name}`);
        ctx.addOutput(`\u2502  Files:   ${companionCount > 0 ? `1 SKILL.md + ${companionCount} companion(s)` : "1 SKILL.md"}`);
        ctx.addOutput(`\u2502  Size:    ${skill.content.length} chars`);
        if (companionCount > 0) {
          ctx.addOutput(`\u2502  Companions: ${skill.fileNames.join(", ")}`);
        }
        return;
      }

      // Default: list all skills
      const reg = await SkillRegistry.create(process.cwd());
      const skills = reg.list();
      if (skills.length === 0) {
        ctx.addOutput("No skills loaded.");
        return;
      }
      const maxBudget = config.skills?.maxCompanionBytes ?? 15000;
      ctx.addOutput(`Skills (${skills.length} total, budget: ${(maxBudget / 1024).toFixed(0)}KB):`);
      for (const s of skills) {
        const compStr = s.fileNames.length > 0 ? ` +${s.fileNames.length} companion(s)` : "";
        ctx.addOutput(`  \u2022 ${s.name} (${s.content.length} chars${compStr})`);
      }
    },
  });

  return registry;
}
