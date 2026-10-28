import { POST } from "@/app/api/process-bill/route";

describe("POST /api/process-bill", () => {
  it("returns unit items whose paise total exactly reconciles", async () => {
    const response = await POST(new Request("http://localhost/api/process-bill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        merchantName: "Olive",
        receiptDate: "2026-01-01",
        items: [
          { id: "a", name: "A", quantity: 2, amountPaise: 26000 },
          { id: "b", name: "B", quantity: 1, amountPaise: 14000 },
        ],
        subtotalPaise: 40000,
        taxPaise: 2100,
        totalPaise: 42100,
      }),
    }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.generatedItems.reduce(
      (sum: number, item: { amountPaise: number }) => sum + item.amountPaise,
      0,
    )).toBe(42100);
  });

  it("rejects more than fifty expanded items before allocating", async () => {
    const response = await POST(new Request("http://localhost/api/process-bill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        merchantName: "Olive",
        receiptDate: "2026-01-01",
        items: [{ id: "a", name: "A", quantity: 51, amountPaise: 5100 }],
        subtotalPaise: 5100,
        taxPaise: 0,
        totalPaise: 5100,
      }),
    }));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("more than 50 items");
  });
});
