import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { defineTool } from "./define.js";

export const StateReadTool = defineTool({
  id: "state-read",
  description:
    "Read the current agent state file (state.md). Shows your current objective, phase, findings, and next steps.",
  parameters: {
    type: "object",
    properties: {},
  },
  execute: async (_args, ctx) => {
    const statePath = path.join(
      os.homedir(),
      ".openhack",
      "sessions",
      `${ctx.sessionId}.state.md`,
    );
    try {
      const content = await fs.readFile(statePath, "utf-8");
      return { output: content };
    } catch {
      return {
        output:
          "# Current State\n(No state file found. Use state-write to create one.)",
      };
    }
  },
});
