import { expandReceiptItems, validateReceipt, type ReceiptData } from "@/lib/receipt";

describe("receipt processing", () => {
  const receipt: ReceiptData = {
    merchantName: "Olive",
    receiptDate: "2026-01-01",
    items: [
      { id: "a", name: "Product A", quantity: 2, amountPaise: 26000 },
      { id: "b", name: "Product B", quantity: 1, amountPaise: 14000 },
    ],
    subtotalPaise: 40000,
    taxPaise: 2100,
    totalPaise: 42100,
  };

  it("allocates GST over individual units and reconciles every paise", () => {
    const items = expandReceiptItems(receipt.items, receipt.taxPaise);
    expect(items.map((item) => item.amountPaise)).toEqual([13683, 13682, 14735]);
    expect(items.reduce((sum, item) => sum + item.amountPaise, 0)).toBe(receipt.totalPaise);
  });

  it("rejects a receipt whose subtotal and tax do not equal its total", () => {
    expect(validateReceipt({ ...receipt, totalPaise: 42_099 })).toContain(
      "Subtotal plus GST must equal the receipt total.",
    );
  });

  it("reports missing receipt details", () => {
    expect(validateReceipt({
      ...receipt,
      merchantName: "",
      items: [],
    })).toEqual(expect.arrayContaining(["Add at least one receipt item.", "Add the merchant name."]));
  });
});
