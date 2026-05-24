import { execa } from "execa";
import { defineTool } from "./define.js";
import { isCommandAllowed, COMMAND_BLOCKED_MSG, checkPermission } from "./security.js";

/**
 * On Windows, many Unix commands (strings, head, file, xxd, od) are not available.
 * This map provides suggestions for common alternatives.
 */
const WINDOWS_ALT_SUGGESTIONS: Record<string, string> = {
  strings: "Use `findstr` for text search, or `python -c \"...\"` for binary strings extraction",
  xxd: "Use `python -c \"open('f','rb').read().hex()\"` for hex dump",
  head: "Use `Get-Content -Head` in PowerShell, or `Select-Object -First`",
  tail: "Use `Get-Content -Tail` in PowerShell",
  file: "Use `python -c \"import struct; f=open('f','rb'); print(f.read(16).hex())\"` for magic bytes",
  od: "Use `python -c \"open('f','rb').read()\"` for octal/hex dump",
  objdump: "Not available. Use `python` with pefile/pyelftools or the reverse MCP server",
  readelf: "Not available. Use `python` with pyelftools",
  tshark: "Not available. Install Wireshark or use `python` with scapy for pcap analysis",
  binwalk: "Not available. Use `python` for file carving",
};

function getPlatformHint(): string {
  if (process.platform === "win32") {
    return "Running on Windows. Many Linux commands (strings, xxd, file, head, od) are NOT available. Use: python for hex/binary, findstr for text search, dir for listing.";
  }
  return "";
}

export const ShellTool = defineTool({
  id: "bash",
  description: `Execute a shell command and return its output. ${getPlatformHint()}`,
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: `The shell command to execute.${process.platform === "win32" ? " NOTE: Windows cmd.exe is used. Many Unix commands (strings,xxd,file,head) do NOT exist. Use python, findstr, or PowerShell alternatives." : ""}`,
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds",
        default: 30000,
      },
    },
    required: ["command"],
  },
  execute: async (args, ctx) => {
    const timeout = typeof args.timeout === "number" ? args.timeout : 30000;
    if (!isCommandAllowed(args.command)) {
      return { output: COMMAND_BLOCKED_MSG, error: true };
    }
    const permDenied = await checkPermission(ctx, "bash", args.command);
    if (permDenied) return permDenied;
    try {
      const result = await execa(args.command, {
        shell: true,
        cwd: ctx.workingDir,
        timeout,
        maxBuffer: 1024 * 1024,
      });
      return { output: result.stdout };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const combined = [e.stdout, e.stderr].filter(Boolean).join("\n");

      // Check if the error suggests a missing Unix command on Windows
      const errorMsg = combined || e.message || "";
      if (process.platform === "win32") {
        const lower = errorMsg.toLowerCase();
        for (const [cmd, suggestion] of Object.entries(WINDOWS_ALT_SUGGESTIONS)) {
          if (lower.includes(`'${cmd}'`) || lower.includes(cmd) || lower.includes(`"${cmd}"`)) {
            return {
              output: `${errorMsg}\n\nTip: '${cmd}' is a Linux command not available on Windows. ${suggestion}`,
              error: true,
            };
          }
        }
      }

      return {
        output: errorMsg || "Command failed",
        error: true,
      };
    }
  },
});
