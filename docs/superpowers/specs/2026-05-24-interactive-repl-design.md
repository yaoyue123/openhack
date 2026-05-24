# Interactive REPL Design Spec

**Date:** 2026-05-24
**Status:** Draft
**Author:** Sisyphus (via brainstorming)

## Summary

Add an interactive REPL mode as the default `openhack` command, similar to Claude Code and OpenCode. Running bare `openhack` opens a branded chat interface where users converse with the agent, solve CTF challenges, and manage sessions — all within a single persistent TUI.

## Background

Currently `openhack` requires a subcommand (`chat`, `solve`, etc.) and has no persistent interactive mode. The `src/repl/` directory contains an Ink-based TUI with 5 components (`ChatMessage`, `Input`, `ToolCallDisplay`, `FlagHighlight`) and a `startREPL()` function returning a `REPLHandle`, but nothing wires it to the CLI.

## Design Decision

**Approach:** Upgrade the existing Ink REPL infrastructure (Approach A).

Alternatives considered and rejected:
- **B: Replace with @inquirer/prompts** — loses declarative rendering, throws away ~250 lines of existing components.
- **C: Dual-layer Ink + readline** — two rendering layers fighting over stdout, high complexity.

## Section 1: CLI Entry Point & Default Command

### Changes to `src/index.ts`

1. Remove `.demandCommand()` and `.strict()`.
2. Add a `$0` default command (yargs fallback when no subcommand given).

### Behavior matrix

| Input | Behavior |
|-------|----------|
| `openhack` | ASCII art welcome + enter REPL |
| `openhack chat <msg>` | Existing one-shot chat (unchanged) |
| `openhack solve [path]` | Existing solve flow (unchanged) |
| `openhack --help` | Show yargs help |

### Welcome screen

When the REPL starts, render:

```
  ╔═══════════════════════════════╗
  ║      ___ _   _ ___ _____     ║
  ║     / _ \ | | / __|_   _|    ║
  ║    | (_) | |_| \__ \ | |      ║
  ║     \___/ \___/|___/ |_|      ║
  ║                               ║
  ║   v0.0.1  •  CTF AI Agent    ║
  ╚═══════════════════════════════╝

  Type /help for commands, or start chatting.
```

Version read from `package.json` `version` field.

### REPL initialization

```
openhack (no args)
  → Load Config via ConfigLoader
  → Create Provider (from config.llm)
  → Create ToolRegistry.createBuiltin()
  → Create SkillRegistry
  → Create SessionStore (new or resume)
  → Call startREPL({ onSubmit, agentName: "triage" })
  → Render welcome + input prompt
```

## Section 2: Context-Aware Status Animation

### New file: `src/repl/components/Spinner.tsx`

### Agent status state machine

| Status | Trigger | Display | Color |
|--------|---------|---------|-------|
| `idle` | Waiting for user input | (nothing) | — |
| `thinking` | LLM streaming tokens | `⟳ thinking...` | dim white |
| `reading` | `read` / `glob` / `grep` tool call | `⟳ reading file...` | yellow |
| `executing` | `bash` / `python` tool call | `⟳ running bash...` | cyan |
| `writing` | `write` / `edit` tool call | `⟳ writing file...` | magenta |
| `analyzing` | Any other tool or delegation | `⟳ analyzing...` | blue |

### Spinner animation

Classic Braille rotation frames: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms interval via Ink's `useInterval` hook (or `setInterval` + re-render).

```typescript
type AgentStatus = "idle" | "thinking" | "reading" | "executing" | "writing" | "analyzing";
```

### Tool-to-status mapping

```typescript
const TOOL_STATUS_MAP: Record<string, AgentStatus> = {
  read: "reading",
  glob: "reading",
  grep: "reading",
  bash: "executing",
  python: "executing",
  write: "writing",
  edit: "writing",
  // Everything else defaults to "analyzing"
};
```

### REPLHandle extension

```typescript
setStatus(status: AgentStatus): void;
```

### Agent-loop integration

- `onToken` callback fires → `handle.setStatus("thinking")`
- `onToolCall` callback fires → map tool name to status, call `handle.setStatus(mappedStatus)`
- Tool execution completes → `handle.setStatus("thinking")`
- Stream ends → `handle.setStatus("idle")`

## Section 3: Multi-line Input & Slash Commands

### 3a. Input component changes (`src/repl/components/Input.tsx`)

Extend `useInput` handler:

| Key | Action |
|-----|--------|
| **Enter** | Submit message |
| **Shift+Enter** | Insert `\n` (newline) |
| **Ctrl+C** | If streaming: abort. If idle: exit REPL |
| **Paste** (multi-char input event) | Append raw content, preserve newlines |
| **Up arrow** | Navigate input history (previous) |
| **Down arrow** | Navigate input history (next) |

Input history: store last 100 submissions in a circular buffer.

### 3b. Slash command system

New file: `src/repl/slash-commands.ts`

```typescript
interface SlashCommand {
  name: string;
  description: string;
  usage?: string;
  execute(ctx: SlashContext): Promise<void>;
}

interface SlashContext {
  replHandle: REPLHandle;
  config: OpenhackConfig;
  provider: Provider;
  session: Session | null;
  toolRegistry: ToolRegistry;
  skillRegistry: SkillRegistry;
  agentRegistry: AgentRegistry;
  setProvider: (provider: Provider) => void;
  setSession: (session: Session) => void;
}

class SlashCommandRegistry {
  register(cmd: SlashCommand): void;
  tryParse(input: string): SlashCommand | null;
}
```

### Command table

| Command | Arguments | Behavior |
|---------|-----------|----------|
| `/help` | — | List all slash commands with descriptions |
| `/solve` | `[path]` | Start CTF solve in REPL. Read challenge.json if present. Create Session. Auto-triage or accept `--agent` flag |
| `/agent` | `[name]` | Switch active agent (triage/crypto/pwn/web/reverse/forensics/misc) |
| `/model` | `[name]` | Switch LLM model by creating new Provider with updated model |
| `/skill` | `[name]` | Load or switch skill |
| `/status` | — | Display context window usage, agent, model, session, flags, steps |
| `/sessions` | — | List sessions (reuse SessionStore.list() logic) |
| `/resume` | `<id>` | Resume a session, load its message history into REPL |
| `/clear` | — | Clear screen (reset message display, keep session data) |
| `/exit` | — | Exit REPL (save session state first) |

### Parsing logic

In `Input.onSubmit`:
1. If input starts with `/`, pass to `SlashCommandRegistry.tryParse()`
2. If matched, execute the command (no agent call)
3. If not matched, display `Unknown command: /foo. Type /help.`
4. If input does NOT start with `/`, forward to agent via `onSubmit` callback

## Section 4: CTF-Enhanced Chat Integration

### 4a. Persistent multi-turn conversation

The REPL maintains a `ModelMessage[]` array across turns:

```
User types message
  → Append user message to history
  → Call runAgentLoop({ messages: history, ... })
  → onToken: stream text + update status
  → onToolCall: update status + show tool call inline
  → onFlag: highlight flag
  → Loop completes
  → Append assistant messages to history
  → Save session
  → Return to input prompt
```

### 4b. Session persistence

Every REPL session:
1. Creates a `Session` via `SessionStore.create()` on startup
2. Saves `session.state = "running"` immediately
3. Appends to `session.timeline` on each tool call, flag found, agent switch
4. On `/exit` or Ctrl+C: saves `session.state = "paused"`
5. On `/resume <id>`: loads existing session + message history

### 4c. `/solve` in-REPL flow

```
/solve ./crypto-challenge
  → Read challenge.json from path
  → Create Session with challenge metadata
  → Auto-triage: select agent based on category
  → Inject challenge context into message history
  → Run agent loop (with harness + memory)
  → Status animations active throughout
  → Flag found: highlight + add to session
  → Return to input prompt (don't exit REPL)
```

### 4d. `/status` display format

```
╭──────────────────────────────────╮
│  Agent:    triage                 │
│  Model:    deepseek-v3            │
│  Session:  abc123 (running)       │
│  Context:  12.4k / 100k tokens    │
│  Flags:    1 found                │
│  Steps:    8 / 25                 │
╰──────────────────────────────────╯
```

Context estimation: `messages.reduce((sum, m) => sum + m.content.length / 4, 0)` (chars / 4 ≈ tokens).

### 4e. Harness & Memory in REPL

REPL mode enables the full harness stack:
- **LoopGuard**: detects repeated tool calls, injects warnings
- **BudgetGuard**: tracks token usage, triggers compression
- **Terminator**: watches for flag patterns, stops on flag found or stall
- **MemoryManager**: maintains state.md, findings.md, failed-paths.md in session directory

All callbacks from `runAgentLoop` (`onToken`, `onToolCall`, `onFlag`) route through `REPLHandle` to update the TUI.

## Section 5: Inline Tool Call Display

### Changes to `src/repl/components/ToolCallDisplay.tsx`

### Display formats

**Tool running (pending):**
```
 ⏳ read  challenge.py  (12 lines)
```

**Tool completed:**
```
 ✓ read  challenge.py  (12 lines)
```

**Tool error:**
```
 ✗ bash  python solve.py  exit code 1
```

### Component props extension

```typescript
interface ToolCallDisplayProps {
  readonly tool: string;
  readonly args: string;
  readonly status?: "pending" | "success" | "error";
  readonly detail?: string;  // e.g., "(12 lines)", "exit code 1"
}
```

### Argument summarization rules

| Tool | Display arg | Truncation |
|------|------------|------------|
| `bash` | `command` | 60 chars + `...` |
| `read` | `filePath` | Full path |
| `write` | `filePath` | Full path |
| `edit` | `filePath` + first 30 chars of `oldString` | `...` |
| `glob` | `pattern` | Full |
| `grep` | `pattern` | Full |
| `webfetch` | `url` | 50 chars + `...` |
| `flag` | flag value | Full (highlighted) |
| `python` | first 40 chars of code | `...` |
| Other | tool name only | — |

### REPLHandle extension

```typescript
setToolResult(toolId: string, result: "success" | "error", detail?: string): void;
```

## File changes summary

| File | Change type | Description |
|------|------------|-------------|
| `src/index.ts` | Modify | Add `$0` default command, remove demandCommand |
| `src/solve.ts` | **New** | Extracted solve logic, shared by CLI command and `/solve` slash command |
| `src/agent-loop.ts` | Modify | Add `abortSignal` option, extend `onToolCall` with optional result param |
| `src/session/store.ts` | Modify | Add `messages` field to Session type for history persistence |
| `src/repl/index.tsx` | Modify | Extend REPLHandle with status/tool methods, integrate agent loop, add streaming buffer |
| `src/repl/components/Spinner.tsx` | **New** | Context-aware spinner component with Braille animation |
| `src/repl/components/Input.tsx` | Modify | Multi-line support (`\` continuation + Shift+Enter), slash command detection, input history |
| `src/repl/components/ToolCallDisplay.tsx` | Modify | Status-based display (pending/success/error) with argument summarization |
| `src/repl/components/Welcome.tsx` | **New** | ASCII art welcome screen with version |
| `src/repl/slash-commands.ts` | **New** | Slash command registry and 10 command implementations |
| `src/repl/types.ts` | **New** | Shared types: AgentStatus, SlashContext, SlashCommand, etc. |

## Edge Cases & Error Handling

### Initialization failures

| Scenario | Behavior |
|----------|----------|
| Config missing | Show error: `No config found. Run 'openhack init' first.` then exit |
| Config invalid | Show validation errors, offer to re-run `openhack init` |
| LLM unreachable | Show connection error in REPL, allow `/model` to switch. Don't crash |
| No model configured | Show warning: `No model set. Use /model <name> to configure.` |

### Streaming abort (Ctrl+C)

`runAgentLoop` must accept an `AbortSignal`:

```typescript
interface AgentLoopOptions {
  // ... existing fields
  abortSignal?: AbortSignal;
}
```

Implementation: pass `signal` to `streamText()` call. On Ctrl+C during streaming:
1. Call `abortController.abort()`
2. `handle.setStatus("idle")`
3. Append partial assistant message to history (if any text was generated)
4. Return to input prompt

### Multi-line input on Windows

Shift+Enter is unreliable on Windows terminals (cmd.exe, PowerShell). Fallback strategy:

1. **Primary**: Detect `key.shift && key.return` in Ink `useInput` (works on macOS/Linux terminals)
2. **Fallback**: Support `\` at end of line as continuation character (like bash). If input ends with `\`, strip it and append next line
3. **Paste**: Multi-char `input` events from paste operations preserve newlines natively — always works

### Message history persistence

Current `Session` type (in `src/session/store.ts`) does not store messages. Add a `messages` field:

```typescript
// In session store, add:
interface Session {
  // ... existing fields
  messages?: ModelMessage[];  // Persisted conversation history
}
```

Save messages to session JSON after each agent turn. On `/resume`, load messages back into REPL.

### Streaming render performance

Ink re-renders on every dispatch. High-frequency `onToken` calls (~50ms intervals) cause flicker.

Solution: buffer tokens in a `useRef` and flush to state every 100ms via `setInterval`:

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

`REPLHandle.appendStreaming` writes to `bufferRef` instead of dispatching immediately.

### Solve logic reuse

The `solve` command in `src/index.ts` is a monolithic ~150-line function. Extract into `src/solve.ts`:

```typescript
// src/solve.ts
export async function solveInRepl(ctx: SolveContext): Promise<SolveResult> { ... }
```

Both `index.ts` (standalone `solve` command) and `/solve` slash command call this shared function.

### Tool call result tracking

Current `onToolCall` callback receives `(tool, args)` but not the result. To show "✓ read file.py (12 lines)", we need result info. Options:

1. Extend `onToolCall` to include result: `onToolCall?: (tool: string, args: unknown, result?: string) => void`
2. Or add a new callback: `onToolResult?: (tool: string, result: string) => void`

Preferred: option 1, backward-compatible by making `result` optional.

## Non-goals (explicitly out of scope)

- Markdown rendering in terminal (keep plain text)
- Syntax highlighting for code blocks
- Theme customization
- Mouse support
- Tab auto-completion for file paths
- Undo/redo for input
