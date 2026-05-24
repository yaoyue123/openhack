# Interactive REPL Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive REPL mode as the default `openhack` command, with context-aware status animations, multi-line input, slash commands, and full CTF integration.

**Architecture:** Upgrade the existing Ink-based REPL in `src/repl/` by extending `REPLHandle` with status/tool callbacks, adding a Spinner component with context-aware labels, a SlashCommandRegistry for in-REPL commands, and wiring a yargs `$0` default command to launch it. Extract solve logic into a shared module for reuse.

**Tech Stack:** TypeScript ESM, Ink 7 (React for terminal), React 19, yargs 18, Vercel AI SDK 6, vitest for testing.

**Spec:** `docs/superpowers/specs/2026-05-24-interactive-repl-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/repl/types.ts` | Create | Shared types: `AgentStatus`, `ToolCallStatus`, `SlashContext`, `SlashCommand` |
| `src/agent-loop.ts` | Modify | Add `abortSignal` option, extend `onToolCall` with result param |
| `src/session/store.ts` | Modify | Add optional `messages` field to `Session` interface |
| `src/solve.ts` | Create | Extracted solve logic, shared by CLI and `/solve` slash command |
| `src/repl/components/Spinner.tsx` | Create | Context-aware Braille spinner with status labels |
| `src/repl/components/Welcome.tsx` | Create | ASCII art welcome screen with version |
| `src/repl/components/ToolCallDisplay.tsx` | Modify | Add `status` and `detail` props, argument summarization |
| `src/repl/components/Input.tsx` | Modify | Multi-line (`\` continuation), slash command detection, input history |
| `src/repl/slash-commands.ts` | Create | `SlashCommandRegistry` + 10 command implementations |
| `src/repl/index.tsx` | Modify | Extend `REPLHandle` with status/tool/streaming-buffer methods |
| `src/index.ts` | Modify | Add `$0` default command, remove `demandCommand`/`strict` |
| `src/repl/__tests__/slash-commands.test.ts` | Create | Tests for slash command parsing |
| `src/repl/__tests__/spinner.test.ts` | Create | Tests for tool-to-status mapping |

---

## Chunk 1: Foundation Layer

### Task 1: Create shared REPL types

**Files:**
- Create: `src/repl/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/repl/types.ts

/** Agent status for the spinner display */
export type AgentStatus =
  | "idle"
  | "thinking"
  | "reading"
  | "executing"
  | "writing"
  | "analyzing";

/** Tool call display status */
export type ToolCallStatus = "pending" | "success" | "error";

/** Maps tool IDs to their display status */
export const TOOL_STATUS_MAP: Record<string, AgentStatus> = {
  read: "reading",
  glob: "reading",
  grep: "reading",
  bash: "executing",
  python: "executing",
  write: "writing",
  edit: "writing",
};

/** Get the agent status for a given tool ID */
export function getToolStatus(toolId: string): AgentStatus {
  return TOOL_STATUS_MAP[toolId] ?? "analyzing";
}

/** Maps agent status to display label */
export const STATUS_LABELS: Record<Exclude<AgentStatus, "idle">, string> = {
  thinking: "thinking",
  reading: "reading file",
  executing: "running command",
  writing: "writing file",
  analyzing: "analyzing",
};

/** Maps agent status to display color */
export const STATUS_COLORS: Record<Exclude<AgentStatus, "idle">, string> = {
  thinking: "gray",
  reading: "yellow",
  executing: "cyan",
  writing: "magenta",
  analyzing: "blue",
};
```

- [ ] **Step 2: Write test for tool-to-status mapping**

```typescript
// src/repl/__tests__/spinner.test.ts
import { describe, it, expect } from "vitest";
import { getToolStatus, TOOL_STATUS_MAP } from "../types.js";

describe("getToolStatus", () => {
  it("maps read tools to 'reading'", () => {
    expect(getToolStatus("read")).toBe("reading");
    expect(getToolStatus("glob")).toBe("reading");
    expect(getToolStatus("grep")).toBe("reading");
  });

  it("maps execution tools to 'executing'", () => {
    expect(getToolStatus("bash")).toBe("executing");
    expect(getToolStatus("python")).toBe("executing");
  });

  it("maps write tools to 'writing'", () => {
    expect(getToolStatus("write")).toBe("writing");
    expect(getToolStatus("edit")).toBe("writing");
  });

  it("defaults unknown tools to 'analyzing'", () => {
    expect(getToolStatus("flag")).toBe("analyzing");
    expect(getToolStatus("webfetch")).toBe("analyzing");
    expect(getToolStatus("unknown")).toBe("analyzing");
  });

  it("all TOOL_STATUS_MAP values are valid AgentStatus", () => {
    const validStatuses = ["reading", "executing", "writing"];
    for (const status of Object.values(TOOL_STATUS_MAP)) {
      expect(validStatuses).toContain(status);
    }
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/repl/__tests__/spinner.test.ts`
Expected: 5 tests PASS

- [ ] **Step 4: Commit**

```
feat(repl): add shared types for agent status and tool mapping
```

---

### Task 2: Add abortSignal to agent-loop

**Files:**
- Modify: `src/agent-loop.ts`
- Test: `npx vitest run` (existing tests must still pass)

- [ ] **Step 1: Add abortSignal to AgentLoopOptions**

In `src/agent-loop.ts`, add to the `AgentLoopOptions` interface (after `onFlag`):

```typescript
  abortSignal?: AbortSignal;
```

- [ ] **Step 2: Pass signal to streamText**

In `src/agent-loop.ts`, modify the `streamText` call (line ~172) to include the signal:

Change:
```typescript
    const result = streamText({
      model: provider.languageModel(),
      system: systemPrompt,
      messages,
      tools: aiTools,
      stopWhen: stepCountIs(Math.min(maxIterations - iteration, 10)),
```

To:
```typescript
    const result = streamText({
      model: provider.languageModel(),
      system: systemPrompt,
      messages,
      tools: aiTools,
      abortSignal: options.abortSignal,
      stopWhen: stepCountIs(Math.min(maxIterations - iteration, 10)),
```

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run`
Expected: All existing tests PASS (abortSignal is optional, backward-compatible)

- [ ] **Step 4: Commit**

```
feat(agent-loop): add optional AbortSignal for stream cancellation
```

---

### Task 3: Add messages field to Session

**Files:**
- Modify: `src/session/store.ts`

- [ ] **Step 1: Add messages field to Session interface**

In `src/session/store.ts`, add to the `Session` interface (after `agentHistory`):

```typescript
  messages?: unknown[];
```

Using `unknown[]` to avoid importing `ModelMessage` from `ai` package (session store is a plain JSON persistence layer).

- [ ] **Step 2: Verify existing tests pass**

Run: `npx vitest run`
Expected: PASS (messages is optional, no existing code writes to it)

- [ ] **Step 3: Commit**

```
feat(session): add optional messages field for REPL history persistence
```

---

### Task 4: Extract solve logic into shared module

**Files:**
- Create: `src/solve.ts`
- Modify: `src/index.ts` (refactor `solve` command to use shared function)

- [ ] **Step 1: Create src/solve.ts with extracted logic**

Extract the core solve logic from the `solve` command handler in `src/index.ts` (lines 153-309). The function signature:

```typescript
// src/solve.ts
import type { Provider } from "./llm/provider.js";
import type { ToolRegistry } from "./tool/registry.js";
import type { ToolContext } from "./tool/types.js";
import type { OpenhackConfig } from "./config/schema.js";
import type { AgentRegistry } from "./agent/registry.js";
import type { SkillRegistry } from "./skill/registry.js";
import type { MCPLifecycle } from "./mcp/lifecycle.js";
import type { DelegateRequest } from "./agent/types.js";
import type { Session } from "./session/store.js";
import { runAgent } from "./agent/runtime.js";
import { SessionStore } from "./session/store.js";

export interface SolveCallbacks {
  onToken: (token: string) => void;
  onToolCall: (tool: string, args: unknown) => void;
  onFlag: (flag: string) => Promise<void>;
  onDelegate?: (req: DelegateRequest) => Promise<import("./agent/runtime.js").AgentRunResult>;
}

export interface SolveOptions {
  workDir: string;
  paths: string[];
  agentName?: string;
  config: OpenhackConfig;
  provider: Provider;
  tools: ToolRegistry;
  toolContext: ToolContext;
  skillRegistry: SkillRegistry;
  agentRegistry: AgentRegistry;
  mcpLifecycle: MCPLifecycle;
  session?: Session;
  callbacks: SolveCallbacks;
}

export async function runSolve(options: SolveOptions): Promise<{
  session: Session;
  flags: string[];
  iterations: number;
  terminationReason: string;
}> {
  // ... extracted from index.ts solve command handler
  // This is a mechanical extraction - move the body of the solve handler here
  // Replace direct process.stdout.write calls with options.callbacks.onToken etc.
}
```

Note: This is a **mechanical extraction**. The body is copied from `index.ts` lines 153-309 with:
- `process.stdout.write(token)` → `options.callbacks.onToken(token)`
- `process.stdout.write(\`\n[tool: ${tool}]\n\`)` → `options.callbacks.onToolCall(tool, a)`
- Session management stays the same
- All imports stay the same

- [ ] **Step 2: Refactor index.ts solve command to call runSolve**

In `src/index.ts`, replace the solve command handler body with:

```typescript
    async (args) => {
      const paths = (args.path as string[]) ?? [];
      const workDir = paths[0] ?? process.cwd();

      const agentRegistry = await AgentRegistry.createWithUserAgents(workDir);
      const agentName = (args.agent as string | undefined) ?? args.category ?? undefined;
      const agent = agentName ? agentRegistry.get(agentName) : agentRegistry.getDefault();
      if (!agent) {
        console.error(`Unknown agent: ${agentName}`);
        process.exit(1);
      }

      const runtime = createAppRuntime(workDir);
      const mcpLifecycle = new MCPLifecycle();
      try {
        const config = await runtime.runPromise(
          Effect.flatMap(ConfigService, (svc) => svc.get()),
        ) as OpenhackConfig;

        const modelOverride = args.model !== "default" ? (args.model as string) : null;
        const llmConfig = modelOverride ? { ...config.llm, model: modelOverride } : config.llm;
        const provider = createProvider(llmConfig);
        const registry_tools = ToolRegistry.createBuiltin();
        const skillRegistry = await SkillRegistry.create(process.cwd());
        const toolContext: ToolContext = { workingDir: workDir, sessionId: "cli", permissionCheck: async () => true };

        const result = await runSolve({
          workDir, paths, agentName: agent?.name, config, provider,
          tools: registry_tools, toolContext, skillRegistry, agentRegistry, mcpLifecycle,
          callbacks: {
            onToken: (token) => process.stdout.write(token),
            onToolCall: (tool) => process.stdout.write(`\n[tool: ${tool}]\n`),
            onFlag: async (flag) => process.stdout.write(`\n🚩 FLAG DETECTED: ${flag}\n`),
          },
        });

        process.stdout.write(`\nSession: ${result.session.id} (${result.session.state})\n\n`);
      } finally {
        await mcpLifecycle.stopAll().catch(() => {});
        await runtime.dispose();
      }
    },
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```
refactor: extract solve logic into src/solve.ts for CLI and REPL reuse
```

---

## Chunk 2: UI Components

### Task 5: Create Spinner component

**Files:**
- Create: `src/repl/components/Spinner.tsx`

- [ ] **Step 1: Create Spinner component**

```tsx
// src/repl/components/Spinner.tsx
import React, { useState, useEffect } from "react";
import { Text } from "ink";
import type { AgentStatus } from "../types.js";
import { STATUS_LABELS, STATUS_COLORS } from "../types.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL = 80;

interface SpinnerProps {
  readonly status: AgentStatus;
}

function Spinner({ status }: SpinnerProps): React.JSX.Element | null {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (status === "idle") return;

    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, FRAME_INTERVAL);

    return () => clearInterval(timer);
  }, [status]);

  if (status === "idle") return null;

  const label = STATUS_LABELS[status];
  const color = STATUS_COLORS[status];
  const frame = SPINNER_FRAMES[frameIndex];

  return (
    <Box marginLeft={2}>
      <Text color={color}>{`${frame} ${label}...`}</Text>
    </Box>
  );
}

export { Spinner };
```

Note: Need `import { Box, Text } from "ink";` — add `Box` to the import.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
feat(repl): add context-aware Spinner component with Braille animation
```

---

### Task 6: Create Welcome component

**Files:**
- Create: `src/repl/components/Welcome.tsx`

- [ ] **Step 1: Create Welcome component**

```tsx
// src/repl/components/Welcome.tsx
import React from "react";
import { Box, Text } from "ink";

interface WelcomeProps {
  readonly version: string;
}

const LOGO = [
  "  ___ _   _ ___ _____ ",
  " / _ \\ | | / __|_   _|",
  "| (_) | |_| \\__ \\ | |  ",
  " \\___/ \\___/|___/ |_|  ",
];

function Welcome({ version }: WelcomeProps): React.JSX.Element {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {LOGO.map((line, i) => (
        <Text key={i} color="green" bold>{line}</Text>
      ))}
      <Box marginTop={1}>
        <Text dimColor>{`  v${version}  •  CTF AI Agent\n`}</Text>
      </Box>
      <Text dimColor>{"  Type /help for commands, or start chatting.\n"}</Text>
    </Box>
  );
}

export { Welcome };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
feat(repl): add ASCII art Welcome component with version display
```

---

### Task 7: Upgrade ToolCallDisplay

**Files:**
- Modify: `src/repl/components/ToolCallDisplay.tsx`

- [ ] **Step 1: Extend ToolCallDisplay with status and detail**

Replace entire file:

```tsx
// src/repl/components/ToolCallDisplay.tsx
import React from "react";
import { Box, Text } from "ink";
import type { ToolCallStatus } from "../types.js";

interface ToolCallDisplayProps {
  readonly tool: string;
  readonly args: string;
  readonly status?: ToolCallStatus;
  readonly detail?: string;
}

const STATUS_ICONS: Record<ToolCallStatus, { icon: string; color: string }> = {
  pending: { icon: "⏳", color: "yellow" },
  success: { icon: "✓", color: "green" },
  error: { icon: "✗", color: "red" },
};

function summarizeArgs(tool: string, args: string): string {
  try {
    const parsed = JSON.parse(args);
    switch (tool) {
      case "bash":
      case "python":
        return String(parsed.command ?? parsed.code ?? args).slice(0, 60);
      case "read":
      case "write":
        return String(parsed.filePath ?? args);
      case "edit": {
        const path = String(parsed.filePath ?? "");
        const old = String(parsed.oldString ?? "").slice(0, 30);
        return `${path} "${old}..."`;
      }
      case "glob":
      case "grep":
        return String(parsed.pattern ?? args);
      case "webfetch":
        return String(parsed.url ?? args).slice(0, 50);
      case "flag":
        return String(parsed.flag ?? args);
      default:
        return "";
    }
  } catch {
    return args.slice(0, 50);
  }
}

function ToolCallDisplay({ tool, args, status = "pending", detail }: ToolCallDisplayProps): React.JSX.Element {
  const { icon, color } = STATUS_ICONS[status];
  const summary = summarizeArgs(tool, args);

  return (
    <Box>
      <Text color={color}>{` ${icon} `}</Text>
      <Text bold>{tool}</Text>
      {summary && <Text dimColor>{`  ${summary}`}</Text>}
      {detail && <Text dimColor>{`  ${detail}`}</Text>}
    </Box>
  );
}

export { ToolCallDisplay };
export type { ToolCallDisplayProps };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
feat(repl): upgrade ToolCallDisplay with status icons and argument summarization
```

---

### Task 8: Upgrade Input component

**Files:**
- Modify: `src/repl/components/Input.tsx`

- [ ] **Step 1: Rewrite Input with multi-line, history, slash detection**

Replace entire file:

```tsx
// src/repl/components/Input.tsx
import React, { useState, useCallback, useRef } from "react";
import { Box, Text, useInput } from "ink";

interface InputProps {
  readonly prompt: string;
  readonly onSubmit: (value: string) => void;
  readonly disabled?: boolean;
}

const MAX_HISTORY = 100;

function Input({ prompt, onSubmit, disabled = false }: InputProps): React.JSX.Element {
  const [value, setValue] = useState("");
  const [history, setHistory] = useRef<string[]>([]).current;
  const historyIndex = useRef(-1);

  useInput(
    (input, key) => {
      // Ctrl+C handled by parent via useApp
      if (key.return) {
        if (key.shift) {
          // Shift+Enter: insert newline
          setValue((prev) => prev + "\n");
          return;
        }

        const trimmed = value.trim();
        if (trimmed.length === 0) return;

        // Check for line continuation (\ at end)
        if (trimmed.endsWith("\\")) {
          setValue((prev) => prev.slice(0, -1) + "\n");
          return;
        }

        onSubmit(trimmed);
        // Add to history
        history.push(trimmed);
        if (history.length > MAX_HISTORY) history.shift();
        historyIndex.current = -1;
        setValue("");
        return;
      }

      if (key.backspace || key.delete) {
        setValue((prev) => prev.slice(0, -1));
        return;
      }

      if (key.upArrow) {
        if (history.length === 0) return;
        const newIdx = historyIndex.current === -1
          ? history.length - 1
          : Math.max(0, historyIndex.current - 1);
        historyIndex.current = newIdx;
        setValue(history[newIdx]);
        return;
      }

      if (key.downArrow) {
        if (historyIndex.current === -1) return;
        const newIdx = historyIndex.current + 1;
        if (newIdx >= history.length) {
          historyIndex.current = -1;
          setValue("");
        } else {
          historyIndex.current = newIdx;
          setValue(history[newIdx]);
        }
        return;
      }

      // Regular input (includes paste - multi-char with newlines preserved)
      if (input && !key.ctrl && !key.meta) {
        setValue((prev) => prev + input);
      }
    },
    { isActive: !disabled },
  );

  // Display: show last line of multi-line input, dim previous lines
  const lines = value.split("\n");
  const displayLines = lines.length > 3 ? ["...", ...lines.slice(-2)] : lines;
  const hasSlash = value.startsWith("/");

  return (
    <Box flexDirection="column">
      {displayLines.length > 1 && displayLines.slice(0, -1).map((line, i) => (
        <Box key={i}>
          <Text dimColor>{"   "}</Text>
          <Text dimColor>{line}</Text>
        </Box>
      ))}
      <Box>
        <Text color="cyan" bold>{`[${prompt}] > `}</Text>
        {disabled ? (
          <Text dimColor>{"..."}</Text>
        ) : hasSlash ? (
          <Text color="yellow">{value}</Text>
        ) : (
          <Text>{value}</Text>
        )}
        {!disabled && <Text dimColor>{"\u2588"}</Text>}
      </Box>
    </Box>
  );
}

export { Input };
export type { InputProps };
```

Note: The `useRef` pattern for history needs adjustment — `useRef<string[]>([])` should be:
```typescript
const historyRef = useRef<string[]>([]);
const history = historyRef.current;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
feat(repl): upgrade Input with multi-line, history, and slash command highlighting
```

---

## Chunk 3: Slash Commands

### Task 9: Create SlashCommandRegistry

**Files:**
- Create: `src/repl/slash-commands.ts`
- Create: `src/repl/__tests__/slash-commands.test.ts`

- [ ] **Step 1: Write tests for slash command parsing**

```typescript
// src/repl/__tests__/slash-commands.test.ts
import { describe, it, expect } from "vitest";
import { SlashCommandRegistry, type SlashCommand, type SlashContext } from "../slash-commands.js";

describe("SlashCommandRegistry", () => {
  it("parses /help command", () => {
    const registry = new SlashCommandRegistry();
    const helpCmd: SlashCommand = {
      name: "help",
      description: "Show help",
      execute: async () => {},
    };
    registry.register(helpCmd);

    const result = registry.tryParse("/help");
    expect(result).toBe(helpCmd);
  });

  it("parses command with arguments", () => {
    const registry = new SlashCommandRegistry();
    const modelCmd: SlashCommand = {
      name: "model",
      description: "Switch model",
      execute: async () => {},
    };
    registry.register(modelCmd);

    const result = registry.tryParse("/model deepseek-v3");
    expect(result).toBe(modelCmd);
  });

  it("returns null for unknown commands", () => {
    const registry = new SlashCommandRegistry();
    expect(registry.tryParse("/unknown")).toBeNull();
  });

  it("returns null for non-slash input", () => {
    const registry = new SlashCommandRegistry();
    expect(registry.tryParse("hello")).toBeNull();
  });

  it("extracts arguments from input", () => {
    const registry = new SlashCommandRegistry();
    const solveCmd: SlashCommand = {
      name: "solve",
      description: "Solve",
      execute: async () => {},
    };
    registry.register(solveCmd);

    const result = registry.parseArgs("/solve ./challenge");
    expect(result).toEqual({ command: "solve", args: "./challenge" });
  });

  it("handles commands with no arguments", () => {
    const registry = new SlashCommandRegistry();
    const clearCmd: SlashCommand = {
      name: "clear",
      description: "Clear",
      execute: async () => {},
    };
    registry.register(clearCmd);

    const result = registry.parseArgs("/clear");
    expect(result).toEqual({ command: "clear", args: "" });
  });

  it("lists all registered commands", () => {
    const registry = new SlashCommandRegistry();
    registry.register({ name: "help", description: "Help", execute: async () => {} });
    registry.register({ name: "clear", description: "Clear", execute: async () => {} });

    expect(registry.list()).toHaveLength(2);
    expect(registry.list().map((c) => c.name)).toEqual(["help", "clear"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/repl/__tests__/slash-commands.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement SlashCommandRegistry**

```typescript
// src/repl/slash-commands.ts

export interface SlashContext {
  replHandle: import("./index.js").REPLHandle;
  config: import("../config/schema.js").OpenhackConfig;
  addOutput: (text: string) => void;
  // Lazy-initialized dependencies - set by the default command
  getProvider: () => import("../llm/provider.js").Provider;
  setProvider: (provider: import("../llm/provider.js").Provider) => void;
  getSession: () => import("../session/store.js").Session | null;
  setSession: (session: import("../session/store.js").Session) => void;
  getAgentName: () => string;
  setAgentName: (name: string) => void;
  getMessages: () => unknown[];
}

export interface SlashCommand {
  name: string;
  description: string;
  usage?: string;
  execute(ctx: SlashContext, args: string): Promise<void>;
}

export class SlashCommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd);
  }

  tryParse(input: string): SlashCommand | null {
    if (!input.startsWith("/")) return null;
    const name = input.slice(1).split(/\s+/)[0] ?? "";
    return this.commands.get(name) ?? null;
  }

  parseArgs(input: string): { command: string; args: string } | null {
    if (!input.startsWith("/")) return null;
    const parts = input.slice(1).split(/\s+/);
    const command = parts[0] ?? "";
    const args = parts.slice(1).join(" ");
    return { command, args };
  }

  list(): SlashCommand[] {
    return [...this.commands.values()];
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/repl/__tests__/slash-commands.test.ts`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```
feat(repl): add SlashCommandRegistry with parsing and argument extraction
```

---

### Task 10: Implement slash commands

**Files:**
- Modify: `src/repl/slash-commands.ts` (add command implementations)

- [ ] **Step 1: Add 10 slash command implementations**

Add these to `src/repl/slash-commands.ts` (after the `SlashCommandRegistry` class):

```typescript
import { createProvider } from "../llm/provider.js";
import { SessionStore } from "../session/store.js";

/** Create and register all built-in slash commands */
export function createBuiltinSlashCommands(): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();

  registry.register({
    name: "help",
    description: "Show available commands",
    async execute(ctx) {
      const commands = ctx.replHandle.getSlashRegistry().list();
      ctx.addOutput("Available commands:");
      for (const cmd of commands) {
        ctx.addOutput(`  /${cmd.name}${cmd.usage ? ` ${cmd.usage}` : ""} — ${cmd.description}`);
      }
    },
  });

  registry.register({
    name: "clear",
    description: "Clear the screen",
    async execute(ctx) {
      ctx.replHandle.clearMessages();
    },
  });

  registry.register({
    name: "exit",
    description: "Exit the REPL",
    usage: "",
    async execute(ctx) {
      const session = ctx.getSession();
      if (session) {
        session.state = "paused";
        await SessionStore.save(session);
      }
      ctx.replHandle.unmount();
    },
  });

  registry.register({
    name: "status",
    description: "Show current session status",
    async execute(ctx) {
      const session = ctx.getSession();
      const agent = ctx.getAgentName();
      const provider = ctx.getProvider();
      const messages = ctx.getMessages();
      const config = ctx.config;

      const tokenEstimate = Math.round(
        messages.reduce((sum: number, m: any) => sum + (typeof m.content === "string" ? m.content.length / 4 : 0), 0)
      );
      const maxTokens = config.harness.budget.maxTokens;

      ctx.addOutput("╭──────────────────────────────────╮");
      ctx.addOutput(`│  Agent:    ${agent.padEnd(22)}│`);
      ctx.addOutput(`│  Model:    ${provider.modelName.padEnd(22)}│`);
      ctx.addOutput(`│  Session:  ${(session ? `${session.id.slice(0, 8)} (${session.state})` : "none").padEnd(22)}│`);
      ctx.addOutput(`│  Context:  ${(tokenEstimate > 1000 ? `${(tokenEstimate / 1000).toFixed(1)}k` : String(tokenEstimate))} / ${(maxTokens / 1000).toFixed(0)}k tokens`.padEnd(34) + "│");
      ctx.addOutput(`│  Flags:    ${(session ? `${session.flags.length} found` : "0").padEnd(22)}│`);
      ctx.addOutput("╰──────────────────────────────────╯");
    },
  });

  registry.register({
    name: "model",
    description: "Switch LLM model",
    usage: "<name>",
    async execute(ctx, args) {
      if (!args.trim()) {
        ctx.addOutput(`Current model: ${ctx.getProvider().modelName}`);
        ctx.addOutput("Usage: /model <name>");
        return;
      }
      const config = ctx.config;
      const newConfig = { ...config.llm, model: args.trim() };
      const newProvider = createProvider(newConfig);
      ctx.setProvider(newProvider);
      ctx.addOutput(`Switched model to: ${args.trim()}`);
    },
  });

  registry.register({
    name: "agent",
    description: "Switch agent category",
    usage: "<name>",
    async execute(ctx, args) {
      const validAgents = ["triage", "crypto", "pwn", "web", "reverse", "forensics", "misc"];
      if (!args.trim()) {
        ctx.addOutput(`Current agent: ${ctx.getAgentName()}`);
        ctx.addOutput(`Available: ${validAgents.join(", ")}`);
        return;
      }
      const name = args.trim().toLowerCase();
      if (!validAgents.includes(name)) {
        ctx.addOutput(`Unknown agent: ${name}. Available: ${validAgents.join(", ")}`);
        return;
      }
      ctx.setAgentName(name);
      ctx.addOutput(`Switched agent to: ${name}`);
    },
  });

  registry.register({
    name: "solve",
    description: "Solve a CTF challenge",
    usage: "[path]",
    async execute(ctx, args) {
      ctx.addOutput(`Solving: ${args || "current directory"}...`);
      // The actual solve integration will be wired in Task 12
      // This is a placeholder that triggers the solve flow
      ctx.replHandle.startSolve(args.trim() || ".");
    },
  });

  registry.register({
    name: "sessions",
    description: "List sessions",
    async execute(ctx) {
      const sessions = await SessionStore.list();
      if (sessions.length === 0) {
        ctx.addOutput("No sessions found.");
        return;
      }
      ctx.addOutput("ID                 Date                 State       Flags");
      for (const s of sessions.slice(0, 20)) {
        const date = s.createdAt.slice(0, 19);
        const flags = s.flags.length > 0 ? s.flags.join(", ") : "-";
        ctx.addOutput(`${s.id.slice(0, 18).padEnd(19)} ${date.padEnd(21)} ${s.state.padEnd(12)} ${flags}`);
      }
    },
  });

  registry.register({
    name: "resume",
    description: "Resume a session",
    usage: "<id>",
    async execute(ctx, args) {
      if (!args.trim()) {
        ctx.addOutput("Usage: /resume <session-id>");
        return;
      }
      const session = await SessionStore.load(args.trim());
      if (!session) {
        ctx.addOutput(`Session not found: ${args.trim()}`);
        return;
      }
      ctx.setSession(session);
      if (session.messages && session.messages.length > 0) {
        ctx.replHandle.loadHistory(session.messages);
      }
      ctx.addOutput(`Resumed session: ${session.id} (${session.state})`);
      ctx.addOutput(`Category: ${session.challenge.category ?? "unknown"}`);
      if (session.flags.length > 0) {
        ctx.addOutput(`Flags: ${session.flags.join(", ")}`);
      }
    },
  });

  registry.register({
    name: "skill",
    description: "Load or show skills",
    usage: "[name]",
    async execute(ctx, args) {
      // Skill loading is context-dependent - list available for now
      ctx.addOutput(args.trim() ? `Loading skill: ${args.trim()}` : "Use /skill <name> to load a skill");
    },
  });

  return registry;
}
```

Note: `Provider` needs a `modelName` getter. Add to `src/llm/provider.ts` if not present:

```typescript
get modelName(): string {
  return this.config.model;
}
```

Also, `REPLHandle` needs `clearMessages`, `getSlashRegistry`, `startSolve`, and `loadHistory` methods — added in Task 12.

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/repl/__tests__/slash-commands.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```
feat(repl): add 10 built-in slash commands (help, clear, exit, status, model, agent, solve, sessions, resume, skill)
```

---

## Chunk 4: Integration

### Task 11: Extend REPLHandle and integrate agent loop

**Files:**
- Modify: `src/repl/index.tsx`

- [ ] **Step 1: Extend REPLHandle interface**

Add new methods to the `REPLHandle` interface:

```typescript
interface REPLHandle {
  // Existing
  addMessage(message: Message): void;
  addToolCall(tool: string, args: string): void;
  setStreaming(value: boolean): void;
  appendStreaming(token: string): void;
  clearStreaming(): void;
  setAgent(agent: string): void;
  unmount: () => void;
  waitUntilExit: () => Promise<unknown>;
  // New
  setStatus(status: AgentStatus): void;
  setToolResult(toolId: string, result: ToolCallStatus, detail?: string): void;
  clearMessages(): void;
  getSlashRegistry(): SlashCommandRegistry;
  startSolve(path: string): void;
  loadHistory(messages: unknown[]): void;
}
```

- [ ] **Step 2: Add status/toolCall tracking to reducer**

Add to the `REPLState` interface:

```typescript
interface REPLState {
  // Existing
  messages: Message[];
  isStreaming: boolean;
  currentAgent: string;
  toolCalls: ToolCall[];
  streamingText: string;
  // New
  agentStatus: AgentStatus;
  toolResults: Map<string, { status: ToolCallStatus; detail?: string }>;
}
```

Add to `REPLAction`:

```typescript
| { kind: "set_status"; status: AgentStatus }
| { kind: "set_tool_result"; toolId: string; status: ToolCallStatus; detail?: string }
| { kind: "clear_messages" }
```

Update `replReducer` to handle new actions.

- [ ] **Step 3: Add streaming buffer**

Add a ref-based buffer to avoid Ink re-render on every token:

```typescript
const bufferRef = useRef("");
useEffect(() => {
  const timer = setInterval(() => {
    if (bufferRef.current) {
      dispatch({ kind: "append_streaming", token: bufferRef.current });
      bufferRef.current = "";
    }
  }, 100);
  return () => clearInterval(timer);
}, []);
```

The `appendStreaming` method on REPLHandle writes to `bufferRef` instead of dispatching immediately.

- [ ] **Step 4: Integrate Spinner into render**

In the JSX, replace the static "thinking..." text with:

```tsx
<Spinner status={localState.agentStatus} />
```

Import `Spinner` from `./components/Spinner.js`.

- [ ] **Step 5: Integrate Welcome into initial render**

Show `Welcome` component only when messages array is empty:

```tsx
{localState.messages.length === 0 && !localState.isStreaming && (
  <Welcome version={version} />
)}
```

Import `Welcome` from `./components/Welcome.js`.

- [ ] **Step 6: Wire up agent loop in default command**

The `onSubmit` callback in the default command (created in Task 12) will:

1. Check for slash commands first
2. If not slash, append user message to `ModelMessage[]` history
3. Call `handle.setStatus("thinking")`
4. Call `runAgentLoop` with:
   - `onToken`: writes to bufferRef → `handle.appendStreaming`
   - `onToolCall`: `handle.setStatus(getToolStatus(tool))` + `handle.addToolCall(tool, args)`
   - `abortSignal`: from an AbortController stored in closure
5. On loop complete: `handle.setStatus("idle")`, save session

- [ ] **Step 7: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```
feat(repl): extend REPLHandle with status animation, tool results, and agent loop integration
```

---

### Task 12: Add default command to index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add default command before `.demandCommand()`**

Remove `.demandCommand()` and `.strict()`. Add before the closing `await cli.parse()`:

```typescript
  .command(
    "$0",
    "Start interactive REPL",
    () => {},
    async () => {
      const runtime = createAppRuntime(process.cwd());
      try {
        const config = await runtime.runPromise(
          Effect.flatMap(ConfigService, (svc) => svc.get()),
        ) as OpenhackConfig;

        if (!config.llm.baseURL || config.llm.model === "default") {
          console.log("⚠  Run 'openhack init' first to configure your LLM backend.");
          console.log("   Then start the REPL with: openhack\n");
          process.exit(1);
        }

        const provider = createProvider(config.llm);
        const registry = ToolRegistry.createBuiltin();
        const skillRegistry = await SkillRegistry.create(process.cwd());
        const agentRegistry = await AgentRegistry.createWithUserAgents(process.cwd());

        const session = await SessionStore.create();
        session.state = "running";
        await SessionStore.save(session);

        const toolContext: ToolContext = {
          workingDir: process.cwd(),
          sessionId: session.id,
          permissionCheck: async () => true,
        };

        let currentProvider = provider;
        let currentAgent = "triage";
        const messageHistory: ModelMessage[] = [];
        let abortController: AbortController | null = null;

        const handle = startREPL({
          onSubmit: async (message: string) => {
            // Check slash commands
            const slashRegistry = handle.getSlashRegistry();
            if (message.startsWith("/")) {
              const cmd = slashRegistry.tryParse(message);
              if (cmd) {
                const { args } = slashRegistry.parseArgs(message) ?? { args: "" };
                await cmd.execute({
                  replHandle: handle,
                  config,
                  addOutput: (text: string) => handle.addMessage({ role: "system", content: text }),
                  getProvider: () => currentProvider,
                  setProvider: (p) => { currentProvider = p; },
                  getSession: () => session,
                  setSession: (s) => { Object.assign(session, s); },
                  getAgentName: () => currentAgent,
                  setAgentName: (name) => { currentAgent = name; handle.setAgent(name); },
                  getMessages: () => messageHistory,
                }, args);
                return;
              }
              handle.addMessage({ role: "system", content: `Unknown command: ${message.split(/\s/)[0]}. Type /help.` });
              return;
            }

            // Regular message → agent loop
            messageHistory.push({ role: "user", content: message });

            abortController = new AbortController();

            try {
              await runAgentLoop({
                provider: currentProvider,
                messages: messageHistory,
                system: getSystemPrompt(currentAgent),
                tools: registry,
                toolContext,
                maxIterations: config.agent.maxSteps,
                abortSignal: abortController.signal,
                onToken: (token) => handle.appendStreaming(token),
                onToolCall: (tool, args) => {
                  handle.setStatus(getToolStatus(tool));
                  handle.addToolCall(tool, JSON.stringify(args).slice(0, 200));
                },
                onFlag: (flag) => {
                  handle.addMessage({ role: "system", content: `🚩 FLAG: ${flag}` });
                  session.flags.push(flag);
                },
              });
            } catch (err: unknown) {
              if ((err as Error).name !== "AbortError") {
                const msg = err instanceof Error ? err.message : String(err);
                handle.addMessage({ role: "system", content: `Error: ${msg}` });
              }
            } finally {
              handle.setStatus("idle");
              abortController = null;
            }

            // Save session
            session.messages = messageHistory;
            await SessionStore.save(session);
          },
          agentName: "triage",
        });

        // Set up slash command registry on handle
        // (This wiring happens after handle creation since registry needs handle ref)
        const slashRegistry = createBuiltinSlashCommands();
        handle.setSlashRegistry(slashRegistry);

        await handle.waitUntilExit();
      } finally {
        await runtime.dispose();
      }
    },
  );
```

Note: Requires adding imports at top of `src/index.ts`:
- `import { startREPL } from "./repl/index.js"`
- `import { getToolStatus } from "./repl/types.js"`
- `import { createBuiltinSlashCommands } from "./repl/slash-commands.js"`
- `import type { ModelMessage } from "ai"`

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors (may need minor fixes for type mismatches)

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Manual smoke test**

Run: `npx tsx src/index.ts`
Expected: See ASCII welcome, input prompt, can type messages

- [ ] **Step 5: Commit**

```
feat: add interactive REPL as default openhack command
```

---

## Task dependency graph

```
Task 1 (types) ─────────────────┬─────────────── Task 5 (Spinner) ──┐
                                 │                                    │
Task 2 (abortSignal) ───────────┤                                    │
                                 │                                    │
Task 3 (session messages) ──────┤──────── Task 7 (ToolCallDisplay)   ├─ Task 11 (REPLHandle) ── Task 12 (default cmd)
                                 │                                    │
Task 4 (solve extraction) ──────┤──────── Task 8 (Input) ───────────┘
                                 │
                                 └──────── Task 9+10 (slash cmds) ────┘
```

Tasks 5, 6, 7, 8 can run **in parallel** (no dependencies between them).
Tasks 9+10 depend on Task 1 (types).
Task 11 depends on Tasks 1, 5, 6, 7, 8.
Task 12 depends on Tasks 2, 3, 4, 11.
