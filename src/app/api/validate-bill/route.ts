import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { safeText } from "@/lib/validation";
import { z } from "zod";

const schema = z.object({
  totalPaise: z.number().int().nonnegative().safe(),
  items: z.array(z.object({ id: z.string(), amountPaise: z.number().int().nonnegative().safe() })).max(50),
  people: z.array(z.object({ id: z.string().min(1), name: safeText(60) })).min(1),
  assignments: z.array(
    z.object({ itemId: z.string(), targetId: z.string() }),
  ).max(50),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request);
    const input = schema.parse(await request.json());
    const itemIds = new Set(input.items.map(({ id }) => id));
    const peopleIds = new Set(input.people.map(({ id }) => id));
    const assignedItems = new Set<string>();
    const errors: string[] = [];
    if (itemIds.size !== input.items.length) errors.push("Receipt items must have unique identifiers.");
    if (peopleIds.size !== input.people.length) errors.push("People must have unique identifiers.");
    if (input.items.reduce((sum, item) => sum + item.amountPaise, 0) !== input.totalPaise) {
      errors.push("Receipt item values must match the receipt total.");
    }

    for (const assignment of input.assignments) {
      if (!itemIds.has(assignment.itemId)) errors.push("An assignment refers to an unknown item.");
      if (assignment.targetId !== "common" && !peopleIds.has(assignment.targetId)) {
        errors.push("An item is assigned to a person who no longer exists.");
      }
      if (assignedItems.has(assignment.itemId)) errors.push("An item cannot be assigned more than once.");
      assignedItems.add(assignment.itemId);
    }
    if (assignedItems.size !== itemIds.size) errors.push("Assign every item before finishing.");
    const assignedTotal = input.items
      .filter(({ id }) => assignedItems.has(id))
      .reduce((sum, item) => sum + item.amountPaise, 0);
    if (!Number.isSafeInteger(assignedTotal)) errors.push("Assigned total exceeds the safe money limit.");
    if (assignedTotal !== input.totalPaise) errors.push("Assigned total must match the receipt total.");
    return NextResponse.json({ valid: errors.length === 0, errors, assignedTotalPaise: assignedTotal });
  } catch (error) {
    return jsonError(error);
  }
}
