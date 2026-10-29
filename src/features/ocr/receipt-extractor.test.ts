import { findArithmeticMismatch, reconcileReceipt, toReceiptData } from "@/features/ocr/receipt-extractor";

describe("findArithmeticMismatch", () => {
  const base = {
    merchantName: "Blueleaf Bistro",
    receiptDate: "2025-12-21",
    items: [
      { id: "1", name: "Masala Dosa", quantity: 2, amountPaise: 353800 },
      { id: "2", name: "Veg Biryani", quantity: 1, amountPaise: 374700 },
    ],
    subtotalPaise: 728500,
    taxPaise: 65646,
    totalPaise: 794146,
  };

  it("accepts amounts that reconcile", () => {
    expect(findArithmeticMismatch(base)).toBeNull();
  });

  it("flags items that do not add up to the subtotal", () => {
    expect(findArithmeticMismatch({ ...base, subtotalPaise: 728600 })).toMatch(/subtotal/);
  });

  it("flags a total that does not equal subtotal plus tax", () => {
    expect(findArithmeticMismatch({ ...base, totalPaise: 794100 })).toMatch(/total/);
  });
});

describe("reconcileReceipt", () => {
  const receipt = {
    merchantName: "Blueleaf Bistro",
    receiptDate: "",
    items: [{ id: "1", name: "Tea", quantity: 1, amountPaise: 5000 }],
    subtotalPaise: 5100,
    taxPaise: 250,
    totalPaise: 5350,
  };

  it("recomputes totals from items and warns when printed values disagree", () => {
    const result = reconcileReceipt(receipt);
    expect(result.receipt).toMatchObject({ subtotalPaise: 5000, totalPaise: 5250 });
    expect(result.warning).toMatch(/Check the item amounts/);
  });

  it("returns no warning for a consistent bill", () => {
    expect(reconcileReceipt({ ...receipt, subtotalPaise: 5000, totalPaise: 5250 }).warning).toBeNull();
  });
});

describe("toReceiptData", () => {
  it("converts printed rupee strings to paise and blanks invalid dates", () => {
    const receipt = toReceiptData({
      merchantName: " Blueleaf Bistro ",
      receiptDate: "21/12/2025",
      items: [{ name: "Masala Dosa", quantity: 2, amount: "3,538.00" }],
      subtotal: "3538.00",
      taxAndCharges: "636.84",
      total: "4174.84",
    });
    expect(receipt.merchantName).toBe("Blueleaf Bistro");
    expect(receipt.receiptDate).toBe("");
    expect(receipt.items[0]).toMatchObject({ name: "Masala Dosa", quantity: 2, amountPaise: 353800 });
    expect(receipt.totalPaise).toBe(417484);
  });

  it("throws when an amount is unreadable", () => {
    expect(() =>
      toReceiptData({
        merchantName: "X",
        receiptDate: "",
        items: [{ name: "Tea", quantity: 1, amount: "" }],
        subtotal: "0",
        taxAndCharges: "0",
        total: "0",
      }),
    ).toThrow(/Tea/);
  });
});
