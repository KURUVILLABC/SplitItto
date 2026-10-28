import { allocateProportionally, formatRupees, parseRupees, splitEqually } from "@/lib/money";

describe("money allocation", () => {
  it("allocates proportional paise with deterministic remainders", () => {
    expect(allocateProportionally(2100, [
      { id: "a", amount: 13000 },
      { id: "b", amount: 13000 },
      { id: "c", amount: 14000 },
    ])).toEqual([683, 682, 735]);
  });

  it("preserves exact value when splitting common items", () => {
    expect(splitEqually(14735, 3)).toEqual([4912, 4912, 4911]);
    expect(splitEqually(14735, 3).reduce((sum, value) => sum + value, 0)).toBe(14735);
  });

  it("parses and formats money without losing paise", () => {
    expect(parseRupees("1,234.56")).toBe(123456);
    expect(parseRupees("12.345")).toBeNull();
    expect(formatRupees(42100)).toContain("421.00");
  });

  it("rejects allocation without valid recipients", () => {
    expect(() => allocateProportionally(1, [])).toThrow();
    expect(() => splitEqually(1, 0)).toThrow();
  });
});
