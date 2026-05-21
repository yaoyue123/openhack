# MEMORY MODULE

Persistent markdown-based storage and context compression for agent sessions.

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Add a new memory file type | `memory-store.ts` -> `VALID_NAMES` set | Then add tool support in `src/tool/` |
| Change state.md template | `state-file.ts` -> `stateTemplate()` | Sections: Objective, Phase, What I Know, What I've Tried, Next Step, Blockers |
| Change compression logic | `compressor.ts` -> `compress()` | Splits messages into older (summarized) + recent (preserved) |
| Extract phase from state | `state-file.ts` -> `parsePhase()` | Regex on `## Phase` heading |
| Wire memory into agent loop | `index.ts` -> `MemoryManager` facade | Constructor takes `sessionDir`, delegates to store + compressor |
| Change compression trigger | `src/harness/budget-guard.ts` (not here) | Calls `MemoryManager.compress()` when tokens cross threshold |

## CONVENTIONS

- `MemoryManager` is the single facade. State operations delegate to `state-file.ts`, memory files to `MemoryStore`, compression to standalone `compress()` export.
- All file I/O swallows errors silently (returns `(empty)` or no-op). Callers should not expect throws.
- `VALID_NAMES` is a hardcoded allowlist: `findings`, `failed-paths`, `attack-log`, `experience`. Unknown names return `(empty)` on read, no-op on write.
- `appendLog()` appends ISO-timestamped lines to `attack-log.md`. Gated by `autoLog` config.
- `compress()` is a pure synchronous extraction, not LLM-based. It pulls tool call names + truncated args, flags via regex, and assistant text snippets into a summary system message.
- `state.md` lives at `sessionDir/state.md`. Memory files live at `sessionDir/memory/*.md`.
- `tokensSaved` is estimated as `(oldChars - summaryChars) / 4`, not measured.

## ANTI-PATTERNS

- Do NOT add new memory file names without updating `VALID_NAMES` in `memory-store.ts`. Writes silently drop.
- Do NOT call `MemoryStore` directly from outside this module. Use `MemoryManager`.
- Do NOT rely on `compress()` to preserve exact flag values in all cases. It extracts flags by regex from older messages, but recent messages are kept verbatim. The regex only matches `flag{}`, `HTB{}`, `CTF{}`, `picoCTF{}` patterns.
- Do NOT treat `readFile` / `readState` failures as empty string. They return a blank template string for state, `(empty)` for memory files.
- `compress()` is async but does no async work. The signature matches a potential future LLM-based compression hook.
