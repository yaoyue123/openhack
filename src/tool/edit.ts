import { readFile, writeFile } from "node:fs/promises";
import { defineTool } from "./define.js";
import { resolveSecurePath, PathTraversalError, checkPermission } from "./security.js";

export const EditTool = defineTool({
  id: "edit",
  description:
    "Perform exact string replacement in a file. Replaces oldString with newString.",
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Path to the file to edit",
      },
      oldString: {
        type: "string",
        description: "The exact string to find and replace",
      },
      newString: {
        type: "string",
        description: "The replacement string",
      },
      replaceAll: {
        type: "boolean",
        description: "Replace all occurrences instead of just the first",
        default: false,
      },
    },
    required: ["filePath", "oldString", "newString"],
  },
  execute: async (args, ctx) => {
    const permDenied = await checkPermission(ctx, "edit", args.filePath);
    if (permDenied) return permDenied;
    try {
      const safePath = resolveSecurePath(args.filePath, ctx.workingDir);
      const content = await readFile(safePath, "utf-8");
      const { oldString, newString, replaceAll } = args;

      let count = 0;
      let searchFrom = 0;
      while (true) {
        const idx = content.indexOf(oldString, searchFrom);
        if (idx === -1) break;
        count++;
        searchFrom = idx + 1;
      }

      if (count === 0) {
        return {
          output: `No matches found for the specified string in ${safePath}`,
          error: true,
        };
      }

      if (count > 1 && !replaceAll) {
        return {
          output: `Found ${count} matches. Use replaceAll=true to replace all occurrences.`,
          error: true,
        };
      }

      const newContent = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);

      await writeFile(safePath, newContent, "utf-8");
      const replaced = replaceAll ? count : 1;
      return {
        output: `Replaced ${replaced} occurrence(s) in ${safePath}`,
      };
    } catch (err: unknown) {
      const message = err instanceof PathTraversalError ? err.message : (err as Error)?.message || "Failed to edit file";
      return { output: message, error: true };
    }
  },
});
