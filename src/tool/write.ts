import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { defineTool } from "./define.js";
import { resolveSecurePath, PathTraversalError, checkPermission } from "./security.js";

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
  execute: async (args, ctx) => {
    const permDenied = await checkPermission(ctx, "write", args.filePath);
    if (permDenied) return permDenied;
    try {
      const safePath = resolveSecurePath(args.filePath, ctx.workingDir);
      await mkdir(dirname(safePath), { recursive: true });
      await writeFile(safePath, args.content, "utf-8");
      const bytes = Buffer.byteLength(args.content, "utf-8");
      return { output: `Wrote ${bytes} bytes to ${safePath}` };
    } catch (err: unknown) {
      const message = err instanceof PathTraversalError ? err.message : (err as Error)?.message || "Failed to write file";
      return { output: message, error: true };
    }
  },
});
