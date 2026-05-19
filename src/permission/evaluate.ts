import type { PermissionRule } from "../config/schema.js"
import { matchWildcard } from "./pattern.js"

export type PermissionAction = "allow" | "deny" | "ask"

export function evaluate(
  tool: string,
  target: string,
  ...rulesets: PermissionRule[][]
): PermissionAction {
  const rules = rulesets.flat()
  const match = [...rules].reverse().find(
    (rule) => matchWildcard(tool, rule.tool) && matchWildcard(target, rule.pattern),
  )
  return match?.action ?? "ask"
}
