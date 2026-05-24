/**
 * OpenCode-inspired theme for the REPL UI.
 *
 * Warm gray hierarchy, left-border-only cards, minimal visual noise.
 * Every REPL component imports from here — no hardcoded colors elsewhere.
 */

// ── Color Palette (opencode warm-gray) ──────────────────────────────────────

export const colors = {
  /** Primary text — near-white */
  text: "#eeeeee",
  /** Muted/secondary text — mid gray */
  textMuted: "#808080",
  /** Root background — near-black */
  background: "#0a0a0a",
  /** Panel background — dark card bg (messages, tool blocks) */
  backgroundPanel: "#141414",
  /** Element background — input area, hover states */
  backgroundElement: "#1e1e1e",
  /** Standard borders */
  border: "#484848",
  /** Active borders */
  borderActive: "#606060",
  /** Warm orange — primary accent (agent badges, highlights) */
  primary: "#fab283",
  /** Blue — agent color, secondary accent */
  secondary: "#5c9cf5",
  /** Purple — headings, keywords */
  accent: "#9d7cd8",
  /** Red — errors */
  error: "#e06c75",
  /** Orange — warnings, pause state */
  warning: "#f5a742",
  /** Green — success, flags */
  success: "#7fd88f",
  /** Dim white — subtle text */
  dim: "#484848",
} as const;

// ── Agent Colors ────────────────────────────────────────────────────────────

export const agentColors: Record<string, string> = {
  triage: colors.secondary,
  crypto: colors.accent,
  pwn: colors.error,
  web: colors.primary,
  reverse: colors.warning,
  forensics: colors.success,
  misc: colors.textMuted,
} as const;

/** Get agent color with fallback to primary */
export function getAgentColor(agent: string): string {
  return agentColors[agent] ?? colors.secondary;
}

// ── Role Styles ──────────────────────────────────────────────────────────────

export const roleStyles = {
  user: {
    label: "you",
    color: colors.text,
    borderColor: colors.secondary,
  },
  assistant: {
    label: "agent",
    color: colors.text,
    borderColor: getAgentColor("triage"),
  },
  system: {
    label: "sys",
    color: colors.textMuted,
    borderColor: colors.border,
  },
} as const;

// ── Tool Call Status Styles ──────────────────────────────────────────────────

export const toolIcons: Record<string, { icon: string; pending: string }> = {
  bash: { icon: "$", pending: "Running command..." },
  python: { icon: "$", pending: "Running Python..." },
  read: { icon: "→", pending: "Reading file..." },
  write: { icon: "←", pending: "Writing file..." },
  edit: { icon: "←", pending: "Editing file..." },
  glob: { icon: "✱", pending: "Finding files..." },
  grep: { icon: "✱", pending: "Searching content..." },
  webfetch: { icon: "%", pending: "Fetching..." },
  flag: { icon: "⚑", pending: "Submitting flag..." },
  default: { icon: "⚙", pending: "Working..." },
};

export const toolStatusStyles = {
  pending: {
    color: colors.textMuted,
  },
  success: {
    color: colors.success,
  },
  error: {
    color: colors.error,
  },
} as const;

// ── Agent Status Styles ──────────────────────────────────────────────────────

export const agentStatusStyles: Record<string, { color: string; label: string }> = {
  thinking: { color: colors.primary, label: "thinking" },
  reading: { color: colors.secondary, label: "reading" },
  executing: { color: colors.primary, label: "executing" },
  writing: { color: colors.accent, label: "writing" },
  analyzing: { color: colors.secondary, label: "analyzing" },
} as const;

// ── Spinner ──────────────────────────────────────────────────────────────────

export const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
export const spinnerInterval = 80;

// ── Status Bar ───────────────────────────────────────────────────────────────

export const statusBarStyle = {
  dimColor: colors.textMuted,
  textColor: colors.text,
  accentColor: colors.secondary,
} as const;

// ── Pause State ──────────────────────────────────────────────────────────────

export const pauseStyle = {
  borderColor: colors.warning,
  textColor: colors.warning,
  dimColor: colors.textMuted,
  promptColor: colors.text,
} as const;

// ── Welcome ──────────────────────────────────────────────────────────────────

export const welcomeStyle = {
  logoColor: colors.secondary,
  versionColor: colors.textMuted,
  taglineColor: colors.textMuted,
} as const;

// ── Input ────────────────────────────────────────────────────────────────────

export const inputStyle = {
  borderColor: colors.borderActive,
  promptColor: colors.textMuted,
  cursor: "▎",
} as const;

// ── Flag Highlight ───────────────────────────────────────────────────────────

export const flagStyle = {
  color: colors.success,
  prefix: "⚑",
} as const;

// ── Decorative Characters ────────────────────────────────────────────────────

export const decor = {
  /** Left border character (opencode style) */
  leftBorder: "┃",
  /** Thin separator */
  separator: "·",
  bullet: "•",
  arrow: "→",
  diamond: "◈",
  agent: "▣",
} as const;
