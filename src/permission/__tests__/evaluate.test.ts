import { describe, it, expect } from "vitest"
import type { PermissionRule } from "../../config/schema.js"
import { evaluate } from "../evaluate.js"

const rules: PermissionRule[] = [
  { tool: "read", pattern: "*", action: "allow" },
  { tool: "bash", pattern: "file *", action: "allow" },
  { tool: "bash", pattern: "nmap *", action: "ask" },
  { tool: "bash", pattern: "rm -rf /", action: "deny" },
]

describe("evaluate", () => {
  it("allows read for any target", () => {
    expect(evaluate("read", "anything.txt", rules)).toBe("allow")
  })

  it("allows bash file command", () => {
    expect(evaluate("bash", "file mystery.bin", rules)).toBe("allow")
  })

  it("asks for nmap", () => {
    expect(evaluate("bash", "nmap -sV target.local", rules)).toBe("ask")
  })

  it("denies rm -rf /", () => {
    expect(evaluate("bash", "rm -rf /", rules)).toBe("deny")
  })

  it("defaults to ask for unknown", () => {
    expect(evaluate("unknown-tool", "something", rules)).toBe("ask")
  })
})
