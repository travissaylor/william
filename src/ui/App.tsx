import React, { useState, useEffect, useRef } from 'react';
import { Box, useStdout } from 'ink';
import type { TuiEmitter, TuiEvent, DashboardData, ToolCallEvent } from './events.js';
import type { WorkspaceState } from '../types.js';
import { Dashboard } from './Dashboard.js';
import { LogArea } from './LogArea.js';
import type { LogEntry } from './LogArea.js';

/** Dashboard border (top + bottom) plus 2 content lines = 4 rows */
const DASHBOARD_HEIGHT = 4;
/** Maximum log entries kept in memory to prevent unbounded growth */
const MAX_ENTRIES = 500;

export interface AppProps {
  emitter: TuiEmitter;
  workspaceName: string;
  initialState: WorkspaceState;
  maxIterations: number;
}

function deriveInitialDashboard(workspaceName: string, state: WorkspaceState, maxIterations: number): DashboardData {
  const storyValues = Object.values(state.stories);
  return {
    workspaceName,
    storyId: state.currentStory,
    storyTitle: '',
    iteration: 0,
    maxIterations,
    storiesCompleted: storyValues.filter(s => s.passes === true).length,
    storiesTotal: storyValues.length,
    storiesSkipped: storyValues.filter(s => s.passes === 'skipped').length,
    cumulativeCostUsd: 0,
    cumulativeInputTokens: 0,
    cumulativeOutputTokens: 0,
    storyAttempts: state.currentStory ? (state.stories[state.currentStory]?.attempts ?? 0) : 0,
    stuckStatus: 'normal',
    filesModified: 0,
  };
}

export function App({ emitter, workspaceName, initialState, maxIterations }: AppProps) {
  const { stdout } = useStdout();
  const [terminalRows, setTerminalRows] = useState(stdout.rows || 24);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [liveText, setLiveText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData>(() =>
    deriveInitialDashboard(workspaceName, initialState, maxIterations),
  );
  const liveTextRef = useRef('');
  const idRef = useRef(0);
  const startTimeRef = useRef(Date.now());

  // Handle terminal resize
  useEffect(() => {
    const onResize = () => setTerminalRows(stdout.rows || 24);
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  useEffect(() => {
    const handler = (event: TuiEvent) => {
      if (event.type === 'dashboard-update') {
        setDashboard(event.data);
        return;
      }

      if (event.type === 'thinking') {
        setIsThinking(event.isThinking);
        return;
      }

      if (event.type === 'assistant-text') {
        setIsThinking(false);
        liveTextRef.current += event.text;
        setLiveText(liveTextRef.current);
      } else {
        // Build the text for the new entry
        const entryText = event.type === 'tool-call'
          ? `  ▸ ${(event as ToolCallEvent).toolName}${(event as ToolCallEvent).toolInput ? ': ' + (event as ToolCallEvent).toolInput : ''}`
          : event.text;

        // Commit any accumulated live text, then add the new event
        if (liveTextRef.current) {
          const committedText = liveTextRef.current;
          liveTextRef.current = '';
          setLiveText('');
          setEntries(prev => {
            const next = [
              ...prev,
              { id: idRef.current++, type: 'assistant-text' as const, text: committedText },
              { id: idRef.current++, type: event.type, text: entryText },
            ];
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
          });
        } else {
          setEntries(prev => {
            const next = [
              ...prev,
              { id: idRef.current++, type: event.type, text: entryText },
            ];
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
          });
        }
      }
    };

    emitter.on('event', handler);
    return () => {
      emitter.off('event', handler);
    };
  }, [emitter]);

  const logHeight = Math.max(1, terminalRows - DASHBOARD_HEIGHT);

  return (
    <Box flexDirection="column" height={terminalRows}>
      <Dashboard data={dashboard} startTime={startTimeRef.current} />
      <LogArea entries={entries} liveText={liveText} isThinking={isThinking} height={logHeight} />
    </Box>
  );
}
