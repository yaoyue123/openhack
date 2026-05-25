---
wave: 1
depends_on: []
files_modified:
  - challenges/简单的rsa/challenge.json
autonomous: true
---

# Phase 1: Live Test Run — PLAN

**Phase:** 1
**Mode:** standard
**Wave:** 1 (single wave — sequential tasks with dependency)

## Goal

Execute `openhack solve` against `challenges/简单的rsa/简单的RSA.pyc` with the crypto agent and verify the correct flag is found: `flag{IlikeCTFbutCTFdon'tlikeme}`.

## Requirements

- TEST-01: OpenHack can be configured and run `solve` against a challenge
- TEST-02: Crypto agent decompiles .pyc and extracts RSA parameters
- TEST-03: Crypto agent performs RSA decryption correctly
- TEST-04: Flag detection identifies `flag{IlikeCTFbutCTFdon'tlikeme}`
- TEST-05: Session state transitions correctly

## Must-Haves (Goal-Backward Verification)

1. The command `npm run dev -- solve challenges/简单的rsa --category crypto` completes without crash
2. The output contains the string `flag{IlikeCTFbutCTFdon'tlikeme}`
3. A session file is created in `~/.openhack/sessions/` with state "completed" and the flag in its flags array
4. The full agent output is captured to a log file for Phase 2 retrospective analysis

## Pre-Conditions

- ✓ LLM backend configured: SiliconFlow API (`https://api.siliconflow.cn/v1`) with model `deepseek-ai/DeepSeek-V4-Flash`
- ✓ Python packages: pycryptodome, sympy, xdis, uncompyle6 installed
- ✓ Node.js project built (`npm run build` or use `npm run dev`)

## Tasks

### Task 1: Create challenge.json metadata

<read_first>
- src/solve.ts (lines 65-79 — understand how challenge.json is parsed and what fields are used)
</read_first>

<action>
Create file `challenges/简单的rsa/challenge.json` with fields: name="简单的RSA", category="crypto", description="Decrypt the message encrypted with RSA to find the flag. The challenge file is a Python compiled .pyc file.", files=["简单的RSA.pyc"]. Do NOT include a flag field (solve.ts strips it anyway).
</action>

<acceptance_criteria>
- File `challenges/简单的rsa/challenge.json` exists and contains valid JSON with name, category, description, files fields
- No `flag` key present in the JSON
</acceptance_criteria>

### Task 2: Verify build and test infrastructure

<read_first>
- package.json (scripts section)
</read_first>

<action>
Run `npm run typecheck` to verify TypeScript compiles cleanly. Run `npm run build` to produce dist/index.js. Verify the binary exists at dist/index.js.
</action>

<acceptance_criteria>
- `npm run typecheck` exits with code 0 (or only pre-existing errors, not new ones)
- `dist/index.js` exists after `npm run build`
</acceptance_criteria>

### Task 3: Execute the test run

<read_first>
- src/solve.ts (understand the solve flow)
- src/agent/definitions.ts (crypto agent prompt — know what context the agent receives)
</read_first>

<action>
Run `npm run dev -- solve challenges/简单的rsa --category crypto` and capture ALL output (stdout + stderr) to `.planning/phases/01-live-test/test-output.log`. Use a timeout of 5 minutes (300s, matching config). The working directory must be the project root so the tool can find `challenges/简单的rsa/`.

**Critical:** Capture the full output including:
- Agent's token-by-token reasoning (onToken callback)
- Tool calls and their results ([tool: ...] markers)
- Flag detection output (🚩 FLAG DETECTED: ...)
- Session info at the end

If the command fails or times out, capture whatever output was produced.
</action>

<acceptance_criteria>
- File `.planning/phases/01-live-test/test-output.log` exists and contains the full agent execution output
- Output shows the agent was invoked with the crypto specialist (not triage)
- Output shows at least one tool call (python, read, or bash)
</acceptance_criteria>

### Task 4: Verify the result

<read_first>
- .planning/phases/01-live-test/test-output.log (the test output)
- src/session/store.ts (understand session file format)
</read_first>

<action>
Check the test output for:
1. Does the output contain `flag{IlikeCTFbutCTFdon'tlikeme}`?
2. What tool calls did the agent make? (grep for `[tool:` lines)
3. Did the agent successfully extract p, q, e, c from the .pyc?
4. Did the agent perform RSA decryption?
5. What was the session state at the end?

Also check `~/.openhack/sessions/` for the session file and verify its state and flags array.

Write findings to `.planning/phases/01-live-test/test-results.md` with:
- PASS/FAIL for each of the 5 success criteria (TEST-01 through TEST-05)
- Summary of agent's step-by-step approach
- Any errors or unexpected behavior observed
- Full list of tool calls in order
</action>

<acceptance_criteria>
- File `.planning/phases/01-live-test/test-results.md` exists
- Contains PASS/FAIL verdicts for TEST-01 through TEST-05
- If any test FAIL, includes detailed description of what went wrong
- Includes ordered list of all tool calls the agent made
</acceptance_criteria>

## Post-Conditions

- Test execution completed and output captured
- Results documented with PASS/FAIL for all 5 criteria
- Full agent trace available for Phase 2 retrospective analysis
- If flag was found: confirmation that the entire pipeline works end-to-end
- If flag was NOT found: documented failure points for Phase 2+3 improvement cycle

## Verification

1. `test-output.log` contains complete agent execution trace
2. `test-results.md` has verdicts for all 5 success criteria
3. Each verdict is backed by evidence from the output log
4. Session file in `~/.openhack/sessions/` reflects the actual execution result
