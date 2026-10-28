import { calculatePersonTotals, type Person } from "@/features/assignment/assignment-store";
import type { GeneratedReceiptItem } from "@/lib/receipt";

describe("common item distribution", () => {
  const people: Person[] = [
    { id: "p1", name: "Jamie" },
    { id: "p2", name: "Sam" },
    { id: "p3", name: "Alex" },
  ];
  const items: GeneratedReceiptItem[] = [
    { id: "common-item", label: "Fries #1", amountPaise: 14735, sourceLineId: "fries" },
    { id: "owned-item", label: "Tea #1", amountPaise: 10000, sourceLineId: "tea" },
  ];

  it("shares common paise evenly and counts assigned items once", () => {
    const result = calculatePersonTotals(people, items, {
      "common-item": "common",
      "owned-item": "p1",
    });
    expect(result.people.map(({ amountPaise }) => amountPaise)).toEqual([14912, 4912, 4911]);
    expect(result.commonPaise).toBe(14735);
    expect(result.unassignedCount).toBe(0);
    expect(result.assignedPaise).toBe(24735);
    expect(result.unassignedPaise).toBe(0);
    expect(result.people.reduce((sum, person) => sum + person.amountPaise, 0)).toBe(24735);
  });

  it("moves items to unassigned if a person is no longer present", () => {
    const result = calculatePersonTotals(people.slice(0, 1), items, {
      "common-item": null,
      "owned-item": "deleted",
    });
    expect(result.unassignedPaise).toBe(24735);
    expect(result.unassignedCount).toBe(2);
    expect(result.assignedPaise).toBe(0);
  });

  it("counts zero-value items as unassigned until they have an owner", () => {
    const result = calculatePersonTotals(
      people.slice(0, 1),
      [{ id: "free-item", label: "Taster #1", amountPaise: 0, sourceLineId: "taster" }],
      {},
    );
    expect(result.unassignedPaise).toBe(0);
    expect(result.unassignedCount).toBe(1);
  });
});
