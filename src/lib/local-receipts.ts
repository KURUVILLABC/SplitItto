import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

export function isLocalReceiptId(value: string): boolean {
  return localIdPattern.test(value);
}
