#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Effect } from "effect";
import * as os from "node:os";
import * as path from "node:path";
import { createAppRuntime, ConfigService } from "./runtime/app.js";
import { createProvider } from "./llm/provider.js";
import { runAgentLoop } from "./agent-loop.js";
import { ToolRegistry } from "./tool/registry.js";
import type { OpenhackConfig } from "./config/schema.js";
import type { ToolContext } from "./tool/types.js";
import { getAgent, getDefaultAgent, registry } from "./agent/router.js";
import { AgentRegistry } from "./agent/registry.js";
import { runAgent, type AgentRunContext } from "./agent/runtime.js";
import type { DelegateRequest } from "./agent/types.js";
import { getSystemPrompt } from "./llm/system-prompt.js";
import { SessionStore } from "./session/store.js";
import { SkillRegistry } from "./skill/registry.js";
import { ConfigLoader, stripJsoncComments } from "./config/loader.js";
import { MCPLifecycle } from "./mcp/lifecycle.js";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((o: unknown, k: string) => {
    if (o !== null && o !== undefined && typeof o === "object") {
      return (o as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop()!;
  const target = keys.reduce((o: Record<string, unknown>, k: string) => {
    if (!(k in o)) o[k] = {};
    return o[k] as Record<string, unknown>;
  }, obj);
  target[last] = value;
}

function parseValue(v: string): unknown {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  if (/^\d+\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

const cli = yargs(hideBin(process.argv))
  .scriptName("openhack")
  .command(
    "init",
    "Initialize openhack configuration",
    () => {},
    async () => {
      const { createInterface } = await import("node:readline");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const question = (prompt: string): Promise<string> =>
        new Promise((resolve) => rl.question(prompt, resolve));

      console.log("openhack configuration wizard\n");

      const baseURL = await question("API base URL (default: http://localhost:11434/v1): ");
      const apiKey = await question("API key: ");
      const model = await question("Default model (default: default): ");

      rl.close();

      const config: Record<string, unknown> = {};
      config.llm = {};
      if (baseURL.trim()) (config.llm as Record<string, unknown>).baseURL = baseURL.trim();
      if (apiKey.trim()) (config.llm as Record<string, unknown>).apiKey = apiKey.trim();
      if (model.trim()) (config.llm as Record<string, unknown>).model = model.trim();

      const loader = new ConfigLoader();
      await loader.save(config as Partial<OpenhackConfig>);

      console.log(`\n✓ Configuration saved to ${loader.getConfigPath()}`);
    },
  )
  .command(
    "chat [message..]",
    "Start chatting with openhack",
    (y) => y.option("model", { type: "string", default: "default" }),
    async (args) => {
      const message = ((args.message as string[]) ?? []).join(" ");
      if (!message) {
        console.error("Error: no message provided");
        process.exit(1);
      }

      const runtime = createAppRuntime(process.cwd());
      try {
        const config = await runtime.runPromise(
          Effect.flatMap(ConfigService, (svc) => svc.get()),
        ) as OpenhackConfig;

        const modelOverride = args.model !== "default" ? args.model : null;
        const llmConfig = modelOverride
          ? { ...config.llm, model: modelOverride }
          : config.llm;

        const provider = createProvider(llmConfig);
        const registry = ToolRegistry.createBuiltin();
        const toolContext: ToolContext = {
          workingDir: process.cwd(),
          sessionId: "cli",
          permissionCheck: async () => true,
        };

        try {
          await runAgentLoop({
            provider,
            messages: [{ role: "user", content: message }],
            system: getSystemPrompt("general"),
            tools: registry,
            toolContext,
            maxIterations: config.agent.maxSteps,
            onToken: (token) => process.stdout.write(token),
            onToolCall: (tool, a) => {
              process.stdout.write(`\n[tool: ${tool}]\n`);
            },
            onFlag: (flag) => {
              process.stdout.write(`\n🚩 FLAG DETECTED: ${flag}\n`);
            },
          });
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.error(`\nError: ${error.message || error}`);
          if (error.cause) console.error(`Cause: ${error.cause}`);
        }
        process.stdout.write("\n");
      } finally {
        await runtime.dispose();
      }
    },
  )
  .command(
    "solve [path..]",
    "Auto-triage and solve a challenge",
    (y) =>
      y
        .option("category", {
          type: "string",
          description: "Skip triage, use specific category agent",
        })
        .option("agent", {
          type: "string",
          description: "Use specific agent by name",
        })
        .option("model", { type: "string", default: "default" }),
    async (args) => {
      const paths = (args.path as string[]) ?? [];
      const workDir = paths[0] ?? process.cwd();

      const agentRegistry = await AgentRegistry.createWithUserAgents(workDir);

      const agentName = (args.agent as string | undefined) ?? args.category ?? undefined;
      const agent = agentName ? agentRegistry.get(agentName) : agentRegistry.getDefault();
      if (!agent) {
        console.error(`Unknown agent: ${agentName}`);
        process.exit(1);
      }

      const runtime = createAppRuntime(workDir);
      const mcpLifecycle = new MCPLifecycle();
      try {
        const config = await runtime.runPromise(
          Effect.flatMap(ConfigService, (svc) => svc.get()),
        ) as OpenhackConfig;

        const modelOverride = args.model !== "default" ? (args.model as string) : null;
        const llmConfig = modelOverride
          ? { ...config.llm, model: modelOverride }
          : config.llm;

        const provider = createProvider(llmConfig);
        const registry_tools = ToolRegistry.createBuiltin();
        const skillRegistry = await SkillRegistry.create(process.cwd());

        const pathContext =
          paths.length > 0 ? `\n\nWorking directory: ${paths.join(", ")}` : "";

        let challengeInfo: Partial<{ name: string; category: string; description: string; files: string[] }> = {};
        let challengeContext = pathContext;
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
          challengeContext = pathContext;
        }

        const session = await SessionStore.create({
          name: challengeInfo.name,
          category: challengeInfo.category ?? agent.name,
          description: challengeInfo.description,
          files: challengeInfo.files ?? paths,
        });
        session.state = "running";
        session.agentHistory.push(agent.name);
        await SessionStore.save(session);

        const toolContext: ToolContext = {
          workingDir: workDir,
          sessionId: session.id,
          permissionCheck: async () => true,
        };

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

        try {
          const delegateHandler = async (req: DelegateRequest) => {
            const specialistDef = agentRegistry.get(req.targetAgent);
            if (!specialistDef) {
              process.stdout.write(`\n[Unknown specialist: ${req.targetAgent}]\n`);
              return { messages: [], flags: [], iterations: 0, terminationReason: "unknown_agent" };
            }

            process.stdout.write(`\n[Delegating to ${req.targetAgent} specialist...]\n`);
            session.timeline.push({ type: "AGENT_SWITCH", from: agent.name, to: req.targetAgent, reason: req.objective });
            session.agentHistory.push(req.targetAgent);
            await SessionStore.save(session);

            const specialistCtx: AgentRunContext = {
              agentDef: specialistDef,
              provider,
              tools: registry_tools,
              toolContext,
              config,
              skillRegistry,
              memoryDir,
              mcpLifecycle,
              initialObjective: `${req.objective}\n\n## Triage Context\n${req.context}`,
              onToken: (token) => process.stdout.write(token),
              onToolCall: (tool, a) => {
                process.stdout.write(`\n[${req.targetAgent} | tool: ${tool}]\n`);
                session.timeline.push({ type: "TOOL_EXEC", tool, args: JSON.stringify(a).slice(0, 200).split(" "), exitCode: 0 });
              },
              onFlag: async (flag) => {
                process.stdout.write(`\n🚩 FLAG DETECTED: ${flag}\n`);
                await collectFlagsAndSave([flag]);
              },
            };

            const result = await runAgent(specialistCtx);
            await collectFlagsAndSave(result.flags);
            return result;
          };

          const result = await runAgent({
            agentDef: agent,
            provider,
            tools: registry_tools,
            toolContext,
            config,
            skillRegistry,
            memoryDir,
            mcpLifecycle,
            initialObjective: userMessage,
            onDelegate: agent.mode === "primary" ? delegateHandler : undefined,
            onToken: (token) => process.stdout.write(token),
            onToolCall: (tool, a) => {
              process.stdout.write(`\n[${agent.name} | tool: ${tool}]\n`);
              session.timeline.push({ type: "TOOL_EXEC", tool, args: JSON.stringify(a).slice(0, 200).split(" "), exitCode: 0 });
            },
            onFlag: async (flag) => {
              process.stdout.write(`\n🚩 FLAG DETECTED: ${flag}\n`);
              await collectFlagsAndSave([flag]);
            },
          });

          session.timeline.push({ type: "HARNESS_TERMINATED", reason: result.terminationReason, iteration: result.iterations });
          session.state = session.flags.length > 0 ? "completed" : "paused";
          await SessionStore.save(session);

          if (session.id) {
            process.stdout.write(`\nSession: ${session.id} (${session.state})\n`);
          }
        } catch (err: unknown) {
          session.state = "error";
          await SessionStore.save(session);
          const error = err instanceof Error ? err : new Error(String(err));
          console.error(`\nError: ${error.message || error}`);
          if (error.cause) console.error(`Cause: ${error.cause}`);
        }
        process.stdout.write("\n");
      } finally {
        await mcpLifecycle.stopAll().catch(() => {});
        await runtime.dispose();
      }
    },
  )
  .command(
    "sessions",
    "List all sessions",
    () => {},
    async () => {
      const sessions = await SessionStore.list();
      if (sessions.length === 0) {
        console.log("No sessions found.");
        return;
      }
      console.log(
        "ID".padEnd(20) +
          "Date".padEnd(22) +
          "Category".padEnd(12) +
          "State".padEnd(12) +
          "Flags",
      );
      for (const s of sessions) {
        const date = s.createdAt.slice(0, 19);
        const cat = (s.challenge.category ?? "-").padEnd(12);
        const flags = s.flags.length > 0 ? s.flags.join(", ") : "-";
        console.log(
          s.id.padEnd(20) + date.padEnd(22) + cat + s.state.padEnd(12) + flags,
        );
      }
    },
  )
  .command(
    "resume <id>",
    "Resume a session",
    () => {},
    async (args) => {
      const session = await SessionStore.load(args.id as string);
      if (!session) {
        console.error(`Session not found: ${args.id}`);
        process.exit(1);
      }

      console.log(`Resuming session: ${session.id}`);
      console.log(`Category: ${session.challenge.category ?? "unknown"}`);
      console.log(`State: ${session.state}`);
      if (session.flags.length > 0) {
        console.log(`Flags found: ${session.flags.join(", ")}`);
      }

      const runtime = createAppRuntime(process.cwd());
      try {
        const config = await runtime.runPromise(
          Effect.flatMap(ConfigService, (svc) => svc.get()),
        ) as OpenhackConfig;

        const provider = createProvider(config.llm);
        const registry = ToolRegistry.createBuiltin();
        const skillRegistry = await SkillRegistry.create(process.cwd());
        const toolContext: ToolContext = {
          workingDir: process.cwd(),
          sessionId: session.id,
          permissionCheck: async () => true,
        };

        const agentName = session.agentHistory.at(-1) ?? "triage";
        const agent = getAgent(agentName);
        const skillContent = agent ? skillRegistry.toPromptWithCompanions(agent.name) : undefined;
        const systemPrompt = agent ? getSystemPrompt(agent.name, skillContent) : getSystemPrompt("general");

        const contextSummary = [
          `Resuming session ${session.id}`,
          `Category: ${session.challenge.category ?? "unknown"}`,
          `State: ${session.state}`,
          session.flags.length > 0 ? `Flags found so far: ${session.flags.join(", ")}` : "",
          `Events: ${session.timeline.length}`,
        ]
          .filter(Boolean)
          .join("\n");

        await runAgentLoop({
          provider,
          messages: [
            { role: "user", content: `Continue working on this challenge.\n\n${contextSummary}` },
          ],
          system: systemPrompt,
          tools: registry,
          toolContext,
          maxIterations: config.agent.maxSteps,
          onToken: (token) => process.stdout.write(token),
          onToolCall: (tool, a) => {
            process.stdout.write(`\n[tool: ${tool}]\n`);
          },
          onFlag: (flag) => {
            process.stdout.write(`\n🚩 FLAG DETECTED: ${flag}\n`);
          },
        });
        process.stdout.write("\n");
      } finally {
        await runtime.dispose();
      }
    },
  )
  .command(
    "skills list",
    "List available skills",
    () => {},
    async () => {
      const registry = await SkillRegistry.create(process.cwd());
      const skills = registry.list();
      if (skills.length === 0) {
        console.log("No skills found.");
        return;
      }
      for (const skill of skills) {
        console.log(`  ${skill.name}: ${skill.content.slice(0, 80).split("\n")[0]}`);
      }
    },
  )
  .command(
    "config",
    "Manage configuration",
    (y) =>
      y
        .command(
          "get <key>",
          "Get a config value",
          (y2) => y2.positional("key", { type: "string", demand: true }),
          async (args) => {
            const loader = new ConfigLoader();
            const config = await loader.load();
            const value = getNestedValue(config as unknown as Record<string, unknown>, args.key as string);
            if (value === undefined) {
              console.error(`Key not found: ${args.key}`);
              process.exit(1);
            }
            const key = args.key as string;
            if (key.includes("apiKey") && typeof value === "string" && value.length > 8) {
              console.log(value.slice(0, 4) + "..." + value.slice(-4));
            } else {
              console.log(typeof value === "object" ? JSON.stringify(value, null, 2) : value);
            }
          },
        )
        .command(
          "set <key> <value>",
          "Set a config value",
          (y2) =>
            y2
              .positional("key", { type: "string", demand: true })
              .positional("value", { type: "string", demand: true }),
          async (args) => {
            const loader = new ConfigLoader();
            const { readFile: fsReadFile } = await import("node:fs/promises");
            let raw: string | null = null;
            try { raw = await fsReadFile(loader.getConfigPath(), "utf-8"); } catch { /* no existing file */ }
            const existing: Record<string, unknown> = raw ? JSON.parse(stripJsoncComments(raw)) : {};
            setNestedValue(existing, args.key as string, parseValue(args.value as string));
            await loader.save(existing as Partial<OpenhackConfig>);
            console.log(`✓ Set ${args.key}`);
          },
        )
        .command(
          "list",
          "Print full configuration",
          () => {},
          async () => {
            const loader = new ConfigLoader();
            const config = await loader.load();
            const masked = JSON.stringify(config, (key, value) => {
              if (key === "apiKey" && typeof value === "string" && value.length > 8) {
                return value.slice(0, 4) + "..." + value.slice(-4);
              }
              return value;
            }, 2);
            console.log(masked);
            console.log(`\nConfig file: ${loader.getConfigPath()}`);
          },
        )
        .command(
          "path",
          "Show config file path",
          () => {},
          async () => {
            const loader = new ConfigLoader();
            console.log(loader.getConfigPath());
          },
        )
        .command(
          "validate",
          "Validate configuration",
          () => {},
          async () => {
            const loader = new ConfigLoader();
            try {
              const config = await loader.load();
              const errors: string[] = [];
              if (!config.llm.baseURL) errors.push("llm.baseURL is required");
              if (!config.llm.model || config.llm.model === "default") errors.push("llm.model should be set (current: 'default')");
              if (!config.llm.apiKey) errors.push("llm.apiKey is empty — set it via config or OPENHACK_LLM_API_KEY env var");
              if (config.agent.maxSteps < 1) errors.push("agent.maxSteps must be >= 1");
              if (config.agent.timeout < 10) errors.push("agent.timeout must be >= 10");

              if (errors.length === 0) {
                console.log("✓ Configuration is valid");
                console.log(`  API: ${config.llm.baseURL}`);
                console.log(`  Model: ${config.llm.model}`);
                console.log(`  API Key: ${config.llm.apiKey ? "configured" : "NOT SET"}`);
                console.log(`  Max Steps: ${config.agent.maxSteps}`);
              } else {
                console.log("Configuration issues:");
                for (const e of errors) console.log(`  ⚠ ${e}`);
                process.exit(1);
              }
            } catch (err: unknown) {
              const error = err instanceof Error ? err : new Error(String(err));
              console.error(`✗ Invalid config: ${error.message}`);
              process.exit(1);
            }
          },
        )
        .demandCommand(),
    () => {},
  )
  .demandCommand()
  .strict();

await cli.parse();
