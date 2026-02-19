import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';

export function ThinkingSpinner() {
  return (
    <Box>
      <Text color="cyan">
        <InkSpinner type="dots" />
      </Text>
      <Text color="gray"> Claude is thinking...</Text>
    </Box>
  );
}
