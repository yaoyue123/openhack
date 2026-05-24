#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execa } from "execa";
import { formatToolError } from "./check-command.js";

const server = new Server(
  { name: "pwn-tools", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "checksec",
      description:
        "Check binary security features (NX, ASLR, Canary, PIE, RELRO)",
      inputSchema: {
        type: "object",
        properties: {
          binary: { type: "string", description: "Path to binary" },
        },
        required: ["binary"],
      },
    },
    {
      name: "disassemble",
      description: "Disassemble binary functions using objdump",
      inputSchema: {
        type: "object",
        properties: {
          binary: { type: "string" },
          function: {
            type: "string",
            description: "Function name (optional)",
          },
        },
        required: ["binary"],
      },
    },
    {
      name: "run_exploit",
      description:
        "Execute a Python exploit script (typically using pwntools)",
      inputSchema: {
        type: "object",
        properties: {
          script: { type: "string", description: "Python script content" },
          timeout: { type: "number", default: 30 },
        },
        required: ["script"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "checksec") {
    try {
      const result = await execa("checksec", ["--file=" + args!.binary], {
        timeout: 10000,
      });
      return {
        content: [{ type: "text" as const, text: result.stdout }],
      };
    } catch {
      try {
        const r = await execa("readelf", ["-l", args!.binary as string], {
          timeout: 10000,
        });
        return {
          content: [{ type: "text" as const, text: r.stdout }],
        };
      } catch (e2: unknown) {
        const eMsg = formatToolError(e2, "readelf");
        return {
          content: [{ type: "text" as const, text: eMsg }],
          isError: true,
        };
      }
    }
  }

  if (name === "disassemble") {
    const objdumpArgs = ["-d", args!.binary as string];
    if (args!.function) objdumpArgs.push("--disassemble=" + args!.function);
    try {
      const result = await execa("objdump", objdumpArgs, { timeout: 15000 });
      const output =
        result.stdout.length > 50000
          ? result.stdout.slice(0, 50000) + "\n...(truncated)"
          : result.stdout;
      return {
        content: [{ type: "text" as const, text: output }],
      };
    } catch (err: unknown) {
      const eMsg = formatToolError(err, "objdump");
      return {
        content: [{ type: "text" as const, text: eMsg }],
        isError: true,
      };
    }
  }

  if (name === "run_exploit") {
    try {
      const result = await execa("python3", ["-c", args!.script as string], {
        timeout: ((args!.timeout as number | undefined) ?? 30) * 1000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [
          { type: "text" as const, text: result.stdout + "\n" + result.stderr },
        ],
      };
    } catch (err: unknown) {
      const eMsg = formatToolError(err, "python3");
      return {
        content: [{ type: "text" as const, text: eMsg }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: "text" as const, text: "Unknown tool" }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
