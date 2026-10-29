import { v2 as cloudinary } from "cloudinary";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { OcrSpaceProvider } from "@/features/ocr/ocr-space";
import { parseReceiptText } from "@/features/ocr/receipt-parser";
import { extractReceiptWithGemini, reconcileReceipt } from "@/features/ocr/receipt-extractor";
import type { ReceiptData } from "@/lib/receipt";
import { requireEnv, serverEnv } from "@/lib/env";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { isLocalReceiptId, readLocalReceipt } from "@/lib/local-receipts";
import { enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";

async function readWithOcrSpace(url: string, bytes: Uint8Array, format: string): Promise<ReceiptData> {
  const result = await new OcrSpaceProvider().extractImage({ url, bytes, format });
  return { ...parseReceiptText(result.text), ocrProvider: result.provider };
}

const requestSchema = z.object({
  imagePublicId: z.string().min(1).max(255),
  imageUrl: z.string().min(1).max(2000),
  imageFormat: z.enum(["jpg", "jpeg", "png", "webp", "heic", "heif"]).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request);
    const { imagePublicId, imageUrl, imageFormat } = requestSchema.parse(await request.json());
    if (isLocalReceiptId(imagePublicId)) {
      if (process.env.NODE_ENV === "production" || imageUrl !== `local://${imagePublicId}`) {
        throw new HttpError("The local receipt identifier is not valid for this server.", 400);
      }
      const imageBytes = await readLocalReceipt(imagePublicId);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", undefined, {
        langPath: join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int"),
      });
      try {
        const result = await worker.recognize(imageBytes);
        if (!result.data.text.trim()) {
          throw new HttpError("No readable text was found. Try a clearer, well-lit receipt photo.", 422);
        }
        return NextResponse.json({
          ...parseReceiptText(result.data.text),
          ocrProvider: "tesseract-local",
          ocrConfidence: result.data.confidence,
        });
      } finally {
        await worker.terminate();
      }
    }

    if (!imagePublicId.startsWith("billsplit/receipts/") || !imageFormat) {
      throw new HttpError("The uploaded receipt identifier is invalid.", 400);
    }
    if (
      !serverEnv.CLOUDINARY_CLOUD_NAME ||
      !serverEnv.CLOUDINARY_API_KEY ||
      !serverEnv.CLOUDINARY_API_SECRET
    ) {
      throw new HttpError("Cloudinary is not configured for receipt OCR on this server.", 503);
    }
    cloudinary.config({
      cloud_name: requireEnv("CLOUDINARY_CLOUD_NAME"),
      api_key: requireEnv("CLOUDINARY_API_KEY"),
      api_secret: requireEnv("CLOUDINARY_API_SECRET"),
      secure: true,
    });
    // Build the signed download URL on the server from the verified public ID.
    // Comparing against a client-supplied URL fails because the signature embeds a timestamp.
    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
    const ocrImageUrl = cloudinary.utils.private_download_url(imagePublicId, imageFormat, {
      resource_type: "image",
      type: "private",
      expires_at: expiresAt,
    });
    let receipt: ReceiptData;
    let geminiDebug = "";
    try {
      const imageResponse = await fetch(ocrImageUrl, { signal: AbortSignal.timeout(20_000) });
      if (!imageResponse.ok) {
        throw new Error(`Could not download receipt image from Cloudinary (${imageResponse.status}).`);
      }
      const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
      if (serverEnv.GEMINI_API_KEY) {
        try {
          const extraction = await extractReceiptWithGemini({
            apiKey: serverEnv.GEMINI_API_KEY,
            model: serverEnv.GEMINI_MODEL,
            bytes: imageBytes,
            format: imageFormat,
            timeoutMs: 8_500,
          });
          receipt = { ...extraction.receipt, ocrText: extraction.rawResponse, ocrProvider: "gemini" };
        } catch (geminiError) {
          geminiDebug = geminiError instanceof Error ? geminiError.message : String(geminiError);
          receipt = await readWithOcrSpace(ocrImageUrl, imageBytes, imageFormat);
        }
      } else {
        receipt = await readWithOcrSpace(ocrImageUrl, imageBytes, imageFormat);
      }
    } catch (ocrError) {
      const detail = ocrError instanceof Error ? ocrError.message : "Unknown error.";
      throw new HttpError(`Receipt reading failed: ${detail}`, 502);
    }
    const reconciled = reconcileReceipt(receipt);
    const verifyWarning =
      receipt.ocrProvider === "gemini"
        ? null
        : "This bill was read with basic OCR, which can misread names and amounts. Check every item, quantity, price, tax and total against the bill before continuing.";
    const warning = [reconciled.warning, verifyWarning, geminiDebug && `DEBUG: ${geminiDebug}`].filter(Boolean).join(" ") || null;
    return NextResponse.json({ ...reconciled.receipt, warning });
  } catch (error) {
    return jsonError(error);
  }
}
