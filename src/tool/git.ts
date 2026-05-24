import { execa } from "execa";
import { defineTool } from "./define.js";

const SAFE_COMMANDS = ["status", "log", "diff", "show", "branch"] as const;
type SafeCommand = (typeof SAFE_COMMANDS)[number];

const commandDescriptions: Record<SafeCommand, string> = {
  status: "Show working tree status",
  log: "Show commit log (use --oneline -N for compact view)",
  diff: "Show unstaged diff",
  show: "Show details of a specific commit or object (requires args.ref)",
  branch: "List local branches",
};

export const GitTool = defineTool({
  id: "git",
  description: "Run safe Git commands (status, log, diff, show, branch). No destructive commands allowed.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        enum: [...SAFE_COMMANDS],
        description: "Git command to run",
      },
      args: {
        type: "string",
        description: "Additional arguments (e.g., '--oneline -5' for log, '<commit>' for show)",
      },
    },
    required: ["command"],
  },
  execute: async (args) => {
    const command = args.command as string;

    if (!SAFE_COMMANDS.includes(command as SafeCommand)) {
      return {
        output: `Unsupported git command: ${command}. Allowed: ${SAFE_COMMANDS.join(", ")}`,
        error: true,
      };
    }

    try {
      const extraArgs = typeof args.args === "string" && args.args.trim()
        ? args.args.trim().split(/\s+/)
        : [];

      const subprocess = await execa("git", [command, ...extraArgs], {
        shell: true,
        maxBuffer: 1024 * 1024,
      });

      return { output: subprocess.stdout || "(empty output)" };
    } catch (err: any) {
      return { output: err.stderr || err.message || "Git command failed", error: true };
    }
  },
});
