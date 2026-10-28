import { POST } from "@/app/api/validate-bill/route";

describe("POST /api/validate-bill", () => {
  const validBill = {
    totalPaise: 42100,
    items: [
      { id: "a-1", amountPaise: 13683 },
      { id: "a-2", amountPaise: 13682 },
      { id: "b-1", amountPaise: 14735 },
    ],
    people: [
      { id: "person-a", name: "Jamie" },
      { id: "person-b", name: "Sam" },
    ],
    assignments: [
      { itemId: "a-1", targetId: "person-a" },
      { itemId: "a-2", targetId: "person-a" },
      { itemId: "b-1", targetId: "common" },
    ],
  };

  it("accepts a complete split that exactly matches the receipt", async () => {
    const response = await POST(new Request("http://localhost/api/validate-bill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBill),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ valid: true, assignedTotalPaise: 42100, errors: [] });
  });

  it("rejects duplicated assignments and leaves incomplete items unassigned", async () => {
    const response = await POST(new Request("http://localhost/api/validate-bill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...validBill,
        assignments: [
          ...validBill.assignments,
          { itemId: "a-1", targetId: "person-b" },
        ],
      }),
    }));
    const result = await response.json();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("An item cannot be assigned more than once.");
  });
});
