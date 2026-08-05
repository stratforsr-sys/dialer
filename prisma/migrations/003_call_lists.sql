-- ============================================================================
-- 003: Ringlistor som mappar + claim-lås på leads
--
-- - CallList  : en mapp med leads (skapas normalt av en import)
-- - LeadOnList: many-to-many — samma lead kan ligga i flera mappar
-- - ListAccess: vilka säljare som har tillgång till en mapp (admin ser allt)
-- - Lead.claimedAt: när leadet låstes av Lead.ownerId. NULL = fritt.
--                   Låset löper ut efter CLAIM_TTL_DAYS (60) och leadet blir fritt igen.
--
-- Idempotent: kan köras om utan att förstöra data.
-- ============================================================================

ALTER TABLE "Lead" ADD COLUMN "claimedAt" DATETIME;

CREATE INDEX IF NOT EXISTS "Lead_claimedAt_idx" ON "Lead"("claimedAt");

CREATE TABLE IF NOT EXISTS "CallList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceFile" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "CallList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CallList_archived_createdAt_idx" ON "CallList"("archived", "createdAt");

CREATE TABLE IF NOT EXISTS "LeadOnList" (
    "listId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("listId", "leadId"),
    CONSTRAINT "LeadOnList_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CallList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadOnList_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeadOnList_leadId_idx" ON "LeadOnList"("leadId");

CREATE TABLE IF NOT EXISTS "ListAccess" (
    "listId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("listId", "userId"),
    CONSTRAINT "ListAccess_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CallList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ListAccess_userId_idx" ON "ListAccess"("userId");

-- ── Backfill 1: systemmappen "Tidigare importer" ────────────────────────────
-- Skapas av äldsta admin (faller tillbaka på äldsta användaren om ingen admin finns).

INSERT OR IGNORE INTO "CallList" ("id", "name", "description", "isSystem", "archived", "createdAt", "updatedAt", "createdById")
SELECT
    'legacy-import-folder',
    'Tidigare importer',
    'Alla leads som importerades innan mappar fanns.',
    true,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    (SELECT "id" FROM "User" ORDER BY ("role" = 'ADMIN') DESC, "createdAt" ASC LIMIT 1)
WHERE EXISTS (SELECT 1 FROM "User");

-- Alla befintliga leads in i mappen

INSERT OR IGNORE INTO "LeadOnList" ("listId", "leadId", "addedAt")
SELECT 'legacy-import-folder', "id", "createdAt" FROM "Lead";

-- Alla nuvarande användare får tillgång till mappen

INSERT OR IGNORE INTO "ListAccess" ("listId", "userId", "grantedAt")
SELECT 'legacy-import-folder', "id", CURRENT_TIMESTAMP FROM "User";

-- ── Backfill 2: claim-lås på leads som redan bearbetats ─────────────────────
-- Ett lead som någon faktiskt har ringt/antecknat på räknas som claimat vid den
-- tidpunkten — och blir därmed automatiskt fritt igen 60 dagar efter senaste
-- aktiviteten. Aldrig kontaktade leads lämnas fria (claimedAt = NULL).

UPDATE "Lead"
SET "claimedAt" = (
    SELECT MAX(a."timestamp") FROM "Activity" a
    WHERE a."leadId" = "Lead"."id"
      AND a."type" IN ('CALL', 'CALL_NO_ANSWER', 'NOTE', 'MEETING_BOOKED', 'DEAL_CREATED', 'STATUS_CHANGE')
)
WHERE "claimedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Activity" a
    WHERE a."leadId" = "Lead"."id"
      AND a."type" IN ('CALL', 'CALL_NO_ANSWER', 'NOTE', 'MEETING_BOOKED', 'DEAL_CREATED', 'STATUS_CHANGE')
  );

-- Leads med öppen affär hålls alltid låsta hos sin ägare

UPDATE "Lead" SET "claimedAt" = CURRENT_TIMESTAMP WHERE "hasActiveDeal" = true;
