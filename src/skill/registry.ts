import type { ParsedSkill } from "./parser.js"
import { discoverSkills } from "./loader.js"

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
}
