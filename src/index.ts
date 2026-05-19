#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Effect } from "effect";
import { createAppRuntime, ConfigService } from "./runtime/app.js";
import { createProvider } from "./llm/provider.js";
import { streamLLMResponse } from "./llm/stream.js";
import type { OpenhackConfig } from "./config/schema.js";

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
        const model = provider.languageModel();

        for await (const event of streamLLMResponse({
          model,
          system: "You are openhack, a CTF security assistant.",
          messages: [{ role: "user", content: message }],
        })) {
          if (event.type === "text" && event.content) {
            process.stdout.write(event.content);
          }
        }
        process.stdout.write("\n");
      } finally {
        await runtime.dispose();
      }
    },
  )
  .demandCommand()
  .strict();

await cli.parse();
