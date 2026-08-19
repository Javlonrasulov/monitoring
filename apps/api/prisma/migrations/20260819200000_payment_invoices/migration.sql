-- CreateEnum
CREATE TYPE "PaymentInvoiceStatus" AS ENUM ('WAITING', 'CONFIRMING', 'FINISHED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "PaymentInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "PaymentInvoiceStatus" NOT NULL DEFAULT 'WAITING',
    "priceUsd" INTEGER NOT NULL,
    "nowPaymentId" TEXT NOT NULL,
    "payAddress" TEXT NOT NULL,
    "payAmount" TEXT NOT NULL,
    "payCurrency" TEXT NOT NULL,
    "network" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "lastProviderStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInvoice_nowPaymentId_key" ON "PaymentInvoice"("nowPaymentId");

-- CreateIndex
CREATE INDEX "PaymentInvoice_organizationId_status_idx" ON "PaymentInvoice"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PaymentInvoice_expiresAt_idx" ON "PaymentInvoice"("expiresAt");

-- AddForeignKey
ALTER TABLE "PaymentInvoice" ADD CONSTRAINT "PaymentInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
