import { requireEnv } from "@/lib/env";
import type { OcrImageSource, OcrProvider, OcrResult } from "@/features/ocr/provider";

interface OcrSpaceResponse {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string[] | string | null;
  ParsedResults?: Array<{ ParsedText?: string; FileParseExitCode?: number; ErrorMessage?: string }>;
}

const mimeByFormat: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export class OcrSpaceProvider implements OcrProvider {
  async extract(imageUrl: string): Promise<OcrResult> {
    return this.extractImage({ url: imageUrl, bytes: new Uint8Array() });
  }

  async extractImage(source: OcrImageSource & { format?: string }): Promise<OcrResult> {
    const apiKey = requireEnv("OCR_SPACE_API_KEY");
    const form = new FormData();
    form.append("apikey", apiKey);
    form.append("language", "eng");
    form.append("OCREngine", "2");
    form.append("scale", "true");
    form.append("isTable", "false");
    if (source.bytes.byteLength > 0) {
      const mime = mimeByFormat[source.format ?? ""] ?? "image/jpeg";
      form.append("base64Image", `data:${mime};base64,${Buffer.from(source.bytes).toString("base64")}`);
    } else {
      form.append("url", source.url);
    }

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`OCR.space request failed (${response.status}).`);
    const result = (await response.json()) as OcrSpaceResponse;
    if (result.IsErroredOnProcessing) {
      const message = Array.isArray(result.ErrorMessage)
        ? result.ErrorMessage.join(" ")
        : result.ErrorMessage ?? "Unknown error.";
      throw new Error(`OCR.space: ${message}`);
    }
    const text = result.ParsedResults?.map((part) => part.ParsedText ?? "").join("\n").trim();
    if (!text) throw new Error("No readable text was found in the receipt image.");
    return { text, provider: "ocr-space" };
  }
}
