import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import { extractReceiptWithGemini, GeminiApiError, reconcileReceipt } from "@/features/ocr/receipt-extractor";
import type { ReceiptData } from "@/lib/receipt";
import { requireEnv, serverEnv } from "@/lib/env";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { requireGoogleAccessToken } from "@/lib/google-session";
import { isLocalReceiptId, readLocalReceipt } from "@/lib/local-receipts";
import { enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  imagePublicId: z.string().min(1).max(255),
  imageUrl: z.string().min(1).max(2000),
  imageFormat: z.enum(["jpg", "jpeg", "png", "webp", "heic", "heif"]).optional(),
});

// Gemini gets two attempts inside one 16 s budget. Only Gemini 5xx responses are retried;
// auth, access, quota, and timeout failures would fail the same way again.
// The image download (8 s) runs first, so the whole request stays under the 26 s function limit.
const GEMINI_BUDGET_MS = 16_000;

async function readWithGemini(
  accessToken: string,
  bytes: Uint8Array,
  format: string,
  model: string,
): Promise<ReceiptData> {
  const deadline = Date.now() + GEMINI_BUDGET_MS;
  let lastError: unknown = new Error("Gemini did not respond in time.");
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;
    try {
      const extraction = await extractReceiptWithGemini({
        accessToken,
        model,
        bytes,
        format,
        timeoutMs: remaining,
      });
      return { ...extraction.receipt, ocrText: extraction.rawResponse, ocrProvider: "gemini" };
    } catch (error) {
      lastError = error;
      if (!(error instanceof GeminiApiError) || error.status < 500) break;
    }
  }
  throw lastError;
}

function geminiFailureToHttpError(error: unknown): HttpError {
  if (error instanceof GeminiApiError) {
    if (error.status === 401) {
      return new HttpError("Gemini rejected your Google sign-in. Sign out, sign in again, and retry.", 401);
    }
    if (error.status === 403) {
      return new HttpError(
        "Gemini access was not granted for this Google account. Approve Gemini access when signing in, and make sure the Generative Language API is enabled for this app. Then sign in again.",
        403,
      );
    }
    if (error.status === 404) {
      return new HttpError("The configured Gemini model is not available. Ask the site administrator to check GEMINI_MODEL.", 502);
    }
    if (error.status === 429) {
      return new HttpError(
        "Your Gemini quota is used up or billing is not enabled for this Google account. Try again later or check your Gemini plan.",
        429,
      );
    }
    if (error.status >= 500) {
      return new HttpError("Gemini is busy right now. Try again in a moment.", 503);
    }
    return new HttpError("Gemini could not process this image. Try a clearer photo or enter the items manually.", 502);
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new HttpError("Gemini did not respond in time. Try again.", 504);
  }
  return new HttpError("Gemini could not read this receipt. Try a clearer photo or enter the items manually.", 502);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const accessToken = await requireGoogleAccessToken(request);
    await enforceRateLimit(request);
    const { imagePublicId, imageUrl, imageFormat } = requestSchema.parse(await request.json());
    if (isLocalReceiptId(imagePublicId)) {
      if (process.env.NODE_ENV === "production" || imageUrl !== `local://${imagePublicId}`) {
        throw new HttpError("The local receipt identifier is not valid for this server.", 400);
      }
      const imageBytes = await readLocalReceipt(imagePublicId);
      let receipt: ReceiptData;
      try {
        receipt = await readWithGemini(accessToken, imageBytes, imageFormat ?? "jpg", serverEnv.GEMINI_MODEL);
      } catch (ocrError) {
        throw geminiFailureToHttpError(ocrError);
      }
      const reconciled = reconcileReceipt(receipt);
      return NextResponse.json({ ...reconciled.receipt, warning: reconciled.warning });
    }

    if (!imagePublicId.startsWith("billsplit/receipts/") || !imageFormat) {
      throw new HttpError("The uploaded receipt identifier is invalid.", 400);
    }
    if (
      !serverEnv.CLOUDINARY_CLOUD_NAME ||
      !serverEnv.CLOUDINARY_API_KEY ||
      !serverEnv.CLOUDINARY_API_SECRET
    ) {
      throw new HttpError("Cloudinary is not configured for receipt reading on this server.", 503);
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
    const imageDownloadUrl = cloudinary.utils.private_download_url(imagePublicId, imageFormat, {
      resource_type: "image",
      type: "private",
      expires_at: expiresAt,
    });
    let receipt: ReceiptData;
    let imageBytes: Uint8Array;
    try {
      const imageResponse = await fetch(imageDownloadUrl, { signal: AbortSignal.timeout(8_000) });
      if (!imageResponse.ok) throw new Error(`Cloudinary download failed (${imageResponse.status}).`);
      imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
    } catch {
      throw new HttpError("Could not load the uploaded receipt image. Upload it again.", 502);
    }
    try {
      receipt = await readWithGemini(accessToken, imageBytes, imageFormat, serverEnv.GEMINI_MODEL);
    } catch (ocrError) {
      throw geminiFailureToHttpError(ocrError);
    }
    const reconciled = reconcileReceipt(receipt);
    return NextResponse.json({ ...reconciled.receipt, warning: reconciled.warning });
  } catch (error) {
    return jsonError(error);
  }
}
