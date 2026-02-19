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

export interface ToolCallEvent {
  type: 'tool-call';
  toolName: string;
  toolInput: string;
}

export interface DashboardData {
  workspaceName: string;
  storyId: string | null;
  storyTitle: string;
  iteration: number;
  maxIterations: number;
  storiesCompleted: number;
  storiesTotal: number;
  storiesSkipped: number;
  cumulativeCostUsd: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  storyAttempts: number;
  stuckStatus: 'normal' | 'hint-written' | 'approaching-skip';
  filesModified: number;
  modelName?: string;
}

export interface DashboardUpdateEvent {
  type: 'dashboard-update';
  data: DashboardData;
}

export interface ThinkingEvent {
  type: 'thinking';
  isThinking: boolean;
}

export interface ResultEvent {
  type: 'result';
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export type TuiEvent = SystemEvent | AssistantTextEvent | ErrorEvent | ToolCallEvent | DashboardUpdateEvent | ThinkingEvent | ResultEvent;

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

  toolCall(toolName: string, toolInput: string): void {
    this.emit('event', { type: 'tool-call', toolName, toolInput } satisfies ToolCallEvent);
  }

  dashboardUpdate(data: DashboardData): void {
    this.emit('event', { type: 'dashboard-update', data } satisfies DashboardUpdateEvent);
  }

  thinkingStart(): void {
    this.emit('event', { type: 'thinking', isThinking: true } satisfies ThinkingEvent);
  }

  thinkingStop(): void {
    this.emit('event', { type: 'thinking', isThinking: false } satisfies ThinkingEvent);
  }

  result(totalCostUsd: number, inputTokens: number, outputTokens: number, durationMs: number): void {
    this.emit('event', { type: 'result', totalCostUsd, inputTokens, outputTokens, durationMs } satisfies ResultEvent);
  }
}
