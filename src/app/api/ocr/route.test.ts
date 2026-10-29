jest.mock("@/features/ocr/ocr-space", () => ({
  OcrSpaceProvider: class {
    async extract() {
      return {
        text: "Olive Kitchen\n01/01/2026\n2 x Product A 260.00\nProduct B 140.00\nGST 21.00\nGrand Total 421.00",
        provider: "google-vision",
      };
    }
  },
}));

jest.mock("@/lib/local-receipts", () => ({
  isLocalReceiptId: (id: string) => id.startsWith("local-"),
  readLocalReceipt: jest.fn().mockResolvedValue(Buffer.from("sample-image")),
}));

jest.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("tesseract.js", () => ({
  createWorker: jest.fn().mockResolvedValue({
    recognize: jest.fn().mockResolvedValue({
      data: {
        text: [
          "Blueleaf Bistro",
          "21/12/2025",
          "2 x Masala Dosa 3538.00",
          "3 x Veg Biryani 3747.00",
          "1 x Paneer Butter 3295.00",
          "Masala",
          "2 x Veg Biryani 3790.00",
          "2 x Hakka Noodles 3878.00",
          "1 x Butter Naan 3399.00",
          "SUBTOTAL: 33,647.00",
          "CGST (9%): 3328.23",
          "SGST (9%): 3328.23",
          "TOTAL: %4,303.46",
        ].join("\n"),
        confidence: 88,
      },
    }),
    terminate: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe("POST /api/ocr", () => {
  it("processes a local-development image through OCR and returns parsed data", async () => {
    const { POST } = await import("@/app/api/ocr/route");
    const response = await POST(new Request("http://localhost/api/ocr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imagePublicId: "local-12345678-1234-1234-1234-123456789abc",
        imageUrl: "local://local-12345678-1234-1234-1234-123456789abc",
      }),
    }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      merchantName: "Blueleaf Bistro",
      subtotalPaise: 364700,
      taxPaise: 65646,
      totalPaise: 430346,
      ocrProvider: "tesseract-local",
    });
    expect(result.items).toHaveLength(6);
    expect(result.items[2].name).toBe("Paneer Butter Masala");
  });

});
