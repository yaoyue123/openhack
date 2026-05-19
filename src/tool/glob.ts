import { glob as globFn } from "glob";
import { defineTool } from "./define.js";

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
    try {
      const matches = await globFn(args.pattern, { cwd });
      if (matches.length === 0) {
        return { output: "(no matches)" };
      }
      return { output: matches.join("\n") };
    } catch (err: any) {
      return { output: err.message || "Glob search failed", error: true };
    }
  },
});
