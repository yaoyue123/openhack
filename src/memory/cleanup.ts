import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

const SESSION_DIR = path.join(os.homedir(), ".openhack", "sessions")

/**
 * Delete session directories older than maxAgeDays.
 * Returns the number of deleted sessions.
 */
export async function cleanupOldSessions(maxAgeDays: number = 30): Promise<number> {
  const now = Date.now()
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  let deletedCount = 0

  let entries: string[]
  try {
    entries = await fs.readdir(SESSION_DIR)
  } catch {
    // No sessions directory exists
    return 0
  }

  for (const entry of entries) {
    const sessionPath = path.join(SESSION_DIR, entry)
    try {
      const stat = await fs.stat(sessionPath)
      if (!stat.isDirectory()) continue
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.rm(sessionPath, { recursive: true, force: true })
        deletedCount++
      }
    } catch {
      // Skip entries we can't stat or remove
      continue
    }
  }

  return deletedCount
}
