interface HasLastUpdated {
  data: {
    lastUpdated?: Date;
  };
}

/** Newest first; entries without a `lastUpdated` sort last. */
export function sortByLastUpdatedDesc<T extends HasLastUpdated>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) => (b.data.lastUpdated?.getTime() ?? 0) - (a.data.lastUpdated?.getTime() ?? 0),
  );
}
