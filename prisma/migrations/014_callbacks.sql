-- 014_callbacks
--
-- Återkomster som egna rader, plus en påminnelse som faktiskt når säljaren.
--
-- Före den här migrationen var en lovad återuppringning en enda kolumn:
-- `Lead.callbackAt`. Den bar tiden, men ingenting annat. Den visste inte vem
-- som lovat (leadets ägare byts vid varje disposition), inte om löftet hölls,
-- inte vad som skulle sägas, och den skrevs över utan spår så fort nästa
-- återkomst bokades. Enda vägen tillbaka till leadet var att säljaren råkade
-- öppna cockpiten i rätt ringlista efter att tiden passerat.
--
-- `Lead.callbackAt` finns kvar och skrivs fortfarande — lease-frågan sorterar
-- på den och uppföljningsmotorn läser den. Den är nu ett denormaliserat eko av
-- den öppna raden i den här tabellen, inte sanningen.
--
-- Missad är inget lagrat status: det är PENDING med en tid som passerat.
-- Ett lagrat värde hade krävt ett jobb som vänder rader vid rätt minut, och
-- den minuten blir fel varje gång jobbet inte körs.

CREATE TABLE IF NOT EXISTS "Callback" (
  "id"                   TEXT PRIMARY KEY NOT NULL,
  "scheduledAt"          DATETIME NOT NULL,
  "note"                 TEXT,
  "emailReminder"        BOOLEAN NOT NULL DEFAULT 0,
  "status"               TEXT NOT NULL DEFAULT 'PENDING',
  "emailSentAt"          DATETIME,
  "seenAt"               DATETIME,
  "completedAt"          DATETIME,
  "cancelledAt"          DATETIME,
  "leadId"               TEXT NOT NULL,
  "contactId"            TEXT,
  "sellerId"             TEXT NOT NULL,
  "bookedOnAttemptId"    TEXT,
  "completedOnAttemptId" TEXT,
  "createdAt"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Callback_leadId_fkey"    FOREIGN KEY ("leadId")    REFERENCES "Lead" ("id")    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Callback_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Callback_sellerId_fkey"  FOREIGN KEY ("sellerId")  REFERENCES "User" ("id")    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Klockan i sidebaren frågar "mina öppna, i tidsordning" var sextionde sekund.
CREATE INDEX IF NOT EXISTS "Callback_sellerId_status_scheduledAt_idx"
  ON "Callback" ("sellerId", "status", "scheduledAt");

-- Morgonjobbet och chefsvyn frågar över hela golvet.
CREATE INDEX IF NOT EXISTS "Callback_status_scheduledAt_idx"
  ON "Callback" ("status", "scheduledAt");

CREATE INDEX IF NOT EXISTS "Callback_leadId_status_idx"
  ON "Callback" ("leadId", "status");

-- ── Backfill ──────────────────────────────────────────────────────────────
--
-- Varje lead som just nu bär en obesvarad återkomst får en rad. Ägaren är den
-- bästa gissningen på vem som lovade: claim-låset sätts av samma skrivning som
-- satte callbackAt, så för allt som inte hunnit byta hand är det rätt person.
--
-- id byggs av randomblob i stället för cuid — kolumnen är TEXT och unikheten
-- är det enda som krävs. `emailReminder` sätts till 0 för de gamla: ingen ska
-- vakna till ett mejl om ett löfte de gav innan funktionen fanns.

INSERT INTO "Callback" (
  "id", "scheduledAt", "note", "emailReminder", "status",
  "leadId", "sellerId", "createdAt", "updatedAt"
)
SELECT
  lower(hex(randomblob(16))),
  l."callbackAt",
  NULL,
  0,
  'PENDING',
  l."id",
  l."ownerId",
  COALESCE(l."lastAttemptAt", CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
FROM "Lead" l
WHERE l."callbackAt" IS NOT NULL
  AND l."retired" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "Callback" c WHERE c."leadId" = l."id" AND c."status" = 'PENDING'
  );
