import { execa } from "execa";
import { defineTool } from "./define.js";
import { checkPermission } from "./security.js";

export const GrepTool = defineTool({
  id: "grep",
  description:
    "Search file contents using a regular expression pattern via grep.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Regular expression pattern to search for",
      },
      path: {
        type: "string",
        description: "Directory or file to search in",
      },
      include: {
        type: "string",
        description: 'File pattern to include (e.g. "*.ts")',
      },
    },
    required: ["pattern"],
  },
  execute: async (args, ctx) => {
    const searchPath = args.path || ctx.workingDir;
    const permDenied = await checkPermission(ctx, "grep", `${args.pattern} in ${searchPath}`);
    if (permDenied) return permDenied;
    const grepArgs = ["-rn", "--color=never", "-E", args.pattern];

    if (args.include) {
      grepArgs.push(`--include=${args.include}`);
    }

    grepArgs.push(searchPath);

    try {
      const result = await execa("grep", grepArgs, {
        cwd: ctx.workingDir,
        reject: false,
        timeout: 30000,
      });

      if (result.exitCode === 1) {
        return { output: "(no matches)" };
      }

      if (result.exitCode !== 0 && result.exitCode !== 1) {
        return {
          output: result.stderr || `grep exited with code ${result.exitCode}`,
          error: true,
        };
      }

      const lines = result.stdout.split("\n").filter(Boolean).slice(0, 200);
      return { output: lines.join("\n") };
    } catch (err: unknown) {
      const message = (err as Error).message || "Grep search failed";
      return { output: message, error: true };
    }
  },
});
