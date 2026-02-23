import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { DashboardData } from "./events.js";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

function renderProgressBar(
  completed: number,
  total: number,
  width = 10,
): string {
  if (total === 0) return `[${"░".repeat(width)}] 0/0`;
  const filled = Math.round((completed / total) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${completed}/${total}`;
}

export interface DashboardProps {
  data: DashboardData;
  startTime: number;
}

export function Dashboard({ data, startTime }: DashboardProps) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startTime);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [startTime]);

  const stuckColor =
    data.stuckStatus === "normal"
      ? "green"
      : data.stuckStatus === "hint-written"
        ? "yellow"
        : "red";

  const stuckLabel =
    data.stuckStatus === "normal"
      ? "● normal"
      : data.stuckStatus === "hint-written"
        ? "▲ hint written"
        : "▲ approaching skip";

  const totalTokens = data.cumulativeInputTokens + data.cumulativeOutputTokens;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      <Box>
        <Text bold color="cyan">
          {data.workspaceName}
        </Text>
        <Text dimColor>{" │ "}</Text>
        <Text bold>{data.storyId ?? "idle"}</Text>
        <Text>{data.storyTitle ? `: ${data.storyTitle}` : ""}</Text>
        <Text dimColor>{" │ "}</Text>
        <Text>Iter </Text>
        <Text bold>{data.iteration}</Text>
        <Text>/{data.maxIterations}</Text>
        {data.modelName ? (
          <>
            <Text dimColor>{" │ "}</Text>
            <Text dimColor>{data.modelName}</Text>
          </>
        ) : null}
      </Box>
      <Box>
        <Text>
          {renderProgressBar(data.storiesCompleted, data.storiesTotal)}
        </Text>
        <Text dimColor>{" │ "}</Text>
        <Text color="green">${data.cumulativeCostUsd.toFixed(2)}</Text>
        <Text dimColor>{" │ "}</Text>
        <Text>{formatTokens(totalTokens)} tok</Text>
        <Text dimColor>{" │ "}</Text>
        <Text bold color="white">
          {formatElapsed(elapsed)}
        </Text>
        <Text dimColor>{" │ "}</Text>
        <Text>att {data.storyAttempts}</Text>
        <Text dimColor>{" │ "}</Text>
        <Text color={stuckColor}>{stuckLabel}</Text>
        <Text dimColor>{" │ "}</Text>
        <Text>{data.filesModified} files</Text>
      </Box>
    </Box>
  );
}
