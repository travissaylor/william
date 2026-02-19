import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, Static } from 'ink';
import type { TuiEmitter, TuiEvent } from './events.js';
import type { WorkspaceState } from '../types.js';

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

export function App({ emitter }: AppProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [liveText, setLiveText] = useState('');
  const liveTextRef = useRef('');
  const idRef = useRef(0);

  useEffect(() => {
    const handler = (event: TuiEvent) => {
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
      {liveText ? <Text>{liveText}</Text> : null}
    </Box>
  );
}
