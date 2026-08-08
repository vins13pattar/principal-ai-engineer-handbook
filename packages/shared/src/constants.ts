export const DIFFICULTY_LEVELS = ["foundational", "intermediate", "advanced", "expert"] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/**
 * A lab's maturity, as claimed on its Build page.
 *
 * `production-shaped` is the honest middle: the architecture, tests, and
 * failure handling are real, but something a production deployment requires is
 * deliberately simulated — an in-memory store standing in for a database, a
 * deterministic fake standing in for a model provider, no container or deploy
 * manifest. Tests passing is not the bar for `production-ready`; a lab only
 * earns that once its remaining stand-ins have a real integration path.
 */
export const LAB_STATUSES = [
  "planned",
  "in-progress",
  "production-shaped",
  "production-ready",
] as const;

export type LabStatus = (typeof LAB_STATUSES)[number];

export const ADR_STATUSES = ["proposed", "accepted", "deprecated", "superseded"] as const;

export type AdrStatus = (typeof ADR_STATUSES)[number];

export const ARCHITECTURE_MATURITY = ["reference", "battle-tested", "emerging"] as const;

export type ArchitectureMaturity = (typeof ARCHITECTURE_MATURITY)[number];

/** Learn track modules, in canonical reading order. Index doubles as the module number. */
export const LEARN_MODULES = [
  "principal-engineer-mindset",
  "production-python",
  "distributed-systems",
  "networking",
  "ai-infrastructure",
  "agent-engineering",
  "mcp",
  "langgraph",
  "rag",
  "model-serving",
  "kubernetes",
  "cloud",
  "observability",
  "system-design",
  "leadership",
] as const;

export type LearnModuleSlug = (typeof LEARN_MODULES)[number];
