import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import matter from "gray-matter";
import type { AgentDef, AgentMode } from "./types.js";
import type { PermissionRule } from "../config/schema.js";

const AGENT_DIRS = [
  path.join(os.homedir(), ".openhack", "agents"),
  path.join(".openhack", "agents"),
];

interface AgentFrontmatter {
  name?: string;
  mode?: string;
  description?: string;
  skills?: string[];
  excludeTools?: string[];
  mcpServers?: string[];
  maxSteps?: number;
  permissions?: Array<{ tool: string; pattern: string; action: string }>;
}

export async function loadUserAgents(baseDir?: string): Promise<AgentDef[]> {
  const agents: AgentDef[] = [];
  const dirs = [...AGENT_DIRS];
  if (baseDir) dirs.push(path.join(baseDir, ".openhack", "agents"));

  for (const dir of dirs) {
    const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    let entries: string[];
    try {
      entries = await fs.readdir(absDir);
    } catch {
      continue;
    }

    for (const entry of entries.filter((e) => e.endsWith(".md"))) {
      try {
        const filePath = path.join(absDir, entry);
        const raw = await fs.readFile(filePath, "utf-8");
        const parsed = matter(raw);
        const fm = parsed.data as AgentFrontmatter;
        const content = parsed.content.trim();

        const agentName = fm.name ?? path.basename(entry, ".md");
        const mode = validateMode(fm.mode ?? "specialist");

        const permissions: PermissionRule[] = (fm.permissions ?? []).map((p) => ({
          tool: p.tool,
          pattern: p.pattern,
          action: validateAction(p.action),
        }));

        if (permissions.length === 0) {
          permissions.push({ tool: "*", pattern: "*", action: "allow" });
        }

        agents.push({
          name: agentName,
          mode,
          description: fm.description ?? `Custom agent from ${entry}`,
          basePrompt: content,
          permissions,
          skills: fm.skills ?? [],
          excludeTools: fm.excludeTools,
          mcpServers: fm.mcpServers,
          maxSteps: fm.maxSteps,
        });
      } catch {
        continue;
      }
    }
  }

  return agents;
}

function validateMode(m: string): AgentMode {
  if (m === "primary" || m === "specialist") return m;
  return "specialist";
}

function validateAction(a: string): "allow" | "deny" | "ask" {
  if (a === "allow" || a === "deny" || a === "ask") return a;
  return "allow";
}
