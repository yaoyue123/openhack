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
  description: [
    "Execute a Python 3 script for analysis, exploit development, and data processing.",
    "",
    "WHEN TO USE:",
    "  - Crypto: AES/DES/RSA decryption with pycryptodome, XOR ciphers, hash cracking",
    "  - Network: HTTP requests (requests library), socket programming, raw packet crafting",
    "  - Binary analysis: struct.unpack for binary parsing, pefile for PE analysis",
    "  - Exploit development: pwntools for pwn challenges, payload construction",
    "  - Data analysis: base64/hex encoding, JSON parsing, regex extraction",
    "  - Web attacks: constructing serialized payloads (PHP serialize, pickle), JWT manipulation",
    "",
    "LIMITATIONS:",
    "  - Default timeout 30 seconds — increase timeout param for long computations",
    "  - Output truncated at 10KB — use file I/O for large results",
    "  - Not all packages may be installed — check error hints for pip install suggestions",
    "",
    "ALTERNATIVES:",
    "  - For simple HTTP GET: use webfetch (no code needed)",
    "  - For running CLI tools: use bash (sqlmap, nmap, etc.)",
    "  - For file content search: use grep (no code needed)",
    "",
    "TIPS:",
    "  - Use print() to output results — stdout is captured",
    "  - For PHP deserialization: import struct; construct payloads with precise byte counting",
    "  - For crypto challenges: from Crypto.Cipher import AES; from Crypto.Util.Padding import unpad",
    "  - Common libraries available: pycryptodome, sympy, requests, pwntools",
  ].join("\n"),
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
      const e = err as { stdout?: string; stderr?: string; message?: string; timedOut?: boolean };
      // Structured error feedback for LLM self-repair
      const parts: string[] = ["[Python Error]"];

      if (e.timedOut) {
        parts.push("Execution timed out. Try optimizing your script or increase the timeout parameter.");
      }

      const stderr = e.stderr?.trim();
      const stdout = e.stdout?.trim();
      if (stderr) {
        // Extract the most useful part: last traceback + error message
        const tracebackLines = stderr.split("\n");
        // Find the last occurrence of "Traceback" for multi-error scripts
        let lastTraceIdx = -1;
        for (let i = tracebackLines.length - 1; i >= 0; i--) {
          if (tracebackLines[i].startsWith("Traceback")) {
            lastTraceIdx = i;
            break;
          }
        }
        if (lastTraceIdx >= 0) {
          parts.push(tracebackLines.slice(lastTraceIdx).join("\n"));
        } else {
          // No traceback found, include last 10 lines
          parts.push(tracebackLines.slice(-10).join("\n"));
        }
      }
      if (stdout && !stderr?.includes(stdout)) {
        parts.push(`Partial output: ${stdout.slice(0, 2000)}`);
      }

      // Hint for common errors
      const errorMsg = stderr ?? e.message ?? "";
      if (/ModuleNotFoundError|ImportError/.test(errorMsg)) {
        const match = errorMsg.match(/No module named ['"]?(\S+?)['"]?/);
        if (match) {
          parts.push(`Hint: Install with 'pip install ${match[1]}' or use an alternative library.`);
        }
      }
      if (/SyntaxError/.test(errorMsg)) {
        parts.push("Hint: Check for Python syntax errors (missing colon, quotes, parentheses, indentation).");
      }
      if (/NameError/.test(errorMsg)) {
        const match = errorMsg.match(/name '(\w+)' is not defined/);
        if (match) {
          parts.push(`Hint: Variable '${match[1]}' is not defined. Make sure to define it before use or extract it from the challenge data first.`);
        }
      }

      const combined = parts.join("\n");
      return {
        output: combined,
        error: true,
      };
    }
  },
});
