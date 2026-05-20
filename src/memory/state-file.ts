import * as fs from "node:fs/promises"
import * as path from "node:path"

const STATE_FILE = "state.md"

function stateTemplate(objective: string): string {
  return `# Current State

## Objective
${objective}

## Phase
recon

## What I Know

## What I've Tried

## Next Step

## Blockers
`
}

export async function initState(sessionDir: string, objective: string): Promise<void> {
  try {
    await fs.mkdir(sessionDir, { recursive: true })
    await fs.writeFile(path.join(sessionDir, STATE_FILE), stateTemplate(objective), "utf-8")
  } catch {
    // swallow file errors
  }
}

export async function readState(sessionDir: string): Promise<string> {
  try {
    return await fs.readFile(path.join(sessionDir, STATE_FILE), "utf-8")
  } catch {
    return stateTemplate("")
  }
}

export async function writeState(sessionDir: string, content: string): Promise<void> {
  try {
    await fs.mkdir(sessionDir, { recursive: true })
    await fs.writeFile(path.join(sessionDir, STATE_FILE), content, "utf-8")
  } catch {
    // swallow file errors
  }
}

export function parsePhase(content: string): string | null {
  const match = /^##\s*Phase\s*\n\s*(\w+)/mi.exec(content)
  return match ? match[1] : null
}
