import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpError } from "@/lib/http";

const localReceiptDirectory = join(tmpdir(), "billsplit-ai-local-receipts");
const localIdPattern =
  /^local-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveLocalReceipt(bytes: Uint8Array): Promise<string> {
  const imagePublicId = `local-${randomUUID()}`;
  await mkdir(localReceiptDirectory, { recursive: true, mode: 0o700 });
  await writeFile(join(localReceiptDirectory, `${imagePublicId}.img`), bytes, {
    flag: "wx",
    mode: 0o600,
  });
  return imagePublicId;
}

export async function readLocalReceipt(imagePublicId: string): Promise<Buffer> {
  if (!localIdPattern.test(imagePublicId)) {
    throw new HttpError("The local receipt identifier is invalid.", 400);
  }
  try {
    return await readFile(join(localReceiptDirectory, `${imagePublicId}.img`));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new HttpError("The uploaded receipt is no longer available. Please upload it again.", 404);
    }
    throw error;
  }
}

export function isLocalReceiptId(value: string): boolean {
  return localIdPattern.test(value);
}
