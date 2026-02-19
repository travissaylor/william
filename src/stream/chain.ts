import type { StreamSession, ToolUseBlock } from './types.js';

export interface ChainContext {
  filesModified: string[];
  filesRead: string[];
  commandsRun: string[];
  errors: string[];
  keyDecisions: string[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

function extractFilePath(tu: ToolUseBlock): string | null {
  const input = tu.input as Record<string, unknown>;
  const fp = input.file_path ?? input.path;
  return typeof fp === 'string' ? fp : null;
}

export function extractChainContext(session: StreamSession): ChainContext {
  const filesModified = new Set<string>();
  const filesRead = new Set<string>();
  const commandsRun: string[] = [];

  for (const tu of session.toolUses) {
    const filePath = extractFilePath(tu);

    if (tu.name === 'Write' || tu.name === 'Edit') {
      if (filePath) filesModified.add(filePath);
    } else if (tu.name === 'Read') {
      if (filePath) filesRead.add(filePath);
    } else if (tu.name === 'Bash') {
      const cmd = (tu.input as Record<string, unknown>).command;
      if (typeof cmd === 'string') commandsRun.push(cmd);
    }
  }

  const errors: string[] = [];
  for (const tr of session.toolResults) {
    if (tr.is_error) {
      errors.push(`[${tr.tool_use_id}] ${tr.content.slice(0, 300)}`);
    }
  }

  // Extract last few assistant text blocks as key decisions
  const keyDecisions: string[] = [];
  for (const event of session.events) {
    if (event.type === 'assistant') {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text.trim()) {
          keyDecisions.push(block.text.trim());
        }
      }
    }
  }

  return {
    filesModified: Array.from(filesModified),
    filesRead: Array.from(filesRead),
    commandsRun,
    errors,
    keyDecisions: keyDecisions.slice(-5),
    costUsd: session.totalCostUsd,
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    durationMs: session.durationMs,
  };
}

export function formatChainContextForPrompt(ctx: ChainContext, storyId: string): string {
  const parts: string[] = [];
  parts.push(`## Chain Context from ${storyId}`);
  parts.push('');

  if (ctx.filesModified.length > 0) {
    parts.push('### Files Modified');
    for (const f of ctx.filesModified.slice(0, 15)) {
      parts.push(`- \`${f}\``);
    }
    parts.push('');
  }

  if (ctx.filesRead.length > 0) {
    parts.push('### Files Referenced');
    for (const f of ctx.filesRead.slice(0, 15)) {
      parts.push(`- \`${f}\``);
    }
    parts.push('');
  }

  if (ctx.commandsRun.length > 0) {
    parts.push('### Commands Run');
    for (const c of ctx.commandsRun.slice(0, 20)) {
      parts.push(`- \`${c.slice(0, 200)}\``);
    }
    parts.push('');
  }

  if (ctx.errors.length > 0) {
    parts.push('### Errors Encountered');
    for (const e of ctx.errors.slice(0, 10)) {
      parts.push(`- ${e.slice(0, 200)}`);
    }
    parts.push('');
  }

  if (ctx.keyDecisions.length > 0) {
    parts.push('### Key Decisions');
    for (const d of ctx.keyDecisions.slice(0, 5)) {
      // Truncate long decision text
      const truncated = d.length > 500 ? d.slice(0, 500) + '...' : d;
      parts.push(`- ${truncated}`);
    }
    parts.push('');
  }

  parts.push(`### Session Stats`);
  parts.push(`- Cost: $${ctx.costUsd.toFixed(4)}`);
  parts.push(`- Tokens: ${ctx.inputTokens} in / ${ctx.outputTokens} out`);
  parts.push(`- Duration: ${(ctx.durationMs / 1000).toFixed(1)}s`);

  return parts.join('\n');
}
