import { randomUUID } from "node:crypto";
import type { ReceiptData } from "@/lib/receipt";
import { parseRupees } from "@/lib/money";

function findAmountCandidates(line: string): number[] {
  const matches = line.match(/(?:₹\s*)?(\d[\d,]*(?:\.\d{1,2})?)/g);
  if (!matches?.length) return [];
  for (const match of [...matches].reverse()) {
    const token = match.replace(/[^\d.,]/g, "");
    const parsed = parseRupees(token);
    if (parsed === null) continue;
    const candidates = [parsed];
    if (/^3[\d,]+(?:\.\d{1,2})?$/.test(token)) {
      const missingCurrencySymbol = parseRupees(token.slice(1));
      if (missingCurrencySymbol !== null && missingCurrencySymbol !== parsed) {
        candidates.push(missingCurrencySymbol);
      }
    }
    return candidates;
  }
  return [];
}

function sumCandidates(lines: readonly string[]): number[][] {
  return lines.reduce<number[][]>((sums, line) => {
    const candidates = findAmountCandidates(line);
    if (candidates.length === 0) return sums;
    return sums.flatMap((sum) =>
      candidates.map((candidate) => {
        const total = [...sum, candidate].reduce((value, amount) => value + amount, 0);
        return [total];
      }),
    );
  }, [[]]);
}

function matchItemAmounts(candidates: readonly number[][], target: number): number[] | null {
  let sums = new Map<number, number[]>([[0, []]]);
  for (const choices of candidates) {
    const next = new Map<number, number[]>();
    for (const [sum, selected] of sums) {
      for (const amount of choices) {
        const nextSum = sum + amount;
        if (nextSum <= target && !next.has(nextSum)) {
          next.set(nextSum, [...selected, amount]);
        }
      }
    }
    if (next.size > 50_000) return null;
    sums = next;
  }
  return sums.get(target) ?? null;
}

function parseReceiptDate(line: string | undefined): string {
  const match = line?.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (!match) return "";
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const day = first > 12 ? first : second > 12 ? second : first;
  const month = first > 12 ? second : second > 12 ? first : second;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

export function parseReceiptText(text: string): ReceiptData {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const totalLine = lines.find((line) => /\b(grand\s*total|total\s*(?:due|amount)?|amount\s*payable)\b/i.test(line));
  const gstLine = lines.find((line) => /\b(gst|tax|vat)\b/i.test(line));
  const splitTaxLines = lines.filter((line) => /\b(cgst|sgst)\b/i.test(line));
  const subtotalLine = lines.find((line) => /\b(sub\s*total|subtotal|net\s*amount)\b/i.test(line));
  const totalCandidates = totalLine ? findAmountCandidates(totalLine) : [];
  const subtotalCandidates = subtotalLine ? findAmountCandidates(subtotalLine) : [];
  const taxCandidates = gstLine
    ? findAmountCandidates(gstLine)
    : splitTaxLines.length > 0
      ? sumCandidates(splitTaxLines).map(([amount]) => amount)
      : [];
  const ignoredLine = (line: string) =>
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(line) ||
    /\b(grand\s*total|total\s*(?:due|amount)?|amount\s*payable|sub\s*total|subtotal|net\s*amount|gst|tax|cgst|sgst|vat|cash|change|discount|date|invoice|bill\s*(?:no|number))\b/i.test(line);
  const parsedLines: { id: string; name: string; quantity: number; candidates: number[] }[] = [];
  const firstQuantityLine = lines.findIndex((line) => /^\s*\d+\s*[x×]\s*/i.test(line));
  for (const [lineIndex, line] of lines.entries()) {
    if (subtotalLine && line === subtotalLine) break;
    if (firstQuantityLine >= 0 && lineIndex < firstQuantityLine) continue;
    if (ignoredLine(line)) continue;
    const amountCandidates = findAmountCandidates(line);
    const quantityMatch = line.match(/^\s*(\d+)\s*[x×]\s*/i);
    if (!quantityMatch && amountCandidates.length === 0) {
      const previous = parsedLines[parsedLines.length - 1];
      if (previous && /^[\p{L}][\p{L}\s'-]{0,39}$/u.test(line)) {
        previous.name = `${previous.name} ${line}`.trim();
      }
      continue;
    }
    if (amountCandidates.length === 0) continue;
    const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) continue;
    const name = line
      .replace(/^\s*\d+\s*[x×]\s*/i, "")
      .replace(/(?:₹\s*)?\d[\d,]*(?:\.\d{1,2})?\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) continue;
    parsedLines.push({ id: randomUUID(), name, quantity, candidates: amountCandidates });
  }
  const rawItemAmounts = parsedLines.map(({ candidates }) => candidates[0]);
  const exactReceipt = subtotalCandidates.flatMap((subtotal) =>
    taxCandidates.flatMap((tax) =>
      totalCandidates.map((total) => ({ subtotal, tax, total })),
    ),
  ).find(({ subtotal, tax, total }) => Number.isSafeInteger(subtotal + tax) && subtotal + tax === total);
  const expectedSubtotal = exactReceipt?.subtotal ?? subtotalCandidates[0];
  const selectedLineAmounts =
    expectedSubtotal === undefined ? null : matchItemAmounts(parsedLines.map(({ candidates }) => candidates), expectedSubtotal);
  const items = parsedLines.map((item, index) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    amountPaise: selectedLineAmounts?.[index] ?? item.candidates[0],
  }));
  const subtotalPaise =
    expectedSubtotal ?? rawItemAmounts.reduce((sum, amount) => sum + amount, 0);
  const taxPaise = exactReceipt?.tax ?? taxCandidates[0] ?? null;
  const totalPaise = exactReceipt?.total ?? totalCandidates[0] ?? null;
  const estimatedTax = taxPaise ?? 0;
  const estimatedTotal = totalPaise ?? subtotalPaise + estimatedTax;
  const firstItemIndex = lines.findIndex((line) => items.some((item) => line.includes(item.name)));
  const merchantName = lines.slice(0, firstItemIndex > 0 ? firstItemIndex : 1)[0] ?? "";
  const dateText = lines.find((line) => /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(line));
  return {
    merchantName,
    receiptDate: parseReceiptDate(dateText),
    items,
    subtotalPaise,
    taxPaise: taxPaise ?? Math.max(0, estimatedTotal - subtotalPaise),
    totalPaise: estimatedTotal,
    ocrText: text,
  };
}
