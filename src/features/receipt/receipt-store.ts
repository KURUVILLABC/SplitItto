"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ReceiptData, ReceiptLine, GeneratedReceiptItem } from "@/lib/receipt";

interface ReceiptState {
  receipt: ReceiptData | null;
  generatedItems: GeneratedReceiptItem[];
  setReceipt: (receipt: ReceiptData) => void;
  updateReceipt: (updates: Partial<ReceiptData>) => void;
  addItem: () => void;
  updateItem: (id: string, updates: Partial<Omit<ReceiptLine, "id">>) => void;
  removeItem: (id: string) => void;
  setGeneratedItems: (items: GeneratedReceiptItem[]) => void;
  reset: () => void;
}

const blankReceipt: ReceiptData = {
  merchantName: "",
  receiptDate: new Date().toISOString().slice(0, 10),
  items: [],
  subtotalPaise: 0,
  taxPaise: 0,
  totalPaise: 0,
};

function recalculate(receipt: ReceiptData, updates: Partial<ReceiptData>): ReceiptData {
  const next = { ...receipt, ...updates };
  const subtotalPaise = next.items.reduce((sum, item) => sum + item.amountPaise, 0);
  return { ...next, subtotalPaise, totalPaise: subtotalPaise + next.taxPaise };
}

export const useReceiptStore = create<ReceiptState>()(
  persist(
    (set, get) => ({
      receipt: null,
      generatedItems: [],
      setReceipt: (receipt) => set({ receipt, generatedItems: [] }),
      updateReceipt: (updates) => {
        const receipt = get().receipt;
        if (receipt) set({ receipt: recalculate(receipt, updates) });
      },
      addItem: () => {
        const receipt = get().receipt;
        if (!receipt) return;
        const item: ReceiptLine = {
          id: crypto.randomUUID(),
          name: "",
          quantity: 1,
          amountPaise: 0,
        };
        set({ receipt: recalculate(receipt, { items: [...receipt.items, item] }) });
      },
      updateItem: (id, updates) => {
        const receipt = get().receipt;
        if (!receipt) return;
        const items = receipt.items.map((item) => (item.id === id ? { ...item, ...updates } : item));
        set({ receipt: recalculate(receipt, { items }), generatedItems: [] });
      },
      removeItem: (id) => {
        const receipt = get().receipt;
        if (!receipt) return;
        const items = receipt.items.filter((item) => item.id !== id);
        set({ receipt: recalculate(receipt, { items }), generatedItems: [] });
      },
      setGeneratedItems: (generatedItems) => set({ generatedItems }),
      reset: () => set({ receipt: null, generatedItems: [] }),
    }),
    {
      name: "billsplit-receipt",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ receipt: state.receipt, generatedItems: state.generatedItems }),
    },
  ),
);

export function newEmptyReceipt(): ReceiptData {
  return { ...blankReceipt, items: [] };
}
