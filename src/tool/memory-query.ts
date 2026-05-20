import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { defineTool } from "./define.js";

const MEMORY_FILES = ["findings", "failed-paths", "attack-log", "experience"] as const;

export const MemoryQueryTool = defineTool({
  id: "memory-query",
  description:
    "Read a memory file (findings, failed-paths, attack-log, experience)",
  parameters: {
    type: "object",
    properties: {
      file: {
        type: "string",
        enum: [...MEMORY_FILES],
        description: "Which memory file to read",
      },
    },
    required: ["file"],
  },
  execute: async (args, ctx) => {
    const filePath = path.join(
      os.homedir(),
      ".openhack",
      "sessions",
      `${ctx.sessionId}.memory`,
      `${args.file}.md`,
    );
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return { output: content };
    } catch {
      return { output: "(empty)" };
    }
  },
});
