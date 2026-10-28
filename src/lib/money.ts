export interface MoneyInput {
  id: string;
  amount: number;
}

export function allocateProportionally(
  amount: number,
  weights: readonly MoneyInput[],
): number[] {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative safe integer.");
  }
  if (weights.some(({ amount: weight }) => !Number.isSafeInteger(weight) || weight < 0)) {
    throw new Error("Weights must be non-negative safe integers.");
  }
  const totalWeight = weights.reduce((sum, item) => sum + item.amount, 0);
  if (!Number.isSafeInteger(totalWeight)) {
    throw new Error("The combined allocation weight exceeds the safe money limit.");
  }
  if (weights.length === 0) {
    if (amount === 0) return [];
    throw new Error("Cannot allocate money without any recipients.");
  }
  if (totalWeight === 0) {
    if (amount === 0) return weights.map(() => 0);
    throw new Error("Cannot allocate money when all weights are zero.");
  }

  const shares = weights.map(({ amount: weight }, index) => {
    const numerator = BigInt(amount) * BigInt(weight);
    const denominator = BigInt(totalWeight);
    return {
      index,
      remainder: numerator % denominator,
      value: Number(numerator / denominator),
    };
  });
  const remainder = amount - shares.reduce((sum, share) => sum + share.value, 0);
  const priority = [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (let index = 0; index < remainder; index += 1) {
    priority[index].value += 1;
  }
  return shares.map(({ value }) => value);
}

export function splitEqually(amount: number, recipientCount: number): number[] {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(recipientCount) || recipientCount < 1) {
    throw new Error("At least one recipient is required.");
  }
  const each = Math.floor(amount / recipientCount);
  const remainder = amount % recipientCount;
  return Array.from({ length: recipientCount }, (_, index) => each + (index < remainder ? 1 : 0));
}

export function formatRupees(paise: number): string {
  if (!Number.isSafeInteger(paise)) {
    throw new Error("Money must be represented as a safe integer number of paise.");
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function parseRupees(value: string): number | null {
  const normalized = value.trim().replace(/[₹,\s]/g, "");
  if (!/^(?:\d+)(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}
