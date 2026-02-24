import type { ParsedPrd, ParsedStory } from "./parser.js";
import type { WorkspaceState } from "../types.js";

export interface BuildContextOpts {
  parsedPrd: ParsedPrd;
  rawMarkdown: string;
  state: WorkspaceState;
  progressTxt: string;
  stuckHint?: string;
  chainContext?: string;
  /** For revision workspaces: the full original PRD so agents understand the broader context */
  originalPrd?: string;
}

/**
 * Extracts the ## Codebase Patterns section from progress.txt content.
 * Returns everything from the heading line up to the next ## heading or end of string.
 */
function extractCodebasePatterns(progressTxt: string): string {
  const match =
    /^## Codebase Patterns\s*\n([\s\S]*?)(?=\n## |\n---|\s*$)/m.exec(
      progressTxt,
    );
  if (!match) return "";
  return match[0].trim();
}

/**
 * Extracts the last N progress entries from progress.txt.
 * Entries are delimited by ## [Date] - US-XXX style headers.
 */
function extractLastProgressEntries(
  progressTxt: string,
  count: number,
): string {
  // Split on ## headers that look like timestamps/story entries
  // Match patterns like "## 2024-01-15 - US-003" or "## [2024-01-15] - US-003"
  const parts = progressTxt.split(/(?=^## \[?\d{4}-\d{2}-\d{2}\]?)/m);
  const entries = parts.filter((p) =>
    /^## \[?\d{4}-\d{2}-\d{2}\]?/.test(p.trim()),
  );
  return entries
    .slice(-count)
    .map((e) => e.trim())
    .join("\n\n");
}

/**
 * Returns a one-line status symbol for a story given the workspace state.
 */
function storyStatusSymbol(
  storyId: string,
  currentStory: string | null,
  stories: WorkspaceState["stories"],
): string {
  if (storyId === currentStory) return "→";
  const s = stories[storyId] as WorkspaceState["stories"][string] | undefined;
  if (!s) return "·";
  if (s.passes === true) return "✓";
  if (s.passes === "skipped") return "⊘";
  return "·";
}

/**
 * Builds a focused context prompt for a single agent iteration.
 *
 * - Small PRDs (< 10KB): injects raw markdown verbatim
 * - Large PRDs (≥ 10KB): injects selective sections + story summaries
 *
 * Always appends ## Codebase Patterns, last 3 progress entries, and
 * optionally ## Stuck Recovery Hint.
 */
export function buildContext(opts: BuildContextOpts): string {
  const {
    parsedPrd,
    rawMarkdown,
    state,
    progressTxt,
    stuckHint,
    chainContext,
    originalPrd,
  } = opts;
  const parts: string[] = [];

  // For revision workspaces, prepend the original PRD so agents understand the broader context
  if (originalPrd) {
    parts.push(`## Original PRD\n\n${originalPrd}`);
  }

  const isSmall = Buffer.byteLength(rawMarkdown, "utf8") < 10_240;

  if (isSmall) {
    parts.push(rawMarkdown);
  } else {
    // Append non-empty top-level sections
    const topSections: [string, string][] = [
      ["## Introduction", parsedPrd.introduction],
      ["## Goals", parsedPrd.goals],
      ["## Non-Goals", parsedPrd.nonGoals],
      ["## Technical Considerations", parsedPrd.technicalConsiderations],
      ["## Functional Requirements", parsedPrd.functionalRequirements],
    ];
    for (const [heading, content] of topSections) {
      if (content.trim()) {
        parts.push(`${heading}\n\n${content.trim()}`);
      }
    }

    // Build story status table
    const statusLines = parsedPrd.stories.map((s) => {
      const sym = storyStatusSymbol(s.id, state.currentStory, state.stories);
      return `${sym} ${s.id}: ${s.title}`;
    });
    if (statusLines.length > 0) {
      parts.push(`## Story Status\n\n${statusLines.join("\n")}`);
    }

    // Find current story index
    const currentIdx = parsedPrd.stories.findIndex(
      (s) => s.id === state.currentStory,
    );

    // Previous 1–2 completed stories (full rawMarkdown)
    if (currentIdx > 0) {
      const prevCompleted = parsedPrd.stories
        .slice(0, currentIdx)
        .filter((s) => state.stories[s.id].passes === true)
        .slice(-2);
      for (const story of prevCompleted) {
        parts.push(
          `## Previously Completed: ${story.id}\n\n${story.rawMarkdown}`,
        );
      }
    }

    // Current story (full rawMarkdown)
    if (currentIdx !== -1) {
      const current = parsedPrd.stories[currentIdx];
      parts.push(`## Current Story\n\n${current.rawMarkdown}`);
    }

    // Next 1–2 upcoming stories (title + description only, no acceptance criteria)
    const upcoming: ParsedStory[] = [];
    if (currentIdx !== -1) {
      for (const s of parsedPrd.stories.slice(currentIdx + 1)) {
        const st = state.stories[s.id];
        if (st.passes !== true && st.passes !== "skipped") {
          upcoming.push(s);
          if (upcoming.length >= 2) break;
        }
      }
    }
    for (const story of upcoming) {
      const descPart = story.description ? `\n\n${story.description}` : "";
      parts.push(`## Upcoming: ${story.id} — ${story.title}${descPart}`);
    }
  }

  // Always append Codebase Patterns
  const patterns = extractCodebasePatterns(progressTxt);
  if (patterns) {
    parts.push(patterns);
  }

  // Always append last 3 progress entries
  const recentEntries = extractLastProgressEntries(progressTxt, 3);
  if (recentEntries) {
    parts.push(`## Recent Progress\n\n${recentEntries}`);
  }

  // Optionally append stuck recovery hint
  if (stuckHint) {
    parts.push(`## Stuck Recovery Hint\n\n${stuckHint}`);
  }

  // Append chain context from previous story session
  if (chainContext) {
    parts.push(chainContext);
  }

  return parts.join("\n\n");
}
