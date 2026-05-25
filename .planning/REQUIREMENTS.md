# Requirements: OpenHack v0.1 — RSA Crypto Test & Improvement

**Defined:** 2026-05-25
**Core Value:** AI agent that autonomously solves CTF challenges with safety harness and persistent memory.

## v0.1 Requirements

### Testing

- [ ] **TEST-01**: OpenHack can be configured with an LLM backend and run `solve` command against a challenge directory
- [ ] **TEST-02**: Crypto agent can decompile a Python 3.10 .pyc file and extract RSA parameters (p, q, e, c, n)
- [ ] **TEST-03**: Crypto agent can perform standard RSA decryption given known p, q, e, c values
- [ ] **TEST-04**: Flag detection correctly identifies the flag `flag{IlikeCTFbutCTFdon'tlikeme}` from agent output
- [ ] **TEST-05**: Session state is correctly saved (running → completed with flag)

### Retrospective

- [ ] **RETRO-01**: Document agent's step-by-step behavior during the test run
- [ ] **RETRO-02**: Identify and document any failures, inefficiencies, or missed opportunities in the agent's approach
- [ ] **RETRO-03**: Document which skill references were actually used vs. ignored by the agent
- [ ] **RETRO-04**: Summarize lessons learned with actionable improvement items

### Code Improvements

- [ ] **IMPROVE-01**: Fix .pyc decompilation to handle multiple Python versions (detect magic number, try appropriate Python)
- [ ] **IMPROVE-02**: Improve crypto agent prompt to guide .pyc → extract params → RSA decrypt workflow more explicitly
- [ ] **IMPROVE-03**: Add Windows-specific Python path resolution (conda, py launcher, python3 fallback)
- [ ] **IMPROVE-04**: Add error handling for missing Python packages with actionable install messages
- [ ] **IMPROVE-05**: Fix Python tool to handle binary/multiline output correctly on Windows

### Capability Upgrades

- [ ] **UPGRADE-01**: Add base64/encoding detection to the flag validation workflow
- [ ] **UPGRADE-02**: Enhance crypto skill with .pyc version compatibility matrix
- [ ] **UPGRADE-03**: Add crypto agent ability to verify its own solution against expected flag format

## v0.2 Requirements

Deferred to future milestone.

### Extended Crypto

- **CRYPTO-01**: Agent can solve challenges requiring multiple RSA attack techniques in sequence
- **CRYPTO-02**: Agent can handle challenges with custom flag formats beyond standard patterns
- **CRYPTO-03**: Agent integrates with external crypto tools (RsaCtfTool, SageMath)

### Cross-Category

- **CROSS-01**: Reverse agent + Crypto agent collaboration for binary crypto challenges
- **CROSS-02**: Web agent + Crypto agent for web crypto challenges (JWT, TLS)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full automated test suite | Testing through real challenge execution only |
| Docker sandboxing for Python | Out of scope for this milestone; system Python is acceptable |
| Non-crypto categories | Focus on crypto agent quality first |
| Performance benchmarking | Correctness over speed for initial test |
| Multi-challenge batch testing | Single challenge test first, generalize later |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 1 | Pending |
| TEST-02 | Phase 1 | Pending |
| TEST-03 | Phase 1 | Pending |
| TEST-04 | Phase 1 | Pending |
| TEST-05 | Phase 1 | Pending |
| RETRO-01 | Phase 2 | Pending |
| RETRO-02 | Phase 2 | Pending |
| RETRO-03 | Phase 2 | Pending |
| RETRO-04 | Phase 2 | Pending |
| IMPROVE-01 | Phase 3 | Pending |
| IMPROVE-02 | Phase 3 | Pending |
| IMPROVE-03 | Phase 3 | Pending |
| IMPROVE-04 | Phase 3 | Pending |
| IMPROVE-05 | Phase 3 | Pending |
| UPGRADE-01 | Phase 4 | Pending |
| UPGRADE-02 | Phase 4 | Pending |
| UPGRADE-03 | Phase 4 | Pending |

**Coverage:**
- v0.1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-25*
*Last updated: 2026-05-25 after initial definition*
