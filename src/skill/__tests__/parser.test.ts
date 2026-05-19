import { describe, it, expect } from "vitest"
import { parseSkill } from "../parser.js"

describe("parseSkill", () => {
  it("parses valid SKILL.md with frontmatter", () => {
    const content = `---
name: triage
description: First-pass triage for CTF challenges
---

# Triage Agent

Analyze files and route to specialists.
`
    const result = parseSkill("/skills/triage/SKILL.md", content)
    expect(result).not.toBeNull()
    expect(result!.name).toBe("triage")
    expect(result!.description).toBe("First-pass triage for CTF challenges")
    expect(result!.content).toContain("Triage Agent")
    expect(result!.location).toBe("/skills/triage/SKILL.md")
  })

  it("returns null when name is missing from frontmatter", () => {
    const content = `---
description: No name here
---

Some content.
`
    const result = parseSkill("/skills/bad/SKILL.md", content)
    expect(result).toBeNull()
  })

  it("extracts description correctly", () => {
    const content = `---
name: web-exploit
description: Web exploitation specialist
metadata:
  user-invocable: "true"
  category: exploit
---

# Web Exploit

Uses SQL injection and XSS techniques.
`
    const result = parseSkill("/skills/web/SKILL.md", content)
    expect(result).not.toBeNull()
    expect(result!.name).toBe("web-exploit")
    expect(result!.description).toBe("Web exploitation specialist")
    expect(result!.frontmatter.metadata?.category).toBe("exploit")
    expect(result!.content).toContain("SQL injection")
  })
})
