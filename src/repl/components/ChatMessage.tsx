import React from "react";
import { Box, Text } from "ink";
import { FlagHighlight } from "./FlagHighlight.js";

interface Message {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
}

interface ChatMessageProps {
  readonly message: Message;
}

const ROLE_PREFIX: Record<Message["role"], { label: string; color: string }> = {
  user: { label: "you", color: "cyan" },
  assistant: { label: "agent", color: "green" },
  system: { label: "system", color: "gray" },
};

function ChatMessage({ message }: ChatMessageProps): React.JSX.Element {
  const { role, content } = message;
  const { label, color } = ROLE_PREFIX[role];
  const isSystem = role === "system";

  const lines = content.split("\n");

  return (
    <Box flexDirection="column" marginY={0}>
      {lines.map((line, i) => (
        <Box key={i}>
          <Text color={color} bold={!isSystem}>
            {i === 0 ? `${label}> ` : "   "}
          </Text>
          {isSystem ? (
            <Text dimColor>{line}</Text>
          ) : (
            <FlagHighlight content={line} />
          )}
        </Box>
      ))}
    </Box>
  );
}

export { ChatMessage };
export type { Message, ChatMessageProps };
