import * as fs from "node:fs/promises"
import * as path from "node:path"

const VALID_NAMES = new Set(["findings", "failed-paths", "attack-log", "experience"])

export class MemoryStore {
  private readonly memoryDir: string

  constructor(sessionDir: string) {
    this.memoryDir = path.join(sessionDir, "memory")
  }

  async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true })
    } catch {
      // directory creation failures are non-fatal
    }
  }

  async readFile(name: string): Promise<string> {
    if (!VALID_NAMES.has(name)) {
      return "(empty)"
    }
    try {
      return await fs.readFile(path.join(this.memoryDir, `${name}.md`), "utf-8")
    } catch {
      return "(empty)"
    }
  }

  async writeFile(name: string, content: string): Promise<void> {
    if (!VALID_NAMES.has(name)) {
      return
    }
    try {
      await this.ensureDir()
      await fs.writeFile(path.join(this.memoryDir, `${name}.md`), content, "utf-8")
    } catch {
      // swallow file errors
    }
  }

  async appendLog(entry: string): Promise<void> {
    try {
      await this.ensureDir()
      const line = `- [${new Date().toISOString()}] ${entry}\n`
      await fs.appendFile(path.join(this.memoryDir, "attack-log.md"), line, "utf-8")
    } catch {
      // swallow file errors
    }
  }
}
