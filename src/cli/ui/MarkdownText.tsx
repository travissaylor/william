import React from "react";
import { Text } from "ink";
import { renderMarkdown } from "./render-markdown.js";

export { renderMarkdown };

export function MarkdownText({ children }: { children: string }) {
  return <Text>{renderMarkdown(children)}</Text>;
}
