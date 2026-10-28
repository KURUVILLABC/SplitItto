import { v2 as cloudinary } from "cloudinary";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { GoogleVisionProvider } from "@/features/ocr/google-vision";
import { parseReceiptText } from "@/features/ocr/receipt-parser";
import { requireEnv, serverEnv } from "@/lib/env";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { isLocalReceiptId, readLocalReceipt } from "@/lib/local-receipts";
import { enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";

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
    const cloudName = requireEnv("CLOUDINARY_CLOUD_NAME");
    cloudinary.config({
      cloud_name: cloudName,
      api_key: requireEnv("CLOUDINARY_API_KEY"),
      api_secret: requireEnv("CLOUDINARY_API_SECRET"),
      secure: true,
    });
    const parsedUrl = new URL(imageUrl);
    const expiresAt = Number(parsedUrl.searchParams.get("expires_at"));
    const expectedUrl =
      Number.isSafeInteger(expiresAt) &&
      expiresAt * 1000 > Date.now() &&
      expiresAt * 1000 <= Date.now() + 16 * 60 * 1000
        ? cloudinary.utils.private_download_url(imagePublicId, imageFormat, {
            resource_type: "image",
            type: "private",
            expires_at: expiresAt,
          })
        : "";
    if (
      parsedUrl.hostname !== "api.cloudinary.com" ||
      parsedUrl.pathname !== `/v1_1/${cloudName}/image/download` ||
      parsedUrl.searchParams.get("public_id") !== imagePublicId ||
      parsedUrl.searchParams.get("type") !== "private" ||
      !Number.isSafeInteger(expiresAt) ||
      imageUrl !== expectedUrl
    ) {
      throw new HttpError("The receipt image URL is not a trusted upload.", 400);
    }
    const result = await new GoogleVisionProvider().extract(imageUrl);
    return NextResponse.json({ ...parseReceiptText(result.text), ocrProvider: result.provider });
  } catch (error) {
    return jsonError(error);
  }
}
