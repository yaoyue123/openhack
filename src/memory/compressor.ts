import type { ModelMessage } from "ai"
import type { CompressionResult } from "./types.js"

const FLAG_PATTERN = /(flag|HTB|CTF|picoCTF)\{[^}]+\}/gi

function extractToolCalls(msg: ModelMessage): string[] {
  const parts: string[] = []

  // ModelMessage can be various shapes from the ai SDK.
  // Tool calls appear in assistant messages under `toolInvocations` or `tool_calls`.
  const rec = msg as Record<string, unknown>

  // ai SDK v4+ style: toolInvocations array
  const invocations = rec["toolInvocations"]
  if (Array.isArray(invocations)) {
    for (const inv of invocations) {
      const invRec = inv as Record<string, unknown>
      const name = String(invRec["toolName"] ?? invRec["name"] ?? "unknown")
      const args = invRec["args"] ?? invRec["arguments"] ?? invRec["input"] ?? {}
      const argStr = typeof args === "string" ? args : JSON.stringify(args)
      const truncated = argStr.length > 100 ? argStr.slice(0, 100) + "…" : argStr
      parts.push(`${name}(${truncated})`)
    }
  }

  // OpenAI-style: tool_calls on assistant message
  const toolCalls = rec["tool_calls"]
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      const tcRec = tc as Record<string, unknown>
      const fn = (tcRec["function"] ?? {}) as Record<string, unknown>
      const name = String(fn["name"] ?? "unknown")
      const argStr = String(fn["arguments"] ?? "")
      const truncated = argStr.length > 100 ? argStr.slice(0, 100) + "…" : argStr
      parts.push(`${name}(${truncated})`)
    }
  }

  return parts
}

function extractText(msg: ModelMessage): string {
  const rec = msg as Record<string, unknown>
  if (typeof rec["content"] === "string") {
    return rec["content"]
  }
  if (Array.isArray(rec["content"])) {
    return (rec["content"] as Array<Record<string, unknown>>)
      .filter((p) => p["type"] === "text")
      .map((p) => String(p["text"] ?? ""))
      .join("\n")
  }
  return ""
}

export async function compress(
  messages: ModelMessage[],
  preserveRecent: number,
  _sessionDir: string,
): Promise<CompressionResult> {
  if (messages.length <= preserveRecent) {
    return { summary: "", messages, tokensSaved: 0 }
  }

  const older = messages.slice(0, messages.length - preserveRecent)
  const recent = messages.slice(messages.length - preserveRecent)

  let totalOldChars = 0
  const actions: string[] = []
  const flags: string[] = []

  for (const msg of older) {
    const text = extractText(msg)
    totalOldChars += text.length

  const toolParts = extractToolCalls(msg)
    for (const tc of toolParts) {
      actions.push(`- Step: ${tc} → [output truncated]`)
    }


    const flagMatches = text.match(FLAG_PATTERN)
    if (flagMatches) {
      flags.push(...flagMatches)
    }

    const rec = msg as Record<string, unknown>
    if (rec["role"] === "assistant" && text.length > 0) {
      const snippet = text.length > 200 ? text.slice(0, 200) + "…" : text
      if (toolParts.length === 0) {
        actions.push(`- Assistant: ${snippet}`)
      }
    }
  }

  const summaryLines: string[] = [
    "## Context Summary (Compressed)",
    "### Actions Taken",
  ]

  if (actions.length > 0) {
    summaryLines.push(...actions)
  } else {
    summaryLines.push("- No tool calls extracted")
  }

  summaryLines.push("### Key Findings")

  if (flags.length > 0) {
    const unique = [...new Set(flags)]
    summaryLines.push(...unique.map((f) => `- ${f}`))
  } else {
    summaryLines.push("None extracted")
  }

  const summary = summaryLines.join("\n")
  const tokensSaved = Math.ceil((totalOldChars - summary.length) / 4)

  const summaryMessage: ModelMessage = {
    role: "system",
    content: summary,
  } as ModelMessage

  return {
    summary,
    messages: [summaryMessage, ...recent],
    tokensSaved: Math.max(tokensSaved, 0),
  }
}
