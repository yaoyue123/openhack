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
  { name: "web-tools", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "dirb_scan",
      description: "Run dirb directory scan against a URL",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Target URL" },
          wordlist: {
            type: "string",
            description: "Path to wordlist",
            default: "/usr/share/wordlists/dirb/common.txt",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "nikto_scan",
      description: "Run nikto web vulnerability scanner",
      inputSchema: {
        type: "object",
        properties: {
          target: { type: "string", description: "Target URL or host" },
        },
        required: ["target"],
      },
    },
    {
      name: "sqlmap_run",
      description: "Run sqlmap SQL injection tool",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Target URL" },
          options: {
            type: "string",
            description: "Extra sqlmap arguments",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "curl_request",
      description: "Make a custom curl request",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Target URL" },
          method: {
            type: "string",
            default: "GET",
            description: "HTTP method",
          },
          headers: {
            type: "string",
            description: "JSON string of headers",
          },
          data: {
            type: "string",
            description: "Request body data",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "jwt_decode",
      description: "Decode a JWT token without verification",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "JWT token string" },
        },
        required: ["token"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "dirb_scan") {
    const wordlist =
      (args!.wordlist as string | undefined) ??
      "/usr/share/wordlists/dirb/common.txt";
    try {
      const result = await execa("dirb", [args!.url as string, wordlist], {
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout + "\n" + result.stderr) },
        ],
      };
    } catch (err: unknown) {
      return makeError(err, "dirb");
    }
  }

  if (name === "nikto_scan") {
    try {
      const result = await execa("nikto", ["-h", args!.target as string], {
        timeout: 300000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout + "\n" + result.stderr) },
        ],
      };
    } catch (err: unknown) {
      return makeError(err, "nikto");
    }
  }

  if (name === "sqlmap_run") {
    const sqlmapArgs = ["-u", args!.url as string, "--batch"];
    const extra = args!.options as string | undefined;
    if (extra) {
      sqlmapArgs.push(...extra.split(/\s+/));
    }
    try {
      const result = await execa("sqlmap", sqlmapArgs, {
        timeout: 300000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout + "\n" + result.stderr) },
        ],
      };
    } catch (err: unknown) {
      return makeError(err, "sqlmap");
    }
  }

  if (name === "curl_request") {
    const method = (args!.method as string | undefined) ?? "GET";
    const curlArgs = ["-s", "-X", method];

    const headersRaw = args!.headers as string | undefined;
    if (headersRaw) {
      try {
        const parsed = JSON.parse(headersRaw) as Record<string, string>;
        for (const [key, value] of Object.entries(parsed)) {
          curlArgs.push("-H", `${key}: ${value}`);
        }
      } catch {
        return {
          content: [
            { type: "text" as const, text: "Invalid headers JSON" },
          ],
          isError: true,
        };
      }
    }

    const data = args!.data as string | undefined;
    if (data) {
      curlArgs.push("-d", data);
    }

    curlArgs.push(args!.url as string);

    try {
      const result = await execa("curl", curlArgs, {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout) },
        ],
      };
    } catch (err: unknown) {
      return makeError(err, "curl");
    }
  }

  if (name === "jwt_decode") {
    const token = args!.token as string;
    const parts = token.split(".");
    if (parts.length !== 3) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Invalid JWT: expected 3 parts separated by dots",
          },
        ],
        isError: true,
      };
    }

    function base64urlDecode(str: string): string {
      const padded = str.replace(/-/g, "+").replace(/_/g, "/");
      const pad = padded.length % 4;
      const base64 =
        pad === 0
          ? padded
          : pad === 2
            ? padded + "=="
            : pad === 3
              ? padded + "="
              : padded;
      return Buffer.from(base64, "base64").toString("utf-8");
    }

    try {
      const header = JSON.parse(base64urlDecode(parts[0]));
      const payload = JSON.parse(base64urlDecode(parts[1]));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { header, payload, signature: parts[2] },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [
          {
            type: "text" as const,
            text: err instanceof Error ? err.message : String(err),
          },
        ],
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
