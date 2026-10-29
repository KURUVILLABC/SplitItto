import { requireEnv } from "@/lib/env";
import type { OcrImageSource, OcrProvider, OcrResult } from "@/features/ocr/provider";

interface VisionResponse {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    error?: { message?: string };
  }>;
}

export class GoogleVisionProvider implements OcrProvider {
  async extract(imageUrl: string): Promise<OcrResult> {
    return this.extractImage({ url: imageUrl, bytes: new Uint8Array() });
  }

  async extractImage(source: OcrImageSource): Promise<OcrResult> {
    const apiKey = requireEnv("GOOGLE_VISION_API_KEY");
    const image = source.bytes.byteLength > 0
      ? { content: Buffer.from(source.bytes).toString("base64") }
      : { source: { imageUri: source.url } };
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image,
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) throw new Error(`Google Vision request failed (${response.status}).`);
    const result = (await response.json()) as VisionResponse;
    const first = result.responses?.[0];
    if (first?.error?.message) throw new Error(`Google Vision: ${first.error.message}`);
    const text = first?.fullTextAnnotation?.text?.trim();
    if (!text) throw new Error("No readable text was found in the receipt image.");
    return { text, provider: "google-vision" };
  }
}
