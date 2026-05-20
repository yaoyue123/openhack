import type { ModelMessage } from "ai"

export interface MemoryConfig {
  enabled: boolean
  autoLog: boolean
}

export interface CompressionResult {
  summary: string
  messages: ModelMessage[]
  tokensSaved: number
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = { enabled: true, autoLog: true }
