export interface OcrResult {
  text: string;
  provider: string;
  confidence?: number;
}

export interface OcrProvider {
  extract(imageUrl: string): Promise<OcrResult>;
}
