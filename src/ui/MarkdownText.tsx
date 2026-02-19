import React from 'react';
import { Text } from 'ink';
import { marked } from 'marked';
import markedTerminal from 'marked-terminal';

// Configure marked with terminal renderer once
marked.use(markedTerminal());

/**
 * Renders a markdown string with terminal formatting (bold, headers,
 * code highlighting, lists, links, etc.) using marked + marked-terminal.
 */
export function renderMarkdown(input: string): string {
  // marked.parse can return string | Promise<string>; with no async
  // extensions it always returns string synchronously.
  const rendered = marked.parse(input) as string;
  // Trim trailing newlines that marked-terminal tends to add
  return rendered.replace(/\n+$/, '');
}

export function MarkdownText({ children }: { children: string }) {
  return <Text>{renderMarkdown(children)}</Text>;
}
