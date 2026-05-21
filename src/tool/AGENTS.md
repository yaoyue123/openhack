# src/tool/

13 built-in tools the agent loop dispatches during CTF solving.

## STRUCTURE

```
src/tool/
├── types.ts            # ToolDef, ToolContext, ToolResult interfaces
├── define.ts           # defineTool() identity factory (returns opts as-is)
├── registry.ts         # ToolRegistry class, createBuiltin() static factory
├── shell.ts            # ShellTool (id: "bash") - execa, shell:true, cwd from ctx
├── read.ts             # ReadTool - fs.readFile
├── write.ts            # WriteTool - fs.writeFile
├── edit.ts             # EditTool - exact string replacement, replaceAll option
├── glob.ts             # GlobTool - fast-glob pattern matching
├── grep.ts             # GrepTool - regex content search
├── webfetch.ts         # WebFetchTool - fetch URL, convert to text
├── flag.ts             # FlagTool - regex flag detection + detectFlags() helper
├── python.ts           # PythonTool - execa("python3", ["-c", code])
├── state-read.ts       # reads state.md from session dir
├── state-write.ts      # writes full state.md content
├── memory-query.ts     # reads memory files (findings, failed-paths, attack-log)
├── memory-write.ts     # writes to findings.md / failed-paths.md (attack-log is auto-only)
└── __tests__/          # vitest tests with mock ToolContext
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Add a new tool | New file + `registry.ts` | defineTool(), export PascalCase, add to builtins array |
| Change tool parameters | Tool file's `parameters` object | JSON Schema format (type, properties, required) |
| Change execution behavior | Tool file's `execute` function | Receives `(args, ctx: ToolContext)` |
| Access working dir or session | `ctx.workingDir`, `ctx.sessionId` | All tools get the same ToolContext |
| Permission gating | `ctx.permissionCheck(tool, pattern)` | Not yet wired in most tools |
| Flag detection logic | `flag.ts` -> `FLAG_PATTERNS`, `detectFlags()` | Terminator watches for flag metadata |
| Convert tools to AI SDK format | `registry.ts` -> `toAITools()` | Returns `{id: {description, parameters}}` map |

## CONVENTIONS

- Every tool is `defineTool({...})` assigned to a `export const PascalTool`
- `parameters` uses JSON Schema: `{ type: "object", properties: {...}, required: [...] }`
- `execute` returns `Promise<ToolResult>` where error results set `error: true` (never throw)
- ShellTool and PythonTool use `execa` with `maxBuffer: 1024 * 1024`, timeout support
- EditTool counts matches before replacing; errors if multiple matches without `replaceAll`
- `memory-write.ts` restricts writes to `findings` and `failed-paths` only (attack-log is append-only by the system)
- Tests mock ToolContext as `{ workingDir, sessionId, permissionCheck }` plain object
- Registry import order in `createBuiltin()` determines tool listing order

## ANTI-PATTERNS

- Do NOT throw from `execute`. Return `{ output: "...", error: true }` instead
- Do NOT add tools outside the builtins array in `createBuiltin()`. They won't be registered
- Do NOT use `ctx.permissionCheck()` without wiring it. Currently a no-op in most tools
- Do NOT write to `attack-log.md` from `memory-write`. It is auto-generated only
- Do NOT change `defineTool()` to do validation or wrapping. It is intentionally an identity function
- Do NOT import tool files outside this module except via `registry.ts`
