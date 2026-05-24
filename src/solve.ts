import * as path from "node:path";
import * as os from "node:os";
import type { Provider } from "./llm/provider.js";
import type { ToolRegistry } from "./tool/registry.js";
import type { ToolContext } from "./tool/types.js";
import type { OpenhackConfig } from "./config/schema.js";
import type { AgentRegistry } from "./agent/registry.js";
import type { SkillRegistry } from "./skill/registry.js";
import type { MCPLifecycle } from "./mcp/lifecycle.js";
import type { DelegateRequest } from "./agent/types.js";
import type { AgentLoopResult } from "./agent-loop.js";
import { runAgent } from "./agent/runtime.js";
import { SessionStore } from "./session/store.js";
import type { Session } from "./session/store.js";

export interface SolveCallbacks {
  onToken: (token: string) => void;
  onToolCall: (tool: string, args: unknown) => void;
  onFlag: (flag: string) => Promise<void>;
}

export interface SolveOptions {
  workDir: string;
  paths: string[];
  agentName?: string;
  config: OpenhackConfig;
  provider: Provider;
  tools: ToolRegistry;
  toolContext: ToolContext;
  skillRegistry: SkillRegistry;
  agentRegistry: AgentRegistry;
  mcpLifecycle: MCPLifecycle;
  session?: Session;
  callbacks: SolveCallbacks;
}

export async function runSolve(options: SolveOptions): Promise<{
  session: Session;
  flags: string[];
  iterations: number;
  terminationReason: string;
}> {
  const {
    workDir,
    paths,
    config,
    provider,
    tools,
    toolContext,
    skillRegistry,
    agentRegistry,
    mcpLifecycle,
    callbacks,
  } = options;

  const agent = options.agentName
    ? agentRegistry.get(options.agentName)
    : agentRegistry.getDefault();
  if (!agent) {
    throw new Error(`Unknown agent: ${options.agentName}`);
  }

  // Read challenge.json if present
  let challengeInfo: Partial<{ name: string; category: string; description: string; files: string[] }> = {};
  let challengeContext: string;
  try {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");
    const jsonPath = nodePath.join(workDir, "challenge.json");
    const raw = await fs.readFile(jsonPath, "utf-8");
    const chal = JSON.parse(raw);
    const { flag: _, ...safe } = chal;
    challengeInfo = { name: safe.name, category: safe.category, description: safe.description, files: safe.files };
    challengeContext = `\n\nChallenge: ${safe.name || "Unknown"}\nCategory: ${safe.category || "unknown"}\nDescription: ${safe.description || "No description"}\nFiles: ${(safe.files || []).join(", ")}\nDirectory: ${paths.join(", ")}`;
  } catch {
    challengeContext = paths.length > 0 ? `\n\nWorking directory: ${paths.join(", ")}` : "";
  }

  // Create or reuse session
  const session = options.session ?? await SessionStore.create({
    name: challengeInfo.name,
    category: challengeInfo.category ?? agent.name,
    description: challengeInfo.description,
    files: challengeInfo.files ?? paths,
  });
  session.state = "running";
  session.agentHistory.push(agent.name);
  await SessionStore.save(session);

  const toolCtx: ToolContext = { ...toolContext, sessionId: session.id };

  const userMessage = `Solve this CTF challenge using the ${agent.name} agent.${challengeContext}\n\nIMPORTANT: Do NOT read challenge.json for the answer. Analyze the actual challenge files to find the flag.`;

  const memoryDir = path.join(os.homedir(), ".openhack", "sessions");

  const collectFlagsAndSave = async (flags: string[]) => {
    for (const f of flags) {
      if (!session.flags.includes(f)) {
        session.flags.push(f);
        session.timeline.push({ type: "FLAG_FOUND", flag: f, source: "agent" });
      }
    }
    await SessionStore.save(session);
  };

  const delegateHandler = async (req: DelegateRequest): Promise<AgentLoopResult> => {
    const specialistDef = agentRegistry.get(req.targetAgent);
    if (!specialistDef) {
      callbacks.onToolCall(`[Unknown specialist: ${req.targetAgent}]`, {});
      return { messages: [], flags: [], iterations: 0, terminationReason: "unknown_agent" };
    }

    session.timeline.push({ type: "AGENT_SWITCH", from: agent.name, to: req.targetAgent, reason: req.objective });
    session.agentHistory.push(req.targetAgent);
    await SessionStore.save(session);

    return runAgent({
      agentDef: specialistDef,
      provider,
      tools,
      toolContext: toolCtx,
      config,
      skillRegistry,
      memoryDir,
      mcpLifecycle,
      initialObjective: `${req.objective}\n\n## Triage Context\n${req.context}`,
      onToken: callbacks.onToken,
      onToolCall: (tool, a) => {
        callbacks.onToolCall(tool, a);
      },
      onFlag: async (flag) => {
        await callbacks.onFlag(flag);
        await collectFlagsAndSave([flag]);
      },
    });
  };

  try {
    const result = await runAgent({
      agentDef: agent,
      provider,
      tools,
      toolContext: toolCtx,
      config,
      skillRegistry,
      memoryDir,
      mcpLifecycle,
      initialObjective: userMessage,
      onDelegate: agent.mode === "primary" ? delegateHandler : undefined,
      onToken: callbacks.onToken,
      onToolCall: callbacks.onToolCall,
      onFlag: async (flag) => {
        await callbacks.onFlag(flag);
        await collectFlagsAndSave([flag]);
      },
    });

    session.timeline.push({ type: "HARNESS_TERMINATED", reason: result.terminationReason, iteration: result.iterations });
    session.state = session.flags.length > 0 ? "completed" : "paused";
    await SessionStore.save(session);

    return {
      session,
      flags: [...session.flags],
      iterations: result.iterations,
      terminationReason: result.terminationReason,
    };
  } catch (err: unknown) {
    session.state = "error";
    await SessionStore.save(session);
    throw err;
  }
}
