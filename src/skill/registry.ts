import type { ParsedSkill } from "./parser.js"
import { discoverSkills } from "./loader.js"

const DEFAULT_MAX_BYTES = 15000

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

  toPrompt(name: string): string | undefined {
    const skill = this.skills.get(name)
    if (!skill) return undefined
    return `## Skill: ${skill.name}\n\n${skill.content}`
  }

  /**
   * Returns the SKILL.md body plus as many companion files as fit within
   * maxBytes.  Companions are appended in alphabetical order.
   * The default budget is 15 000 bytes (~4 K tokens).
   */
  toPromptWithCompanions(name: string, maxBytes: number = DEFAULT_MAX_BYTES): string | undefined {
    const skill = this.skills.get(name)
    if (!skill) return undefined

    const header = `## Skill: ${skill.name}\n\n`
    let budget = maxBytes - Buffer.byteLength(header) - Buffer.byteLength(skill.content)

    let prompt = header + skill.content

    if (skill.files.length === 0 || budget <= 0) return prompt

    const indexed = skill.fileNames
      .map((n, i) => ({ name: n, content: skill.files[i] }))
      .sort((a, b) => a.name.localeCompare(b.name))

    for (const companion of indexed) {
      const separator = "\n\n---\n\n"
      const section = `### ${companion.name}\n\n${companion.content}`
      const cost = Buffer.byteLength(separator) + Buffer.byteLength(section)

      if (cost > budget) break
      prompt += separator + section
      budget -= cost
    }

    return prompt
  }
}
