PRAGMA foreign_keys=OFF;

CREATE TABLE "Lead_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "orgNumber" TEXT,
    "website" TEXT,
    "address" TEXT,
    "hasActiveDeal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "Lead_new" ("id","companyName","orgNumber","website","address","hasActiveDeal","createdAt","updatedAt","ownerId")
SELECT "id","companyName","orgNumber","website","address",false,"createdAt","updatedAt","ownerId" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "Lead_new" RENAME TO "Lead";
CREATE UNIQUE INDEX "Lead_orgNumber_key" ON "Lead"("orgNumber");

CREATE TABLE "Deal_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "oneTimeValue" REAL,
    "arrValue" REAL,
    "probability" INTEGER NOT NULL DEFAULT 20,
    "expectedCloseAt" DATETIME,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Deal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "Deal_new" ("id","title","valueType","oneTimeValue","arrValue","probability","notes","status","createdAt","updatedAt","stageId","leadId","createdById")
SELECT
    "id", "title", 'ONE_TIME', "value", NULL, 20, "notes", "status", "createdAt", "createdAt",
    COALESCE((SELECT "id" FROM "PipelineStage" ORDER BY "order" ASC LIMIT 1), ''),
    "leadId", "createdById"
FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "Deal_new" RENAME TO "Deal";

CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePrice" REAL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "DealProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price" REAL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT,
    "dealId" TEXT NOT NULL,
    "productId" TEXT,
    CONSTRAINT "DealProduct_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DealProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

UPDATE "Lead" SET "hasActiveDeal" = true
WHERE "id" IN (SELECT DISTINCT "leadId" FROM "Deal" WHERE "status" = 'OPEN');

PRAGMA foreign_keys=ON;
