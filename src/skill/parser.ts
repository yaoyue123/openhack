import matter from "gray-matter"

export interface SkillFrontmatter {
  name: string
  description?: string
  license?: string
  compatibility?: string
  "allowed-tools"?: string
  metadata?: {
    "user-invocable"?: string
    "argument-hint"?: string
    category?: string
    "mcp-servers"?: MCPServerDecl[]
  }
}

export interface MCPServerDecl {
  name: string
  command: string[]
  optional?: boolean
  container?: string
}

export interface ParsedSkill {
  name: string
  description?: string
  location: string
  frontmatter: SkillFrontmatter
  content: string
  files: string[]
  fileNames: string[]
}

export function parseSkill(filePath: string, content: string): ParsedSkill | null {
  const parsed = matter(content)
  const data = parsed.data
  if (!data.name || typeof data.name !== "string") return null
  return {
    name: data.name,
    description: data.description,
    location: filePath,
    frontmatter: data as SkillFrontmatter,
    content: parsed.content,
    files: [],
    fileNames: [],
  }
}
