import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { defineTool } from "./define.js";

export const WriteTool = defineTool({
  id: "write",
  description: "Write content to a file, creating directories as needed.",
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Path to the file to write",
      },
      content: {
        type: "string",
        description: "Content to write to the file",
      },
    },
    required: ["filePath", "content"],
  },
  execute: async (args) => {
    try {
      await mkdir(dirname(args.filePath), { recursive: true });
      await writeFile(args.filePath, args.content, "utf-8");
      const bytes = Buffer.byteLength(args.content, "utf-8");
      return { output: `Wrote ${bytes} bytes to ${args.filePath}` };
    } catch (err: any) {
      return { output: err.message || "Failed to write file", error: true };
    }
  },
});
