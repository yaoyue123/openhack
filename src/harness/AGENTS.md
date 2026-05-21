# HARNESS

Three-guard system that observes the agent loop via `onStepFinish` callback. It never modifies prompts directly. It returns hints and actions that the agent loop interprets.

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Add a new guard | New file + register in `index.ts` Harness class | Follow the `check(messages, ...) -> Result` pattern |
| Change loop sensitivity | `types.ts` DEFAULT_HARNESS_CONFIG.loop | windowSize, similarityThreshold, maxRepeats |
| Change token budget | `types.ts` DEFAULT_HARNESS_CONFIG.budget | maxTokens, compressThreshold, preserveRecentSteps |
| Change stall tolerance | `types.ts` DEFAULT_HARNESS_CONFIG.terminator | maxStepsWithoutProgress |
| Modify similarity algorithm | `loop-guard.ts` jaccardSimilarity / tokenize | Jaccard on token sets, sha256 hashes tool args |
| Modify token estimation | `budget-guard.ts` estimateTokens | char-length / 4 heuristic, fallback when no usage reported |
| Modify termination triggers | `terminator.ts` FLAG_PATTERN, PHASE_PATTERN | Regex for flags and `## Phase done` in state.md |
| Change config merging | `index.ts` Harness constructor | Spread defaults with partial overrides per guard |

## CONVENTIONS

- Every guard has a `check()` method that takes `ModelMessage[]` and returns a typed result from `types.ts`.
- Results carry an action enum or boolean, never throw. The agent loop decides what to do with the result.
- Config is always a plain object from `types.ts`, validated by Zod upstream in `src/config/`.
- LoopGuard is stateful (keeps a sliding window of tool call signatures). BudgetGuard and Terminator are stateless per call.
- Terminator checks state.md phase before scanning messages for flag patterns.
- BudgetGuard does not perform compression itself. It returns `shouldCompress: true` and the agent loop delegates to MemoryManager.

## ANTI-PATTERNS

- Do NOT make guards modify messages in place. They are observers.
- Do NOT import from `src/memory/` or `src/agent-loop/` in guard files. The dependency flows the other direction.
- Do NOT add state to BudgetGuard or Terminator without a reset mechanism. LoopGuard's window is the one exception.
- Do NOT use the `flag` tool result as the sole termination signal. Terminator scans raw message text for flag patterns as a backup.
