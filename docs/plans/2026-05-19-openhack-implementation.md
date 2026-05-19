# openhack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build openhack — a CTF competition AI agent with TypeScript, supporting Skill + MCP architecture, capable of auto-triaging challenges and delegating to specialist agents.

**Architecture:** Effect-based service system (inspired by opencode). Each subsystem is an Effect `Context.Service` with a `Layer`. LLM calls go through Vercel AI SDK with OpenAI-compatible providers. Tools are Effect-managed defs. Skills are SKILL.md files scanned from multiple sources and injected into agent context. MCP servers provide specialized security tools.

**Tech Stack:** TypeScript, Effect (DI/runtime), Vercel AI SDK (LLM), @modelcontextprotocol/sdk (MCP), ink (TUI), yargs (CLI), gray-matter (frontmatter), drizzle-orm + better-sqlite3 (session persistence)

---

## Phase 1: Project Scaffold + Config + LLM Provider

> Outcome: `openhack chat "hello"` gets a streaming response from an LLM.

### Task 1.1: Initialize project structure

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `.gitignore`

**Step 1: Initialize package.json**

```bash
cd /home/mcj/openhack
npm init -y
```

Then replace contents:

```json
{
  "name": "openhack",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "openhack": "./dist/index.js"
  },
  "exports": {
    "./*": "./src/*.ts"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

**Step 2: Install core dependencies**

```bash
npm install effect ai @ai-sdk/openai-compatible @modelcontextprotocol/sdk gray-matter yargs glob zod ink react better-sqlite3 drizzle-orm
npm install -D typescript tsx tsup vitest @types/node @types/react @types/better-sqlite3 @types/yargs
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "paths": { "#/*": ["./src/*"] }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create minimal src/index.ts**

```typescript
#!/usr/bin/env node
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

const cli = yargs(hideBin(process.argv))
  .scriptName("openhack")
  .command(
    "chat [message..]",
    "Start chatting with openhack",
    (y) => y.option("model", { type: "string", default: "default" }),
    async (args) => {
      const message = (args.message ?? []).join(" ")
      console.log(`openhack> ${message}`)
      // Will be replaced with actual LLM call in Task 1.4
    }
  )
  .demandCommand()
  .strict()

await cli.parse()
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.env
openhack.jsonc
```

**Step 6: Commit**

```bash
git init && git add -A && git commit -m "feat: project scaffold with yargs CLI"
```

---

### Task 1.2: Config system (Effect Service)

**Files:**
- Create: `src/config/schema.ts`
- Create: `src/config/loader.ts`
- Test: `src/config/__tests__/loader.test.ts`

**Step 1: Write the test**

`src/config/__tests__/loader.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { ConfigLoader } from "../loader.js"

describe("ConfigLoader", () => {
  it("should return defaults when no config file exists", async () => {
    const config = await ConfigLoader.load("/tmp/nonexistent-openhack-test")
    expect(config.llm.baseURL).toBe("http://localhost:11434/v1")
    expect(config.llm.model).toBe("default")
    expect(config.permissions.default).toBeInstanceOf(Array)
  })

  it("should parse openhack.jsonc with overrides", async () => {
    // Will test with a temp dir containing openhack.jsonc
    const config = await ConfigLoader.load("/tmp/test-openhack-config")
    // assertions on merged config
  })
})
```

**Step 2: Create config schema**

`src/config/schema.ts`:
```typescript
import { Schema } from "effect"

export interface PermissionRule {
  readonly tool: string
  readonly pattern: string
  readonly action: "allow" | "deny" | "ask"
}

export interface MCPServerConfig {
  readonly type: "local" | "remote"
  readonly command?: string[]
  readonly url?: string
  readonly environment?: Record<string, string>
  readonly timeout?: number
  readonly container?: string  // Docker image name
  readonly optional?: boolean
}

export interface LLMConfig {
  readonly baseURL: string
  readonly model: string
  readonly apiKey?: string
  readonly temperature?: number
  readonly topP?: number
  readonly maxTokens?: number
}

export interface OpenhackConfig {
  readonly llm: LLMConfig
  readonly permissions: {
    readonly default: PermissionRule[]
    readonly [profile: string]: PermissionRule[]
  }
  readonly mcp: Record<string, MCPServerConfig>
  readonly skills: {
    readonly paths?: string[]
    readonly urls?: string[]
  }
  readonly docker: {
    readonly enabled: boolean
    readonly preferContainer: boolean
  }
}

export const DEFAULT_CONFIG: OpenhackConfig = {
  llm: {
    baseURL: process.env.OPENHACK_LLM_BASE_URL ?? "http://localhost:11434/v1",
    model: process.env.OPENHACK_LLM_MODEL ?? "default",
    apiKey: process.env.OPENHACK_LLM_API_KEY,
  },
  permissions: {
    default: [
      { tool: "read", pattern: "*", action: "allow" },
      { tool: "glob", pattern: "*", action: "allow" },
      { tool: "grep", pattern: "*", action: "allow" },
      { tool: "write", pattern: "/tmp/*", action: "allow" },
      { tool: "write", pattern: "./workspace/*", action: "allow" },
      { tool: "bash", pattern: "file *", action: "allow" },
      { tool: "bash", pattern: "curl *", action: "allow" },
      { tool: "bash", pattern: "python3 *", action: "allow" },
      { tool: "bash", pattern: "cat *", action: "allow" },
      { tool: "bash", pattern: "strings *", action: "allow" },
      { tool: "bash", pattern: "xxd *", action: "allow" },
      { tool: "bash", pattern: "nmap *", action: "ask" },
      { tool: "bash", pattern: "sqlmap *", action: "ask" },
      { tool: "bash", pattern: "hydra *", action: "ask" },
      { tool: "bash", pattern: "rm -rf *", action: "ask" },
      { tool: "bash", pattern: "rm -rf /", action: "deny" },
    ],
  },
  mcp: {},
  skills: {},
  docker: {
    enabled: true,
    preferContainer: true,
  },
}
```

**Step 3: Create config loader**

`src/config/loader.ts`:
```typescript
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { DEFAULT_CONFIG, type OpenhackConfig } from "./schema.js"

// Strip JSONC comments (single-line // only)
function stripComments(text: string): string {
  return text.replace(/\/\/.*$/gm, "")
}

export const ConfigLoader = {
  async load(projectDir: string): Promise<OpenhackConfig> {
    const configPaths = [
      path.join(projectDir, "openhack.jsonc"),
      path.join(projectDir, "openhack.json"),
    ]

    for (const configPath of configPaths) {
      try {
        const raw = await fs.readFile(configPath, "utf-8")
        const parsed = JSON.parse(stripComments(raw))
        return deepMerge(DEFAULT_CONFIG, parsed)
      } catch {
        continue
      }
    }

    return DEFAULT_CONFIG
  },
}

function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const result = { ...base }
  for (const key of Object.keys(override) as (keyof T)[]) {
    const bv = base[key]
    const ov = override[key]
    if (
      typeof bv === "object" && bv !== null && !Array.isArray(bv) &&
      typeof ov === "object" && ov !== null && !Array.isArray(ov)
    ) {
      result[key] = deepMerge(bv, ov as any)
    } else if (ov !== undefined) {
      result[key] = ov as T[keyof T]
    }
  }
  return result
}
```

**Step 4: Run tests**

```bash
npx vitest run src/config/__tests__/loader.test.ts
```

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: config system with JSONC support and defaults"
```

---

### Task 1.3: Effect AppRuntime bootstrap

**Files:**
- Create: `src/runtime/app.ts`

`src/runtime/app.ts`:
```typescript
import { Context, Effect, Layer, ManagedRuntime } from "effect"
import { ConfigLoader, type OpenhackConfig } from "../config/loader.js"

// --- Config Service ---
export interface ConfigInterface {
  readonly get: () => Effect.Effect<OpenhackConfig>
}

export class ConfigService
  extends Context.Service<ConfigService, ConfigInterface>()("@openhack/Config") {}

const ConfigLive = (projectDir: string) =>
  Layer.effect(
    ConfigService,
    Effect.gen(function* () {
      const config = yield* Effect.promise(() => ConfigLoader.load(projectDir))
      return ConfigService.of({ get: () => Effect.succeed(config) })
    }),
  )

// --- App Runtime ---
export function createAppRuntime(projectDir: string) {
  const AppLayer = Layer.mergeAll(
    ConfigLive(projectDir),
    // More services will be added here in later tasks
  )

  const rt = ManagedRuntime.make(AppLayer)
  return {
    runPromise: <A, E>(effect: Effect.Effect<A, E>) => rt.runPromise(effect),
    runSync: <A, E>(effect: Effect.Effect<A, E>) => rt.runSync(effect),
    dispose: () => rt.dispose(),
  }
}

export type AppRuntime = ReturnType<typeof createAppRuntime>
```

---

### Task 1.4: LLM Provider Service (OpenAI Compatible)

**Files:**
- Create: `src/llm/provider.ts`
- Create: `src/llm/stream.ts`
- Test: `src/llm/__tests__/provider.test.ts`

**Step 1: Write the test**

`src/llm/__tests__/provider.test.ts`:
```typescript
import { describe, it, expect } from "vitest"

describe("LLM Provider", () => {
  it("should create provider from config", async () => {
    // Test that provider creation doesn't throw with valid config
    const { createProvider } = await import("../provider.js")
    const provider = createProvider({
      baseURL: "http://localhost:11434/v1",
      model: "llama3",
    })
    expect(provider).toBeDefined()
    expect(provider.modelId).toBe("llama3")
  })
})
```

**Step 2: Create provider**

`src/llm/provider.ts`:
```typescript
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModelV1 } from "ai"
import type { LLMConfig } from "../config/schema.js"

export interface Provider {
  readonly modelId: string
  readonly languageModel: () => LanguageModelV1
}

export function createProvider(config: LLMConfig): Provider {
  const sdk = createOpenAICompatible({
    name: "openhack-provider",
    baseURL: config.baseURL,
    apiKey: config.apiKey ?? "unused",
  })

  return {
    modelId: config.model,
    languageModel: () => sdk(config.model),
  }
}
```

**Step 3: Create streaming wrapper**

`src/llm/stream.ts`:
```typescript
import { streamText, type CoreMessage } from "ai"
import type { Provider } from "./provider.js"

export interface StreamOptions {
  provider: Provider
  messages: CoreMessage[]
  system?: string
  maxTokens?: number
  temperature?: number
  tools?: Record<string, any>
  onToken?: (token: string) => void
}

export async function* streamLLMResponse(opts: StreamOptions) {
  const result = streamText({
    model: opts.provider.languageModel(),
    messages: opts.messages,
    system: opts.system,
    maxTokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
    tools: opts.tools,
  })

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      opts.onToken?.(part.textDelta)
      yield { type: "text" as const, content: part.textDelta }
    } else if (part.type === "tool-call") {
      yield {
        type: "tool-call" as const,
        tool: part.toolName,
        args: part.args,
      }
    }
  }

  yield { type: "done" as const }
}
```

**Step 4: Wire into CLI — update src/index.ts**

```typescript
#!/usr/bin/env node
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { createAppRuntime } from "./runtime/app.js"
import { createProvider } from "./llm/provider.js"
import { streamLLMResponse } from "./llm/stream.js"
import type { CoreMessage } from "ai"

const cli = yargs(hideBin(process.argv))
  .scriptName("openhack")
  .command(
    "chat [message..]",
    "Start chatting with openhack",
    (y) =>
      y
        .option("model", { type: "string" })
        .option("system", { type: "string" }),
    async (args) => {
      const rt = createAppRuntime(process.cwd())
      const config = await rt.runPromise(
        (await import("./runtime/app.js")).ConfigService.use((s) => s.get()),
      )
      const provider = createProvider({
        ...config.llm,
        model: args.model ?? config.llm.model,
      })

      const message = (args.message ?? []).join(" ")
      if (!message) {
        console.error("Please provide a message")
        process.exit(1)
      }

      const messages: CoreMessage[] = [{ role: "user", content: message }]

      process.stdout.write("openhack> ")
      for await (const event of streamLLMResponse({
        provider,
        messages,
        system: args.system ?? "You are openhack, a CTF security assistant.",
      })) {
        if (event.type === "text") {
          process.stdout.write(event.content)
        }
      }
      console.log()
      await rt.dispose()
    }
  )
  .demandCommand()
  .strict()

await cli.parse()
```

**Step 5: Run test**

```bash
npx vitest run src/llm/__tests__/provider.test.ts
```

**Step 6: Manual smoke test**

```bash
npx tsx src/index.ts chat "What is a buffer overflow?"
```

Expected: streaming text response from local LLM (or error if no endpoint running).

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: LLM provider with OpenAI-compatible streaming"
```

---

## Phase 2: Built-in Tool System

> Outcome: LLM can call tools (shell, read, write, edit, glob, grep, webfetch, flag-detect).

### Task 2.1: Tool definition pattern

**Files:**
- Create: `src/tool/types.ts`
- Create: `src/tool/define.ts`

`src/tool/types.ts`:
```typescript
import type { Effect } from "effect"
import type { JSONSchema7 } from "json-schema"

export interface ToolContext {
  workingDir: string
  sessionId: string
  permissionCheck: (tool: string, pattern: string) => Effect.Effect<boolean>
}

export interface ToolDef {
  id: string
  description: string
  parameters: JSONSchema7
  execute(args: Record<string, any>, ctx: ToolContext): Promise<ToolResult>
}

export interface ToolResult {
  output: string
  error?: boolean
  metadata?: Record<string, any>
}
```

`src/tool/define.ts`:
```typescript
import type { ToolDef, ToolResult, ToolContext } from "./types.js"
import type { JSONSchema7 } from "json-schema"

export function defineTool(opts: {
  id: string
  description: string
  parameters: JSONSchema7
  execute: (args: Record<string, any>, ctx: ToolContext) => Promise<ToolResult>
}): ToolDef {
  return opts
}
```

---

### Task 2.2: Shell tool

**Files:**
- Create: `src/tool/shell.ts`
- Test: `src/tool/__tests__/shell.test.ts`

`src/tool/shell.ts`:
```typescript
import { defineTool } from "./define.js"

export const ShellTool = defineTool({
  id: "bash",
  description:
    "Execute a bash command. Returns stdout, stderr, and exit code. " +
    "Use for running security tools, compiling code, network operations.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default 30000)",
        default: 30000,
      },
    },
    required: ["command"],
  },
  async execute(args, ctx) {
    const { execa } = await import("execa")
    try {
      const result = await execa(args.command, {
        shell: true,
        cwd: ctx.workingDir,
        timeout: args.timeout ?? 30000,
        maxBuffer: 1024 * 1024, // 1MB
      })
      return {
        output: result.stdout || "(no output)",
        metadata: { exitCode: result.exitCode },
      }
    } catch (err: any) {
      return {
        output: err.stdout + "\n" + err.stderr || err.message,
        error: true,
        metadata: { exitCode: err.exitCode ?? 1 },
      }
    }
  },
})
```

`src/tool/__tests__/shell.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { ShellTool } from "../shell.js"

describe("ShellTool", () => {
  it("should execute echo command", async () => {
    const result = await ShellTool.execute(
      { command: "echo hello" },
      { workingDir: "/tmp", sessionId: "test", permissionCheck: async () => true } as any,
    )
    expect(result.output.trim()).toBe("hello")
    expect(result.error).toBeFalsy()
  })

  it("should capture stderr on failure", async () => {
    const result = await ShellTool.execute(
      { command: "ls /nonexistent_dir_xyz" },
      { workingDir: "/tmp", sessionId: "test", permissionCheck: async () => true } as any,
    )
    expect(result.error).toBe(true)
  })
})
```

Install execa: `npm install execa`

---

### Task 2.3: File tools (read, write, edit)

**Files:**
- Create: `src/tool/read.ts`
- Create: `src/tool/write.ts`
- Create: `src/tool/edit.ts`
- Test: `src/tool/__tests__/file-tools.test.ts`

`src/tool/read.ts`:
```typescript
import { defineTool } from "./define.js"
import * as fs from "node:fs/promises"

export const ReadTool = defineTool({
  id: "read",
  description: "Read a file's contents. Returns line-numbered output.",
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Absolute path to the file" },
      offset: { type: "number", description: "Line number to start from (1-indexed)" },
      limit: { type: "number", description: "Max lines to read" },
    },
    required: ["filePath"],
  },
  async execute(args) {
    const content = await fs.readFile(args.filePath, "utf-8")
    const lines = content.split("\n")
    const start = (args.offset ?? 1) - 1
    const end = args.limit ? start + args.limit : lines.length
    const sliced = lines.slice(start, end)
    const numbered = sliced.map((line, i) => `${start + i + 1}: ${line}`).join("\n")
    return { output: numbered }
  },
})
```

`src/tool/write.ts`:
```typescript
import { defineTool } from "./define.js"
import * as fs from "node:fs/promises"
import * as path from "node:path"

export const WriteTool = defineTool({
  id: "write",
  description: "Write content to a file. Creates parent directories if needed.",
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Absolute path to write" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["filePath", "content"],
  },
  async execute(args) {
    await fs.mkdir(path.dirname(args.filePath), { recursive: true })
    await fs.writeFile(args.filePath, args.content, "utf-8")
    return { output: `Wrote ${args.content.length} bytes to ${args.filePath}` }
  },
})
```

`src/tool/edit.ts`:
```typescript
import { defineTool } from "./define.js"
import * as fs from "node:fs/promises"

export const EditTool = defineTool({
  id: "edit",
  description:
    "Perform exact string replacement in a file. Fails if oldString not found or found multiple times.",
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Absolute path" },
      oldString: { type: "string", description: "Exact string to replace" },
      newString: { type: "string", description: "Replacement string" },
      replaceAll: { type: "boolean", description: "Replace all occurrences" },
    },
    required: ["filePath", "oldString", "newString"],
  },
  async execute(args) {
    const content = await fs.readFile(args.filePath, "utf-8")
    const count = content.split(args.oldString).length - 1
    if (count === 0) return { output: "oldString not found in file", error: true }
    if (count > 1 && !args.replaceAll) {
      return { output: `Found ${count} matches. Use replaceAll or provide more context.`, error: true }
    }
    const newContent = args.replaceAll
      ? content.replaceAll(args.oldString, args.newString)
      : content.replace(args.oldString, args.newString)
    await fs.writeFile(args.filePath, newContent, "utf-8")
    return { output: `Replaced ${args.replaceAll ? count : 1} occurrence(s) in ${args.filePath}` }
  },
})
```

Test file covering all three:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { ReadTool } from "../read.js"
import { WriteTool } from "../write.js"
import { EditTool } from "../edit.js"

const TEST_DIR = "/tmp/openhack-test-file-tools"

describe("File tools", () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true })
  })

  it("write then read", async () => {
    const filePath = path.join(TEST_DIR, "test.txt")
    await WriteTool.execute({ filePath, content: "hello world\nline 2\n" }, {} as any)
    const result = await ReadTool.execute({ filePath }, {} as any)
    expect(result.output).toContain("hello world")
    expect(result.output).toContain("1:")
    expect(result.output).toContain("2:")
  })

  it("edit replaces exact string", async () => {
    const filePath = path.join(TEST_DIR, "edit-test.txt")
    await WriteTool.execute({ filePath, content: "foo bar baz" }, {} as any)
    const result = await EditTool.execute({ filePath, oldString: "bar", newString: "QUX" }, {} as any)
    expect(result.error).toBeFalsy()
    const read = await ReadTool.execute({ filePath }, {} as any)
    expect(read.output).toContain("foo QUX baz")
  })
})
```

---

### Task 2.4: Search tools (glob, grep)

**Files:**
- Create: `src/tool/glob.ts`
- Create: `src/tool/grep.ts`

`src/tool/glob.ts`:
```typescript
import { defineTool } from "./define.js"
import { glob } from "glob"

export const GlobTool = defineTool({
  id: "glob",
  description: "Find files matching a glob pattern.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern (e.g. **/*.py)" },
      path: { type: "string", description: "Directory to search in" },
    },
    required: ["pattern"],
  },
  async execute(args, ctx) {
    const files = await glob(args.pattern, { cwd: args.path ?? ctx.workingDir, absolute: true })
    return { output: files.join("\n") || "(no matches)" }
  },
})
```

`src/tool/grep.ts`:
```typescript
import { defineTool } from "./define.js"
import { execa } from "execa"

export const GrepTool = defineTool({
  id: "grep",
  description: "Search file contents with regex. Returns matching lines.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern" },
      path: { type: "string", description: "Directory to search" },
      include: { type: "string", description: "File pattern (e.g. *.py)" },
    },
    required: ["pattern"],
  },
  async execute(args, ctx) {
    const grepArgs = ["-rn", "--color=never", "-E", args.pattern]
    if (args.include) grepArgs.push("--include", args.include)
    grepArgs.push(args.path ?? ctx.workingDir)
    try {
      const result = await execa("grep", grepArgs, { timeout: 30000 })
      const lines = result.stdout.split("\n").slice(0, 200)
      return { output: lines.join("\n") }
    } catch (err: any) {
      if (err.exitCode === 1) return { output: "(no matches)" }
      return { output: err.message, error: true }
    }
  },
})
```

---

### Task 2.5: WebFetch tool + Flag detection tool

**Files:**
- Create: `src/tool/webfetch.ts`
- Create: `src/tool/flag.ts`

`src/tool/webfetch.ts`:
```typescript
import { defineTool } from "./define.js"

export const WebFetchTool = defineTool({
  id: "webfetch",
  description: "Fetch a URL and return its content as text/markdown.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to fetch" },
      format: { type: "string", enum: ["text", "markdown", "html"], default: "markdown" },
    },
    required: ["url"],
  },
  async execute(args) {
    const resp = await fetch(args.url, {
      headers: { "User-Agent": "openhack/0.1.0" },
      signal: AbortSignal.timeout(30000),
    })
    if (!resp.ok) return { output: `HTTP ${resp.status} ${resp.statusText}`, error: true }
    const text = await resp.text()
    const truncated = text.length > 50000 ? text.slice(0, 50000) + "\n...(truncated)" : text
    return { output: truncated }
  },
})
```

`src/tool/flag.ts`:
```typescript
import { defineTool } from "./define.js"

export const FLAG_PATTERNS = [
  /flag\{[^}]+\}/gi,
  /HTB\{[^}]+\}/gi,
  /CTF\{[^}]+\}/gi,
  /picoCTF\{[^}]+\}/gi,
  /csawctf\{[^}]+\}/gi,
]

export function detectFlags(text: string): string[] {
  const flags = new Set<string>()
  for (const pattern of FLAG_PATTERNS) {
    pattern.lastIndex = 0
    const matches = text.matchAll(pattern)
    for (const m of matches) flags.add(m[0])
  }
  return [...flags]
}

export const FlagTool = defineTool({
  id: "flag",
  description: "Scan text for CTF flag patterns (flag{}, HTB{}, CTF{}, picoCTF{}, etc.)",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to scan for flags" },
    },
    required: ["text"],
  },
  async execute(args) {
    const flags = detectFlags(args.text)
    if (flags.length === 0) return { output: "No flags detected" }
    return {
      output: `Flags found:\n${flags.map((f) => `  🚩 ${f}`).join("\n")}`,
      metadata: { flags },
    }
  },
})
```

---

### Task 2.6: Tool Registry

**Files:**
- Create: `src/tool/registry.ts`
- Test: `src/tool/__tests__/registry.test.ts`

`src/tool/registry.ts`:
```typescript
import type { ToolDef } from "./types.js"
import { ShellTool } from "./shell.js"
import { ReadTool } from "./read.js"
import { WriteTool } from "./write.js"
import { EditTool } from "./edit.js"
import { GlobTool } from "./glob.js"
import { GrepTool } from "./grep.js"
import { WebFetchTool } from "./webfetch.js"
import { FlagTool } from "./flag.js"

export class ToolRegistry {
  private tools: Map<string, ToolDef> = new Map()

  static createBuiltin(): ToolRegistry {
    const reg = new ToolRegistry()
    const builtins: ToolDef[] = [
      ShellTool, ReadTool, WriteTool, EditTool,
      GlobTool, GrepTool, WebFetchTool, FlagTool,
    ]
    for (const tool of builtins) reg.register(tool)
    return reg
  }

  register(tool: ToolDef): void {
    this.tools.set(tool.id, tool)
  }

  get(id: string): ToolDef | undefined {
    return this.tools.get(id)
  }

  all(): ToolDef[] {
    return [...this.tools.values()]
  }

  /** Convert all registered tools to AI SDK tool format */
  toAITools(): Record<string, any> {
    const result: Record<string, any> = {}
    for (const tool of this.tools.values()) {
      result[tool.id] = {
        description: tool.description,
        parameters: tool.parameters,
      }
    }
    return result
  }
}
```

Test:
```typescript
import { describe, it, expect } from "vitest"
import { ToolRegistry } from "../registry.js"

describe("ToolRegistry", () => {
  it("should register and retrieve builtin tools", () => {
    const reg = ToolRegistry.createBuiltin()
    expect(reg.get("bash")).toBeDefined()
    expect(reg.get("read")).toBeDefined()
    expect(reg.get("write")).toBeDefined()
    expect(reg.get("edit")).toBeDefined()
    expect(reg.all()).toHaveLength(8)
  })

  it("should convert to AI SDK tool format", () => {
    const reg = ToolRegistry.createBuiltin()
    const tools = reg.toAITools()
    expect(tools.bash.description).toBeTruthy()
    expect(tools.bash.parameters.type).toBe("object")
  })
})
```

---

### Task 2.7: Wire tools into LLM loop

**Files:**
- Modify: `src/llm/stream.ts` — add tool execution loop
- Create: `src/llm/agent-loop.ts`

`src/llm/agent-loop.ts`:
```typescript
import { streamText, type CoreMessage, type ToolCallPart } from "ai"
import type { Provider } from "./provider.js"
import type { ToolRegistry } from "../tool/registry.js"
import type { ToolContext } from "../tool/types.js"
import { detectFlags } from "../tool/flag.js"

export interface AgentLoopOptions {
  provider: Provider
  messages: CoreMessage[]
  system?: string
  tools: ToolRegistry
  toolContext: ToolContext
  maxIterations?: number
  onToken?: (token: string) => void
  onToolCall?: (tool: string, args: any) => void
  onFlag?: (flag: string) => void
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<CoreMessage[]> {
  const messages = [...opts.messages]
  const maxIter = opts.maxIterations ?? 20

  for (let i = 0; i < maxIter; i++) {
    const aiTools: Record<string, any> = {}
    for (const tool of opts.tools.all()) {
      aiTools[tool.id] = {
        description: tool.description,
        parameters: { type: "object", ...tool.parameters },
        execute: async (args: any) => {
          opts.onToolCall?.(tool.id, args)
          const result = await tool.execute(args, opts.toolContext)
          // Auto-detect flags in tool output
          const flags = detectFlags(result.output)
          for (const f of flags) opts.onFlag?.(f)
          return result
        },
      }
    }

    const result = streamText({
      model: opts.provider.languageModel(),
      messages,
      system: opts.system,
      maxTokens: 4096,
      tools: aiTools,
      maxSteps: 1,
    })

    let fullText = ""
    let toolCalls: ToolCallPart[] = []

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        fullText += part.textDelta
        opts.onToken?.(part.textDelta)
      } else if (part.type === "tool-call") {
        toolCalls.push(part)
      }
    }

    // Build assistant message
    const assistantContent: any[] = []
    if (fullText) assistantContent.push({ type: "text", text: fullText })
    for (const tc of toolCalls) {
      assistantContent.push({
        type: "tool-call" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
      })
    }
    messages.push({ role: "assistant", content: assistantContent })

    // If no tool calls, we're done
    if (toolCalls.length === 0) break

    // Auto-detect flags in assistant text
    const flags = detectFlags(fullText)
    for (const f of flags) opts.onFlag?.(f)
  }

  return messages
}
```

**Step 2: Update CLI to use agent loop**

Update `src/index.ts` to use `runAgentLoop` with all tools registered. Replace the simple `streamLLMResponse` call with the full agent loop.

**Step 3: Run all tests**

```bash
npx vitest run
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: complete tool system with agent loop"
```

---

## Phase 3: Permission System

> Outcome: Dangerous commands are blocked or require confirmation.

### Task 3.1: Permission evaluator

**Files:**
- Create: `src/permission/evaluate.ts`
- Create: `src/permission/pattern.ts`
- Test: `src/permission/__tests__/evaluate.test.ts`

`src/permission/pattern.ts`:
```typescript
import { minimatch } from "minimatch"

export function matchWildcard(value: string, pattern: string): boolean {
  if (pattern === "*") return true
  return minimatch(value, pattern, { nocase: true })
}
```

`src/permission/evaluate.ts`:
```typescript
import type { PermissionRule } from "../config/schema.js"
import { matchWildcard } from "./pattern.js"

export type PermissionAction = "allow" | "deny" | "ask"

export function evaluate(
  tool: string,
  target: string,
  ...rulesets: PermissionRule[][]
): PermissionAction {
  const rules = rulesets.flat()
  // Last matching rule wins (like opencode)
  const match = rules.findLast(
    (rule) => matchWildcard(tool, rule.tool) && matchWildcard(target, rule.pattern),
  )
  return match?.action ?? "ask" // default to ask if no match
}
```

Install minimatch: `npm install minimatch`

Test:
```typescript
import { describe, it, expect } from "vitest"
import { evaluate } from "../evaluate.js"
import type { PermissionRule } from "../../../config/schema.js"

const rules: PermissionRule[] = [
  { tool: "read", pattern: "*", action: "allow" },
  { tool: "bash", pattern: "file *", action: "allow" },
  { tool: "bash", pattern: "nmap *", action: "ask" },
  { tool: "bash", pattern: "rm -rf /", action: "deny" },
]

describe("evaluate", () => {
  it("allows read for any target", () => {
    expect(evaluate("read", "/etc/passwd", rules)).toBe("allow")
  })
  it("allows bash file command", () => {
    expect(evaluate("bash", "file /tmp/chall.bin", rules)).toBe("allow")
  })
  it("asks for nmap", () => {
    expect(evaluate("bash", "nmap -sS 10.0.0.1", rules)).toBe("ask")
  })
  it("denies rm -rf /", () => {
    expect(evaluate("bash", "rm -rf /", rules)).toBe("deny")
  })
  it("defaults to ask for unknown", () => {
    expect(evaluate("unknown", "something", [])).toBe("ask")
  })
})
```

---

### Task 3.2: Wire permissions into tool execution

**Files:**
- Modify: `src/llm/agent-loop.ts` — add permission check before each tool execute

In the `execute` callback of each tool in the agent loop, call `evaluate()` first. If `deny` → return error. If `ask` → prompt user in REPL. If `allow` → proceed.

---

### Task 3.3: Commit

```bash
git add -A && git commit -m "feat: permission system with wildcard pattern matching"
```

---

## Phase 4: Skill Engine

> Outcome: `openhack skills list` shows available skills; loading a skill injects knowledge into agent context.

### Task 4.1: Skill parser (frontmatter)

**Files:**
- Create: `src/skill/parser.ts`
- Test: `src/skill/__tests__/parser.test.ts`

`src/skill/parser.ts`:
```typescript
import matter from "gray-matter"

export interface SkillFrontmatter {
  name: string
  description?: string
  license?: string
  compatibility?: string
  "allowed-tools"?: string
  metadata?: {
    "user-invocable"?: string
    "argument-hint"?: string
    category?: string
    "mcp-servers"?: MCPServerDecl[]
  }
}

export interface MCPServerDecl {
  name: string
  command: string[]
  optional?: boolean
  container?: string
}

export interface ParsedSkill {
  name: string
  description?: string
  location: string
  frontmatter: SkillFrontmatter
  content: string          // markdown body (the knowledge)
  files: string[]          // companion .md files
}

export function parseSkill(filePath: string, content: string): ParsedSkill | null {
  const parsed = matter(content)
  const data = parsed.data

  if (!data.name || typeof data.name !== "string") return null

  return {
    name: data.name,
    description: data.description,
    location: filePath,
    frontmatter: data as SkillFrontmatter,
    content: parsed.content,
    files: [],
  }
}
```

---

### Task 4.2: Skill discovery (scan directories)

**Files:**
- Create: `src/skill/loader.ts`

`src/skill/loader.ts`:
```typescript
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { glob } from "glob"
import { parseSkill, type ParsedSkill } from "./parser.js"

export const SKILL_DIRS = [
  // Built-in (relative to app root)
  "skills",
  // Global user
  path.join(process.env.HOME ?? "~", ".openhack", "skills"),
  // Project local
  ".openhack/skills",
]

export async function discoverSkills(projectDir: string): Promise<ParsedSkill[]> {
  const skills: ParsedSkill[] = []
  const seen = new Set<string>()

  for (const dir of SKILL_DIRS) {
    const absDir = path.isAbsolute(dir) ? dir : path.join(projectDir, dir)
    const pattern = path.join(absDir, "**/SKILL.md")
    const matches = await glob(pattern, { absolute: true }).catch(() => [] as string[])

    for (const skillFile of matches) {
      const content = await fs.readFile(skillFile, "utf-8")
      const skill = parseSkill(skillFile, content)
      if (!skill) continue

      // Load companion .md files
      const skillDir = path.dirname(skillFile)
      const companions = await glob("*.md", { cwd: skillDir, absolute: true }).catch(() => [] as string[])
      const companionContents = await Promise.all(
        companions
          .filter((f) => f !== skillFile)
          .map(async (f) => ({ path: f, content: await fs.readFile(f, "utf-8") })),
      )
      skill.files = companionContents.map((c) => c.content)
      // Merge companion content into skill content
      if (companionContents.length > 0) {
        skill.content += "\n\n" + companionContents.map((c) => c.content).join("\n\n---\n\n")
      }

      if (!seen.has(skill.name)) {
        skills.push(skill)
        seen.add(skill.name)
      }
    }
  }

  return skills
}
```

---

### Task 4.3: Skill registry + SkillTool

**Files:**
- Create: `src/skill/registry.ts`

`src/skill/registry.ts`:
```typescript
import type { ParsedSkill } from "./parser.js"
import { discoverSkills } from "./loader.js"

export class SkillRegistry {
  private skills: Map<string, ParsedSkill> = new Map()

  static async create(projectDir: string): Promise<SkillRegistry> {
    const reg = new SkillRegistry()
    const skills = await discoverSkills(projectDir)
    for (const skill of skills) reg.skills.set(skill.name, skill)
    return reg
  }

  get(name: string): ParsedSkill | undefined {
    return this.skills.get(name)
  }

  list(): ParsedSkill[] {
    return [...this.skills.values()]
  }

  /** Generate system prompt section from a loaded skill */
  toPrompt(name: string): string | undefined {
    const skill = this.skills.get(name)
    if (!skill) return undefined
    return `## Skill: ${skill.name}\n\n${skill.content}`
  }
}
```

---

### Task 4.4: Create built-in triage skill

**Files:**
- Create: `skills/triage/SKILL.md`

`skills/triage/SKILL.md`:
```markdown
---
name: triage
description: >
  First-pass triage for CTF challenges. Analyzes files, URLs, and descriptions
  to determine the challenge category and route to the appropriate specialist agent.
metadata:
  user-invocable: "true"
  argument-hint: "[challenge-file-or-url]"
  category: meta
---

# CTF Challenge Triage

You are the triage agent for CTF challenges. Your job is to quickly analyze a challenge and determine its category.

## Analysis Steps

1. **File Analysis**: Run `file` on any binary files to determine type
2. **Text Inspection**: Use `strings`, `cat`, `head` to inspect text-based files
3. **Network Check**: If a URL/host is provided, use `curl` or `nmap` to probe
4. **Pattern Detection**: Look for category indicators:

| Indicator | Category |
|-----------|----------|
| ELF binary, `.bin`, no web interface | pwn or reverse |
| HTTP URL, web app, cookies, JWT | web |
| `.pcap`, disk image, memory dump | forensics |
| Mathematical puzzle, key/ciphertext | crypto |
| Python jail, encoding puzzle, sandbox | misc |
| Android APK, `.dex` file | reverse |

## Routing

After analysis, call the appropriate specialist:
- `/web` for web challenges
- `/pwn` for binary exploitation
- `/reverse` for reverse engineering
- `/crypto` for cryptography
- `/forensics` for forensics
- `/misc` for miscellaneous

## Output Format

```
Category: [web|pwn|reverse|crypto|forensics|misc]
Confidence: [high|medium|low]
Key observations:
- [observation 1]
- [observation 2]
Recommended approach: [brief strategy]
```
```

**Step: Commit**

```bash
git add -A && git commit -m "feat: skill engine with discovery, parsing, and triage skill"
```

---

## Phase 5: MCP Client

> Outcome: Agent can connect to external MCP servers and use their tools.

### Task 5.1: MCP client service

**Files:**
- Create: `src/mcp/client.ts`

`src/mcp/client.ts`:
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import type { MCPServerConfig } from "../config/schema.js"
import type { ToolDef, ToolResult, ToolContext } from "../tool/types.js"

export interface MCPConnection {
  name: string
  client: Client
  tools: ToolDef[]
}

export async function connectMCP(
  name: string,
  config: MCPServerConfig,
): Promise<MCPConnection> {
  const client = new Client({ name: "openhack", version: "0.1.0" })

  let transport
  if (config.type === "local" && config.command) {
    const [cmd, ...args] = config.command
    transport = new StdioClientTransport({
      command: cmd,
      args,
      env: { ...process.env, ...config.environment } as Record<string, string>,
    })
  } else {
    throw new Error(`Unsupported MCP config type: ${config.type}`)
  }

  await client.connect(transport)
  const { tools: mcpTools } = await client.listTools()

  // Convert MCP tools to our ToolDef format
  const tools: ToolDef[] = mcpTools.map((t) => ({
    id: `${name}__${t.name}`,
    description: t.description ?? "",
    parameters: (t.inputSchema ?? { type: "object", properties: {} }) as any,
    async execute(args, ctx): Promise<ToolResult> {
      const result = await client.callTool({ name: t.name, arguments: args })
      const textContent = result.content
        ?.filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n") ?? ""
      return { output: textContent || "(no output)" }
    },
  }))

  return { name, client, tools }
}

export async function disconnectMCP(conn: MCPConnection): Promise<void> {
  await conn.client.close()
}
```

---

### Task 5.2: MCP lifecycle manager

**Files:**
- Create: `src/mcp/lifecycle.ts`

`src/mcp/lifecycle.ts`:
```typescript
import type { OpenhackConfig, MCPServerConfig } from "../config/schema.js"
import { connectMCP, disconnectMCP, type MCPConnection } from "./client.js"
import type { ToolDef } from "../tool/types.js"

export class MCPLifecycle {
  private connections: Map<string, MCPConnection> = new Map()

  async startAll(config: OpenhackConfig): Promise<ToolDef[]> {
    const tools: ToolDef[] = []
    for (const [name, mcpConfig] of Object.entries(config.mcp)) {
      try {
        const conn = await connectMCP(name, mcpConfig)
        this.connections.set(name, conn)
        tools.push(...conn.tools)
      } catch (err) {
        if (!mcpConfig.optional) {
          console.error(`MCP server "${name}" failed to start:`, err)
        }
      }
    }
    return tools
  }

  async startOne(name: string, config: MCPServerConfig): Promise<ToolDef[]> {
    const conn = await connectMCP(name, config)
    this.connections.set(name, conn)
    return conn.tools
  }

  async stopAll(): Promise<void> {
    for (const conn of this.connections.values()) {
      await disconnectMCP(conn)
    }
    this.connections.clear()
  }

  getActiveConnections(): string[] {
    return [...this.connections.keys()]
  }
}
```

---

### Task 5.3: Create pwn MCP server (example)

**Files:**
- Create: `mcp/pwn-server.ts`

`mcp/pwn-server.ts`:
```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { execa } from "execa"

const server = new Server({ name: "pwn-tools", version: "0.1.0" }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "checksec",
      description: "Check binary security features (NX, ASLR, Canary, PIE, RELRO)",
      inputSchema: {
        type: "object",
        properties: { binary: { type: "string", description: "Path to binary" } },
        required: ["binary"],
      },
    },
    {
      name: "disassemble",
      description: "Disassemble binary functions using objdump",
      inputSchema: {
        type: "object",
        properties: {
          binary: { type: "string" },
          function: { type: "string", description: "Function name (optional)" },
        },
        required: ["binary"],
      },
    },
    {
      name: "run_exploit",
      description: "Execute a Python exploit script (typically using pwntools)",
      inputSchema: {
        type: "object",
        properties: {
          script: { type: "string", description: "Python script content" },
          timeout: { type: "number", default: 30 },
        },
        required: ["script"],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === "checksec") {
    try {
      const result = await execa("checksec", ["--file=" + args!.binary], { timeout: 10000 })
      return { content: [{ type: "text", text: result.stdout }] }
    } catch (err: any) {
      // Fallback to readelf if checksec not available
      try {
        const r = await execa("readelf", ["-l", args!.binary], { timeout: 10000 })
        return { content: [{ type: "text", text: r.stdout }] }
      } catch (e2: any) {
        return { content: [{ type: "text", text: err.message }], isError: true }
      }
    }
  }

  if (name === "disassemble") {
    const objdumpArgs = ["-d", args!.binary]
    if (args!.function) objdumpArgs.push("--disassemble=" + args!.function)
    try {
      const result = await execa("objdump", objdumpArgs, { timeout: 15000 })
      const output = result.stdout.length > 50000 ? result.stdout.slice(0, 50000) + "\n...(truncated)" : result.stdout
      return { content: [{ type: "text", text: output }] }
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message }], isError: true }
    }
  }

  if (name === "run_exploit") {
    try {
      const result = await execa("python3", ["-c", args!.script], {
        timeout: (args!.timeout ?? 30) * 1000,
        maxBuffer: 1024 * 1024,
      })
      return { content: [{ type: "text", text: result.stdout + "\n" + result.stderr }] }
    } catch (err: any) {
      return {
        content: [{ type: "text", text: (err.stdout ?? "") + "\n" + (err.stderr ?? "") + "\n" + err.message }],
        isError: true,
      }
    }
  }

  return { content: [{ type: "text", text: "Unknown tool" }], isError: true }
})

const transport = new StdioServerTransport()
await server.connect(transport)
```

**Step: Commit**

```bash
git add -A && git commit -m "feat: MCP client + lifecycle + pwn MCP server"
```

---

## Phase 6: Agent System

> Outcome: Triage agent classifies challenges, routes to specialist agents.

### Task 6.1: Agent definition and router

**Files:**
- Create: `src/agent/types.ts`
- Create: `src/agent/router.ts`

`src/agent/types.ts`:
```typescript
import type { PermissionRule } from "../config/schema.js"

export type AgentMode = "primary" | "subagent"

export interface AgentDef {
  name: string
  mode: AgentMode
  description: string
  systemPrompt: string
  permissions: PermissionRule[]
  defaultSkills: string[]
}

export const AGENTS: Record<string, AgentDef> = {
  triage: {
    name: "triage",
    mode: "primary",
    description: "CTF challenge triage and classification",
    systemPrompt: `You are the triage agent for openhack, a CTF competition assistant.
Analyze the challenge and determine its category. Be concise.
Output your analysis in the structured format defined in your triage skill.`,
    permissions: [
      { tool: "bash", pattern: "file *", action: "allow" },
      { tool: "bash", pattern: "strings *", action: "allow" },
      { tool: "bash", pattern: "curl *", action: "allow" },
      { tool: "bash", pattern: "head *", action: "allow" },
      { tool: "bash", pattern: "cat *", action: "allow" },
      { tool: "read", pattern: "*", action: "allow" },
      { tool: "glob", pattern: "*", action: "allow" },
    ],
    defaultSkills: ["triage"],
  },
  web: {
    name: "web",
    mode: "primary",
    description: "Web security challenges (SQLi, XSS, SSTI, SSRF, JWT, file upload, etc.)",
    systemPrompt: `You are the web exploitation specialist agent for openhack.
You solve web security CTF challenges. Use your web skill knowledge and available tools.`,
    permissions: [
      { tool: "bash", pattern: "curl *", action: "allow" },
      { tool: "bash", pattern: "python3 *", action: "allow" },
      { tool: "bash", pattern: "sqlmap *", action: "ask" },
      { tool: "bash", pattern: "nmap *", action: "ask" },
      { tool: "*", pattern: "*", action: "allow" },
    ],
    defaultSkills: ["web"],
  },
  pwn: {
    name: "pwn",
    mode: "primary",
    description: "Binary exploitation (buffer overflow, ROP, heap, format string, etc.)",
    systemPrompt: `You are the binary exploitation specialist agent for openhack.
You solve pwn CTF challenges using checksec, disassembly, and exploit development.`,
    permissions: [
      { tool: "*", pattern: "*", action: "allow" },
    ],
    defaultSkills: ["pwn"],
  },
  reverse: {
    name: "reverse",
    mode: "primary",
    description: "Reverse engineering (ELF/PE analysis, custom VMs, anti-debug, etc.)",
    systemPrompt: `You are the reverse engineering specialist agent for openhack.
You analyze and reverse engineer binaries to find flags.`,
    permissions: [
      { tool: "*", pattern: "*", action: "allow" },
    ],
    defaultSkills: ["reverse"],
  },
  crypto: {
    name: "crypto",
    mode: "primary",
    description: "Cryptographic challenges (RSA, AES, ECC, classical ciphers, etc.)",
    systemPrompt: `You are the cryptography specialist agent for openhack.
You solve crypto CTF challenges using mathematical analysis and script-based attacks.`,
    permissions: [
      { tool: "*", pattern: "*", action: "allow" },
    ],
    defaultSkills: ["crypto"],
  },
  forensics: {
    name: "forensics",
    mode: "primary",
    description: "Digital forensics (disk/memory, steganography, network captures, etc.)",
    systemPrompt: `You are the digital forensics specialist agent for openhack.
You analyze disk images, memory dumps, network captures, and hidden data.`,
    permissions: [
      { tool: "*", pattern: "*", action: "allow" },
    ],
    defaultSkills: ["forensics"],
  },
  misc: {
    name: "misc",
    mode: "primary",
    description: "Miscellaneous challenges (pyjail, encoding, sandbox escape, etc.)",
    systemPrompt: `You are the miscellaneous challenges specialist agent for openhack.
You solve pyjail, encoding puzzles, sandbox escapes, and other non-standard challenges.`,
    permissions: [
      { tool: "*", pattern: "*", action: "allow" },
    ],
    defaultSkills: ["misc"],
  },
}
```

`src/agent/router.ts`:
```typescript
import { AGENTS, type AgentDef } from "./types.js"

export function getAgent(name: string): AgentDef | undefined {
  return AGENTS[name]
}

export function listAgents(): AgentDef[] {
  return Object.values(AGENTS)
}

export function getDefaultAgent(): AgentDef {
  return AGENTS.triage
}
```

---

### Task 6.2: Wire agent selection into CLI

Update `src/index.ts` to accept `--agent` flag. When no agent specified, use `triage`. Load agent's default skills and build system prompt from skill content.

**Step: Commit**

```bash
git add -A && git commit -m "feat: agent system with triage + 6 specialist agents"
```

---

## Phase 7: Session Management + Events

> Outcome: Sessions persist across restarts; events track progress.

### Task 7.1: Event bus

**Files:**
- Create: `src/session/events.ts`

```typescript
export type HackEvent =
  | { type: "FLAG_FOUND"; flag: string; source: string }
  | { type: "VULN_DISCOVERED"; vuln: string; severity: string; detail: string }
  | { type: "PHASE_CHANGE"; from: string; to: string }
  | { type: "TOOL_EXEC"; tool: string; args: string[]; exitCode: number }
  | { type: "SKILL_LOADED"; skill: string; mcpStarted: boolean }
  | { type: "AGENT_SWITCH"; from: string; to: string; reason: string }

export type EventCallback = (event: HackEvent) => void

export class EventBus {
  private listeners: EventCallback[] = []

  on(cb: EventCallback): () => void {
    this.listeners.push(cb)
    return () => { this.listeners = this.listeners.filter((l) => l !== cb) }
  }

  emit(event: HackEvent): void {
    for (const cb of this.listeners) cb(event)
  }
}
```

### Task 7.2: Session store

**Files:**
- Create: `src/session/store.ts`

```typescript
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import type { HackEvent } from "./events.js"

export interface Session {
  id: string
  createdAt: string
  challenge: {
    name?: string
    category?: string
    description?: string
    files: string[]
    target?: string
  }
  timeline: HackEvent[]
  flags: string[]
  state: "idle" | "running" | "paused" | "completed" | "error"
  agentHistory: string[]
}

const SESSION_DIR = path.join(os.homedir(), ".openhack", "sessions")

export const SessionStore = {
  async create(challenge?: Partial<Session["challenge"]>): Promise<Session> {
    await fs.mkdir(SESSION_DIR, { recursive: true })
    const session: Session = {
      id: `ses_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      challenge: { files: [], ...challenge },
      timeline: [],
      flags: [],
      state: "idle",
      agentHistory: [],
    }
    await fs.writeFile(
      path.join(SESSION_DIR, `${session.id}.json`),
      JSON.stringify(session, null, 2),
    )
    return session
  },

  async load(id: string): Promise<Session | null> {
    try {
      const raw = await fs.readFile(path.join(SESSION_DIR, `${id}.json`), "utf-8")
      return JSON.parse(raw)
    } catch {
      return null
    }
  },

  async save(session: Session): Promise<void> {
    await fs.mkdir(SESSION_DIR, { recursive: true })
    await fs.writeFile(
      path.join(SESSION_DIR, `${session.id}.json`),
      JSON.stringify(session, null, 2),
    )
  },

  async list(): Promise<Session[]> {
    await fs.mkdir(SESSION_DIR, { recursive: true })
    const files = await fs.readdir(SESSION_DIR)
    const sessions: Session[] = []
    for (const f of files.filter((f) => f.endsWith(".json"))) {
      const s = await this.load(f.replace(".json", ""))
      if (s) sessions.push(s)
    }
    return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
}
```

**Step: Commit**

```bash
git add -A && git commit -m "feat: session persistence with event bus"
```

---

## Phase 8: REPL TUI

> Outcome: Full interactive terminal UI with input, streaming output, and flag highlighting.

### Task 8.1: REPL with ink

**Files:**
- Create: `src/repl/index.tsx`
- Create: `src/repl/components/ChatMessage.tsx`
- Create: `src/repl/components/Input.tsx`
- Create: `src/repl/components/FlagHighlight.tsx`

This task creates an ink-based React TUI with:
- Scrolling message history
- Input box at bottom
- Streaming text display
- Flag highlighting (🚩 flag{...} shown in green/bold)
- Tool call display (shows tool name + truncated args)
- Agent indicator showing current active agent

**Step: Commit**

```bash
git add -A && git commit -m "feat: ink-based REPL TUI with flag highlighting"
```

---

## Phase 9: Runtime Layer (Docker)

> Outcome: Agent detects Docker and optionally runs tools in containers.

### Task 9.1: Docker detector + executor

**Files:**
- Create: `src/runtime/docker.ts`

```typescript
import { execa } from "execa"

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execa("docker", ["info"], { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

export async function runInContainer(
  image: string,
  command: string[],
  options?: { timeout?: number; workdir?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = ["run", "--rm"]
  if (options?.workdir) args.push("-w", options.workdir)
  args.push(image, ...command)
  try {
    const result = await execa("docker", args, {
      timeout: options?.timeout ?? 60000,
      maxBuffer: 1024 * 1024,
    })
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message,
      exitCode: err.exitCode ?? 1,
    }
  }
}
```

**Step: Commit**

```bash
git add -A && git commit -m "feat: Docker runtime detection and container execution"
```

---

## Phase 10: Built-in Skills Content

> Outcome: Complete CTF knowledge base in markdown.

### Task 10.1: Create all skill directories with SKILL.md + technique files

**Files (create all):**
- `skills/web/SKILL.md` + `skills/web/sql-injection.md` + `skills/web/xss.md` + `skills/web/ssti.md` + `skills/web/ssrf.md` + `skills/web/jwt-attacks.md` + `skills/web/file-upload.md`
- `skills/pwn/SKILL.md` + `skills/pwn/buffer-overflow.md` + `skills/pwn/rop-chains.md` + `skills/pwn/heap-exploitation.md` + `skills/pwn/format-string.md`
- `skills/reverse/SKILL.md` + `skills/reverse/elf-analysis.md` + `skills/reverse/custom-vm.md` + `skills/reverse/anti-debug.md`
- `skills/crypto/SKILL.md` + `skills/crypto/rsa-attacks.md` + `skills/crypto/aes-modes.md` + `skills/crypto/classical-ciphers.md`
- `skills/forensics/SKILL.md` + `skills/forensics/disk-memory.md` + `skills/forensics/steganography.md` + `skills/forensics/network-analysis.md`
- `skills/misc/SKILL.md` + `skills/misc/pyjail.md` + `skills/misc/encoding.md`

Each SKILL.md should follow the ctf-skills pattern: YAML frontmatter with name/description/allowed-tools/metadata, then markdown body with quick-start commands, technique overview, pivoting rules, and prerequisite installation commands.

**Reference:** Use https://github.com/ljagiello/ctf-skills as template for content structure.

**Step: Commit**

```bash
git add -A && git commit -m "feat: complete built-in skill content for all CTF categories"
```

---

## Phase 11: Additional MCP Servers

> Outcome: Web, reverse, forensics MCP servers.

### Task 11.1: web-server.ts

Tools: `dirb_scan`, `nikto_scan`, `sqlmap_run`, `curl_request`, `jwt_decode`

### Task 11.2: rev-server.ts

Tools: `ghidra_decompile`, `strings_extract`, `hexdump`, `r2_analyze`

### Task 11.3: forensics-server.ts

Tools: `binwalk_extract`, `exiftool_read`, `volatility_analyze`, `tshark_capture`

**Step: Commit each server separately**

---

## Phase 12: CLI Polish + Docker Images

### Task 12.1: Full CLI commands

Add to `src/index.ts`:
- `openhack solve <path>` — auto-triage and solve
- `openhack solve --category pwn <path>` — skip triage
- `openhack sessions` — list sessions
- `openhack resume <id>` — resume session
- `openhack skills list` — list available skills
- `openhack skills install <url>` — install remote skill
- `openhack config` — print current config

### Task 12.2: Docker image Dockerfiles

**Files:**
- `docker/Dockerfile.pwn` — Ubuntu + pwntools + gdb + pwndbg + checksec
- `docker/Dockerfile.web` — Ubuntu + sqlmap + nikto + dirb + nuclei
- `docker/Dockerfile.forensics` — Ubuntu + binwalk + volatility + exiftool + tshark
- `docker/Dockerfile.full` — All of the above

### Task 12.3: openhack.jsonc default config

```jsonc
{
  // LLM configuration — points to local Ollama by default
  "llm": {
    "baseURL": "http://localhost:11434/v1",
    "model": "llama3"
  },
  // MCP servers — started on demand when skill is loaded
  "mcp": {
    "pwn-tools": {
      "type": "local",
      "command": ["node", "--experimental-strip-types", "mcp/pwn-server.ts"],
      "optional": true
    },
    "web-tools": {
      "type": "local",
      "command": ["node", "--experimental-strip-types", "mcp/web-server.ts"],
      "optional": true
    }
  },
  // Docker configuration
  "docker": {
    "enabled": true,
    "preferContainer": true
  }
}
```

**Step: Final commit**

```bash
git add -A && git commit -m "feat: CLI polish, Docker images, default config"
```

---

## Dependency Graph (Execution Order)

```
Phase 1 (Scaffold + Config + LLM)
    │
    ├── Phase 2 (Tools) ──── Phase 3 (Permissions)
    │                              │
    ├── Phase 4 (Skills)          │
    │       │                      │
    │       └── Phase 5 (MCP) ────┤
    │                              │
    ├── Phase 6 (Agents) ◄────────┘
    │       │
    │       ├── Phase 7 (Sessions + Events)
    │       └── Phase 8 (REPL TUI)
    │
    ├── Phase 9 (Docker Runtime)
    ├── Phase 10 (Skill Content)
    ├── Phase 11 (MCP Servers)
    └── Phase 12 (CLI Polish + Dockerfiles)
```

**Critical path:** Phase 1 → 2 → 6 → 8 (gets you a working agent)
**Can parallelize:** Phase 3 + 4 + 5 (independent of each other)
**Can defer:** Phase 9, 10, 11, 12 (nice-to-have for MVP)
