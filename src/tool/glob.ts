import { glob as globFn } from "glob";
import { defineTool } from "./define.js";
import { checkPermission } from "./security.js";

export const GlobTool = defineTool({
  id: "glob",
  description: "Find files matching a glob pattern.",
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
