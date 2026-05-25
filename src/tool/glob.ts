import { glob as globFn } from "glob";
import { defineTool } from "./define.js";
import { checkPermission } from "./security.js";

export const GlobTool = defineTool({
  id: "glob",
  description: [
    "Find files matching a glob pattern.",
    "",
    "WHEN TO USE:",
    "  - Finding challenge files: glob('**/*.pcap'), glob('**/*.py'), glob('**/*.bin')",
    "  - Exploring directory structure: glob('*'), glob('**/*')",
    "  - Finding specific file types: glob('**/*.php'), glob('**/*.{js,ts,json}')",
    "",
    "LIMITATIONS:",
    "  - Only matches file NAMES, not file contents — use grep to search inside files",
    "  - Does not read file contents — use read tool after finding files",
    "",
    "ALTERNATIVES:",
    "  - For searching file contents: use grep tool",
    "  - For complex file operations: use bash with find command (but glob is usually faster)",
  ].join("\n"),
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern to match files against",
      },
      path: {
        type: "string",
        description: "Directory to search in (defaults to working directory)",
      },
    },
    required: ["pattern"],
  },
  execute: async (args, ctx) => {
    const cwd = args.path || ctx.workingDir;
    const permDenied = await checkPermission(ctx, "glob", args.pattern);
    if (permDenied) return permDenied;
    try {
      const matches = await globFn(args.pattern, { cwd });
      if (matches.length === 0) {
        return { output: "(no matches)" };
      }
      return { output: matches.join("\n") };
    } catch (err: unknown) {
      const message = (err as Error).message || "Glob search failed";
      return { output: message, error: true };
    }
  },
});
