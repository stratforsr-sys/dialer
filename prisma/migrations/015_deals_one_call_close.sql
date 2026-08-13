-- 015_deals_one_call_close
--
-- Pipelinen bort. En affär är ett avslut, inte en prognos.
--
-- Verksamheten är one call close — det står redan i CLAUDE.md, och möten togs
-- bort i migration 007. Ändå bar `Deal` kvar hela prognosmaskineriet: ett
-- obligatoriskt `stageId` mot en tabell vars steg hette "Möte bokat", "Demo"
-- och "Offert", ett sannolikhetsreglage och ett förväntat avslutsdatum. Tre av
-- de fem fälten i registreringsrutan frågade om saker som aldrig händer här.
--
-- Vad som händer:
--   * `PipelineStage` försvinner helt.
--   * `Deal` tappar stageId, probability och expectedCloseAt.
--   * `oneTimeValue` + `arrValue` slås ihop till ETT `value`. Ett avtal är
--     aldrig både engångsbelopp och löpande — två kolumner där bara en får
--     vara ifylld är en bugg som väntar på att skrivas.
--   * `valueType` 'ARR' blir 'MONTHLY'. Säljaren säger "2 900 i månaden",
--     inte "34 800 i ARR", och fältet ska fråga om det man faktiskt sa.
--   * Nya kolumner: contactName, contactEmail, contactPhone, closedAt.
--
-- ── Om statusarna ─────────────────────────────────────────────────────────
--
-- `DealStatus` går från OPEN/WON/LOST till WON/LOST, och befintliga OPEN-rader
-- skrivs om till WON. Det är ett tolkningsbeslut och det ska stå här:
-- registreringsrutan var den enda vägen att bokföra ett sälj i systemet, och
-- den satte alltid OPEN. En OPEN-rad betyder därför i praktiken "någon sålde
-- och tryckte på knappen", inte "affär under förhandling". Att i stället kasta
-- dem hade raderat säljhistorik.
--
-- Rader som redan är WON eller LOST rörs inte.
--
-- ── Om metoden ────────────────────────────────────────────────────────────
--
-- Tabellombyggnad och inte ALTER TABLE DROP COLUMN: `stageId` sitter i en
-- FOREIGN KEY-klausul, och SQLite vägrar släppa en kolumn som en constraint i
-- tabelldefinitionen pekar på. Samma mönster som migration 002.
--
-- foreign_keys=OFF krävs för att DROP TABLE "Deal" inte ska kaskadradera
-- DealProduct. Pragmat är verkningslöst inuti en transaktion — apply-sql.mjs
-- kör med executeMultiple(), som inte lindar in filen i någon.

PRAGMA foreign_keys=OFF;

CREATE TABLE "Deal_new" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "title"        TEXT NOT NULL,
    "contactName"  TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "valueType"    TEXT NOT NULL DEFAULT 'ONE_TIME',
    "value"        REAL,
    "notes"        TEXT,
    "status"       TEXT NOT NULL DEFAULT 'WON',
    "closedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadId"       TEXT NOT NULL,
    "createdById"  TEXT NOT NULL,
    CONSTRAINT "Deal_leadId_fkey"      FOREIGN KEY ("leadId")      REFERENCES "Lead" ("id") ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Kontaktuppgifterna fanns aldrig på affären förut. De hämtas från leadets
-- första kontakt — samma person säljaren hade i luren i de allra flesta fall.
-- Blir det fel går det att rätta i affärsvyn; att lämna dem tomma hade gjort
-- varje gammal affär oanvändbar för den som ska ta över kunden.
INSERT INTO "Deal_new" (
    "id","title","contactName","contactEmail","contactPhone",
    "valueType","value","notes","status","closedAt","createdAt","updatedAt",
    "leadId","createdById"
)
SELECT
    d."id",
    d."title",
    (SELECT c."name"   FROM "Contact" c WHERE c."leadId" = d."leadId" ORDER BY c."createdAt" ASC LIMIT 1),
    (SELECT c."email"  FROM "Contact" c WHERE c."leadId" = d."leadId" ORDER BY c."createdAt" ASC LIMIT 1),
    (SELECT COALESCE(c."directPhoneE164", c."directPhone")
       FROM "Contact" c WHERE c."leadId" = d."leadId" ORDER BY c."createdAt" ASC LIMIT 1),
    CASE d."valueType" WHEN 'ARR' THEN 'MONTHLY' ELSE 'ONE_TIME' END,
    COALESCE(d."oneTimeValue", d."arrValue"),
    d."notes",
    CASE d."status" WHEN 'OPEN' THEN 'WON' ELSE d."status" END,
    -- Bästa tillgängliga säljdatum. `expectedCloseAt` var ett löfte om
    -- framtiden och duger inte som avslutsdatum; skapelsedagen är den enda
    -- tidpunkt vi vet att någon faktiskt tryckte på knappen.
    d."createdAt",
    d."createdAt",
    d."updatedAt",
    d."leadId",
    d."createdById"
FROM "Deal" d;

DROP TABLE "Deal";
ALTER TABLE "Deal_new" RENAME TO "Deal";

CREATE INDEX IF NOT EXISTS "Deal_leadId_idx"        ON "Deal"("leadId");
-- Affärsvyn frågar "alla vunna, senast först" och statistiken "vunna i
-- perioden". Samma index bär båda.
CREATE INDEX IF NOT EXISTS "Deal_status_closedAt_idx" ON "Deal"("status", "closedAt");
CREATE INDEX IF NOT EXISTS "Deal_createdById_idx"   ON "Deal"("createdById");

DROP TABLE IF EXISTS "PipelineStage";

-- `Lead.hasActiveDeal` behåller sin betydelse: bolaget är sålt och ska inte
-- ringas igen. Kolumnen är fortfarande villkoret som håller kunder utanför
-- lease-frågan i dialer.ts. Rader som pekar på en affär som blev LOST
-- (ångrad) släpps tillbaka i rotationen.
UPDATE "Lead" SET "hasActiveDeal" = 1
WHERE "id" IN (SELECT DISTINCT "leadId" FROM "Deal" WHERE "status" = 'WON');

UPDATE "Lead" SET "hasActiveDeal" = 0
WHERE "hasActiveDeal" = 1
  AND "id" NOT IN (SELECT DISTINCT "leadId" FROM "Deal" WHERE "status" = 'WON');

PRAGMA foreign_keys=ON;
