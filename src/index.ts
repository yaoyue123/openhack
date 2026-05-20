#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Effect } from "effect";
import { createAppRuntime, ConfigService } from "./runtime/app.js";
import { createProvider } from "./llm/provider.js";
import { runAgentLoop } from "./agent-loop.js";
import { ToolRegistry } from "./tool/registry.js";
import type { OpenhackConfig } from "./config/schema.js";
import type { ToolContext } from "./tool/types.js";
import { getAgent, getDefaultAgent } from "./agent/router.js";
import { getSystemPrompt } from "./llm/system-prompt.js";
import { SessionStore } from "./session/store.js";
import { SkillRegistry } from "./skill/registry.js";
import { ConfigLoader, stripJsoncComments } from "./config/loader.js";

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

      const agentName = (args.agent as string | undefined) ?? args.category ?? undefined;
      const agent = agentName ? getAgent(agentName) : getDefaultAgent();
      if (!agent) {
        console.error(`Unknown agent: ${agentName}`);
        process.exit(1);
      }

      const runtime = createAppRuntime(workDir);
      try {
        const config = await runtime.runPromise(
          Effect.flatMap(ConfigService, (svc) => svc.get()),
        ) as OpenhackConfig;

        const modelOverride = args.model !== "default" ? (args.model as string) : null;
        const llmConfig = modelOverride
          ? { ...config.llm, model: modelOverride }
          : config.llm;

        const provider = createProvider(llmConfig);
        const registry = ToolRegistry.createBuiltin();
        const skillRegistry = await SkillRegistry.create(process.cwd());
        const toolContext: ToolContext = {
          workingDir: workDir,
          sessionId: "solve",
          permissionCheck: async () => true,
        };

        const pathContext =
          paths.length > 0 ? `\n\nWorking directory: ${paths.join(", ")}` : "";

        let challengeContext = pathContext;
        try {
          const fs = await import("node:fs/promises");
          const nodePath = await import("node:path");
          const jsonPath = nodePath.join(workDir, "challenge.json");
          const raw = await fs.readFile(jsonPath, "utf-8");
          const chal = JSON.parse(raw);
          const { flag: _, ...safe } = chal;
          challengeContext = `\n\nChallenge: ${safe.name || "Unknown"}\nCategory: ${safe.category || "unknown"}\nDescription: ${safe.description || "No description"}\nFiles: ${(safe.files || []).join(", ")}\nDirectory: ${paths.join(", ")}`;
        } catch {
          challengeContext = pathContext;
        }

        const userMessage = `Solve this CTF challenge using the ${agent.name} agent.${challengeContext}\n\nIMPORTANT: Do NOT read challenge.json for the answer. Analyze the actual challenge files to find the flag.`;

        const skillContent = skillRegistry.toPromptWithCompanions(agent.name);

        try {
          await runAgentLoop({
            provider,
            messages: [
              {
                role: "user",
                content: userMessage,
              },
            ],
            system: getSystemPrompt(agent.name, skillContent),
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
