import { allocateProportionally } from "@/lib/money";

export interface ReceiptLine {
  id: string;
  name: string;
  quantity: number;
  amountPaise: number;
}

export interface GeneratedReceiptItem {
  id: string;
  label: string;
  amountPaise: number;
  sourceLineId: string;
}

export interface ReceiptData {
  merchantName: string;
  receiptDate: string;
  items: ReceiptLine[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  imagePublicId?: string;
  ocrText?: string;
  ocrProvider?: string;
}

export function expandReceiptItems(
  items: readonly ReceiptLine[],
  taxPaise: number,
): GeneratedReceiptItem[] {
  if (!Number.isSafeInteger(taxPaise) || taxPaise < 0) {
    throw new Error("Tax must be a non-negative amount in paise.");
  }
  const units = items.flatMap((item) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new Error("Item quantity must be a positive safe integer.");
    }
    if (!Number.isSafeInteger(item.amountPaise) || item.amountPaise < 0) {
      throw new Error("Item amount must be a non-negative safe integer.");
    }
    const each = Math.floor(item.amountPaise / item.quantity);
    const remainder = item.amountPaise % item.quantity;
    return Array.from({ length: item.quantity }, (_, unitIndex) => ({
      id: `${item.id}-${unitIndex + 1}`,
      label: `${item.name} #${unitIndex + 1}`,
      amountPaise: each + (unitIndex < remainder ? 1 : 0),
      sourceLineId: item.id,
    }));
  });
  const taxShares = allocateProportionally(
    taxPaise,
    units.map(({ id, amountPaise }) => ({ id, amount: amountPaise })),
  );
  return units.map((item, index) => ({
    ...item,
    amountPaise: item.amountPaise + taxShares[index],
  }));
}

export function validateReceipt(receipt: ReceiptData): string[] {
  const errors: string[] = [];
  if (receipt.items.length === 0) errors.push("Add at least one receipt item.");
  if (!receipt.merchantName.trim()) errors.push("Add the merchant name.");
  if (!Number.isSafeInteger(receipt.taxPaise) || receipt.taxPaise < 0) {
    errors.push("Tax must be a valid non-negative amount.");
  }
  for (const [index, item] of receipt.items.entries()) {
    if (!item.name.trim()) errors.push(`Item ${index + 1} needs a name.`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      errors.push(`${item.name || `Item ${index + 1}`} needs a quantity of at least 1.`);
    }
    if (!Number.isSafeInteger(item.amountPaise) || item.amountPaise < 0) {
      errors.push(`${item.name || `Item ${index + 1}`} needs a valid amount.`);
    }
  }
  const subtotal = receipt.items.reduce((sum, item) => sum + item.amountPaise, 0);
  if (!Number.isSafeInteger(subtotal)) errors.push("Receipt subtotal is too large.");
  if (subtotal !== receipt.subtotalPaise) errors.push("Item amounts must equal the receipt subtotal.");
  if (!Number.isSafeInteger(receipt.totalPaise) || subtotal + receipt.taxPaise !== receipt.totalPaise) {
    errors.push("Subtotal plus GST must equal the receipt total.");
  }
  if (Number.isSafeInteger(receipt.totalPaise) && receipt.totalPaise < 0) {
    errors.push("Receipt total must be non-negative.");
  }
  return [...new Set(errors)];
}
