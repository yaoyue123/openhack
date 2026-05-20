import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { defineTool } from "./define.js";

export const StateWriteTool = defineTool({
  id: "state-write",
  description:
    "Update the agent state file. Write the COMPLETE new state.md content.",
  parameters: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "Complete new state.md content",
      },
    },
    required: ["content"],
  },
  execute: async (args, ctx) => {
    const statePath = path.join(
      os.homedir(),
      ".openhack",
      "sessions",
      `${ctx.sessionId}.state.md`,
    );
    try {
      await fs.mkdir(path.dirname(statePath), { recursive: true });
      await fs.writeFile(statePath, args.content as string, "utf-8");
      return { output: "State updated." };
    } catch {
      return { output: "Failed to update state.", error: true };
    }
  },
});
