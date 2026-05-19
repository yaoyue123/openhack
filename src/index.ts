#!/usr/bin/env node
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

const cli = yargs(hideBin(process.argv))
  .scriptName("openhack")
  .command(
    "chat [message..]",
    "Start chatting with openhack",
    (y) => y.option("model", { type: "string", default: "default" }),
    async (args) => {
      const message = ((args.message as string[]) ?? []).join(" ")
      console.log(`openhack> ${message}`)
      // Will be replaced with actual LLM call in Task 1.4
    }
  )
  .demandCommand()
  .strict()

await cli.parse()
