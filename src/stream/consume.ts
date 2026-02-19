import type { ChildProcess } from 'child_process';
import type * as fs from 'fs';
import { NdjsonParser } from './ndjson-parser.js';
import type { StreamMessage, StreamSession } from './types.js';
import type { TuiEmitter } from '../ui/events.js';

function summarizeToolInput(toolName: string, input: Record<string, unknown>): string {
  // Provide a brief one-line summary based on common tool patterns
  if (input.command && typeof input.command === 'string') {
    const cmd = input.command.length > 80 ? input.command.slice(0, 77) + '...' : input.command;
    return cmd;
  }
  if (input.file_path && typeof input.file_path === 'string') {
    return String(input.file_path);
  }
  if (input.pattern && typeof input.pattern === 'string') {
    return String(input.pattern);
  }
  if (input.query && typeof input.query === 'string') {
    const q = String(input.query);
    return q.length > 80 ? q.slice(0, 77) + '...' : q;
  }
  // Fallback: show first string-valued key
  for (const val of Object.values(input)) {
    if (typeof val === 'string' && val.length > 0) {
      return val.length > 80 ? val.slice(0, 77) + '...' : val;
    }
  }
  return '';
}

export interface ConsumeOpts {
  childProcess: ChildProcess;
  logStream: fs.WriteStream;
  emitter: TuiEmitter;
  onMessage?: (msg: StreamMessage) => void;
}

/**
 * Wires an NdjsonParser to a child process's stdout, echoing assistant text
 * to the console and writing structured NDJSON lines to the log file.
 * Pipes stderr to console + log.
 * Returns the accumulated StreamSession on close.
 */
export function consumeStreamOutput(opts: ConsumeOpts): Promise<{ session: StreamSession }> {
  const { childProcess, logStream, emitter, onMessage } = opts;
  const parser = new NdjsonParser();

  parser.on('message', (msg: StreamMessage) => {
    // Write each structured event as NDJSON to the log
    logStream.write(JSON.stringify(msg) + '\n');

    // Route assistant content to the TUI
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          emitter.assistantText(block.text);
        } else if (block.type === 'tool_use') {
          emitter.toolCall(block.name, summarizeToolInput(block.name, block.input));
        }
      }
    }

    // Route result messages to the TUI with cost/token/duration data
    if (msg.type === 'result') {
      emitter.result(msg.total_cost_usd, msg.usage.input_tokens, msg.usage.output_tokens, msg.duration_ms);
    }

    // Route system init messages to show model name in dashboard
    if (msg.type === 'system' && msg.subtype === 'init') {
      emitter.system(`[model: ${msg.model}]`);
    }

    // Route tool result errors and start thinking after user messages
    if (msg.type === 'user') {
      for (const block of msg.message.content) {
        if (block.type === 'tool_result' && block.is_error) {
          const preview = block.content.length > 200 ? block.content.slice(0, 197) + '...' : block.content;
          emitter.error(`Tool error: ${preview}`);
        }
      }
      emitter.thinkingStart();
    }

    onMessage?.(msg);
  });

  parser.on('parse-error', (line: string) => {
    emitter.error(`[william] NDJSON parse error: ${line}`);
  });

  return new Promise<{ session: StreamSession }>((resolve, reject) => {
    childProcess.stdout?.on('data', (chunk: Buffer) => {
      parser.feed(chunk);
    });

    childProcess.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      emitter.error(text);
      logStream.write(text);
    });

    childProcess.on('close', () => {
      emitter.thinkingStop();
      parser.flush();
      logStream.end(() => {
        resolve({ session: parser.getSession() });
      });
    });

    childProcess.on('error', (err: Error) => {
      logStream.destroy();
      reject(err);
    });
  });
}
