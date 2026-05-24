import { execa } from "execa";
import { defineTool } from "./define.js";
import { isCommandAllowed, COMMAND_BLOCKED_MSG, checkPermission } from "./security.js";

/**
 * Resolve the Python command for the current platform.
 * Windows uses "python", Unix-like uses "python3".
 */
function resolvePythonCommand(): string {
  if (process.platform === "win32") {
    return "python";
  }
  return "python3";
}

export const PythonTool = defineTool({
  id: "python",
  description:
    "Execute a Python 3 script for analysis. Use for crypto decryption, pcap parsing, data analysis, exploit development. Python has pycryptodome, sympy, pwntools, and common crypto libraries available.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "Python 3 code to execute. Can be multi-line. Use print() to output results.",
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds (default 30)",
        default: 30,
      },
    },
    required: ["code"],
  },
  execute: async (args, ctx) => {
    const timeout =
      (typeof args.timeout === "number" ? args.timeout : 30) * 1000;
    // Check for dangerous operations in Python code
    if (!isCommandAllowed(args.code)) {
      return { output: COMMAND_BLOCKED_MSG, error: true };
    }
    const permDenied = await checkPermission(ctx, "python", args.code.slice(0, 80));
    if (permDenied) return permDenied;
    try {
      const pythonCmd = resolvePythonCommand();
      const result = await execa(pythonCmd, ["-c", args.code], {
        cwd: ctx.workingDir,
        timeout,
        maxBuffer: 1024 * 1024,
      });
      const output = result.stdout || "(no output)";
      const truncated =
        output.length > 10000
          ? output.slice(0, 10000) +
            `\n...(truncated, ${output.length} total bytes)`
          : output;
      return { output: truncated };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const combined = [e.stdout, e.stderr].filter(Boolean).join("\n");
      return {
        output: combined || e.message || "Python execution failed",
        error: true,
      };
    }
  },
});
