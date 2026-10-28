CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Bill" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "merchantName" TEXT,
  "receiptDate" TIMESTAMP(3),
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "subtotal" INTEGER NOT NULL,
  "tax" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "imagePublicId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Bill_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Bill_subtotal_check" CHECK ("subtotal" >= 0),
  CONSTRAINT "Bill_tax_check" CHECK ("tax" >= 0),
  CONSTRAINT "Bill_total_check" CHECK ("total" >= 0),
  CONSTRAINT "Bill_totals_reconcile_check" CHECK ("total" = "subtotal" + "tax")
);
CREATE TABLE "RawReceipt" (
  "id" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "ocrText" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "RawReceipt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BillItem" (
  "id" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "BillItem_amount_check" CHECK ("amount" >= 0)
);
CREATE TABLE "GeneratedItem" (
  "id" TEXT NOT NULL,
  "billItemId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "GeneratedItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GeneratedItem_amount_check" CHECK ("amount" >= 0)
);
CREATE TABLE "Person" (
  "id" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Assignment" (
  "id" TEXT NOT NULL,
  "generatedItemId" TEXT NOT NULL,
  "personId" TEXT,
  "isCommon" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Assignment_target_check" CHECK (("isCommon" = TRUE AND "personId" IS NULL) OR ("isCommon" = FALSE AND "personId" IS NOT NULL))
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX "Bill_userId_createdAt_idx" ON "Bill"("userId", "createdAt");
CREATE INDEX "Bill_deletedAt_idx" ON "Bill"("deletedAt");
CREATE UNIQUE INDEX "RawReceipt_billId_key" ON "RawReceipt"("billId");
CREATE INDEX "RawReceipt_deletedAt_idx" ON "RawReceipt"("deletedAt");
CREATE INDEX "BillItem_billId_deletedAt_idx" ON "BillItem"("billId", "deletedAt");
CREATE INDEX "GeneratedItem_billItemId_position_idx" ON "GeneratedItem"("billItemId", "position");
CREATE INDEX "Person_billId_position_idx" ON "Person"("billId", "position");
CREATE UNIQUE INDEX "Assignment_generatedItemId_key" ON "Assignment"("generatedItemId");
CREATE INDEX "Assignment_personId_idx" ON "Assignment"("personId");
CREATE INDEX "Assignment_deletedAt_idx" ON "Assignment"("deletedAt");
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RawReceipt" ADD CONSTRAINT "RawReceipt_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedItem" ADD CONSTRAINT "GeneratedItem_billItemId_fkey" FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_generatedItemId_fkey" FOREIGN KEY ("generatedItemId") REFERENCES "GeneratedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
