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
}

export interface DashboardUpdateEvent {
  type: 'dashboard-update';
  data: DashboardData;
}

export type TuiEvent = SystemEvent | AssistantTextEvent | ErrorEvent | DashboardUpdateEvent;

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

  dashboardUpdate(data: DashboardData): void {
    this.emit('event', { type: 'dashboard-update', data } satisfies DashboardUpdateEvent);
  }
}
