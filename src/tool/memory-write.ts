import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { defineTool } from "./define.js";

const WRITABLE_MEMORY_FILES = ["findings", "failed-paths"] as const;

export const MemoryWriteTool = defineTool({
  id: "memory-write",
  description:
    "Write to a memory file (findings, failed-paths). Use this to record discoveries and failed approaches.",
  parameters: {
    type: "object",
    properties: {
      file: {
        type: "string",
        enum: [...WRITABLE_MEMORY_FILES],
        description: "Which memory file to write",
      },
      content: {
        type: "string",
        description: "Complete new file content (markdown)",
      },
    },
    required: ["file", "content"],
  },
  execute: async (args, ctx) => {
    const dir = path.join(
      os.homedir(),
      ".openhack",
      "sessions",
      `${ctx.sessionId}.memory`,
    );
    const filePath = path.join(dir, `${args.file}.md`);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, args.content as string, "utf-8");
      return { output: `${args.file}.md updated.` };
    } catch {
      return { output: `Failed to update ${args.file}.md`, error: true };
    }
  },
});
