# Security Policy

## Supported Versions

Only the current `master` branch receives security updates. There are no stable release branches at this time.

## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues.**

Instead, use [GitHub Private Vulnerability Reporting](https://github.com/yaoyue123/openhack/security/advisories/new). This lets you disclose the issue privately so it can be fixed before public disclosure.

### What to Include

A good report helps us fix the issue fast. Please include:

- **Description** of the vulnerability and its impact
- **Steps to reproduce** or a proof of concept
- **Affected versions** (commit hash or version tag)
- **Any mitigations** you've already identified

### Response Timeline

| Stage | Timeline |
|---|---|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Critical fix | Within 7 days |
| Non-critical fix | Next release cycle |

You'll receive updates at each stage. If you don't hear back within 48 hours, follow up on the advisory or open a blank issue mentioning the advisory number.

## Scope

This policy covers the openhack codebase itself. It does not cover:

- Third-party dependencies (report to the upstream project)
- Issues in user configurations (API keys, permissions rules)
- Attacks requiring physical access or compromised host environments

## Out of Scope

- Theoretical vulnerabilities without a working proof of concept
- Social engineering attacks
- Denial of service through resource exhaustion of the LLM backend
