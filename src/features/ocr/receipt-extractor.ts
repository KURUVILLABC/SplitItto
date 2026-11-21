import { z } from "zod";
import { formatRupees, parseRupees } from "@/lib/money";
import type { ReceiptData } from "@/lib/receipt";

const PROMPT = [
  "You are reading a photo of a restaurant or shop bill.",
  "Extract the bill exactly as printed. Do not guess, correct, or compute values that are not printed.",
  "items: one entry per printed line item. name is copied exactly as printed.",
  "quantity is the printed quantity, or 1 if none is printed.",
  "amount is the printed amount for that row (quantity times unit price), as a plain decimal such as 3538.00, with no currency symbol or commas.",
  "subtotal is the printed subtotal or net amount before tax, as a plain decimal.",
  "taxAndCharges is the sum of all printed GST, CGST, SGST, IGST, VAT, service charge and other charge lines, as a plain decimal. Use 0.00 if none.",
  "total is the printed grand total or amount payable, as a plain decimal.",
  "receiptDate is the bill date in YYYY-MM-DD form, or an empty string if not printed.",
  "merchantName is the shop or restaurant name.",
].join("\n");

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    merchantName: { type: "STRING" },
    receiptDate: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          quantity: { type: "INTEGER" },
          amount: { type: "STRING" },
        },
        required: ["name", "quantity", "amount"],
      },
    },
    subtotal: { type: "STRING" },
    taxAndCharges: { type: "STRING" },
    total: { type: "STRING" },
  },
  required: ["merchantName", "receiptDate", "items", "subtotal", "taxAndCharges", "total"],
};

const modelOutputSchema = z.object({
  merchantName: z.string().max(120),
  receiptDate: z.string(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        quantity: z.number().int().min(1).max(50),
        amount: z.string(),
      }),
    )
    .min(1)
    .max(50),
  subtotal: z.string(),
  taxAndCharges: z.string(),
  total: z.string(),
});

type ModelOutput = z.infer<typeof modelOutputSchema>;

const mimeByFormat: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

function toPaise(value: string, label: string): number {
  const paise = parseRupees(value);
  if (paise === null) throw new Error(`Could not read the ${label} amount "${value}".`);
  return paise;
}

export function toReceiptData(output: ModelOutput): ReceiptData {
  const items = output.items.map((item) => ({
    id: crypto.randomUUID(),
    name: item.name,
    quantity: item.quantity,
    amountPaise: toPaise(item.amount, `"${item.name}"`),
  }));
  return {
    merchantName: output.merchantName.trim(),
    receiptDate: /^\d{4}-\d{2}-\d{2}$/.test(output.receiptDate) ? output.receiptDate : "",
    items,
    subtotalPaise: toPaise(output.subtotal, "subtotal"),
    taxPaise: toPaise(output.taxAndCharges, "tax"),
    totalPaise: toPaise(output.total, "total"),
  };
}

export function findArithmeticMismatch(receipt: ReceiptData): string | null {
  const itemSum = receipt.items.reduce((sum, item) => sum + item.amountPaise, 0);
  if (itemSum !== receipt.subtotalPaise) {
    return `The item amounts add up to ${formatRupees(itemSum)} but the subtotal is ${formatRupees(receipt.subtotalPaise)}.`;
  }
  if (receipt.subtotalPaise + receipt.taxPaise !== receipt.totalPaise) {
    return `The subtotal plus tax is ${formatRupees(receipt.subtotalPaise + receipt.taxPaise)} but the total is ${formatRupees(receipt.totalPaise)}.`;
  }
  return null;
}

export function reconcileReceipt(receipt: ReceiptData): { receipt: ReceiptData; warning: string | null } {
  const warning = findArithmeticMismatch(receipt);
  const subtotalPaise = receipt.items.reduce((sum, item) => sum + item.amountPaise, 0);
  return {
    receipt: { ...receipt, subtotalPaise, totalPaise: subtotalPaise + receipt.taxPaise },
    warning: warning ? `${warning} Check the item amounts against the bill before continuing.` : null,
  };
}

export class GeminiApiError extends Error {
  constructor(readonly status: number, detail: string) {
    super(`Gemini request failed (${status}): ${detail}`);
    this.name = "GeminiApiError";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function extractReceiptWithGemini(input: {
  accessToken: string;
  model: string;
  bytes: Uint8Array;
  format: string;
  timeoutMs: number;
}): Promise<{ receipt: ReceiptData; rawResponse: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${input.accessToken}` },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              {
                inline_data: {
                  mime_type: mimeByFormat[input.format] ?? "image/jpeg",
                  data: bytesToBase64(input.bytes),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          thinkingConfig: input.model.startsWith("gemini-3") ? { thinkingLevel: "low" } : { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(input.timeoutMs),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new GeminiApiError(response.status, detail);
  }
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawResponse = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!rawResponse) throw new Error("Gemini returned no receipt data.");
  const output = modelOutputSchema.parse(JSON.parse(rawResponse));
  return { receipt: toReceiptData(output), rawResponse };
}

// Only a Gemini 5xx is retried. Auth, access, quota, and timeout failures would fail the same way again.
export async function extractReceiptFromImage(
  input: Omit<Parameters<typeof extractReceiptWithGemini>[0], "timeoutMs">,
): Promise<{ receipt: ReceiptData; rawResponse: string }> {
  let lastError: unknown = new Error("Gemini did not respond in time.");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await extractReceiptWithGemini({ ...input, timeoutMs: 45_000 });
    } catch (error) {
      lastError = error;
      if (!(error instanceof GeminiApiError) || error.status < 500) break;
    }
  }
  throw lastError;
}

export function geminiErrorMessage(error: unknown): string {
  if (error instanceof GeminiApiError) {
    if (error.status === 401) return "Gemini rejected your Google sign-in. Sign out, sign in again, and retry.";
    if (error.status === 403) {
      return "Gemini access was not granted for this Google account. Approve Gemini access when signing in, and make sure the Generative Language API is enabled for this app. Then sign in again.";
    }
    if (error.status === 404) return "The configured Gemini model is not available. Ask the site administrator to check GEMINI_MODEL.";
    if (error.status === 429) {
      return "Your Gemini quota is used up or billing is not enabled for this Google account. Try again later or check your Gemini plan.";
    }
    if (error.status >= 500) return "Gemini is busy right now. Try again in a moment.";
    return "Gemini could not process this image. Try a clearer photo or enter the items manually.";
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "Gemini did not respond in time. Try again.";
  }
  return "Gemini could not read this receipt. Try a clearer photo or enter the items manually.";
}
