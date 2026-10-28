import { parseReceiptText } from "@/features/ocr/receipt-parser";

describe("receipt OCR parser", () => {
  it("extracts merchant, quantities, line amounts, GST, and total", () => {
    const receipt = parseReceiptText(
      "Olive Kitchen\n01/01/2026\n2 x Product A 260.00\nProduct B 140.00\nSubtotal 400.00\nGST 21.00\nGrand Total 421.00",
    );
    expect(receipt.merchantName).toBe("Olive Kitchen");
    expect(receipt.items).toHaveLength(2);
    expect(receipt.items[0]).toMatchObject({ name: "Product A", quantity: 2, amountPaise: 26000 });
    expect(receipt.subtotalPaise).toBe(40000);
    expect(receipt.taxPaise).toBe(2100);
    expect(receipt.totalPaise).toBe(42100);
  });

  it("recovers amounts when OCR mistakes the rupee symbol for a leading 3", () => {
    const receipt = parseReceiptText(
      [
        "Blueleaf Bistro",
        "21/12/2025",
        "2 x Masala Dosa 3538.00",
        "3 x Veg Biryani 3747.00",
        "1 x Paneer Butter 3295.00",
        "Masala",
        "2 x Veg Biryani 3790.00",
        "2 x Hakka Noodles 3878.00",
        "1 x Butter Naan 3399.00",
        "SUBTOTAL: 33,647.00",
        "CGST (9%): 3328.23",
        "SGST (9%): 3328.23",
        "TOTAL: %4,303.46",
      ].join("\n"),
    );
    expect(receipt.merchantName).toBe("Blueleaf Bistro");
    expect(receipt.receiptDate).toBe("2025-12-21");
    expect(receipt.items).toHaveLength(6);
    expect(receipt.items.map(({ amountPaise }) => amountPaise)).toEqual([
      53800, 74700, 29500, 79000, 87800, 39900,
    ]);
    expect(receipt.items[2].name).toBe("Paneer Butter Masala");
    expect(receipt.subtotalPaise).toBe(364700);
    expect(receipt.taxPaise).toBe(65646);
    expect(receipt.totalPaise).toBe(430346);
    expect(receipt.items.reduce((sum, item) => sum + item.amountPaise, 0)).toBe(receipt.subtotalPaise);
  });
});
