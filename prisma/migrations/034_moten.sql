-- 034 — möten: utfallet "Möte bokat" och tabellen "Meeting"
--
-- Möten togs bort i 007, när verksamheten var one call close. I november 2026
-- började golvet boka möten igen och skrev dem som fritext i återkomstens
-- anteckning ("FYSISKT MÖTE", "TEAMS IMORGON", "Möte 10:15, inbjudan
-- skickad"). Ett sådant möte syntes inte i statistiken, hade inget utfall och
-- bolaget låg kvar som en vanlig återkomst. Se `Meeting` i schema.prisma.
--
-- Bara tillägg. Inga befintliga rader rörs, ingen kolumn byter typ, och kod
-- som inte känner till tabellen märker ingenting — migrationen kan alltså
-- köras FÖRE deployen, vilket är ordningen som krävs: den nya koden skriver
-- `MEETING_BOOKED`, och ett enumvärde databasen inte känner till fäller hela
-- samtalets transaktion.
--
-- `ALTER TYPE … ADD VALUE` går i en transaktion sedan Postgres 12, men värdet
-- får inte ANVÄNDAS i samma transaktion som lägger till det. Filen använder
-- det inte. `IF NOT EXISTS` gör att en omkörning efter ett avbrott mellan
-- ALTER och ledgerraden inte fallerar — även om runnern lägger båda i samma
-- transaktion, så att det läget inte ska kunna uppstå.

ALTER TYPE "ConversationOutcome" ADD VALUE IF NOT EXISTS 'MEETING_BOOKED';

CREATE TYPE "MeetingKind" AS ENUM ('DIGITALT', 'FYSISKT', 'TELEFON');
CREATE TYPE "MeetingStatus" AS ENUM ('BOOKED', 'HELD', 'NO_SHOW', 'CANCELLED');
CREATE TYPE "MeetingOutcome" AS ENUM ('SALD', 'NEJ', 'UPPFOLJNING');

CREATE TABLE "Meeting" (
  "id"                TEXT NOT NULL,
  "scheduledAt"       TIMESTAMP(3) NOT NULL,
  "durationMin"       INTEGER NOT NULL DEFAULT 30,
  "kind"              "MeetingKind" NOT NULL DEFAULT 'DIGITALT',
  "location"          TEXT,
  "note"              TEXT,
  "contactName"       TEXT,
  "contactEmail"      TEXT,
  "contactPhone"      TEXT,
  "status"            "MeetingStatus" NOT NULL DEFAULT 'BOOKED',
  "outcome"           "MeetingOutcome",
  "noReason"          "NoReason",
  "outcomeNote"       TEXT,
  "rescheduleCount"   INTEGER NOT NULL DEFAULT 0,
  "leadId"            TEXT NOT NULL,
  "contactId"         TEXT,
  "bookedById"        TEXT NOT NULL,
  "holderId"          TEXT NOT NULL,
  "dealId"            TEXT,
  "bookedOnAttemptId" TEXT,
  "resolvedAt"        TIMESTAMP(3),
  "resolvedById"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id"),

  -- Ett möte på noll minuter eller tre dygn är ett skrivfel, inte ett möte.
  CONSTRAINT "Meeting_durationMin_check" CHECK ("durationMin" BETWEEN 5 AND 480),
  -- Utfallet finns bara på ett möte som blev av. Ett "uteblev" med utfallet
  -- "såld" vore en rad som säger två saker.
  CONSTRAINT "Meeting_outcome_held_check" CHECK ("outcome" IS NULL OR "status" = 'HELD'),
  -- Ett nej utan anledning går inte att räkna på. IS DISTINCT FROM och inte <>:
  -- `NULL <> 'NEJ'` är NULL, och ett CHECK som ger NULL avvisar ingenting —
  -- här ska det släppa igenom, men det ska vara ett beslut och inte en slump.
  CONSTRAINT "Meeting_nej_reason_check" CHECK ("outcome" IS DISTINCT FROM 'NEJ' OR "noReason" IS NOT NULL),
  -- Ett öppet möte har inget avgörande, och ett avgjort har en tidpunkt.
  CONSTRAINT "Meeting_resolved_check" CHECK (
    ("status" = 'BOOKED' AND "resolvedAt" IS NULL AND "outcome" IS NULL)
    OR ("status" <> 'BOOKED' AND "resolvedAt" IS NOT NULL)
  )
);

CREATE INDEX "Meeting_holderId_status_scheduledAt_idx" ON "Meeting" ("holderId", "status", "scheduledAt");
CREATE INDEX "Meeting_bookedById_createdAt_idx" ON "Meeting" ("bookedById", "createdAt");
CREATE INDEX "Meeting_status_scheduledAt_idx" ON "Meeting" ("status", "scheduledAt");
CREATE INDEX "Meeting_leadId_status_idx" ON "Meeting" ("leadId", "status");

-- Samma kaskader som `Callback`: bolaget tar med sig sina möten, en borttagen
-- kontakt nollas (namnet är redan kopierat), och en användare med möten går
-- inte att radera förrän `deleteUser` flyttat dem — RESTRICT är skyddet mot att
-- en glömd rad i den funktionen tyst tar möten med sig.
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_bookedById_fkey"
  FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_holderId_fkey"
  FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
