-- 023 — Bortfall: ett tangenttryck som spärrar bolaget permanent
--
-- ## Bakgrund
--
-- `DoNotCall` fanns i schemat sedan starten och lästes av däckets WHERE-sats,
-- men **ingen kod skrev någonsin till den**: 0 rader i produktionen. Spärren
-- fanns alltså som filter men inte som åtgärd. Det enda sättet att ta ett
-- bolag ur rotationen var att pensionera raden (`Lead.retired`), och det
-- skyddet dör vid nästa omimport — bolaget kommer tillbaka som en ny rad med
-- ett nytt id och utan minne av att någon bett oss sluta ringa.
--
-- Två vägar skriver nu spärren, båda via `blockLead` i actions/dialer.ts:
--
--   * `CallResult.BORTFALL` — ny knapp, tangent 6 i resultatsteget.
--   * "Inget telefonnummer" — skriver spärren FÖRE raderingen.
--
-- ## Vad migrationen gör — och inte gör
--
-- `BORTFALL` i `CallResult` kräver **ingen SQL**. Prisma lagrar enums i SQLite
-- som ren TEXT utan CHECK-villkor (verifierat mot `sqlite_master`), så ett nytt
-- värde är enbart en schemaändring. Skulle ett CHECK-villkor läggas till i
-- framtiden måste det värdet med.
--
-- Kvar blir en sak: `phoneE164` måste bli nullbar.
--
-- ## Varför phoneE164 blir nullbar
--
-- "Inget telefonnummer" spärrar per definition ett bolag som inte har något
-- nummer att nyckla på. Med NOT NULL gick den raden inte att skriva, och just
-- det fallet är det som mest behöver överleva en omimport: bolaget raderas, och
-- utan spärren gör nästa säljare om exakt samma resultatlösa uppslagning.
--
-- Det unika indexet är kvar. SQLite räknar NULL som skilda värden i ett unikt
-- index, så flera nummerlösa spärrar kan samexistera — vilket är precis vad som
-- behövs.
--
-- SQLite kan inte släppa NOT NULL med ALTER, så tabellen byggs om. Tabellen har
-- **0 rader** i produktionen, så kopieringen är formalia — men den står här
-- ändå, eftersom filen ska kunna köras mot en databas som hunnit få rader.
--
-- Ordningen är den SQLite föreskriver: skapa ny, kopiera, släpp gammal, byt
-- namn, återskapa index. Indexen följer inte med ett namnbyte och måste
-- återskapas — utan dem tappar spärrfiltret sitt org-nummerindex, och det
-- läses numera på varje leasad rad.

-- Ingen `PRAGMA foreign_keys`: **ingen tabell refererar `DoNotCall`**
-- (kontrollerat mot `sqlite_master`), så det finns inga främmande nycklar att
-- skydda under ombyggnaden. Ett PRAGMA som inte biter — det gör det inte inuti
-- en transaktion — hade bara varit en rad till som kan fela i en fil SQLite
-- ändå inte rullar tillbaka.

CREATE TABLE "DoNotCall_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phoneE164" TEXT,
    "leadId" TEXT,
    "orgNumber" TEXT,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "addedById" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoNotCall_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DoNotCall_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "DoNotCall_new" ("id", "phoneE164", "leadId", "orgNumber", "source", "reason", "addedById", "expiresAt", "createdAt")
SELECT "id", "phoneE164", "leadId", "orgNumber", "source", "reason", "addedById", "expiresAt", "createdAt"
FROM "DoNotCall";

DROP TABLE "DoNotCall";

ALTER TABLE "DoNotCall_new" RENAME TO "DoNotCall";

CREATE UNIQUE INDEX "DoNotCall_phoneE164_key" ON "DoNotCall"("phoneE164");
CREATE UNIQUE INDEX "DoNotCall_leadId_key" ON "DoNotCall"("leadId");
CREATE INDEX "DoNotCall_orgNumber_idx" ON "DoNotCall"("orgNumber");
CREATE INDEX "DoNotCall_expiresAt_idx" ON "DoNotCall"("expiresAt");
