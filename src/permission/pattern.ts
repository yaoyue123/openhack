import { minimatch } from "minimatch"

export function matchWildcard(value: string, pattern: string): boolean {
  if (pattern === "*") return true
  return minimatch(value, pattern, { nocase: true })
}
