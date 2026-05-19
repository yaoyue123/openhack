#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Effect } from "effect";
import { createAppRuntime, ConfigService } from "./runtime/app.js";
import { createProvider } from "./llm/provider.js";
import { runAgentLoop } from "./llm/agent-loop.js";
import { ToolRegistry } from "./tool/registry.js";
import type { OpenhackConfig } from "./config/schema.js";
import type { ToolContext } from "./tool/types.js";
import { getAgent, getDefaultAgent } from "./agent/router.js";
import { SessionStore } from "./session/store.js";
import { SkillRegistry } from "./skill/registry.js";
import { ConfigLoader } from "./config/loader.js";
import { DEFAULT_CONFIG } from "./config/schema.js";

const cli = yargs(hideBin(process.argv))
  .scriptName("openhack")
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

        await runAgentLoop({
          provider,
          messages: [{ role: "user", content: message }],
          system: "You are openhack, a CTF security assistant.",
          tools: registry,
          toolContext,
          onToken: (token) => process.stdout.write(token),
          onToolCall: (tool, args) => {
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
        const toolContext: ToolContext = {
          workingDir: workDir,
          sessionId: "solve",
          permissionCheck: async () => true,
        };

        const pathContext =
          paths.length > 0 ? `\n\nWorking directory: ${paths.join(", ")}` : "";

        await runAgentLoop({
          provider,
          messages: [
            {
              role: "user",
              content: `Solve this CTF challenge using the ${agent.name} agent.${pathContext}`,
            },
          ],
          system: agent.systemPrompt,
          tools: registry,
          toolContext,
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
        const toolContext: ToolContext = {
          workingDir: process.cwd(),
          sessionId: session.id,
          permissionCheck: async () => true,
        };

        const agentName = session.agentHistory.at(-1) ?? "triage";
        const agent = getAgent(agentName);
        const systemPrompt = agent?.systemPrompt ?? "You are openhack, a CTF security assistant.";

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
    "Print current configuration",
    () => {},
    async () => {
      const loader = new ConfigLoader();
      const config = await loader.load(process.cwd());
      console.log(JSON.stringify(config, null, 2));
    },
  )
  .demandCommand()
  .strict();

await cli.parse();
