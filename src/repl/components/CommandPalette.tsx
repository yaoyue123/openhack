import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { colors, decor } from "../theme.js";

interface CommandInfo {
  readonly name: string;
  readonly description: string;
  readonly usage?: string;
}

interface CommandPaletteProps {
  readonly commands: readonly CommandInfo[];
  readonly onExecute: (name: string, args: string) => void;
  readonly onDismiss: () => void;
}

function CommandPalette({
  commands,
  onExecute,
  onDismiss,
}: CommandPaletteProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 12);
    const lower = query.toLowerCase();
    return commands
      .filter(
        (c) =>
          c.name.toLowerCase().includes(lower) ||
          c.description.toLowerCase().includes(lower),
      )
      .slice(0, 12);
  }, [query, commands]);

  // Reset selection when filter changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useInput(
    (input, key) => {
      if (key.escape) {
        onDismiss();
        return;
      }

      if (key.return) {
        if (filtered.length > 0) {
          const selected = filtered[Math.min(selectedIndex, filtered.length - 1)];
          onExecute(selected.name, query.slice(selected.name.length + 1).trimStart());
        }
        return;
      }

      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(filtered.length - 1, prev + 1));
        return;
      }

      if (key.backspace || key.delete) {
        setQuery((prev) => prev.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setQuery((prev) => prev + input);
      }
    },
    { isActive: true },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.border}
      padding={1}
      marginBottom={1}
    >
      {/* Header */}
      <Box>
        <Text bold color={colors.secondary}>
          {"Command Palette"}
        </Text>
      </Box>

      {/* Search input */}
      <Box>
        <Text color={colors.primary}>{">"}</Text>
        <Text>{` ${query}`}</Text>
        <Text color={colors.primary}>{"\u258E"}</Text>
      </Box>

      {/* Separator */}
      <Text color={colors.border}>
        {"\u2500".repeat(30)}
      </Text>

      {/* Results */}
      {filtered.length === 0 ? (
        <Text dimColor>{"  No matching commands"}</Text>
      ) : (
        filtered.map((cmd, i) => {
          const isSelected = i === selectedIndex;
          const usage = cmd.usage ? ` ${cmd.usage}` : "";
          return (
            <Box key={cmd.name}>
              <Text color={isSelected ? colors.primary : colors.textMuted}>
                {isSelected ? "\u203A" : " "}
              </Text>
              <Text color={isSelected ? colors.text : colors.textMuted}>
                {` /${cmd.name}${usage}`}
              </Text>
              {isSelected && (
                <Text color={colors.textMuted}>
                  {` ${decor.separator} ${cmd.description}`}
                </Text>
              )}
            </Box>
          );
        })
      )}
    </Box>
  );
}

export { CommandPalette };
export type { CommandPaletteProps, CommandInfo };
