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
  .demandCommand()
  .strict();

await cli.parse();
