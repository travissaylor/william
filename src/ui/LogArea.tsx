import React from 'react';
import { Box, Text } from 'ink';
import { MarkdownText } from './MarkdownText.js';
import { ThinkingSpinner } from './Spinner.js';
import { StoryBanner } from './StoryBanner.js';
import type { BannerKind } from './StoryBanner.js';

export interface LogEntry {
  id: number;
  type: 'system' | 'assistant-text' | 'error' | 'tool-call' | 'story-complete' | 'story-skipped' | 'story-start';
  text: string;
  storyId?: string;
  storyTitle?: string;
}

function LogEntryView({ entry }: { entry: LogEntry }) {
  switch (entry.type) {
    case 'story-complete':
    case 'story-skipped':
    case 'story-start': {
      const kindMap: Record<string, BannerKind> = {
        'story-complete': 'complete',
        'story-skipped': 'skipped',
        'story-start': 'start',
      };
      return <StoryBanner kind={kindMap[entry.type]} storyId={entry.storyId!} storyTitle={entry.storyTitle!} />;
    }
    case 'error':
      return <Text color="red">{entry.text}</Text>;
    case 'system':
      return <Text color="yellow">{entry.text}</Text>;
    case 'tool-call':
      return <Text color="magenta">{entry.text}</Text>;
    case 'assistant-text':
      return <MarkdownText>{entry.text}</MarkdownText>;
    default:
      return <Text>{entry.text}</Text>;
  }
}

export interface LogAreaProps {
  entries: LogEntry[];
  liveText: string;
  isThinking: boolean;
  height: number;
}

export function LogArea({ entries, liveText, isThinking, height }: LogAreaProps) {
  // Only render entries that can reasonably fit in the available height.
  // Each entry is at least 1 line; we use height as the max count.
  const maxVisible = Math.max(5, height);
  const visibleEntries = entries.slice(-maxVisible);

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {/* Spacer pushes content to the bottom of the log area */}
      <Box flexGrow={1} />
      {visibleEntries.map((entry) => (
        <Box key={entry.id} flexShrink={0}>
          <LogEntryView entry={entry} />
        </Box>
      ))}
      {liveText ? (
        <Box flexShrink={0}>
          <MarkdownText>{liveText}</MarkdownText>
        </Box>
      ) : null}
      {isThinking && !liveText ? (
        <Box flexShrink={0}>
          <ThinkingSpinner />
        </Box>
      ) : null}
    </Box>
  );
}
