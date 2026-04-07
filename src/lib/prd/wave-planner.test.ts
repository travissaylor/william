import { describe, it, expect } from "vitest";
import { computeWaves } from "./wave-planner.js";
import type { ParsedStory } from "./parser.js";

function makeStory(id: string, dependsOn: string[] = []): ParsedStory {
  return {
    id,
    title: `Story ${id}`,
    description: "",
    acceptanceCriteria: [],
    dependsOn,
    rawMarkdown: "",
  };
}

describe("computeWaves", () => {
  it("returns empty array for no stories", () => {
    expect(computeWaves([])).toEqual([]);
  });

  it("places all independent stories in wave 1", () => {
    const stories = [
      makeStory("US-001"),
      makeStory("US-002"),
      makeStory("US-003"),
    ];
    const waves = computeWaves(stories);
    expect(waves).toEqual([["US-001", "US-002", "US-003"]]);
  });

  it("places a single story in wave 1", () => {
    const waves = computeWaves([makeStory("US-001")]);
    expect(waves).toEqual([["US-001"]]);
  });

  it("chains linear dependencies into sequential waves", () => {
    const stories = [
      makeStory("US-001"),
      makeStory("US-002", ["US-001"]),
      makeStory("US-003", ["US-002"]),
    ];
    const waves = computeWaves(stories);
    expect(waves).toEqual([["US-001"], ["US-002"], ["US-003"]]);
  });

  it("groups stories into earliest possible wave", () => {
    // US-001 has no deps → wave 1
    // US-002 depends on US-001 → wave 2
    // US-003 depends on US-001 → wave 2
    // US-004 depends on US-002 and US-003 → wave 3
    const stories = [
      makeStory("US-001"),
      makeStory("US-002", ["US-001"]),
      makeStory("US-003", ["US-001"]),
      makeStory("US-004", ["US-002", "US-003"]),
    ];
    const waves = computeWaves(stories);
    expect(waves).toEqual([["US-001"], ["US-002", "US-003"], ["US-004"]]);
  });

  it("handles mixed independent and dependent stories", () => {
    // US-001 and US-002 have no deps → wave 1
    // US-003 depends on US-001 → wave 2
    const stories = [
      makeStory("US-001"),
      makeStory("US-002"),
      makeStory("US-003", ["US-001"]),
    ];
    const waves = computeWaves(stories);
    expect(waves).toEqual([["US-001", "US-002"], ["US-003"]]);
  });

  it("detects circular dependencies", () => {
    const stories = [
      makeStory("US-001", ["US-003"]),
      makeStory("US-002", ["US-001"]),
      makeStory("US-003", ["US-002"]),
    ];
    expect(() => computeWaves(stories)).toThrow(/Circular dependency detected/);
  });

  it("detects two-node circular dependency", () => {
    const stories = [
      makeStory("US-001", ["US-002"]),
      makeStory("US-002", ["US-001"]),
    ];
    expect(() => computeWaves(stories)).toThrow(/Circular dependency detected/);
  });

  it("detects self-dependency as a cycle", () => {
    const stories = [makeStory("US-001", ["US-001"])];
    expect(() => computeWaves(stories)).toThrow(/Circular dependency detected/);
  });

  it("produces deterministic output regardless of input order", () => {
    const storiesA = [
      makeStory("US-003"),
      makeStory("US-001"),
      makeStory("US-002"),
    ];
    const storiesB = [
      makeStory("US-002"),
      makeStory("US-003"),
      makeStory("US-001"),
    ];
    expect(computeWaves(storiesA)).toEqual(computeWaves(storiesB));
  });

  it("handles complex diamond dependency graph", () => {
    // US-001 → wave 1
    // US-002 (dep: US-001), US-003 (dep: US-001) → wave 2
    // US-004 (dep: US-002), US-005 (dep: US-003) → wave 3
    // US-006 (dep: US-004, US-005) → wave 4
    const stories = [
      makeStory("US-001"),
      makeStory("US-002", ["US-001"]),
      makeStory("US-003", ["US-001"]),
      makeStory("US-004", ["US-002"]),
      makeStory("US-005", ["US-003"]),
      makeStory("US-006", ["US-004", "US-005"]),
    ];
    const waves = computeWaves(stories);
    expect(waves).toEqual([
      ["US-001"],
      ["US-002", "US-003"],
      ["US-004", "US-005"],
      ["US-006"],
    ]);
  });
});
