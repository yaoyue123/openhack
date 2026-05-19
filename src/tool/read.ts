import { readFile } from "node:fs/promises";
import { defineTool } from "./define.js";

export const ReadTool = defineTool({
  id: "read",
  description: "Read a file and return its contents with line numbers.",
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Path to the file to read",
      },
      offset: {
        type: "number",
        description: "Line number to start from (1-indexed)",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to return",
      },
    },
    required: ["filePath"],
  },
  execute: async (args) => {
    try {
      const content = await readFile(args.filePath, "utf-8");
      const lines = content.split("\n");
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }

      const offset = typeof args.offset === "number" ? args.offset : 1;
      const limit = typeof args.limit === "number" ? args.limit : lines.length;

      const sliced = lines.slice(offset - 1, offset - 1 + limit);
      const numbered = sliced
        .map((line, i) => `${offset + i}: ${line}`)
        .join("\n");

      return { output: numbered };
    } catch (err: any) {
      return { output: err.message || "Failed to read file", error: true };
    }
  },
});
