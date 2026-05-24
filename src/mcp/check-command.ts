import { execa } from "execa";

const INSTALL_HINTS: Record<string, string> = {
  binwalk: "apt-get install binwalk",
  exiftool: "apt-get install exiftool",
  vol: "pip install volatility3",
  volatility3: "pip install volatility3",
  tshark: "apt-get install tshark",
  checksec: "apt-get install checksec",
  readelf: "apt-get install binutils",
  objdump: "apt-get install binutils",
  python3: "apt-get install python3",
  dirb: "apt-get install dirb",
  nikto: "apt-get install nikto",
  sqlmap: "pip install sqlmap",
  curl: "apt-get install curl",
  strings: "apt-get install binutils",
  xxd: "apt-get install xxd",
  od: "apt-get install coreutils",
  r2: "apt-get install radare2",
  analyzeHeadless: "Set GHIDRA_HOME and install Ghidra",
};

/**
 * Check if a system command is available.
 * Returns null if available, or an install hint string if not found.
 */
export async function checkCommand(binary: string): Promise<string | null> {
  try {
    if (process.platform === "win32") {
      // On Windows use where.exe
      await execa("where.exe", [binary], { timeout: 5000 });
    } else {
      await execa("which", [binary], { timeout: 5000 });
    }
    return null;
  } catch {
    const hint = INSTALL_HINTS[binary] ?? `Install ${binary}`;
    return `"${binary}" not found. To install: ${hint}`;
  }
}

/**
 * Create actionable error message from an execa error.
 * Detects ENOENT and maps to install hints.
 */
export function formatToolError(err: unknown, binary?: string): string {
  const e = err as { code?: string; stdout?: string; stderr?: string; message?: string };
  if (e.code === "ENOENT" && binary) {
    const hint = INSTALL_HINTS[binary] ?? `Install ${binary}`;
    return `"${binary}" not found. To install: ${hint}`;
  }
  return (e.stdout ?? "") + "\n" + (e.stderr ?? "") + "\n" + (e.message ?? String(err));
}
