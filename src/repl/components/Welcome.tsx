import React from "react";
import { Box, Text } from "ink";
import { welcomeStyle, colors, decor } from "../theme.js";

interface WelcomeProps {
  readonly version: string;
  readonly configOk?: boolean;
  readonly sessionsOk?: boolean;
  readonly skillsOk?: boolean;
}

const LOGO_ASCII = [
  "    ____                    __               __  ",
  "   / __ \\____  ___  ____   / /_  ____ ______/ /__",
  "  / / / / __ \\/ _ \\/ __ \\ / __ \\/ __ `/ ___/ //_/",
  " / /_/ / /_/ /  __/ / / // / / / /_/ / /__/ ,<   ",
  " \\____/ .___/\\___/_/ /_//_/ /_/\\__,_/\\___/_/|_|  ",
  "     /_/                                          ",
];

const QUICK_TIPS = [
  { key: "Type a message", desc: "Chat with the AI agent" },
  { key: "/help", desc: "Show all commands" },
  { key: "/agent <name>", desc: "Switch agent (triage/crypto/pwn/...)" },
  { key: "/model <name>", desc: "Switch LLM model" },
  { key: "/clear", desc: "Clear the screen" },
  { key: "Esc", desc: "Cancel running agent" },
];

const TOP_SEPARATOR = "\u250C" + "\u2500".repeat(44) + "\u2510";
const BOTTOM_SEPARATOR = "\u2514" + "\u2500".repeat(44) + "\u2518";

function Welcome({ version, configOk = true, sessionsOk = true, skillsOk = true }: WelcomeProps): React.JSX.Element {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* ASCII logo */}
      <Box flexDirection="column">
        {LOGO_ASCII.map((line, i) => (
          <Text key={i} color={welcomeStyle.logoColor} bold>{line}</Text>
        ))}
      </Box>

      {/* Tagline + version */}
      <Box>
        <Text color={colors.secondary}>{"CTF AI Agent"}</Text>
        <Text color={colors.textMuted}>{` ${decor.separator} `}</Text>
        <Text color={welcomeStyle.versionColor}>{`v${version}`}</Text>
      </Box>

      {/* Separator */}
      <Text color={colors.border}>{TOP_SEPARATOR}</Text>

      {/* Status checks */}
      <Box>
        <Text color={colors.textMuted}>{`${decor.leftBorder} `}</Text>
        <Text color={configOk ? colors.success : colors.error}>{configOk ? "\u2713" : "\u2717"}</Text>
        <Text color={colors.textMuted}>{` Config `}</Text>
        <Text color={sessionsOk ? colors.success : colors.error}>{sessionsOk ? "\u2713" : "\u2717"}</Text>
        <Text color={colors.textMuted}>{` Sessions `}</Text>
        <Text color={skillsOk ? colors.success : colors.error}>{skillsOk ? "\u2713" : "\u2717"}</Text>
        <Text color={colors.textMuted}>{` Skills`}</Text>
      </Box>

      {QUICK_TIPS.map((tip, i) => (
        <Box key={i}>
          <Text color={colors.textMuted}>{`${decor.leftBorder} `}</Text>
          <Text color={colors.secondary}>{decor.bullet}</Text>
          <Text>{` `}</Text>
          <Text color={colors.primary}>{tip.key}</Text>
          <Text color={colors.textMuted}>{` ${decor.separator} ${tip.desc}`}</Text>
        </Box>
      ))}

      {/* Bottom border */}
      <Box>
        <Text color={colors.border}>{BOTTOM_SEPARATOR}</Text>
      </Box>
    </Box>
  );
}

export { Welcome };
