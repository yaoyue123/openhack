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

Tools: read tool (hex dump), python (for binary analysis), strings extraction via python.

Workflow: identify file type (magic bytes via python) → find symbols/strings → analyze key functions → understand algorithm → extract flag/key.

For .pyc files: use xdis to extract constants and decompile.`;

const CRYPTO_PROMPT = `Cryptography specialist.

## Workflow

1. Identify: Read challenge files to determine cipher type (RSA, AES, XOR, etc.)
2. Extract: Get key parameters (n,e,c,p,q,iv,key,ciphertext) from files or .pyc constants
3. Analyze: Apply the appropriate attack from the crypto skill knowledge
4. Solve: Write a python script to decrypt/recover the flag
5. Verify: Use the flag tool

## Handling .pyc (Python Compiled) Files

- Use \`read\` tool to get a hex dump of the .pyc file
- Use python with xdis to extract constants: \`from xdis import load_module; import marshal\`
- Common RSA pattern: p and q stored as Python integers in .pyc constants
- Extract with: \`xdis\` → \`code.co_consts\` contains embedded values (p, q, e, c, n)

## RSA Attack Quick Reference

- Known p,q,e,c: \`m = pow(c, pow(e, -1, (p-1)*(q-1)), n)\`
- Small e (3, 5): Take integer eth root of c
- Small d: Wiener's attack continued fraction
- p,q close: Fermat factorization
- gcd(n1, n2) > 1: Shared prime factoring
- Known plaintext: XOR or RSA homomorphism

## Key Python Packages Available

- pycryptodome (Crypto.Util.number, Crypto.PublicKey.RSA)
- sympy (factorint, isprime, nextprime)
- xdis, uncompyle6 (for .pyc processing)
- scapy (for pcap)

## General Approach

Identify algorithm first, then find implementation flaws. Use python for all computation.`;

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
