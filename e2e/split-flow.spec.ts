import { expect, test } from "@playwright/test";

test("manual receipt can be reviewed, assigned, and saved", async ({ page }) => {
  test.setTimeout(60_000);
  await page.route("**/api/validate-bill", async (route) => {
    await route.fulfill({ json: { valid: true, errors: [], assignedTotalPaise: 42100 } });
  });
  await page.route("**/api/save-bill", async (route) => {
    await route.fulfill({ status: 201, json: { billId: "e2e-bill" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /scan a bill/i }).click();
  await page.getByRole("button", { name: /enter receipt details manually/i }).click();
  await page.getByLabel("RESTAURANT").fill("Olive Kitchen");

  await page.getByRole("button", { name: /add an item/i }).click();
  await page.getByLabel("Item 1 name").fill("Product A");
  await page.getByLabel("Item 1 quantity").fill("2");
  await page.getByLabel("Item 1 amount in rupees").fill("260.00");
  await page.getByRole("button", { name: /add an item/i }).click();
  await page.getByLabel("Item 2 name").fill("Product B");
  await page.getByLabel("Item 2 amount in rupees").fill("140.00");
  await page.getByLabel("GST in rupees").fill("21.00");
  const processingResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/process-bill"),
  );
  await page.getByRole("button", { name: /continue to split/i }).click();
  const processed = await processingResponse;
  expect(processed.status(), await processed.text()).toBe(200);

  const firstItem = page.getByRole("button", { name: /move product a #1/i });
  await expect(firstItem).toBeVisible();
  await page.getByLabel("Person 1 name").fill("Jamie");
  await page.getByRole("button", { name: /add person/i }).click();
  await page.getByLabel("Person 2 name").fill("Sam");
  async function moveItem(item: ReturnType<typeof page.getByRole>, targetLabel: string) {
    const sourceBox = await item.boundingBox();
    const targetBox = await page.getByLabel(targetLabel).boundingBox();
    if (!sourceBox || !targetBox) throw new Error("The drag source or assignment target is not visible.");
    const sourceX = sourceBox.x + sourceBox.width / 2;
    const sourceY = sourceBox.y + sourceBox.height / 2;
    await page.mouse.move(sourceX, sourceY);
    await page.mouse.down();
    await page.mouse.move(sourceX + 8, sourceY + 4, { steps: 3 });
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
    await page.mouse.up();
  }
  await moveItem(firstItem, "Drop items for Jamie");
  await page.getByLabel("Assign Product A #2").selectOption({ label: "Jamie" });
  await moveItem(page.getByRole("button", { name: /move product b #1/i }), "Drop items for Sam");
  await page.getByRole("button", { name: /finish split/i }).click();
  await expect(page.getByRole("heading", { name: "That’s a wrap." })).toBeVisible();
  await expect(page.getByText("₹421.00")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /download summary/i }).click();
  expect((await download).suggestedFilename()).toBe("splititto-e2e-bill.pdf");
});
