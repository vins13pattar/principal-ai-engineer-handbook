export type FreshnessStatus = "fresh" | "aging" | "stale";

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;

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
