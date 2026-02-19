import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, Static } from 'ink';
import type { TuiEmitter, TuiEvent, DashboardData } from './events.js';
import type { WorkspaceState } from '../types.js';
import { Dashboard } from './Dashboard.js';

export interface AppProps {
  emitter: TuiEmitter;
  workspaceName: string;
  initialState: WorkspaceState;
  maxIterations: number;
}

interface LogEntry {
  id: number;
  type: TuiEvent['type'];
  text: string;
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
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [liveText, setLiveText] = useState('');
  const [dashboard, setDashboard] = useState<DashboardData>(() =>
    deriveInitialDashboard(workspaceName, initialState, maxIterations),
  );
  const liveTextRef = useRef('');
  const idRef = useRef(0);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const handler = (event: TuiEvent) => {
      if (event.type === 'dashboard-update') {
        setDashboard(event.data);
        return;
      }

      if (event.type === 'assistant-text') {
        liveTextRef.current += event.text;
        setLiveText(liveTextRef.current);
      } else {
        // Commit any accumulated live text, then add the new event
        if (liveTextRef.current) {
          const committedText = liveTextRef.current;
          liveTextRef.current = '';
          setLiveText('');
          setEntries(prev => [
            ...prev,
            { id: idRef.current++, type: 'assistant-text', text: committedText },
            { id: idRef.current++, type: event.type, text: event.text },
          ]);
        } else {
          setEntries(prev => [
            ...prev,
            { id: idRef.current++, type: event.type, text: event.text },
          ]);
        }
      }
    };

    emitter.on('event', handler);
    return () => {
      emitter.off('event', handler);
    };
  }, [emitter]);

  return (
    <Box flexDirection="column">
      <Static items={entries}>
        {(entry) => (
          <Text key={entry.id} color={entry.type === 'error' ? 'red' : undefined}>
            {entry.text}
          </Text>
        )}
      </Static>
      <Dashboard data={dashboard} startTime={startTimeRef.current} />
      {liveText ? <Text>{liveText}</Text> : null}
    </Box>
  );
}
