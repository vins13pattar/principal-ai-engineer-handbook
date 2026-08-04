import { describe, expect, it } from "vitest";
import { sortByLastUpdatedDesc } from "./sort";

describe("sortByLastUpdatedDesc", () => {
  it("orders entries from most to least recently updated", () => {
    const entries = [
      { id: "a", data: { lastUpdated: new Date("2026-01-01") } },
      { id: "b", data: { lastUpdated: new Date("2026-06-01") } },
      { id: "c", data: { lastUpdated: new Date("2026-03-01") } },
    ];

    expect(sortByLastUpdatedDesc(entries).map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts entries without lastUpdated to the end", () => {
    const entries = [
      { id: "no-date", data: {} },
      { id: "dated", data: { lastUpdated: new Date("2026-01-01") } },
    ];

    expect(sortByLastUpdatedDesc(entries).map((e) => e.id)).toEqual(["dated", "no-date"]);
  });

  it("does not mutate the input array", () => {
    const entries = [
      { id: "a", data: { lastUpdated: new Date("2026-01-01") } },
      { id: "b", data: { lastUpdated: new Date("2026-06-01") } },
    ];
    const original = [...entries];

    sortByLastUpdatedDesc(entries);

    expect(entries).toEqual(original);
  });
});
