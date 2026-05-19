import { execa } from "execa";
import { defineTool } from "./define.js";

export const ShellTool = defineTool({
  id: "bash",
  description: "Execute a shell command and return its output.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds",
        default: 30000,
      },
    },
    required: ["command"],
  },
  execute: async (args, ctx) => {
    const timeout = typeof args.timeout === "number" ? args.timeout : 30000;
    try {
      const result = await execa(args.command, {
        shell: true,
        cwd: ctx.workingDir,
        timeout,
        maxBuffer: 1024 * 1024,
      });
      return { output: result.stdout };
    } catch (err: any) {
      const combined = [err.stdout, err.stderr].filter(Boolean).join("\n");
      return {
        output: combined || err.message || "Command failed",
        error: true,
      };
    }
  },
});
