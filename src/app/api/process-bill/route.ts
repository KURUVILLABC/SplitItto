import { NextResponse } from "next/server";
import { expandReceiptItems, type ReceiptData, validateReceipt } from "@/lib/receipt";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { safeText } from "@/lib/validation";
import { z } from "zod";

const receiptSchema = z.object({
  merchantName: safeText(120),
  receiptDate: z.string(),
  items: z.array(
    z.object({
      id: z.string().min(1).max(100),
      name: safeText(120),
      quantity: z.number().int().positive().max(1000),
      amountPaise: z.number().int().nonnegative().safe(),
    }),
  ).max(1000),
  subtotalPaise: z.number().int().nonnegative().safe(),
  taxPaise: z.number().int().nonnegative().safe(),
  totalPaise: z.number().int().nonnegative().safe(),
  imagePublicId: z.string().max(200).optional(),
  ocrText: z.string().max(20_000).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request);
    const receipt = receiptSchema.parse(await request.json()) as ReceiptData;
    const errors = validateReceipt(receipt);
    if (errors.length > 0) throw new HttpError(errors.join(" "), 422);
    const itemCount = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
    if (itemCount > 50) {
      throw new HttpError(
        "This receipt contains more than 50 items. Support for larger receipts is currently under development.",
        422,
      );
    }
    const generatedItems = expandReceiptItems(receipt.items, receipt.taxPaise);
    if (generatedItems.reduce((sum, item) => sum + item.amountPaise, 0) !== receipt.totalPaise) {
      throw new HttpError("Generated item values do not match the receipt total.", 422);
    }
    return NextResponse.json({ generatedItems });
  } catch (error) {
    return jsonError(error);
  }
}
