import React, { useState, useCallback, useRef } from "react";
import { render, Box, Text, useApp } from "ink";
import { ChatMessage } from "./components/ChatMessage.js";
import { Input } from "./components/Input.js";
import { ToolCallDisplay } from "./components/ToolCallDisplay.js";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ToolCall {
  tool: string;
  args: string;
}

interface REPLProps {
  onSubmit: (message: string) => Promise<void>;
  agentName: string;
  initialMessages?: ReadonlyArray<Message>;
}

interface REPLState {
  messages: Message[];
  isStreaming: boolean;
  currentAgent: string;
  toolCalls: ToolCall[];
  streamingText: string;
}

type REPLAction =
  | { kind: "add_message"; message: Message }
  | { kind: "set_streaming"; value: boolean }
  | { kind: "set_agent"; agent: string }
  | { kind: "add_tool_call"; toolCall: ToolCall }
  | { kind: "append_streaming"; token: string }
  | { kind: "clear_streaming" };

function replReducer(state: REPLState, action: REPLAction): REPLState {
  switch (action.kind) {
    case "add_message":
      return { ...state, messages: [...state.messages, action.message] };
    case "set_streaming":
      return { ...state, isStreaming: action.value };
    case "set_agent":
      return { ...state, currentAgent: action.agent };
    case "add_tool_call":
      return { ...state, toolCalls: [...state.toolCalls, action.toolCall] };
    case "append_streaming":
      return { ...state, streamingText: state.streamingText + action.token };
    case "clear_streaming":
      return { ...state, streamingText: "" };
  }
}

function REPL({ onSubmit, agentName, initialMessages = [] }: REPLProps): React.JSX.Element {
  const { exit } = useApp();

  const [state, dispatch] = React.useReducer(replReducer, {
    messages: [...initialMessages],
    isStreaming: false,
    currentAgent: agentName,
    toolCalls: [],
    streamingText: "",
  });

  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const handleSubmit = useCallback(
    (value: string) => {
      dispatch({ kind: "add_message", message: { role: "user", content: value } });
      dispatch({ kind: "set_streaming", value: true });
      dispatch({ kind: "clear_streaming" });

      void onSubmitRef
        .current(value)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          dispatch({ kind: "add_message", message: { role: "system", content: `Error: ${msg}` } });
        })
        .finally(() => {
          dispatch({ kind: "set_streaming", value: false });
        });
    },
    [],
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column">
        {state.messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {state.toolCalls.map((tc, i) => (
          <ToolCallDisplay key={`tool-${i}`} tool={tc.tool} args={tc.args} />
        ))}

        {state.isStreaming && state.streamingText.length > 0 && (
          <ChatMessage
            message={{ role: "assistant", content: state.streamingText }}
          />
        )}

        {state.isStreaming && (
          <Box marginLeft={2}>
            <Text dimColor>{"  \u25CC thinking..."}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingLeft={1} paddingRight={1}>
        <Input
          prompt={state.currentAgent}
          onSubmit={handleSubmit}
          disabled={state.isStreaming}
        />
      </Box>
    </Box>
  );
}

interface StartREPLOptions {
  onSubmit: (message: string) => Promise<void>;
  agentName?: string;
  initialMessages?: ReadonlyArray<Message>;
}

interface REPLHandle {
  addMessage: (message: Message) => void;
  addToolCall: (tool: string, args: string) => void;
  setStreaming: (value: boolean) => void;
  appendStreaming: (token: string) => void;
  clearStreaming: () => void;
  setAgent: (agent: string) => void;
  unmount: () => void;
  waitUntilExit: () => Promise<unknown>;
}

function startREPL(options: StartREPLOptions): REPLHandle {
  const { onSubmit, agentName = "triage", initialMessages = [] } = options;

  let dispatch: React.Dispatch<REPLAction> | null = null;

  function REPLWrapper(): React.JSX.Element {
    const [localState, localDispatch] = React.useReducer(replReducer, {
      messages: [...initialMessages],
      isStreaming: false,
      currentAgent: agentName,
      toolCalls: [],
      streamingText: "",
    });

    React.useEffect(() => {
      dispatch = localDispatch;
    }, [localDispatch]);

    const { exit } = useApp();

    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;

    const handleSubmit = useCallback(
      (value: string) => {
        localDispatch({ kind: "add_message", message: { role: "user", content: value } });
        localDispatch({ kind: "set_streaming", value: true });
        localDispatch({ kind: "clear_streaming" });

        void onSubmitRef
          .current(value)
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            localDispatch({ kind: "add_message", message: { role: "system", content: `Error: ${msg}` } });
          })
          .finally(() => {
            localDispatch({ kind: "set_streaming", value: false });
          });
      },
      [localDispatch],
    );

    return (
      <Box flexDirection="column" padding={1}>
        <Box flexDirection="column">
          {localState.messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}

          {localState.toolCalls.map((tc, i) => (
            <ToolCallDisplay key={`tool-${i}`} tool={tc.tool} args={tc.args} />
          ))}

          {localState.isStreaming && localState.streamingText.length > 0 && (
            <ChatMessage
              message={{ role: "assistant", content: localState.streamingText }}
            />
          )}

          {localState.isStreaming && (
            <Box marginLeft={2}>
              <Text dimColor>{"  \u25CC thinking..."}</Text>
            </Box>
          )}
        </Box>

        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingLeft={1} paddingRight={1}>
          <Input
            prompt={localState.currentAgent}
            onSubmit={handleSubmit}
            disabled={localState.isStreaming}
          />
        </Box>
      </Box>
    );
  }

  const instance = render(<REPLWrapper />);

  return {
    addMessage(message: Message) {
      dispatch?.({ kind: "add_message", message });
    },
    addToolCall(tool: string, args: string) {
      dispatch?.({ kind: "add_tool_call", toolCall: { tool, args } });
    },
    setStreaming(value: boolean) {
      dispatch?.({ kind: "set_streaming", value });
    },
    appendStreaming(token: string) {
      dispatch?.({ kind: "append_streaming", token });
    },
    clearStreaming() {
      dispatch?.({ kind: "clear_streaming" });
    },
    setAgent(agent: string) {
      dispatch?.({ kind: "set_agent", agent });
    },
    unmount: instance.unmount,
    waitUntilExit: instance.waitUntilExit,
  };
}

export { startREPL, REPL };
export type { StartREPLOptions, REPLHandle, REPLProps, Message };
