export type FreshnessStatus = "fresh" | "aging" | "stale";

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Classifies a page's age since `lastUpdated` so listings/badges can surface
 * content that needs a maintainer pass, independent of its semver `version`.
 */
export function getFreshnessStatus(
  lastUpdated: Date,
  now: Date = new Date(),
  thresholds: { agingAfterMonths: number; staleAfterMonths: number } = {
    agingAfterMonths: 6,
    staleAfterMonths: 12,
  },
): FreshnessStatus {
  const ageInMonths = (now.getTime() - lastUpdated.getTime()) / MS_PER_MONTH;

  if (ageInMonths >= thresholds.staleAfterMonths) return "stale";
  if (ageInMonths >= thresholds.agingAfterMonths) return "aging";
  return "fresh";
}

/**
 * How quickly a topic's underlying subject matter changes, independent of how
 * long ago the page was edited.
 *
 * The distinction matters because `getFreshnessStatus` above measures editorial
 * age, which is the wrong instrument for a protocol. A page on MCP can be two
 * months old and already wrong; a page on TCP backpressure can be two years old
 * and still correct. Age-based staleness would flag the second and miss the
 * first — exactly backwards.
 */
export const FRESHNESS_CLASSIFICATIONS = ["stable", "slow-moving", "fast-moving"] as const;

export type FreshnessClassification = (typeof FRESHNESS_CLASSIFICATIONS)[number];

/**
 * Default review windows per classification, in days. A fast-moving page is due
 * for a maintainer pass roughly quarterly because that is the observed cadence
 * of breaking change in this space — the MCP specification shipped a
 * stateless-protocol rewrite roughly eight months after the previous revision,
 * which an annual review cycle would have missed by two quarters.
 */
export const DEFAULT_REVIEW_AFTER_DAYS: Record<FreshnessClassification, number> = {
  stable: 540,
  "slow-moving": 270,
  "fast-moving": 90,
};

export interface FreshnessDeclaration {
  classification: FreshnessClassification;
  /**
   * The external artifact this page's claims were checked against — a
   * specification revision, SDK version, or API version (e.g. "MCP 2026-07-28").
   * Required for fast-moving pages: "we reviewed this" is not a useful claim
   * without saying what it was reviewed *against*.
   */
  verifiedAgainst?: string;
  /** When that verification was actually performed. */
  verifiedOn?: Date;
  /** Overrides the classification default when a topic needs a tighter window. */
  reviewAfterDays?: number;
}

export interface ReviewStatus {
  /** True once the review window has elapsed since `verifiedOn`. */
  overdue: boolean;
  /** Days until review is due; negative once overdue. */
  daysRemaining: number;
  /** The window actually applied, after any per-page override. */
  reviewAfterDays: number;
}

/**
 * Reports whether a page has exceeded the review window for its classification.
 *
 * Returns `overdue: false` when `verifiedOn` is absent — the linter reports a
 * missing declaration as its own distinct failure, so treating "never verified"
 * as overdue here would double-report the same problem.
 */
export function getReviewStatus(
  declaration: FreshnessDeclaration,
  now: Date = new Date(),
): ReviewStatus {
  const reviewAfterDays =
    declaration.reviewAfterDays ?? DEFAULT_REVIEW_AFTER_DAYS[declaration.classification];

  if (!declaration.verifiedOn) {
    return { overdue: false, daysRemaining: reviewAfterDays, reviewAfterDays };
  }

  const daysSince = (now.getTime() - declaration.verifiedOn.getTime()) / MS_PER_DAY;
  const daysRemaining = Math.ceil(reviewAfterDays - daysSince);
  return { overdue: daysRemaining < 0, daysRemaining, reviewAfterDays };
}
