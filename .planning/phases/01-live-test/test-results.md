# Phase 1: Live Test Run — Results

**Date**: 2026-05-25
**Challenge**: 简单的RSA (crypto, .pyc file)
**Expected Flag**: `flag{IlikeCTFbutCTFdon'tlikeme}`
**Actual Flag**: **NOT FOUND** ❌

## Test Results

| Test ID | Description | Result | Notes |
|---------|-------------|--------|-------|
| TEST-01 | CLI launches and reads challenge | ✅ PASS | `solve` command reads challenge.json, creates session correctly |
| TEST-02 | Agent delegates to crypto specialist | ✅ PASS | `--category crypto` bypasses triage, uses crypto agent |
| TEST-03 | Agent executes tools | ⚠️ PARTIAL | Agent calls glob/read tools but never uses python/bash |
| TEST-04 | Correct flag found | ❌ FAIL | No flag detected after 11 iterations |
| TEST-05 | Harness terminates stalled agent | ✅ PASS | Terminated after 10 steps without progress (no_progress) |

**Overall: FAIL** — Agent did not solve the challenge.

## Detailed Findings

### Run 1 (Timed out at 5min)
- **Session**: ses_mpkozwg7
- **Result**: Timeout, session stuck in "running"
- **Root cause**: `python` tool not in permissions allow list → blocked by permission system

### Run 2 (Timed out at 10min)
- **Session**: ses_mpkp8w2r
- **Result**: Timeout, session stuck in "running"
- **Root cause**: Same permission issue

### Run 3 (Config error)
- **Result**: Config validation failed — `config set` stored array values as strings
- **Root cause**: CLI `config set` command doesn't parse JSON arrays from string arguments

### Run 4 (Terminated by harness)
- **Session**: ses_mpkq8mfh
- **Iterations**: 11 (10 steps + termination)
- **Duration**: ~70 seconds (04:49:35 to 04:50:35)
- **Termination reason**: `no_progress` (harness detected 10 steps without state change)
- **Agent behavior**: Repeatedly called `glob` and `read` tools, never used `python` or `bash`
- **State tracking**: State stayed at "recon" phase, never updated. "What I Know" empty.

## Root Cause Analysis

### Critical Issues

1. **Permission system blocks `python` tool by default** (FIXED in config)
   - `permissions.default: ["ask"]` causes non-interactive solve to block python/bash/flag tools
   - Only read/glob/grep/write/bash were explicitly allowed
   - `python` tool requires explicit allow rule
   - **Fix applied**: Set `permissions.default: ["allow"]` and added all tools to rules

2. **Config `set` command doesn't handle JSON arrays**
   - `openhack config set permissions.rules '[...]'` stores as string, not array
   - Causes config validation failure
   - **Code bug**: Config setter needs JSON.parse for array/object values

3. **Model doesn't follow crypto agent prompt effectively**
   - Despite prompt saying "Use python with xdis to extract constants", model keeps calling glob/read
   - Model (DeepSeek-V4-Flash) appears to lack tool-use sophistication for this task
   - **Not a code bug** — model capability issue

### Contributing Issues

4. **Binary .pyc file returns hex dump** — agent sees hex but doesn't know to switch to python decompilation
5. **State tracking not enforced** — agent never updates state.md, so harness can't detect meaningful progress
6. **Attack log shows only "(tool call)"** — no text reasoning captured, making debugging difficult
7. **AI SDK Warning about system messages** — non-blocking but noisy

### What Worked Well

- Build and typecheck pass cleanly
- Session creation and management works
- Agent delegation (crypto specialist) works
- Harness termination (no_progress detection) works correctly
- Memory system creates state.md and attack-log.md
- Read tool's binary detection and hex dump formatting works

## Recommendations for Phase 2 (Retrospective)

1. **Fix config setter** to handle JSON arrays/objects
2. **Change default permissions** to `["allow"]` for solve mode (non-interactive)
3. **Add decompilation hint** to crypto agent prompt for .pyc files (emphasize python tool over read)
4. **Consider model-specific prompting** — weaker models need more explicit step-by-step guidance
5. **Enforce state updates** — after each tool call step, remind agent to update state.md
6. **Add .pyc detection logic** — when read tool detects .pyc, automatically suggest decompilation approach
