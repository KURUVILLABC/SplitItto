import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { expandReceiptItems } from "@/lib/receipt";
import type { Prisma } from "@prisma/client";
import { safeText } from "@/lib/validation";
import { isLocalReceiptId } from "@/lib/local-receipts";
import { saveLocalBill } from "@/lib/local-bills";
import { serverEnv } from "@/lib/env";
import { z } from "zod";

const schema = z.object({
  receipt: z.object({
    merchantName: safeText(120),
    receiptDate: z.string().date().or(z.literal("")).optional(),
    subtotalPaise: z.number().int().nonnegative().safe(),
    taxPaise: z.number().int().nonnegative().safe(),
    totalPaise: z.number().int().nonnegative().safe(),
    imagePublicId: z.string().max(200).optional(),
    ocrText: z.string().max(20_000).optional(),
    ocrProvider: z.string().max(50).optional(),
    items: z.array(
      z.object({
        id: z.string().min(1),
        name: safeText(120),
        quantity: z.number().int().positive(),
        amountPaise: z.number().int().nonnegative().safe(),
      }),
    ).min(1).max(50),
  }),
  generatedItems: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1).max(150),
      amountPaise: z.number().int().nonnegative().safe(),
      sourceLineId: z.string().min(1),
    }),
  ).min(1).max(50),
  people: z.array(z.object({ id: z.string().min(1), name: safeText(60) })).min(1),
  assignments: z.array(z.object({ itemId: z.string(), targetId: z.string() })).max(50),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request);
    const input = schema.parse(await request.json());
    if (
      input.receipt.imagePublicId &&
      !/^billsplit\/receipts\/[a-zA-Z0-9_-]+$/.test(input.receipt.imagePublicId) &&
      !(process.env.NODE_ENV !== "production" && isLocalReceiptId(input.receipt.imagePublicId))
    ) {
      throw new HttpError("The receipt image identifier is invalid.", 400);
    }
    const itemSubtotal = input.receipt.items.reduce((sum, item) => sum + item.amountPaise, 0);
    if (!Number.isSafeInteger(itemSubtotal) || itemSubtotal !== input.receipt.subtotalPaise) {
      throw new HttpError("Receipt line items do not match the saved subtotal.", 422);
    }
    const expectedTotal = input.receipt.subtotalPaise + input.receipt.taxPaise;
    if (expectedTotal !== input.receipt.totalPaise) {
      throw new HttpError("Receipt subtotal, GST, and total do not reconcile.", 422);
    }
    if (input.receipt.items.reduce((sum, item) => sum + item.quantity, 0) > 50) {
      throw new HttpError(
        "This receipt contains more than 50 items. Support for larger receipts is currently under development.",
        422,
      );
    }
    if (input.generatedItems.reduce((sum, item) => sum + item.amountPaise, 0) !== input.receipt.totalPaise) {
      throw new HttpError("Generated item amounts do not match the receipt total.", 422);
    }
    const expectedItems = expandReceiptItems(input.receipt.items, input.receipt.taxPaise);
    if (JSON.stringify(expectedItems) !== JSON.stringify(input.generatedItems)) {
      throw new HttpError("Generated items do not match the verified receipt allocation.", 422);
    }
    const itemIds = new Set(input.generatedItems.map(({ id }) => id));
    const peopleIds = new Set(input.people.map(({ id }) => id));
    const receiptItemIds = new Set(input.receipt.items.map(({ id }) => id));
    if (itemIds.size !== input.generatedItems.length || receiptItemIds.size !== input.receipt.items.length) {
      throw new HttpError("Receipt and generated item identifiers must be unique.", 422);
    }
    if (peopleIds.size !== input.people.length || peopleIds.has("common")) {
      throw new HttpError("Person identifiers must be unique and valid.", 422);
    }
    const assignedIds = new Set<string>();
    for (const assignment of input.assignments) {
      if (!itemIds.has(assignment.itemId) || assignedIds.has(assignment.itemId)) {
        throw new HttpError("Every generated item must have exactly one valid assignment.", 422);
      }
      if (assignment.targetId !== "common" && !peopleIds.has(assignment.targetId)) {
        throw new HttpError("An assignment refers to an unknown person.", 422);
      }
      assignedIds.add(assignment.itemId);
    }
    if (assignedIds.size !== itemIds.size) throw new HttpError("Assign every item before saving.", 422);
    const generatedSourceIds = new Set(input.generatedItems.map(({ sourceLineId }) => sourceLineId));
    if (input.receipt.items.some(({ id }) => !generatedSourceIds.has(id))) {
      throw new HttpError("A receipt line has no generated item.", 422);
    }
    if (!serverEnv.DATABASE_URL) {
      if (process.env.NODE_ENV === "production") {
        throw new HttpError("Bill storage is not configured on this server.", 503);
      }
      const billId = await saveLocalBill(input);
      return NextResponse.json({ billId, storageProvider: "local" }, { status: 201 });
    }
    const bill = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const created = await transaction.bill.create({
        data: {
          merchantName: input.receipt.merchantName,
          receiptDate: input.receipt.receiptDate ? new Date(`${input.receipt.receiptDate}T00:00:00.000Z`) : null,
          subtotal: input.receipt.subtotalPaise,
          tax: input.receipt.taxPaise,
          total: input.receipt.totalPaise,
          imagePublicId: input.receipt.imagePublicId,
          rawReceipt: input.receipt.ocrText
            ? {
                create: {
                  ocrText: input.receipt.ocrText,
                  provider: input.receipt.ocrProvider ?? "unknown",
                },
              }
            : undefined,
          billItems: {
            create: input.receipt.items.map(({ id, name, quantity, amountPaise }) => ({
              id,
              name,
              quantity,
              amount: amountPaise,
              generated: {
                create: input.generatedItems
                  .filter((item) => item.sourceLineId === id)
                  .map((item, position) => ({
                    id: item.id,
                    label: item.label,
                    amount: item.amountPaise,
                    position,
                  })),
              },
            })),
          },
          people: {
            create: input.people.map((person, position) => ({
              id: person.id,
              name: person.name,
              position,
            })),
          },
        },
      });
      await transaction.assignment.createMany({
        data: input.assignments.map(({ itemId, targetId }) => ({
          generatedItemId: itemId,
          personId: targetId === "common" ? null : targetId,
          isCommon: targetId === "common",
        })),
      });
      return created;
    });
    return NextResponse.json({ billId: bill.id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
