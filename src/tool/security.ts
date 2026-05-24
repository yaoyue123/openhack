import * as path from "node:path";

export class PathTraversalError extends Error {
  constructor(userPath: string) {
    super(`Path traversal detected: ${userPath}`);
    this.name = "PathTraversalError";
  }
}

/**
 * Resolves a user-provided path against an allowed base directory.
 * Prevents directory traversal attacks by ensuring the resolved path
 * stays within the allowed base directory.
 *
 * @param userPath - The path provided by the user/agent
 * @param allowedBase - The root directory that access should be limited to
 * @returns The resolved safe absolute path
 * @throws PathTraversalError if the resolved path escapes the base directory
 */
export function resolveSecurePath(
  userPath: string,
  allowedBase: string,
): string {
  const resolved = path.resolve(allowedBase, userPath);
  const normalizedBase = path.resolve(allowedBase);

  if (
    !resolved.startsWith(normalizedBase + path.sep) &&
    resolved !== normalizedBase
  ) {
    throw new PathTraversalError(userPath);
  }
  return resolved;
}

// ── Shell command safety ─────────────────────────────────────────────────────

/**
 * Patterns that indicate dangerous/destructive shell commands.
 * These are checked as substrings (case-insensitive) against the command string.
 */
const BLOCKED_COMMAND_PATTERNS: (string | RegExp)[] = [
  "rm -rf /",
  "rm -rf --no-preserve-root",
  "dd if=",
  /(?:^|\s)dd(?:\s|$)/,  // standalone dd (whole word)
  "mkfs",
  "fdisk",
  "mkswap",
  ":(){",           // fork bomb
  "chmod 777 /",
  "> /dev/sda",
  "> /dev/hda",
  "shutdown",
  "reboot",
  "poweroff",
  "halt",
  "init 0",
  "init 6",
  "wget -O /",
  "curl -o /",
  "mv /* ",
  "cp /* ",
];

/**
 * Checks if a shell command is safe to execute.
 * Returns true if the command is allowed, false if it matches dangerous patterns.
 */
export function isCommandAllowed(command: string): boolean {
  const lower = command.toLowerCase().trim();
  if (!lower) return false;
  for (const pattern of BLOCKED_COMMAND_PATTERNS) {
    if (typeof pattern === "string") {
      if (lower.includes(pattern)) return false;
    } else if (pattern instanceof RegExp) {
      if (pattern.test(lower)) return false;
    }
  }
  return true;
}

export const COMMAND_BLOCKED_MSG = "Command blocked: potentially dangerous operation.";

/**
 * Permission check convenience function.
 * Returns a permission-denied ToolResult if the check fails, or null if allowed.
 */
export async function checkPermission(
  ctx: { permissionCheck?: (tool: string, target: string) => Promise<boolean> },
  toolId: string,
  target: string,
): Promise<{ output: string; error: true } | null> {
  if (ctx.permissionCheck) {
    const allowed = await ctx.permissionCheck(toolId, target);
    if (!allowed) {
      return { output: `Permission denied: ${toolId} on "${target}"`, error: true };
    }
  }
  return null;
}
