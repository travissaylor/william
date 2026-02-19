import { EventEmitter } from 'events';
import type {
  StreamMessage,
  StreamSession,
  ToolUseBlock,
  ToolResultBlock,
  ContentBlock,
} from './types.js';

export class NdjsonParser extends EventEmitter {
  private buffer = '';
  private session: StreamSession = {
    events: [],
    fullText: '',
    toolUses: [],
    toolResults: [],
    totalCostUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    numTurns: 0,
    resultSubtype: null,
  };

  feed(chunk: Buffer | string): void {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    const lines = this.buffer.split('\n');
    // Keep the last element — it may be an incomplete line
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      this.parseLine(line);
    }
  }

  flush(): void {
    if (this.buffer.trim()) {
      this.parseLine(this.buffer);
      this.buffer = '';
    }
  }

  getSession(): StreamSession {
    return this.session;
  }

  private parseLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      this.emit('parse-error', trimmed);
      return;
    }

    const msg = parsed as StreamMessage;
    this.session.events.push(msg);
    this.emit('message', msg);

    if (msg.type === 'assistant') {
      this.extractAssistantContent(msg.message.content);
    } else if (msg.type === 'user') {
      this.extractUserContent(msg.message.content);
    } else if (msg.type === 'result') {
      this.session.totalCostUsd = msg.total_cost_usd;
      this.session.inputTokens = msg.usage.input_tokens;
      this.session.outputTokens = msg.usage.output_tokens;
      this.session.durationMs = msg.duration_ms;
      this.session.numTurns = msg.num_turns;
      this.session.resultSubtype = msg.subtype;
    }
  }

  private extractAssistantContent(blocks: ContentBlock[]): void {
    for (const block of blocks) {
      if (block.type === 'text') {
        this.session.fullText += block.text;
      } else if (block.type === 'tool_use') {
        this.session.toolUses.push(block as ToolUseBlock);
      }
    }
  }

  private extractUserContent(blocks: ContentBlock[]): void {
    for (const block of blocks) {
      if (block.type === 'tool_result') {
        this.session.toolResults.push(block as ToolResultBlock);
      }
    }
  }
}
