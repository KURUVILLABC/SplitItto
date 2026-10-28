import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import { requireEnv, serverEnv } from "@/lib/env";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { saveLocalReceipt } from "@/lib/local-receipts";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

function hasExpectedSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    return bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  }
  if (mimeType === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  if (mimeType === "image/heic") {
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  }
  return false;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new HttpError("Choose a receipt image to upload.", 400);
    if (!allowedTypes.has(file.type)) {
      throw new HttpError("Upload a JPG, PNG, WEBP, or HEIC receipt image.", 415);
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      throw new HttpError("The image must be 4 MB or smaller.", 413);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasExpectedSignature(bytes, file.type)) {
      throw new HttpError("This file does not appear to be a valid image.", 415);
    }

    const cloudinaryKeys = [
      serverEnv.CLOUDINARY_CLOUD_NAME,
      serverEnv.CLOUDINARY_API_KEY,
      serverEnv.CLOUDINARY_API_SECRET,
    ];
    if (cloudinaryKeys.some((key) => !key)) {
      if (process.env.NODE_ENV === "production") {
        throw new HttpError("Receipt uploads are not configured on this server.", 503);
      }
      if (cloudinaryKeys.some(Boolean)) {
        throw new HttpError("Cloudinary is only partially configured. Complete its credentials or clear them for local development.", 503);
      }
      const imagePublicId = await saveLocalReceipt(bytes);
      return NextResponse.json(
        { imagePublicId, imageUrl: `local://${imagePublicId}`, storageProvider: "local" },
        { status: 201 },
      );
    }

    cloudinary.config({
      cloud_name: requireEnv("CLOUDINARY_CLOUD_NAME"),
      api_key: requireEnv("CLOUDINARY_API_KEY"),
      api_secret: requireEnv("CLOUDINARY_API_SECRET"),
      secure: true,
    });
    const uploaded = await new Promise<{
      imageUrl: string;
      imagePublicId: string;
      imageFormat: string;
    }>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: "billsplit/receipts",
          resource_type: "image",
          type: "private",
          allowed_formats: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
          overwrite: false,
          unique_filename: true,
          transformation: [{ width: 2400, height: 3200, crop: "limit", quality: "auto" }],
        },
        (error, result) => {
          if (error || !result) reject(error ?? new Error("Cloudinary returned no upload result."));
          else {
            const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
            resolve({
              imagePublicId: result.public_id,
              imageFormat: result.format,
              imageUrl: cloudinary.utils.private_download_url(result.public_id, result.format, {
                resource_type: "image",
                type: "private",
                expires_at: expiresAt,
              }),
            });
          }
        },
      );
      upload.end(Buffer.from(bytes));
    });
    return NextResponse.json({ ...uploaded, storageProvider: "cloudinary" }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
