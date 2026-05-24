/**
 * Lightweight heuristic to detect greetings and non-task messages.
 * Used to suppress tool calls on the first agent iteration for conversational messages.
 */

const GREETING_PATTERNS = [
  // English greetings
  /^(hi|hello|hey|howdy|greetings|yo|sup|what'?s up|hola|good\s*(morning|afternoon|evening|day))\b/i,
  // Chinese greetings
  /^(你好|您好|嗨|早上好|下午好|晚上好|哈喽)/,
  // Short messages that are clearly not tasks
  /^(thanks?|thank you|thx|ty|cheers|ok|okay|k|bye|goodbye|cya|see\s*ya|see you|later)\b/i,
  // Questions about capabilities
  /^(what can you do|help|what are you|who are you|how do you work|tell me about yourself)\b/i,
];

const MAX_TASK_LENGTH = 80;

/**
 * Returns true if the message looks like a greeting, small talk, or
 * a question that doesn't contain an actionable task.
 */
export function isGreetingOrNonTask(message: string): boolean {
  const trimmed = message.trim();

  // Very short messages (< 5 chars) are almost never tasks
  if (trimmed.length < 5) return true;

  // Check greeting patterns
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  // Medium-length messages without any task indicators
  if (trimmed.length < MAX_TASK_LENGTH) {
    const hasTaskIndicators =
      /\b(solve|find|hack|exploit|decrypt|decode|read|open|run|execute|check|analyze|write|edit|create|list|show|tell me|explain|extract|crack|break|reverse|compile|build|scan|enum|fetch|download|search|grep|cat|file|binary|flag|ctf|challenge|vuln|vulnerability|payload|script|code|command)\b/i.test(trimmed);

    if (!hasTaskIndicators) {
      // Check if it's a question without actionable content
      if (/^[^!?]*\?$/.test(trimmed) && !/\b(how|what|where|which)\b.*\b(do|can|should|would|to)\b/i.test(trimmed)) {
        return true;
      }
    }
  }

  return false;
}
