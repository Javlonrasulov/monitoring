-- AlterTable
ALTER TABLE "PaymentInvoice" ADD COLUMN IF NOT EXISTS "nowInvoiceId" TEXT;
ALTER TABLE "PaymentInvoice" ADD COLUMN IF NOT EXISTS "checkoutUrl" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentInvoice_nowInvoiceId_key" ON "PaymentInvoice"("nowInvoiceId");
