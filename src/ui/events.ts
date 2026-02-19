import { EventEmitter } from 'events';

export interface SystemEvent {
  type: 'system';
  text: string;
}

export interface AssistantTextEvent {
  type: 'assistant-text';
  text: string;
}

export interface ErrorEvent {
  type: 'error';
  text: string;
}

export type TuiEvent = SystemEvent | AssistantTextEvent | ErrorEvent;

export class TuiEmitter extends EventEmitter {
  system(text: string): void {
    this.emit('event', { type: 'system', text } satisfies SystemEvent);
  }

  assistantText(text: string): void {
    this.emit('event', { type: 'assistant-text', text } satisfies AssistantTextEvent);
  }

  error(text: string): void {
    this.emit('event', { type: 'error', text } satisfies ErrorEvent);
  }
}
