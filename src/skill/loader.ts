import * as fs from "node:fs/promises"
import * as path from "node:path"
import { glob } from "glob"
import { parseSkill, type ParsedSkill } from "./parser.js"

export const SKILL_DIRS = [
  "skills",
  path.join(process.env.HOME ?? "~", ".openhack", "skills"),
  ".openhack/skills",
]

export async function discoverSkills(projectDir: string): Promise<ParsedSkill[]> {
  const skills: ParsedSkill[] = []
  const seen = new Set<string>()

  for (const dir of SKILL_DIRS) {
    const absDir = path.isAbsolute(dir) ? dir : path.join(projectDir, dir)
    const pattern = path.join(absDir, "**/SKILL.md")
    const matches = await glob(pattern, { absolute: true }).catch(() => [] as string[])

    for (const skillFile of matches) {
      const content = await fs.readFile(skillFile, "utf-8")
      const skill = parseSkill(skillFile, content)
      if (!skill) continue

      const skillDir = path.dirname(skillFile)
      const companions = await glob("*.md", { cwd: skillDir, absolute: true }).catch(() => [] as string[])
      const companionContents = await Promise.all(
        companions
          .filter((f) => f !== skillFile)
          .map(async (f) => ({ path: f, content: await fs.readFile(f, "utf-8") })),
      )
      skill.files = companionContents.map((c) => c.content)
      if (companionContents.length > 0) {
        skill.content += "\n\n" + companionContents.map((c) => c.content).join("\n\n---\n\n")
      }

      if (!seen.has(skill.name)) {
        skills.push(skill)
        seen.add(skill.name)
      }
    }
  }

  return skills
}
