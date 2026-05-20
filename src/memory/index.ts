import type { ModelMessage } from "ai"
import type { MemoryConfig, CompressionResult } from "./types.js"
import { DEFAULT_MEMORY_CONFIG } from "./types.js"
import * as stateFile from "./state-file.js"
import { MemoryStore } from "./memory-store.js"
import { compress } from "./compressor.js"

export class MemoryManager {
  readonly store: MemoryStore
  private readonly config: MemoryConfig
  private readonly sessionDir: string

  constructor(sessionDir: string, config?: Partial<MemoryConfig>) {
    this.sessionDir = sessionDir
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config }
    this.store = new MemoryStore(sessionDir)
  }

  async ensureDir(): Promise<void> {
    await this.store.ensureDir()
  }

  async initState(objective: string): Promise<void> {
    await stateFile.initState(this.sessionDir, objective)
  }

  async readState(): Promise<string> {
    return stateFile.readState(this.sessionDir)
  }

  async writeState(content: string): Promise<void> {
    await stateFile.writeState(this.sessionDir, content)
  }

  async readFile(name: string): Promise<string> {
    return this.store.readFile(name)
  }

  async writeFile(name: string, content: string): Promise<void> {
    await this.store.writeFile(name, content)
  }

  async appendLog(entry: string): Promise<void> {
    if (this.config.autoLog) {
      await this.store.appendLog(entry)
    }
  }

  async compress(
    messages: ModelMessage[],
    preserveRecent: number,
  ): Promise<CompressionResult> {
    return compress(messages, preserveRecent, this.sessionDir)
  }
}
