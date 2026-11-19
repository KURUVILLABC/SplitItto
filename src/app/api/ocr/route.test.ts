const extractReceiptWithGemini = jest.fn();

jest.mock("@/features/ocr/receipt-extractor", () => {
  const actual = jest.requireActual("@/features/ocr/receipt-extractor");
  return { ...actual, extractReceiptWithGemini: (...args: unknown[]) => extractReceiptWithGemini(...args) };
});

jest.mock("@/lib/google-session", () => ({
  requireGoogleAccessToken: jest.fn(),
}));

jest.mock("@/lib/local-receipts", () => ({
  isLocalReceiptId: (id: string) => id.startsWith("local-"),
  readLocalReceipt: jest.fn().mockResolvedValue(Buffer.from("sample-image")),
}));

jest.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: jest.fn().mockResolvedValue(undefined),
}));

const geminiReceipt = {
  merchantName: "Blueleaf Bistro",
  receiptDate: "2025-12-21",
  items: [
    { name: "Masala Dosa", quantity: 2, amountPaise: 353800 },
    { name: "Veg Biryani", quantity: 3, amountPaise: 374700 },
  ],
  subtotalPaise: 728500,
  taxPaise: 65646,
  totalPaise: 794146,
  ocrProvider: "gemini",
};

describe("POST /api/ocr", () => {
  beforeEach(() => {
    extractReceiptWithGemini.mockReset();
    extractReceiptWithGemini.mockResolvedValue({ receipt: geminiReceipt, rawResponse: "{}" });
  });

  it("rejects requests from users who are not signed in with Google", async () => {
    const { requireGoogleAccessToken } = await import("@/lib/google-session");
    const { HttpError } = await import("@/lib/http");
    (requireGoogleAccessToken as jest.Mock).mockRejectedValueOnce(
      new HttpError("Sign in with Google to upload and read receipts.", 401),
    );
    const { POST } = await import("@/app/api/ocr/route");
    const response = await POST(new Request("http://localhost/api/ocr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imagePublicId: "local-12345678-1234-1234-1234-123456789abc",
        imageUrl: "local://local-12345678-1234-1234-1234-123456789abc",
      }),
    }));
    expect(response.status).toBe(401);
    expect(extractReceiptWithGemini).not.toHaveBeenCalled();
  });

  it("reads a local-development image with the signed-in user's Gemini token", async () => {
    const { requireGoogleAccessToken } = await import("@/lib/google-session");
    (requireGoogleAccessToken as jest.Mock).mockResolvedValueOnce("user-oauth-token");
    const { POST } = await import("@/app/api/ocr/route");
    const response = await POST(new Request("http://localhost/api/ocr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imagePublicId: "local-12345678-1234-1234-1234-123456789abc",
        imageUrl: "local://local-12345678-1234-1234-1234-123456789abc",
        imageFormat: "png",
      }),
    }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(extractReceiptWithGemini).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "user-oauth-token", format: "png" }),
    );
    expect(result).toMatchObject({ merchantName: "Blueleaf Bistro", ocrProvider: "gemini", warning: null });
    expect(result.items).toHaveLength(2);
  });

  it.each([
    [403, 403, /Gemini access was not granted/],
    [429, 429, /quota is used up or billing/],
    [400, 502, /could not process this image/],
  ])("maps Gemini %i to %i without leaking the raw Google response", async (geminiStatus, expected, message) => {
    const { requireGoogleAccessToken } = await import("@/lib/google-session");
    const { GeminiApiError } = await import("@/features/ocr/receipt-extractor");
    (requireGoogleAccessToken as jest.Mock).mockResolvedValueOnce("user-oauth-token");
    extractReceiptWithGemini.mockRejectedValue(new GeminiApiError(geminiStatus, "raw google detail"));
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
    expect(response.status).toBe(expected);
    expect(result.error).toMatch(message);
    expect(result.error).not.toContain("raw google detail");
    expect(extractReceiptWithGemini).toHaveBeenCalledTimes(1);
  });

  it("retries a Gemini 5xx once and then reports it as busy", async () => {
    const { requireGoogleAccessToken } = await import("@/lib/google-session");
    const { GeminiApiError } = await import("@/features/ocr/receipt-extractor");
    (requireGoogleAccessToken as jest.Mock).mockResolvedValueOnce("user-oauth-token");
    extractReceiptWithGemini.mockRejectedValue(new GeminiApiError(503, "overloaded"));
    const { POST } = await import("@/app/api/ocr/route");
    const response = await POST(new Request("http://localhost/api/ocr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imagePublicId: "local-12345678-1234-1234-1234-123456789abc",
        imageUrl: "local://local-12345678-1234-1234-1234-123456789abc",
      }),
    }));
    expect(response.status).toBe(503);
    expect(extractReceiptWithGemini).toHaveBeenCalledTimes(2);
  });
});
