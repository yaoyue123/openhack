import React, { useState, useRef, useCallback, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { inputStyle, colors, decor, getAgentColor } from "../theme.js";

interface InputProps {
  readonly prompt: string;
  readonly onSubmit: (value: string) => void;
  readonly disabled?: boolean;
  readonly onCancel?: () => void;
  readonly onExit?: () => void;
  readonly onToggleTools?: () => void;
  readonly onCommandPalette?: () => void;
  readonly slashCommands?: readonly string[];
}

const MAX_HISTORY = 100;

interface HistorySearchState {
  active: boolean;
  query: string;
  results: string[];
  selectedIndex: number;
}

function Input({
  prompt,
  onSubmit,
  disabled = false,
  onCancel,
  onExit,
  onToggleTools,
  onCommandPalette,
  slashCommands,
}: InputProps): React.JSX.Element {
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const [historySearch, setHistorySearch] = useState<HistorySearchState>({
    active: false,
    query: "",
    results: [],
    selectedIndex: 0,
  });

  // Keep cursorPos clamped when value changes externally (e.g. history navigation)
  useEffect(() => {
    setCursorPos((prev) => Math.min(prev, value.length));
  }, [value]);

  // Delete word before cursor
  const deleteWordBefore = useCallback(() => {
    setValue((prev) => {
      const before = prev.slice(0, cursorPos);
      const after = prev.slice(cursorPos);
      const trimmed = before.replace(/\S+\s*$/, "");
      setCursorPos(trimmed.length);
      return trimmed + after;
    });
  }, [cursorPos]);

  // Filter slash commands for autocomplete
  const matchingCommands = React.useMemo(() => {
    if (!slashCommands || !value.startsWith("/")) return [];
    const typed = value.slice(1).toLowerCase();
    // Only show autocomplete if no spaces yet (still typing the command name)
    if (typed.includes(" ")) return [];
    return slashCommands.filter((cmd) => cmd.toLowerCase().startsWith(typed)).slice(0, 8);
  }, [value, slashCommands]);

  // Filter history for search
  const updateHistorySearch = useCallback(
    (query: string, allHistory: string[]) => {
      if (!query.trim()) {
        return { results: [], selectedIndex: 0 };
      }
      const results = allHistory
        .slice()
        .reverse()
        .filter((entry) => entry.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 10);
      return { results, selectedIndex: 0 };
    },
    [],
  );

  useInput(
    (input, key) => {
      // ── History Search Mode ──────────────────────────────────
      if (historySearch.active) {
        if (key.escape) {
          setHistorySearch({ active: false, query: "", results: [], selectedIndex: 0 });
          return;
        }
        if (key.return) {
          const selected =
            historySearch.results.length > 0
              ? historySearch.results[historySearch.selectedIndex]
              : null;
          if (selected) {
            setValue(selected);
            setCursorPos(selected.length);
          }
          setHistorySearch({ active: false, query: "", results: [], selectedIndex: 0 });
          return;
        }
        if (key.upArrow) {
          setHistorySearch((prev) => ({
            ...prev,
            selectedIndex: Math.max(0, prev.selectedIndex - 1),
          }));
          return;
        }
        if (key.downArrow) {
          setHistorySearch((prev) => ({
            ...prev,
            selectedIndex: Math.min(prev.results.length - 1, prev.selectedIndex + 1),
          }));
          return;
        }
        if (key.backspace || key.delete) {
          const newQuery = historySearch.query.slice(0, -1);
          const { results, selectedIndex } = updateHistorySearch(newQuery, historyRef.current);
          setHistorySearch({ active: true, query: newQuery, results, selectedIndex });
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          const newQuery = historySearch.query + input;
          const { results, selectedIndex } = updateHistorySearch(newQuery, historyRef.current);
          setHistorySearch({ active: true, query: newQuery, results, selectedIndex });
          return;
        }
        return; // consume all other keys in search mode
      }

      // ── Normal Mode ──────────────────────────────────────────

      // Return / Enter
      if (key.return) {
        if (key.shift) {
          setValue((prev) => {
            const before = prev.slice(0, cursorPos);
            const after = prev.slice(cursorPos);
            const newVal = before + "\n" + after;
            setCursorPos(cursorPos + 1);
            return newVal;
          });
          return;
        }

        // If slash autocomplete is showing, auto-complete the top match
        if (matchingCommands.length > 0) {
          const match = matchingCommands[0];
          const newVal = "/" + match + " ";
          setValue(newVal);
          setCursorPos(newVal.length);
          return;
        }

        // Submit
        const trimmed = value.trim();
        if (trimmed.length === 0) return;

        if (trimmed.endsWith("\\")) {
          setValue((prev) => {
            const before = prev.slice(0, cursorPos - 1);
            const after = prev.slice(cursorPos);
            const newVal = before + "\n" + after;
            setCursorPos(cursorPos);
            return newVal;
          });
          return;
        }

        onSubmit(trimmed);
        historyRef.current.push(trimmed);
        if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
        historyIndexRef.current = -1;
        setValue("");
        setCursorPos(0);
        return;
      }

      // Escape
      if (key.escape) {
        if (value.length > 0) {
          setValue("");
          setCursorPos(0);
          return;
        }
        if (onCancel) {
          onCancel();
        }
        return;
      }

      // Ctrl+D — exit REPL
      if (key.ctrl && input === "d") {
        if (onExit) onExit();
        return;
      }

      // Ctrl+K — open command palette
      if (key.ctrl && input === "k") {
        if (onCommandPalette) onCommandPalette();
        return;
      }

      // Ctrl+O — toggle all tool expansions
      if (key.ctrl && input === "o") {
        if (onToggleTools) onToggleTools();
        return;
      }

      // Ctrl+L — clear input line
      if (key.ctrl && input === "l") {
        setValue("");
        setCursorPos(0);
        return;
      }

      // Ctrl+R — history search
      if (key.ctrl && input === "r") {
        if (historyRef.current.length > 0) {
          const { results, selectedIndex } = updateHistorySearch("", historyRef.current);
          setHistorySearch({ active: true, query: "", results, selectedIndex });
        }
        return;
      }

      // Ctrl+W — delete word before cursor
      if (key.ctrl && input === "w") {
        deleteWordBefore();
        return;
      }

      // Ctrl+U — clear line (delete everything before cursor)
      if (key.ctrl && input === "u") {
        setValue((prev) => {
          const after = prev.slice(cursorPos);
          setCursorPos(0);
          return after;
        });
        return;
      }

      // Backspace — delete character before cursor
      if (key.backspace) {
        if (cursorPos <= 0) return;
        setValue((prev) => {
          const before = prev.slice(0, cursorPos - 1);
          const after = prev.slice(cursorPos);
          setCursorPos(cursorPos - 1);
          return before + after;
        });
        return;
      }

      // Delete — delete character at cursor
      if (key.delete) {
        if (cursorPos >= value.length) return;
        setValue((prev) => {
          const before = prev.slice(0, cursorPos);
          const after = prev.slice(cursorPos + 1);
          return before + after;
        });
        return;
      }

      // Home — jump to start of line
      if (key.home) {
        setCursorPos(0);
        return;
      }

      // End — jump to end of line
      if (key.end) {
        setCursorPos(value.length);
        return;
      }

      // Left arrow — move cursor left
      if (key.leftArrow) {
        setCursorPos((prev) => Math.max(0, prev - 1));
        return;
      }

      // Right arrow — move cursor right
      if (key.rightArrow) {
        setCursorPos((prev) => Math.min(value.length, prev + 1));
        return;
      }

      // Up arrow — history navigation
      if (key.upArrow) {
        const hist = historyRef.current;
        if (hist.length === 0) return;
        const newIdx =
          historyIndexRef.current === -1
            ? hist.length - 1
            : Math.max(0, historyIndexRef.current - 1);
        historyIndexRef.current = newIdx;
        const entry = hist[newIdx];
        setValue(entry);
        setCursorPos(entry.length);
        return;
      }

      // Down arrow — history navigation
      if (key.downArrow) {
        if (historyIndexRef.current === -1) return;
        const newIdx = historyIndexRef.current + 1;
        if (newIdx >= historyRef.current.length) {
          historyIndexRef.current = -1;
          setValue("");
          setCursorPos(0);
        } else {
          historyIndexRef.current = newIdx;
          const entry = historyRef.current[newIdx];
          setValue(entry);
          setCursorPos(entry.length);
        }
        return;
      }

      // Regular character — insert at cursor position
      if (input && !key.ctrl && !key.meta) {
        setValue((prev) => {
          const before = prev.slice(0, cursorPos);
          const after = prev.slice(cursorPos);
          setCursorPos(cursorPos + input.length);
          return before + input + after;
        });
      }
    },
    { isActive: !disabled },
  );

  const lines = value.split("\n");
  const displayLines = lines.length > 3 ? ["...", ...lines.slice(-2)] : lines;
  const agentColor = getAgentColor(prompt);

  // Calculate cursor line/column within the multi-line value
  const cursorLine = value.slice(0, cursorPos).split("\n").length - 1;
  const cursorCol = cursorPos - value.split("\n").slice(0, cursorLine).join("\n").length - (cursorLine > 0 ? 1 : 0);

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* History search overlay */}
      {historySearch.active && (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          <Text dimColor>
            {`(reverse-i-search)\`${historySearch.query}': `}
          </Text>
          {historySearch.results.map((entry, i) => (
            <Text
              key={i}
              color={i === historySearch.selectedIndex ? colors.primary : colors.textMuted}
            >
              {i === historySearch.selectedIndex ? "\u203A " : "  "}
              {entry}
            </Text>
          ))}
          {historySearch.results.length === 0 && (
            <Text dimColor>{"  (no matching history)"}</Text>
          )}
        </Box>
      )}

      {/* Slash autocomplete overlay */}
      {!historySearch.active && matchingCommands.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          {matchingCommands.map((cmd, i) => (
            <Box key={cmd}>
              <Text color={i === 0 ? colors.primary : colors.textMuted}>
                {i === 0 ? "\u203A" : " "}
              </Text>
              <Text color={i === 0 ? colors.primary : colors.textMuted}>
                {` /${cmd}`}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Previous lines (multi-line display) */}
      {!historySearch.active &&
        displayLines.length > 1 &&
        displayLines.slice(0, -1).map((line, i) => (
          <Box key={i}>
            <Text color={agentColor}>{`${decor.leftBorder} `}</Text>
            <Text dimColor>{line}</Text>
          </Box>
        ))}

      {/* Current input line */}
      <Box>
        <Text color={agentColor}>{`${decor.leftBorder} `}</Text>
        {disabled ? (
          <Text dimColor>{"..."}</Text>
        ) : (
          <Box>
            {/* Text before cursor */}
            <Text>{value.slice(0, cursorPos)}</Text>
            {/* Cursor character */}
            <Text color={agentColor}>{inputStyle.cursor}</Text>
            {/* Text after cursor */}
            <Text>{value.slice(cursorPos)}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export { Input };
export type { InputProps };
