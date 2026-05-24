import { readFile } from "node:fs/promises";
import { open } from "node:fs/promises";
import { defineTool } from "./define.js";
import { resolveSecurePath, PathTraversalError, checkPermission } from "./security.js";

/**
 * Check if a file appears to be binary by scanning the first 1024 bytes for null bytes.
 * Returns true if more than 1% of the bytes are null or non-text (outside printable ASCII + common whitespace).
 */
function isBinaryFile(buffer: Buffer): boolean {
  const checkLen = Math.min(buffer.length, 1024);
  if (checkLen === 0) return false;
  let nonText = 0;
  for (let i = 0; i < checkLen; i++) {
    const b = buffer[i];
    // Count null bytes and bytes outside printable ASCII range (tab, newline, carriage return are OK)
    if (b === 0 || (b < 0x09) || (b > 0x0d && b < 0x20) || b > 0x7e) {
      nonText++;
    }
  }
  return (nonText / checkLen) > 0.01;
}

/**
 * Format a buffer as a hex dump (similar to xxd format):
 *   offset:  hex bytes  |  ASCII representation
 */
function formatHexDump(buffer: Buffer, offset: number = 0, maxBytes: number = 4096): string {
  const end = Math.min(offset + maxBytes, buffer.length);
  const slice = buffer.slice(offset, end);
  const lines: string[] = [];
  const bytesPerLine = 16;

  for (let i = 0; i < slice.length; i += bytesPerLine) {
    const chunk = slice.subarray(i, i + bytesPerLine);
    const hexParts: string[] = [];
    const asciiParts: string[] = [];

    for (let j = 0; j < bytesPerLine; j++) {
      if (j < chunk.length) {
        hexParts.push(chunk[j].toString(16).padStart(2, "0"));
        asciiParts.push(chunk[j] >= 0x20 && chunk[j] <= 0x7e ? String.fromCharCode(chunk[j]) : ".");
      } else {
        hexParts.push("  ");
        asciiParts.push(" ");
      }
      if (j === 7) hexParts.push(""); // extra space in the middle
    }

    const absOffset = offset + i;
    lines.push(
      `${absOffset.toString(16).padStart(8, "0")}: ${hexParts.join(" ")}  |${asciiParts.join("")}|`
    );
  }

  const header = `Hex dump (${buffer.length} bytes, showing ${slice.length} bytes):\n`;
  const truncated = end < buffer.length ? `\n...(truncated, ${buffer.length - end} more bytes. Use offset to continue)` : "";
  return header + lines.join("\n") + truncated;
}

export const ReadTool = defineTool({
  id: "read",
  description: "Read a file and return its contents with line numbers. For binary files, returns a formatted hex dump.",
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Path to the file to read",
      },
      offset: {
        type: "number",
        description: "Line number to start from (1-indexed). For hex dump mode, byte offset.",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to return (text mode). For hex dump, max bytes (default 4096).",
      },
    },
    required: ["filePath"],
  },
  execute: async (args, ctx) => {
    const permDenied = await checkPermission(ctx, "read", args.filePath);
    if (permDenied) return permDenied;
    try {
      const safePath = resolveSecurePath(args.filePath, ctx.workingDir);
      const fileHandle = await open(safePath, "r");
      try {
        // Read first 1024 bytes to check if binary
        const probeBuf = Buffer.alloc(1024);
        const { bytesRead } = await fileHandle.read(probeBuf, 0, 1024, 0);
        const header = probeBuf.subarray(0, bytesRead);

        if (isBinaryFile(header)) {
          // Binary file → return hex dump
          const fileStat = await fileHandle.stat();
          const totalSize = fileStat.size;
          const byteOffset = typeof args.offset === "number" ? args.offset : 0;
          const maxBytes = typeof args.limit === "number" ? args.limit : 4096;

          // Read from the specified offset
          const readBuf = Buffer.alloc(Math.min(maxBytes, totalSize - byteOffset));
          const { bytesRead: actualRead } = await fileHandle.read(readBuf, 0, readBuf.length, byteOffset);
          const data = readBuf.subarray(0, actualRead);

          return {
            output: `Binary file detected (${totalSize} bytes).\n\n${formatHexDump(data, byteOffset, maxBytes)}`,
          };
        }

        // Text file → read as UTF-8 and return with line numbers
        const fileStat = await fileHandle.stat();
        const textBuf = Buffer.alloc(Math.min(fileStat.size, 10 * 1024 * 1024)); // max 10MB text
        const { bytesRead: textRead } = await fileHandle.read(textBuf, 0, textBuf.length, 0);
        const content = textBuf.toString("utf-8", 0, textRead);

        const lines = content.split("\n");
        if (lines.length > 0 && lines[lines.length - 1] === "") {
          lines.pop();
        }

        const lineOffset = typeof args.offset === "number" ? args.offset : 1;
        const lineLimit = typeof args.limit === "number" ? args.limit : lines.length;

        const sliced = lines.slice(lineOffset - 1, lineOffset - 1 + lineLimit);
        const numbered = sliced
          .map((line, i) => `${lineOffset + i}: ${line}`)
          .join("\n");

        return { output: numbered };
      } finally {
        await fileHandle.close().catch(() => {});
      }
    } catch (err: unknown) {
      const message = err instanceof PathTraversalError ? err.message : (err as Error)?.message || "Failed to read file";
      return { output: message, error: true };
    }
  },
});
