import type { AgentDef } from "./types.js";
import type { PermissionRule } from "../config/schema.js";

const TRIAGE_PROMPT = `CTF triage agent. Analyze challenge artifacts → classify category → delegate to specialist.

1. Read all files, identify indicators (binary → pwn/rev, pcap → forensics, URLs → web, ciphertext → crypto)
2. Classify into: web, pwn, reverse, crypto, forensics, misc
3. Delegate to specialist with findings — do not solve yourself

Be concise. Evidence-based classification only.`;

const WEB_PROMPT = `Web exploitation specialist.

Attack surface: SQLi (union/blind/time), XSS (reflected/stored/DOM), LFI/RFI, SSRF, CSRF, auth bypass, deserialization, race conditions.

Recon first: enumerate endpoints and technologies before attacking.`;

const PWN_PROMPT = `Binary exploitation specialist.

Attacks: buffer overflow (stack/heap), ROP, format string, UAF/double-free, integer overflow, ret2libc/ret2plt.

Workflow: checksec → disassemble → find vuln → pwntools exploit.`;

const REVERSE_PROMPT = `Reverse engineering specialist.

Tools: objdump, readelf, strings, gdb, strace, ltrace.

Workflow: file type → strings/symbols → disassemble key functions → understand algorithm → extract flag/key.`;

const CRYPTO_PROMPT = `Cryptography specialist.

Attacks: frequency analysis, known-plaintext, padding oracle, RSA (small exponent, factorization), block cipher (ECB/CBC), hash collisions, length extension.

Identify algorithm first, then find implementation flaws.`;

const FORENSICS_PROMPT = `Digital forensics specialist.

Techniques: file carving, steganography, pcap analysis, memory dumps, log analysis, metadata extraction, disk images.

Always identify file type via magic bytes first.`;

const MISC_PROMPT = `Miscellaneous challenges specialist.

Types: encoding/obfuscation, OSINT, programming puzzles, math, esoteric languages.

Try multiple approaches. Be creative.`;

const READ_ONLY: PermissionRule[] = [
  { tool: "bash", pattern: "file *", action: "allow" },
  { tool: "bash", pattern: "strings *", action: "allow" },
  { tool: "bash", pattern: "curl *", action: "allow" },
  { tool: "bash", pattern: "head *", action: "allow" },
  { tool: "bash", pattern: "cat *", action: "allow" },
  { tool: "read", pattern: "**/*", action: "allow" },
  { tool: "glob", pattern: "**/*", action: "allow" },
  { tool: "delegate", pattern: "*", action: "allow" },
];

const FULL_PERMISSIONS: PermissionRule[] = [
  { tool: "*", pattern: "*", action: "allow" },
];

export const BUILTIN_AGENTS: AgentDef[] = [
  {
    name: "triage",
    mode: "primary",
    description: "Analyzes challenges to determine category and delegates to specialist agents",
    basePrompt: TRIAGE_PROMPT,
    permissions: READ_ONLY,
    skills: [],
    excludeTools: ["write", "edit", "python", "state-write", "memory-write"],
  },
  {
    name: "web",
    mode: "specialist",
    description: "Web exploitation specialist for SQL injection, XSS, SSRF, etc.",
    basePrompt: WEB_PROMPT,
    permissions: FULL_PERMISSIONS,
    skills: ["web"],
    mcpServers: ["web"],
  },
  {
    name: "pwn",
    mode: "specialist",
    description: "Binary exploitation specialist for buffer overflows, ROP, format strings, etc.",
    basePrompt: PWN_PROMPT,
    permissions: FULL_PERMISSIONS,
    skills: ["pwn"],
    mcpServers: ["pwn"],
  },
  {
    name: "reverse",
    mode: "specialist",
    description: "Reverse engineering specialist for binary analysis and algorithm extraction",
    basePrompt: REVERSE_PROMPT,
    permissions: FULL_PERMISSIONS,
    skills: ["reverse"],
    mcpServers: ["rev"],
  },
  {
    name: "crypto",
    mode: "specialist",
    description: "Cryptography specialist for breaking weak crypto implementations",
    basePrompt: CRYPTO_PROMPT,
    permissions: FULL_PERMISSIONS,
    skills: ["crypto"],
  },
  {
    name: "forensics",
    mode: "specialist",
    description: "Digital forensics specialist for file analysis, steganography, pcap analysis",
    basePrompt: FORENSICS_PROMPT,
    permissions: FULL_PERMISSIONS,
    skills: ["forensics"],
    mcpServers: ["forensics"],
  },
  {
    name: "misc",
    mode: "specialist",
    description: "Miscellaneous challenges specialist for encoding, OSINT, programming puzzles",
    basePrompt: MISC_PROMPT,
    permissions: FULL_PERMISSIONS,
    skills: ["misc"],
  },
];

export const SPECIALIST_NAMES = BUILTIN_AGENTS
  .filter((a) => a.mode === "specialist")
  .map((a) => a.name);
