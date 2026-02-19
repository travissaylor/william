// SDK message types for `claude --output-format stream-json` NDJSON output

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface StreamSystemMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
  model: string;
  tools: string[];
  cwd: string;
}

export interface StreamAssistantMessage {
  type: 'assistant';
  message: { content: ContentBlock[] };
  parent_tool_use_id?: string;
}

export interface StreamUserMessage {
  type: 'user';
  message: { content: ContentBlock[] };
}

export interface StreamResultMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_tool' | 'error_unknown';
  total_cost_usd: number;
  usage: { input_tokens: number; output_tokens: number };
  duration_ms: number;
  num_turns: number;
  result: string;
}

export type StreamMessage =
  | StreamSystemMessage
  | StreamAssistantMessage
  | StreamUserMessage
  | StreamResultMessage;

export interface StreamSession {
  events: StreamMessage[];
  fullText: string;
  toolUses: ToolUseBlock[];
  toolResults: ToolResultBlock[];
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  numTurns: number;
  resultSubtype: string | null;
}
