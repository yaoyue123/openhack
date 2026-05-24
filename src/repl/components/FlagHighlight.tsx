import React from "react";
import { Text } from "ink";
import { flagStyle } from "../theme.js";

const FLAG_PATTERN = /((?:flag|HTB|CTF|picoCTF)\{[^}]+\})/g;

interface FlagHighlightProps {
  readonly content: string;
}

function FlagHighlight({ content }: FlagHighlightProps): React.JSX.Element {
  const parts = content.split(FLAG_PATTERN);

  return (
    <>
      {parts.map((part, i) => {
        if (FLAG_PATTERN.test(part)) {
          FLAG_PATTERN.lastIndex = 0;
          return (
            <Text key={i} bold color={flagStyle.color}>
              {`${flagStyle.prefix} ${part}`}
            </Text>
          );
        }
        FLAG_PATTERN.lastIndex = 0;
        return <Text key={i}>{part}</Text>;
      })}
    </>
  );
}

export { FlagHighlight };
