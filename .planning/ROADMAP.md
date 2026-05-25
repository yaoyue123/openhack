# Roadmap: OpenHack v0.1 — RSA Crypto Test & Improvement

**Created:** 2026-05-25
**Milestone:** v0.1
**Phases:** 4

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Live Test Run | Run openhack solve against the RSA .pyc challenge and verify it gets the correct flag | TEST-01, TEST-02, TEST-03, TEST-04, TEST-05 | 5 criteria |
| 2 | Retrospective | Analyze the test run, document findings, and identify improvement opportunities | RETRO-01, RETRO-02, RETRO-03, RETRO-04 | 4 criteria |
| 3 | Code Improvements | Fix identified issues: .pyc handling, Windows compat, Python tool, agent prompts | IMPROVE-01, IMPROVE-02, IMPROVE-03, IMPROVE-04, IMPROVE-05 | 5 criteria |
| 4 | Capability Upgrades | Enhance crypto agent with encoding detection, .pyc version matrix, self-verification | UPGRADE-01, UPGRADE-02, UPGRADE-03 | 3 criteria |

## Phase Details

### Phase 1: Live Test Run

**Goal:** Execute `openhack solve` against `challenges/简单的rsa/简单的RSA.pyc` with proper LLM configuration and verify the agent finds the correct flag.

**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04, TEST-05

**Success criteria:**
1. `openhack solve` command starts without configuration errors
2. Agent successfully decompiles the .pyc file and extracts RSA parameters
3. Agent performs correct RSA decryption (m = pow(c, d, n))
4. Flag `flag{IlikeCTFbutCTFdon'tlikeme}` is detected and reported
5. Session state transitions correctly (running → completed)

**Key tasks:**
- Configure LLM backend (verify existing config or set up new one)
- Create challenge.json metadata file in the challenge directory
- Run `openhack solve challenges/简单的rsa --category crypto`
- Monitor agent's tool calls and reasoning
- Verify flag detection and session state

### Phase 2: Retrospective

**Goal:** Analyze the test run output, document agent behavior, identify what worked and what didn't, and produce actionable improvement items.

**Requirements:** RETRO-01, RETRO-02, RETRO-03, RETRO-04

**Success criteria:**
1. Step-by-step agent behavior documented (which tools were called, in what order, with what results)
2. Failures and inefficiencies identified and categorized (critical/medium/low)
3. Skill reference usage analyzed (which SKILL.md sections were referenced)
4. Lessons learned document produced with prioritized improvement items

**Key tasks:**
- Analyze session output and tool call history
- Map agent decisions against the crypto skill reference
- Identify gaps between expected and actual agent behavior
- Write retrospective document in `.planning/phases/02-retro/`

### Phase 3: Code Improvements

**Goal:** Fix identified issues from the retrospective: .pyc version handling, Windows Python path resolution, agent prompt clarity, error messages.

**Requirements:** IMPROVE-01, IMPROVE-02, IMPROVE-03, IMPROVE-04, IMPROVE-05

**Success criteria:**
1. .pyc decompilation works across Python 3.8-3.13 (magic number detection + version-specific handling)
2. Crypto agent prompt explicitly guides .pyc → extract → decrypt workflow
3. Windows Python resolution works with conda, py launcher, and python3
4. Missing package errors include actionable install instructions
5. Python tool handles binary output and multiline results correctly on Windows

**Key tasks:**
- Add Python version detection for .pyc files in crypto agent prompt
- Improve PythonTool with Windows path resolution and error handling
- Enhance crypto agent CRYPTO_PROMPT with explicit .pyc workflow
- Add package availability checks with helpful error messages
- Fix Python tool output handling for Windows

### Phase 4: Capability Upgrades

**Goal:** Enhance the crypto agent with smarter encoding detection, .pyc version compatibility documentation, and self-verification capabilities.

**Requirements:** UPGRADE-01, UPGRADE-02, UPGRADE-03

**Success criteria:**
1. Agent automatically detects and handles base64/hex/latin1 encoding in decrypted RSA output
2. Crypto skill includes Python version → .pyc magic number compatibility matrix
3. Agent can verify its solution by re-encrypting and comparing against original ciphertext

**Key tasks:**
- Add encoding detection logic to crypto agent workflow documentation
- Update skills/crypto/SKILL.md with .pyc version compatibility table
- Add solution verification step to crypto agent prompt
- Update crypto skills with self-check patterns

---
*Roadmap created: 2026-05-25*
