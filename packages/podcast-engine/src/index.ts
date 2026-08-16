export * from "./ids.ts";
export * from "./schema.ts";
export * from "./budget.ts";

// Named rather than `export *`: `allocateCharacters` is exported from
// apportion.ts so its conservation invariant is directly testable, but it is a
// mechanism rather than a contract and does not belong on the package surface.
export { apportion } from "./apportion.ts";
export type { ApportionResult } from "./apportion.ts";

export * from "./plan.ts";
