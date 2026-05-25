import type { ParsedSkill } from "./parser.js"
import { discoverSkills } from "./loader.js"

const DEFAULT_MAX_BYTES = 30000

export class SkillRegistry {
  private skills: Map<string, ParsedSkill> = new Map()

  static async create(projectDir: string): Promise<SkillRegistry> {
    const reg = new SkillRegistry()
    const skills = await discoverSkills(projectDir)
    for (const skill of skills) reg.skills.set(skill.name, skill)
    return reg
  }

  get(name: string): ParsedSkill | undefined {
    return this.skills.get(name)
  }

  list(): ParsedSkill[] {
    return [...this.skills.values()]
  }

  /**
   * List all companion files for a skill with their sizes.
   * Useful for debugging skill injection coverage.
   */
  listCompanions(name: string): { name: string; sizeBytes: number }[] {
    const skill = this.skills.get(name)
    if (!skill) return []
    return skill.fileNames.map((n, i) => ({
      name: n,
      sizeBytes: Buffer.byteLength(skill.files[i]),
    }))
  }

  toPrompt(name: string): string | undefined {
    const skill = this.skills.get(name)
    if (!skill) return undefined
    return `## Skill: ${skill.name}\n\n${skill.content}`
  }

  /**
   * Build a compact index listing all available companion files
   * with a brief description (first 150 chars of each file).
   * Used for Tier 1 of the two-tier knowledge system.
   */
  buildIndex(name: string): string | undefined {
    const skill = this.skills.get(name)
    if (!skill) return undefined

    const lines: string[] = [`### Knowledge Index: ${skill.name}`]
    lines.push("The following reference sections are available. Use `skill-query` to load specific sections on demand.")
    lines.push("")

    for (let i = 0; i < skill.fileNames.length; i++) {
      const fname = skill.fileNames[i]
      const content = skill.files[i]
      const sizeKB = (Buffer.byteLength(content) / 1024).toFixed(1)
      // Extract first meaningful line as description
      const firstLines = content.split("\n").slice(0, 5).join(" ").replace(/#+\s*/g, "").trim()
      const preview = firstLines.length > 150 ? firstLines.slice(0, 150) + "..." : firstLines
      lines.push(`- **${fname}** (${sizeKB}KB): ${preview}`)
    }

    return lines.join("\n")
  }

  /**
   * Query skill companion files by keyword relevance.
   * Returns matching file contents concatenated.
   * This is Tier 2: on-demand retrieval with no budget limit.
   */
  query(name: string, topics: string[], maxBytes: number = 100000): string | undefined {
    const skill = this.skills.get(name)
    if (!skill) return undefined

    const lowerTopics = topics.map(t => t.toLowerCase())
    const matches: { name: string; content: string; score: number }[] = []

    for (let i = 0; i < skill.fileNames.length; i++) {
      const fname = skill.fileNames[i]
      const content = skill.files[i]
      const lowerContent = content.toLowerCase()
      const lowerName = fname.toLowerCase()

      // Score by counting topic keyword matches
      let score = 0
      for (const topic of lowerTopics) {
        // Check filename
        if (lowerName.includes(topic)) score += 10
        // Check content
        const regex = new RegExp(topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
        const matchesCount = (lowerContent.match(regex) ?? []).length
        score += matchesCount
      }

      if (score > 0) {
        matches.push({ name: fname, content, score })
      }
    }

    if (matches.length === 0) {
      return undefined
    }

    // Sort by relevance score descending
    matches.sort((a, b) => b.score - a.score)

    // Build output within maxBytes
    let totalBytes = 0
    const sections: string[] = []

    for (const match of matches) {
      const section = `### ${match.name}\n\n${match.content}`
      const cost = Buffer.byteLength(section)
      if (totalBytes + cost > maxBytes) {
        // Try to fit a truncated version
        const remaining = maxBytes - totalBytes
        if (remaining > 500) {
          sections.push(`### ${match.name} (truncated)\n\n${match.content.slice(0, remaining - 100)}`)
        }
        break
      }
      sections.push(section)
      totalBytes += cost
    }

    return sections.join("\n\n---\n\n")
  }

  /**
   * Returns the SKILL.md body plus as many companion files as fit within
   * maxBytes. Companion files are included in priority order:
   *
   * 1. Files listed in `priority-files` frontmatter (in specified order)
   * 2. Remaining files sorted by relevance heuristic (smaller files first,
   *    to maximize knowledge diversity within budget)
   *
   * Default budget is 30 000 bytes (~8 K tokens), up from 15 000.
   */
  toPromptWithCompanions(name: string, maxBytes: number = DEFAULT_MAX_BYTES): string | undefined {
    const skill = this.skills.get(name)
    if (!skill) return undefined

    const header = `## Skill: ${skill.name}\n\n`
    let budget = maxBytes - Buffer.byteLength(header) - Buffer.byteLength(skill.content)

    let prompt = header + skill.content

    if (skill.files.length === 0 || budget <= 0) return prompt

    // Build index of companion files
    const companionMap = new Map<string, { name: string; content: string }>()
    for (let i = 0; i < skill.fileNames.length; i++) {
      companionMap.set(skill.fileNames[i], { name: skill.fileNames[i], content: skill.files[i] })
    }

    // Determine priority order from frontmatter
    const rawPriority = (skill.frontmatter as unknown as Record<string, unknown>)?.["priority-files"]
    const priorityFiles: string[] = Array.isArray(rawPriority) ? rawPriority.filter((f): f is string => typeof f === "string") : []

    // Build ordered list: priority files first, then remaining by size (smallest first)
    const ordered: { name: string; content: string }[] = []
    const included = new Set<string>()

    // Phase 1: Add priority files in order
    for (const pf of priorityFiles) {
      const companion = companionMap.get(pf)
      if (companion) {
        ordered.push(companion)
        included.add(pf)
      }
    }

    // Phase 2: Add remaining files sorted by size (smallest first = maximize count)
    const remaining = [...companionMap.entries()]
      .filter(([name]) => !included.has(name))
      .map(([name, data]) => ({ ...data, size: Buffer.byteLength(data.content) }))
      .sort((a, b) => a.size - b.size)

    for (const r of remaining) {
      ordered.push({ name: r.name, content: r.content })
    }

    // Fill budget
    for (const companion of ordered) {
      const separator = "\n\n---\n\n"
      const section = `### ${companion.name}\n\n${companion.content}`
      const cost = Buffer.byteLength(separator) + Buffer.byteLength(section)

      if (cost > budget) continue
      prompt += separator + section
      budget -= cost
    }

    return prompt
  }
}
