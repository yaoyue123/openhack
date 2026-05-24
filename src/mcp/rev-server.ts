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
  { name: "rev-tools", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ghidra_decompile",
      description: "Run Ghidra headless decompile on a binary",
      inputSchema: {
        type: "object",
        properties: {
          binary: { type: "string", description: "Path to binary file" },
          function: {
            type: "string",
            description: "Function to decompile (optional, decompiles all if omitted)",
          },
        },
        required: ["binary"],
      },
    },
    {
      name: "strings_extract",
      description: "Extract printable strings from a binary",
      inputSchema: {
        type: "object",
        properties: {
          binary: { type: "string", description: "Path to binary file" },
          minLength: {
            type: "number",
            default: 4,
            description: "Minimum string length",
          },
          encoding: {
            type: "string",
            description: "Character encoding (e.g. 'l' for little-endian 16-bit, 'b' for big-endian 16-bit)",
          },
        },
        required: ["binary"],
      },
    },
    {
      name: "hexdump",
      description: "Hex dump of a file",
      inputSchema: {
        type: "object",
        properties: {
          file: { type: "string", description: "Path to file" },
          length: {
            type: "number",
            default: 256,
            description: "Number of bytes to dump",
          },
          offset: {
            type: "number",
            default: 0,
            description: "Starting offset",
          },
        },
        required: ["file"],
      },
    },
    {
      name: "r2_analyze",
      description: "Run radare2 analysis on a binary",
      inputSchema: {
        type: "object",
        properties: {
          binary: { type: "string", description: "Path to binary file" },
          command: {
            type: "string",
            description: 'Radare2 command string (e.g. "aaa; pdf @main")',
          },
        },
        required: ["binary", "command"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "ghidra_decompile") {
    const binary = args!.binary as string;
    const func = args!.function as string | undefined;
    const projectDir = `/tmp/ghidra_${Date.now()}`;
    const scriptPath = `/tmp/ghidra_decompile_${Date.now()}.py`;

    const scriptContent = func
      ? `import ghidra.app.decompiler.DecompInterface as DI\n` +
        `di = DI()\n` +
        `di.openProgram(currentProgram)\n` +
        `fn = getFunction(func)\n` +
        `if fn:\n` +
        `  result = di.decompileFunction(fn, 60, None)\n` +
        `  print(result.getDecompiledFunction())\n` +
        `else:\n` +
        `  print("Function not found")\n`
      : `import ghidra.app.decompiler.DecompInterface as DI\n` +
        `di = DI()\n` +
        `di.openProgram(currentProgram)\n` +
        `fm = currentProgram.getFunctionManager()\n` +
        `for fn in fm.getFunctions(True):\n` +
        `  result = di.decompileFunction(fn, 60, None)\n` +
        `  if result:\n` +
        `    print(f"=== {fn.getName()} ===")\n` +
        `    print(result.getDecompiledFunction())\n`;

    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(scriptPath, scriptContent);

      const ghidraArgs = [
        process.env.GHIDRA_HOME ?? "/opt/ghidra",
        binary,
        "-projectLocation",
        projectDir,
        "-scriptPath",
        scriptPath,
      ];
      if (func) ghidraArgs.push("-scriptParam", `func=${func}`);

      const result = await execa("analyzeHeadless", ghidraArgs, {
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout + "\n" + result.stderr) },
        ],
      };
    } catch (err: unknown) {
      return makeError(err, "analyzeHeadless");
    }
  }

  if (name === "strings_extract") {
    const binary = args!.binary as string;
    const minLength = (args!.minLength as number | undefined) ?? 4;
    const encoding = args!.encoding as string | undefined;
    const stringsArgs = ["-n", String(minLength)];
    if (encoding) stringsArgs.push("-e", encoding);
    stringsArgs.push(binary);

    try {
      const result = await execa("strings", stringsArgs, {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout) },
        ],
      };
    } catch (err: unknown) {
      return makeError(err, "strings");
    }
  }

  if (name === "hexdump") {
    const file = args!.file as string;
    const length = (args!.length as number | undefined) ?? 256;
    const offset = (args!.offset as number | undefined) ?? 0;
    const xxdArgs = ["-s", String(offset), "-l", String(length), file];

    try {
      const result = await execa("xxd", xxdArgs, { timeout: 10000 });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout) },
        ],
      };
    } catch {
      try {
        const odArgs = [
          "-A",
          "x",
          "-t",
          "x1z",
          "-v",
          "-N",
          String(length),
          "-j",
          String(offset),
          file,
        ];
        const result = await execa("od", odArgs, { timeout: 10000 });
        return {
          content: [
            { type: "text" as const, text: truncate(result.stdout) },
          ],
        };
      } catch (err: unknown) {
        return makeError(err, "od");
      }
    }
  }

  if (name === "r2_analyze") {
    const binary = args!.binary as string;
    const command = args!.command as string;
    const r2Args = ["-q", "-e", "scr.color=0", "-c", command, binary];

    try {
      const result = await execa("r2", r2Args, {
        timeout: 60000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [
          { type: "text" as const, text: truncate(result.stdout + "\n" + result.stderr) },
        ],
      };
    } catch (err: unknown) {
      return makeError(err, "r2");
    }
  }

  return {
    content: [{ type: "text" as const, text: "Unknown tool" }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
