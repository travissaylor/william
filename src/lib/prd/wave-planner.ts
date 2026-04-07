import type { ParsedStory } from "./parser.js";

export type Wave = string[];

/**
 * Computes ordered execution waves from a dependency graph of stories.
 * Stories with no dependencies are placed in wave 1 for maximum parallelism.
 * Stories whose dependencies are satisfied by earlier waves are grouped into
 * the earliest possible wave. Circular dependencies produce a clear error.
 */
export function computeWaves(stories: ParsedStory[]): Wave[] {
  if (stories.length === 0) return [];

  const depsMap = new Map<string, string[]>();

  for (const story of stories) {
    depsMap.set(story.id, story.dependsOn);
  }

  const waves: Wave[] = [];
  const assigned = new Set<string>();

  while (assigned.size < stories.length) {
    const wave: string[] = [];

    for (const story of stories) {
      if (assigned.has(story.id)) continue;
      const deps = depsMap.get(story.id) ?? [];
      const satisfied = deps.every((dep) => assigned.has(dep));
      if (satisfied) {
        wave.push(story.id);
      }
    }

    if (wave.length === 0) {
      // Remaining stories form a cycle — find and report it
      const remaining = stories
        .filter((s) => !assigned.has(s.id))
        .map((s) => s.id);
      const cycle = detectCycle(remaining, depsMap);
      throw new Error(
        `Circular dependency detected: ${cycle.join(" → ")} → ${cycle[0]}`,
      );
    }

    // Sort for deterministic output
    wave.sort();
    waves.push(wave);

    for (const id of wave) {
      assigned.add(id);
    }
  }

  return waves;
}

/**
 * Detects a cycle among the given node IDs using DFS.
 * Returns the IDs forming the cycle.
 */
function detectCycle(
  nodeIds: string[],
  depsMap: Map<string, string[]>,
): string[] {
  const nodeSet = new Set(nodeIds);
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const parent = new Map<string, string>();

  for (const startId of nodeIds) {
    if (visited.has(startId)) continue;

    const stack = [startId];
    while (stack.length > 0) {
      const id = stack[stack.length - 1];

      if (!visited.has(id)) {
        visited.add(id);
        inStack.add(id);
      }

      const deps = (depsMap.get(id) ?? []).filter((d) => nodeSet.has(d));
      let pushed = false;

      for (const dep of deps) {
        if (!visited.has(dep)) {
          parent.set(dep, id);
          stack.push(dep);
          pushed = true;
          break;
        } else if (inStack.has(dep)) {
          // Found cycle — reconstruct it
          const cycle = [dep];
          let cur = id;
          while (cur !== dep) {
            cycle.push(cur);
            cur = parent.get(cur) ?? "";
          }
          cycle.reverse();
          return cycle;
        }
      }

      if (!pushed) {
        inStack.delete(id);
        stack.pop();
      }
    }
  }

  // Fallback — shouldn't reach here if called correctly
  return nodeIds;
}
