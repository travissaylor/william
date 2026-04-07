import React from "react";
import { Box, Text } from "ink";

export type BannerKind = "complete" | "skipped" | "start";

export interface StoryBannerProps {
  kind: BannerKind;
  storyId: string;
  storyTitle: string;
}

export function StoryBanner({ kind, storyId, storyTitle }: StoryBannerProps) {
  switch (kind) {
    case "complete":
      return (
        <Box>
          <Text bold color="green">
            {"✓ "}
            {storyId}: {storyTitle} — COMPLETE
          </Text>
        </Box>
      );
    case "skipped":
      return (
        <Box>
          <Text bold color="yellow">
            {"⊘ "}
            {storyId}: {storyTitle} — SKIPPED
          </Text>
        </Box>
      );
    case "start":
      return (
        <Box>
          <Text bold color="cyan">
            {"→ Starting "}
            {storyId}: {storyTitle}
          </Text>
        </Box>
      );
  }
}
