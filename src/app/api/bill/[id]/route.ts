import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isLocalBillId, readLocalBill } from "@/lib/local-bills";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    await enforceRateLimit(_request);
    const { id } = await context.params;
    if (isLocalBillId(id)) {
      if (process.env.NODE_ENV === "production") throw new HttpError("Bill not found.", 404);
      return NextResponse.json(await readLocalBill(id));
    }
    const bill = await prisma.bill.findFirst({
      where: { id, deletedAt: null },
      include: {
        rawReceipt: { select: { provider: true, confidence: true, createdAt: true } },
        billItems: {
          where: { deletedAt: null },
          include: {
            generated: {
              where: { deletedAt: null },
              include: { assignment: { include: { person: true } } },
              orderBy: { position: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        people: {
          where: { deletedAt: null },
          include: { assignments: { include: { generatedItem: true } } },
          orderBy: { position: "asc" },
        },
      },
    });
    if (!bill) throw new HttpError("Bill not found.", 404);
    return NextResponse.json(bill);
  } catch (error) {
    return jsonError(error);
  }
}
