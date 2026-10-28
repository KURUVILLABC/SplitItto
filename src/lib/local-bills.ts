import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GeneratedReceiptItem, ReceiptData } from "@/lib/receipt";
import { HttpError } from "@/lib/http";
import { z } from "zod";

const localBillDirectory = join(tmpdir(), "billsplit-ai-local-bills");
const localBillIdPattern =
  /^localbill-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LocalBillInput {
  receipt: Omit<ReceiptData, "receiptDate"> & { receiptDate?: string };
  generatedItems: GeneratedReceiptItem[];
  people: { id: string; name: string }[];
  assignments: { itemId: string; targetId: string }[];
}

interface LocalPersonRecord {
  id: string;
  name: string;
  billId: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
}

interface LocalGeneratedItemRecord {
  id: string;
  billItemId: string;
  label: string;
  amount: number;
  position: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
  assignment: {
    id: string;
    generatedItemId: string;
    personId: string | null;
    isCommon: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt: null;
    person: LocalPersonRecord | null;
  } | null;
}

interface LocalBillResponse {
  id: string;
  merchantName: string;
  receiptDate: string | null;
  currency: "INR";
  subtotal: number;
  tax: number;
  total: number;
  imagePublicId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
  rawReceipt: { provider: string; confidence: null; createdAt: string } | null;
  billItems: {
    id: string;
    billId: string;
    name: string;
    quantity: number;
    amount: number;
    createdAt: string;
    updatedAt: string;
    deletedAt: null;
    generated: LocalGeneratedItemRecord[];
  }[];
  people: (LocalPersonRecord & {
    assignments: {
      id: string;
      generatedItemId: string;
      personId: string;
      isCommon: false;
      createdAt: string;
      updatedAt: string;
      deletedAt: null;
      generatedItem: Pick<LocalGeneratedItemRecord, "id" | "label" | "amount">;
    }[];
  })[];
}

const storedBillSchema = z.object({
  id: z.string().regex(localBillIdPattern),
  response: z.unknown(),
});

export function isLocalBillId(id: string): boolean {
  return localBillIdPattern.test(id);
}

function createBillResponse(
  id: string,
  createdAt: string,
  input: LocalBillInput,
): LocalBillResponse {
  const people: LocalPersonRecord[] = input.people.map((person, position) => ({
    ...person,
    billId: id,
    position,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  }));
  const generatedItems: LocalGeneratedItemRecord[] = input.generatedItems.map((item, position) => {
    const assignment = input.assignments.find(({ itemId }) => itemId === item.id);
    const isCommon = assignment?.targetId === "common";
    const assignedPerson = isCommon
      ? null
      : people.find(({ id: personId }) => personId === assignment?.targetId) ?? null;
    return {
      id: item.id,
      billItemId: item.sourceLineId,
      label: item.label,
      amount: item.amountPaise,
      position,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      assignment: assignment
        ? {
            id: `local-assignment-${item.id}`,
            generatedItemId: item.id,
            personId: assignedPerson?.id ?? null,
            isCommon,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
            person: assignedPerson,
          }
        : null,
    };
  });
  return {
    id,
    merchantName: input.receipt.merchantName,
    receiptDate: input.receipt.receiptDate
      ? `${input.receipt.receiptDate}T00:00:00.000Z`
      : null,
    currency: "INR",
    subtotal: input.receipt.subtotalPaise,
    tax: input.receipt.taxPaise,
    total: input.receipt.totalPaise,
    imagePublicId: input.receipt.imagePublicId ?? null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    rawReceipt: input.receipt.ocrText
      ? {
          provider: input.receipt.ocrProvider ?? "unknown",
          confidence: null,
          createdAt,
        }
      : null,
    billItems: input.receipt.items.map((item) => ({
      id: item.id,
      billId: id,
      name: item.name,
      quantity: item.quantity,
      amount: item.amountPaise,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      generated: generatedItems.filter(({ billItemId }) => billItemId === item.id),
    })),
    people: people.map((person) => ({
      ...person,
      assignments: input.assignments
        .filter(({ targetId }) => targetId === person.id)
        .flatMap((assignment) => {
          const item = generatedItems.find(({ id: itemId }) => itemId === assignment.itemId);
          return item
            ? [{
                id: `local-assignment-${item.id}`,
                generatedItemId: item.id,
                personId: person.id,
                isCommon: false as const,
                createdAt,
                updatedAt: createdAt,
                deletedAt: null as null,
                generatedItem: { id: item.id, label: item.label, amount: item.amount },
              }]
            : [];
        }),
    })),
  };
}

export async function saveLocalBill(input: LocalBillInput): Promise<string> {
  const id = `localbill-${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const response = createBillResponse(id, createdAt, input);
  await mkdir(localBillDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    join(localBillDirectory, `${id}.json`),
    JSON.stringify({ id, response }),
    { flag: "wx", mode: 0o600 },
  );
  return id;
}

export async function readLocalBill(id: string): Promise<unknown> {
  if (!isLocalBillId(id)) throw new HttpError("The local bill identifier is invalid.", 400);
  try {
    const stored = JSON.parse(
      await readFile(join(localBillDirectory, `${id}.json`), "utf8"),
    ) as unknown;
    const parsed = storedBillSchema.parse(stored);
    if (parsed.id !== id) throw new Error("The stored bill identifier does not match its filename.");
    return parsed.response;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new HttpError("Bill not found.", 404);
    }
    throw error;
  }
}
