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
import { getAgent } from "./agent/router.js";
import { AgentRegistry } from "./agent/registry.js";
import { runAgent, type AgentRunContext } from "./agent/runtime.js";
import { runSolve } from "./solve.js";
import { getSystemPrompt } from "./llm/system-prompt.js";
import { isGreetingOrNonTask } from "./llm/greeting-detect.js";
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

        const toolContext: ToolContext = {
          workingDir: workDir,
          sessionId: "cli",
          permissionCheck: async () => true,
        };

        try {
          const result = await runSolve({
            workDir,
            paths,
            agentName,
            config,
            provider,
            tools: registry_tools,
            toolContext,
            skillRegistry,
            agentRegistry,
            mcpLifecycle,
            callbacks: {
              onToken: (token) => process.stdout.write(token),
              onToolCall: (tool, _a) => process.stdout.write(`\n[tool: ${tool}]\n`),
              onFlag: async (flag) => { process.stdout.write(`\n🚩 FLAG DETECTED: ${flag}\n`); },
            },
          });

          process.stdout.write(`\nSession: ${result.session.id} (${result.session.state})\n`);
        } catch (err: unknown) {
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
  .command(
    "$0",
    false as any,
    () => {},
    async () => {
      const runtime = createAppRuntime(process.cwd());
      try {
        const config = await runtime.runPromise(
          Effect.flatMap(ConfigService, (svc) => svc.get()),
        ) as OpenhackConfig;

        if (!config.llm.baseURL) {
          console.log("No config found. Run 'openhack init' first to configure your LLM backend.");
          process.exit(1);
        }

        const provider = createProvider(config.llm);
        const registry = ToolRegistry.createBuiltin();
        const skillRegistry = await SkillRegistry.create(process.cwd());
        const agentRegistry = await AgentRegistry.createWithUserAgents(process.cwd());

        const session = await SessionStore.create();
        session.state = "running";
        await SessionStore.save(session);

        const toolContext: ToolContext = {
          workingDir: process.cwd(),
          sessionId: session.id,
          permissionCheck: async () => true,
        };

        let currentProvider = provider;
        let currentAgent = "triage";
        const messageHistory: import("ai").ModelMessage[] = [];
        let abortController: AbortController | null = null;

        const { startREPL } = await import("./repl/index.js");
        const { getToolStatus } = await import("./repl/types.js");
        const { PauseController } = await import("./agent/pause-controller.js");
        const { MemoryManager } = await import("./memory/index.js");

        // Shared memory manager for reading phase info
        const memoryDir = path.join(os.homedir(), ".openhack", "sessions");
        const memoryManager = new MemoryManager(memoryDir);
        await memoryManager.ensureDir();

        const handle = startREPL({
          onSubmit: async (message: string) => {
            messageHistory.push({ role: "user", content: message });

            abortController = new AbortController();

            // Create pause controller for this run
            const pauseController = new PauseController({
              maxStepsPerRun: 8,
              abortSignal: abortController.signal,
            });
            handle.setPauseController(pauseController);

            // Wire pause state changes to REPL
            let toolCallCount = 0;
            let cachedPhase: string | undefined;
            pauseController.onStateChange((state) => {
              handle.setStepContext({
                iteration: state.stepsThisRun,
                maxSteps: state.maxSteps,
                toolCallCount,
                phase: cachedPhase,
              });

              // Async phase update (fire and forget)
              memoryManager.readState().then((stateContent) => {
                const phaseMatch = stateContent.match(/Phase:\s*(\S+)/i);
                const newPhase = phaseMatch?.[1];
                if (newPhase !== cachedPhase) {
                  cachedPhase = newPhase;
                  handle.setStepContext({
                    iteration: state.stepsThisRun,
                    maxSteps: state.maxSteps,
                    toolCallCount,
                    phase: cachedPhase,
                  });
                }
              }).catch(() => {});

              if (state.state === "paused") {
                handle.setAgentRunState({ state: "paused", stepIndex: state.stepsThisRun, maxSteps: state.maxSteps });
              } else if (state.state === "running") {
                handle.setAgentRunState({ state: "running" });
              }
            });

            try {
              // Classify message: if it's a greeting/non-task, force no tools on first iteration
              const toolChoice = isGreetingOrNonTask(message) ? "none" as const : undefined;

              await runAgentLoop({
                provider: currentProvider,
                messages: messageHistory,
                system: getSystemPrompt(currentAgent),
                tools: registry,
                toolContext,
                maxIterations: config.agent.maxSteps,
                abortSignal: abortController.signal,
                pauseController,
                initialToolChoice: toolChoice,
                onToken: (token) => handle.appendStreaming(token),
                onToolCall: (tool, args) => {
                  toolCallCount++;
                  handle.setStatus(getToolStatus(tool));
                  handle.addToolCall(tool, JSON.stringify(args).slice(0, 200));
                },
                onFlag: (flag) => {
                  handle.addMessage({ role: "system", content: `\u{1F3C6} FLAG: ${flag}` });
                  session.flags.push(flag);
                },
                onToolCallAsync: async (tool, args) => {
                  // Handle delegation from triage to specialist agents
                  if (tool === "delegate") {
                    const delegateArgs = args as { targetAgent?: string; objective?: string; context?: string };
                    const targetAgent = delegateArgs.targetAgent;
                    if (!targetAgent) return undefined;

                    const specialistDef = agentRegistry.get(targetAgent);
                    if (!specialistDef) {
                      handle.addMessage({ role: "system", content: `Unknown specialist agent: ${targetAgent}` });
                      return undefined;
                    }

                    session.timeline.push({ type: "AGENT_SWITCH", from: currentAgent, to: targetAgent, reason: delegateArgs.objective ?? "delegation" });
                    session.agentHistory.push(targetAgent);
                    await SessionStore.save(session);

                    const { runAgent } = await import("./agent/runtime.js");
                    const memoryDir = path.join(os.homedir(), ".openhack", "sessions");
                    const mcpLifecycle = new MCPLifecycle();

                    return runAgent({
                      agentDef: specialistDef,
                      provider: currentProvider,
                      tools: registry,
                      toolContext,
                      config,
                      skillRegistry,
                      memoryDir,
                      mcpLifecycle,
                      initialObjective: `${delegateArgs.objective ?? ""}\n\n## Triage Context\n${delegateArgs.context ?? ""}`,
                      onToken: (token) => handle.appendStreaming(token),
                      onToolCall: (t, a) => {
                        toolCallCount++;
                        handle.setStatus(getToolStatus(t));
                        handle.addToolCall(t, JSON.stringify(a).slice(0, 200));
                      },
                      onFlag: async (flag) => {
                        handle.addMessage({ role: "system", content: `\u{1F3C6} FLAG: ${flag}` });
                        session.flags.push(flag);
                        await SessionStore.save(session);
                      },
                    });
                  }
                  return undefined;
                },
              });
            } catch (err: unknown) {
              if ((err as Error).name !== "AbortError") {
                const msg = err instanceof Error ? err.message : String(err);
                handle.addMessage({ role: "system", content: `Error: ${msg}` });
              }
            }

            handle.setAgentRunState({ state: "idle" });
            handle.setStepContext(null);
            session.messages = messageHistory;
            await SessionStore.save(session);
          },
          agentName: "triage",
          version: "0.0.1",
        });

        // Set up slash context for REPL
        const slashCtx: import("./repl/slash-commands.js").SlashContext = {
          addOutput: (text: string) => handle.addMessage({ role: "system", content: text }),
          getProvider: () => currentProvider,
          setProvider: (p) => { currentProvider = p; },
          getSession: () => session,
          setSession: (s) => { Object.assign(session, s); },
          getAgentName: () => currentAgent,
          setAgentName: (name) => { currentAgent = name; handle.setAgent(name); },
          getMessages: () => messageHistory,
          getConfig: () => config,
          exit: () => {
            session.state = "paused";
            SessionStore.save(session).then(() => handle.unmount());
          },
        };

        // Wire slash context
        handle.setSlashContext(slashCtx);

        // Set model info for status bar
        handle.setModelInfo(config.llm.model, session.id, 0, config.harness.budget.maxTokens);

        // Override clear command
        handle.getSlashRegistry().register({
          name: "clear",
          description: "Clear the screen",
          async execute() { handle.clearMessages(); },
        });

        await handle.waitUntilExit();
      } finally {
        await runtime.dispose();
      }
    },
  );

await cli.parse();
