#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execa } from "execa";
import { formatToolError } from "./check-command.js";

const MAX_OUTPUT = 50000;

function truncate(output: string): string {
  return output.length > MAX_OUTPUT
    ? output.slice(0, MAX_OUTPUT) + "\n...(truncated)"
    : output;
}

function makeError(err: unknown, binary?: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: formatToolError(err, binary),
      },
    ],
    isError: true as const,
  };
}

const server = new Server(
  { name: "forensics-tools", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "binwalk_extract",
      description: "Extract embedded files from a binary using binwalk",
      inputSchema: {
        type: "object",
        properties: {
          file: { type: "string", description: "Path to file to analyze" },
          options: {
            type: "string",
            description: "Extra binwalk arguments",
          },
        },
        required: ["file"],
      },
    },
    {
      name: "exiftool_read",
      description: "Read file metadata using exiftool",
      inputSchema: {
        type: "object",
        properties: {
          file: { type: "string", description: "Path to file" },
        },
        required: ["file"],
      },
    },
    {
      name: "volatility_analyze",
      description: "Run Volatility memory forensics analysis",
      inputSchema: {
        type: "object",
        properties: {
          image: { type: "string", description: "Path to memory image" },
          plugin: {
            type: "string",
            description: 'Volatility plugin name (e.g. "pslist", "filescan")',
          },
        },
        required: ["image", "plugin"],
      },
    },
    {
      name: "tshark_capture",
      description: "Analyze network capture files using tshark",
      inputSchema: {
        type: "object",
        properties: {
          file: { type: "string", description: "Path to pcap file" },
          filter: {
            type: "string",
            description: "Display filter expression",
          },
          options: {
            type: "string",
            description: "Extra tshark arguments",
          },
        },
        required: ["file"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "binwalk_extract") {
    const file = args!.file as string;
    const extraOpts = args!.options as string | undefined;
    const bwArgs = [file];
    if (extraOpts) {
      bwArgs.push(...extraOpts.split(/\s+/));
    } else {
      bwArgs.push("-e");
    }

    try {
      const result = await execa("binwalk", bwArgs, {
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout + "\n" + result.stderr) },
        ],
      };
    } catch (err: unknown) {
      return makeError(err, "binwalk");
    }
  }

  if (name === "exiftool_read") {
    try {
      const result = await execa("exiftool", [args!.file as string], {
        timeout: 30000,
      });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout) },
        ],
      };
    } catch (err: unknown) {
      return makeError(err, "exiftool");
    }
  }

  if (name === "volatility_analyze") {
    const image = args!.image as string;
    const plugin = args!.plugin as string;
    const volArgs = ["-f", image, plugin];

    try {
      const result = await execa("vol", volArgs, {
        timeout: 300000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout + "\n" + result.stderr) },
        ],
      };
    } catch {
      // vol not found, try volatility3
      try {
        const result = await execa("volatility3", ["-f", image, plugin], {
          timeout: 300000,
          maxBuffer: 1024 * 1024,
        });
        return {
          content: [
            { type: "text" as const, text: truncate(result.stdout + "\n" + result.stderr) },
          ],
        };
      } catch (err: unknown) {
        return makeError(err, "volatility3");
      }
    }
  }

  if (name === "tshark_capture") {
    const file = args!.file as string;
    const filter = args!.filter as string | undefined;
    const extraOpts = args!.options as string | undefined;
    const tsharkArgs = ["-r", file];
    if (filter) tsharkArgs.push("-Y", filter);
    if (extraOpts) tsharkArgs.push(...extraOpts.split(/\s+/));

    try {
      const result = await execa("tshark", tsharkArgs, {
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout + "\n" + result.stderr) },
        ],
      };
    } catch (err: unknown) {
      return makeError(err, "tshark");
    }
  }

  return {
    content: [{ type: "text" as const, text: "Unknown tool" }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
