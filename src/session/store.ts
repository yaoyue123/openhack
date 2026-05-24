import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import type { HackEvent } from "./events.js"

export interface Session {
  id: string
  createdAt: string
  challenge: {
    name?: string
    category?: string
    description?: string
    files: string[]
    target?: string
  }
  timeline: HackEvent[]
  flags: string[]
  state: "idle" | "running" | "paused" | "completed" | "error"
  agentHistory: string[]
  messages?: unknown[]
}

const SESSION_DIR = path.join(os.homedir(), ".openhack", "sessions")

export const SessionStore = {
  async create(challenge?: Partial<Session["challenge"]>): Promise<Session> {
    await fs.mkdir(SESSION_DIR, { recursive: true })
    const session: Session = {
      id: `ses_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      challenge: { files: [], ...challenge },
      timeline: [],
      flags: [],
      state: "idle",
      agentHistory: [],
    }
    await fs.writeFile(
      path.join(SESSION_DIR, `${session.id}.json`),
      JSON.stringify(session, null, 2),
    )
    return session
  },

  async load(id: string): Promise<Session | null> {
    try {
      const raw = await fs.readFile(path.join(SESSION_DIR, `${id}.json`), "utf-8")
      return JSON.parse(raw)
    } catch {
      return null
    }
  },

  async save(session: Session): Promise<void> {
    await fs.mkdir(SESSION_DIR, { recursive: true })
    await fs.writeFile(
      path.join(SESSION_DIR, `${session.id}.json`),
      JSON.stringify(session, null, 2),
    )
  },

  async list(): Promise<Session[]> {
    await fs.mkdir(SESSION_DIR, { recursive: true })
    const files = await fs.readdir(SESSION_DIR)
    const sessions: Session[] = []
    for (const f of files.filter((f) => f.endsWith(".json"))) {
      const s = await this.load(f.replace(".json", ""))
      if (s) sessions.push(s)
    }
    return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
}
