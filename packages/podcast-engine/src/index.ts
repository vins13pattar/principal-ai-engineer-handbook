export * from "./ids.ts";
export * from "./schema.ts";
export * from "./budget.ts";

// Named rather than `export *`: `allocateCharacters` is exported from
// apportion.ts so its conservation invariant is directly testable, but callers
// of this package plan episodes through `apportion`, `planEpisode`, and the
// rest of the surface below -- none of them need to split a character count
// across weights themselves, so `allocateCharacters` stays off the surface.
export { apportion } from "./apportion.ts";
export type { ApportionResult } from "./apportion.ts";

export * from "./plan.ts";

export * from "./dialogue.ts";
export * from "./episode.ts";
export * from "./create.ts";

export * from "./config.ts";
export * from "./run.ts";
export * from "./manifest.ts";
export * from "./estimate.ts";
