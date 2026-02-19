import type { ChildProcess } from 'child_process';
import type * as fs from 'fs';
import { NdjsonParser } from './ndjson-parser.js';
import type { StreamMessage, StreamSession } from './types.js';
import type { TuiEmitter } from '../ui/events.js';

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

    // Route assistant text content to the TUI
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          emitter.assistantText(block.text);
        }
      }
    }

    // After tool results are sent back, Claude will be thinking again
    if (msg.type === 'user') {
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
