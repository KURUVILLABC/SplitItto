import { z } from "zod";

export function safeText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Text cannot contain control characters.");
}
