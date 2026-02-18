export interface ParsedStory {
  id: string; // e.g., 'US-013'
  title: string;
  description: string;
  acceptanceCriteria: string[];
  rawMarkdown: string;
}

export interface ParsedPrd {
  title: string;
  introduction: string;
  goals: string;
  nonGoals: string;
  technicalConsiderations: string;
  functionalRequirements: string;
  designConsiderations: string;
  successMetrics: string;
  openQuestions: string;
  stories: ParsedStory[];
}

/**
 * Normalizes a section heading for comparison by lowercasing,
 * replacing hyphens with spaces, and stripping other non-alpha characters.
 */
function normalizeHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits markdown into level-2 sections (## heading).
 * Content before the first ## heading is ignored.
 */
function splitIntoSections(markdown: string): Array<{ heading: string; content: string }> {
  const lines = markdown.split('\n');
  const sections: Array<{ heading: string; content: string }> = [];
  let currentHeading = '';
  let currentLines: string[] = [];
  let inSection = false;

  for (const line of lines) {
    // Match exactly ## heading (not ### or ####)
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      if (inSection) {
        sections.push({ heading: currentHeading, content: currentLines.join('\n').trim() });
      }
      currentHeading = h2Match[1].trim();
      currentLines = [];
      inSection = true;
    } else if (inSection) {
      currentLines.push(line);
    }
  }

  if (inSection) {
    sections.push({ heading: currentHeading, content: currentLines.join('\n').trim() });
  }

  return sections;
}

/**
 * Extracts description and acceptance criteria from story body text.
 */
function parseStoryContent(rawMarkdown: string): {
  description: string;
  acceptanceCriteria: string[];
} {
  let description = '';
  let acceptanceCriteria: string[] = [];

  // Extract description: content after **Description:** up to next blank line or next **
  const descMatch = rawMarkdown.match(/\*\*Description:\*\*\s*([\s\S]+?)(?=\n\n|\*\*[A-Z]|$)/);
  if (descMatch) {
    description = descMatch[1].trim();
  }

  // Extract acceptance criteria: list items after **Acceptance Criteria:**
  const criteriaMatch = rawMarkdown.match(/\*\*Acceptance Criteria:\*\*\s*\n([\s\S]+?)(?=\n\n\*\*|\n#{3,}|$)/);
  if (criteriaMatch) {
    acceptanceCriteria = criteriaMatch[1]
      .split('\n')
      .filter((line) => /^\s*-/.test(line))
      .map((line) => line.replace(/^\s*-\s*/, '').trim())
      .filter((line) => line.length > 0);
  }

  return { description, acceptanceCriteria };
}

/**
 * Returns true if the heading text is a phase/group marker, not a story.
 * e.g., "Phase 1: Narrative Page Optimization"
 */
function isPhaseHeader(headingText: string): boolean {
  const cleaned = headingText.replace(/^✅\s*/, '').trim();
  return /^Phase\s+(\d+|[A-Za-z]+)\s*:/i.test(cleaned);
}

/**
 * Parses the content of the ## User Stories section into individual ParsedStory objects.
 * Handles stories at ### or #### level, with or without US-XXX: IDs.
 * Phase headers (### Phase N:) are skipped.
 * Stories without explicit IDs are assigned sequential IDs (US-001, US-002, ...).
 */
function parseStories(content: string): ParsedStory[] {
  const stories: ParsedStory[] = [];
  const lines = content.split('\n');
  let sequentialCounter = 1;

  let currentHeadingText: string | null = null;
  let currentLevel = 0;
  let currentLines: string[] = [];

  const flushStory = () => {
    if (currentHeadingText === null) return;

    const headingLine = '#'.repeat(currentLevel) + ' ' + currentHeadingText;
    const rawMarkdown = [headingLine, ...currentLines].join('\n').trim();

    const cleanedHeading = currentHeadingText.replace(/^✅\s*/, '').trim();
    const storyIdMatch = cleanedHeading.match(/^(US-\d+):\s*(.+)$/);

    let id: string;
    let title: string;

    if (storyIdMatch) {
      id = storyIdMatch[1];
      title = storyIdMatch[2].trim();
    } else {
      id = `US-${String(sequentialCounter).padStart(3, '0')}`;
      sequentialCounter++;
      title = cleanedHeading.replace(/:$/, '').trim();
    }

    const { description, acceptanceCriteria } = parseStoryContent(rawMarkdown);
    stories.push({ id, title, description, acceptanceCriteria, rawMarkdown });
  };

  for (const line of lines) {
    // Match level 3–5 headings (###, ####, #####)
    const headingMatch = line.match(/^(#{3,5})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();

      if (isPhaseHeader(headingText)) {
        // Phase headers are group labels, not stories
        flushStory();
        currentHeadingText = null;
        currentLines = [];
        continue;
      }

      flushStory();
      currentHeadingText = headingText;
      currentLevel = level;
      currentLines = [];
    } else if (currentHeadingText !== null) {
      currentLines.push(line);
    }
  }

  flushStory();
  return stories;
}

/**
 * Parses a markdown PRD string into a structured ParsedPrd object.
 * All fields default to empty string if the section is absent.
 * Stories without explicit US-XXX IDs are assigned sequential IDs.
 */
export function parsePrd(markdown: string): ParsedPrd {
  const result: ParsedPrd = {
    title: '',
    introduction: '',
    goals: '',
    nonGoals: '',
    technicalConsiderations: '',
    functionalRequirements: '',
    designConsiderations: '',
    successMetrics: '',
    openQuestions: '',
    stories: [],
  };

  // Extract title from the first level-1 heading
  const titleMatch = markdown.match(/^# (.+)$/m);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  const sections = splitIntoSections(markdown);

  for (const { heading, content } of sections) {
    const normalized = normalizeHeading(heading);

    switch (normalized) {
      case 'introduction':
        result.introduction = content;
        break;
      case 'goals':
        result.goals = content;
        break;
      case 'non goals':
      case 'nongoals':
        result.nonGoals = content;
        break;
      case 'technical considerations':
        result.technicalConsiderations = content;
        break;
      case 'functional requirements':
        result.functionalRequirements = content;
        break;
      case 'design considerations':
        result.designConsiderations = content;
        break;
      case 'success metrics':
        result.successMetrics = content;
        break;
      case 'open questions':
        result.openQuestions = content;
        break;
      case 'user stories':
        result.stories = parseStories(content);
        break;
    }
  }

  return result;
}
