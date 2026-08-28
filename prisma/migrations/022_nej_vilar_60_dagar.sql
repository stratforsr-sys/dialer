-- 022 — Ett nej vilar 60 dagar, inte 20 timmar
--
-- ## Vad som var fel
--
-- `computeNext` hade en egen gren för exakt ett nej: "vill inte prata med
-- säljare". Alla andra sju anledningar föll igenom till normalfallet, där
-- vilan räknas ur `result`. Resultatet på ett nej är CONNECTED_DM, som saknar
-- gren i `retryHours()` och landar i `default:` — `retryHoursNoAnswer`, satt
-- till 20 timmar i produktionen.
--
-- Ett nej vilade alltså exakt lika länge som ett samtal där ingen svarade.
-- Kunden tackade nej på tisdagen och låg tillbaka i hela golvets däck på
-- onsdagen, utan lås och utan markering — och nästa säljare ringde.
--
-- ## Mätt i produktionsdatan innan ändringen (2026-08-28)
--
--   1 077  registrerade nej totalt
--     636  bolag vars SENASTE samtal var ett nej och som låg RINGBARA just då
--     271  till som vilade och var på väg tillbaka
--      66  samtal ringda av en ANNAN säljare efter ett nej — 51 inom ett dygn
--      20h kortaste uppmätta vila efter ett nej (= retryHoursNoAnswer, exakt)
--     740h uppmätt vila för "vill ej prata säljare" (= den gren som fungerade)
--
-- Fördelningen av de 636 visar var hålet satt: INGET_BEHOV 545, TIMING 27,
-- HAR_BYRA 23, NOJD_MED_ANNAN 20, NEJ_INNAN_PITCH 10, HAR_INHOUSE 9, PRIS 1 —
-- och noll VILL_EJ_PRATA_SALJARE, eftersom det var det enda som redan vilade.
--
-- ## Vad migrationen gör
--
--   1. `DialerConfig.retryDaysNo` — vilan i dagar efter ett nej, 60 som
--      standard. I konfigurationen och inte i koden, av samma skäl som taket:
--      siffran ska gå att ändra utan en deploy.
--   2. `Lead.lastOutcome` / `Lead.lastNoReason` — speglar senaste samtalets
--      utfall dit `lastResult` redan speglade resultatet. Utan dem kan varken
--      avbokningsvägen räkna om nej-vilan eller cockpiten varna för ett nej
--      utan att gå till CallAttempt-historiken.
--   3. Backfill av de två kolumnerna ur senaste CallAttempt-raden.
--   4. Läkning: varje bolag vars senaste samtal var ett nej får
--      `nextActionAt` omräknat till samtalet + 60 dagar.

-- ── 1. Vilan i konfigurationen ────────────────────────────────────────────
ALTER TABLE "DialerConfig" ADD COLUMN "retryDaysNo" INTEGER NOT NULL DEFAULT 60;

-- ── 2. Senaste utfallet på leadet ─────────────────────────────────────────
ALTER TABLE "Lead" ADD COLUMN "lastOutcome" TEXT;
ALTER TABLE "Lead" ADD COLUMN "lastNoReason" TEXT;

-- ── 3. Backfill ur historiken ─────────────────────────────────────────────
--
-- Senaste samtalet per lead, avgjort på startedAt. `id` som andra sortering
-- gör valet deterministiskt när två rader delar tidsstämpel — det finns rader
-- från samma sekund i datan.
UPDATE "Lead" SET
  "lastOutcome" = (
    SELECT ca."outcome" FROM "CallAttempt" ca
    WHERE ca."leadId" = "Lead"."id"
    ORDER BY ca."startedAt" DESC, ca."id" DESC LIMIT 1
  ),
  "lastNoReason" = (
    SELECT ca."noReason" FROM "CallAttempt" ca
    WHERE ca."leadId" = "Lead"."id"
    ORDER BY ca."startedAt" DESC, ca."id" DESC LIMIT 1
  )
WHERE EXISTS (SELECT 1 FROM "CallAttempt" ca WHERE ca."leadId" = "Lead"."id");

-- ── 4. Läkning av bolagen som redan ligger fel ────────────────────────────
--
-- Vilan räknas från SAMTALET, inte från migrationen. Ett nej från den 13:e
-- ska vara ringbart den 12 oktober — inte 60 dagar från idag, vilket hade
-- straffat bolaget för att buggen fanns.
--
-- Bara framåt: `MAX`-villkoret gör att ett bolag som redan ligger längre bort
-- (en bokad återkomst, en längre vila från taket) aldrig dras NÄRMARE av den
-- här raden. Spärrade bolag och kunder rörs inte alls — de ska inte tillbaka
-- i rotationen överhuvudtaget, och att skriva en framtida tid på dem hade
-- sett ut som ett löfte om att de kommer.
--
-- Formatet är `YYYY-MM-DDTHH:MM:SS.000+00:00`, samma som migration 020 skrev
-- och samma som alla 2 894 befintliga rader bär. Det spelar roll: jämförelsen
-- i MAX nedan och i däckets WHERE-sats är TEXTBASERAD, så en rad i ett annat
-- format hade sorterat fel mot resten av tabellen. (`turso db shell` VISAR
-- kolumnen som "2026-08-10 09:15:00" — det är shellens formatering, inte det
-- som ligger i databasen. Kontrollera med `substr`, inte med ögat.)
--
-- Klockslaget ärvs från samtalet, som i 020. `alignToSlot` flyttar ändå in
-- tiden i ett ringpass nästa gång leadet rörs, och passet är en mjuk
-- preferens i ORDER BY — inte ett filter.
UPDATE "Lead" SET "nextActionAt" = MAX(
  COALESCE("nextActionAt", ''),
  strftime('%Y-%m-%dT%H:%M:%S.000+00:00', datetime(
    "lastAttemptAt",
    '+' || (SELECT c."retryDaysNo" FROM "DialerConfig" c WHERE c."id" = 'singleton')
        || ' days'
  ))
)
WHERE "lastOutcome" = 'DM_NO'
  AND "lastAttemptAt" IS NOT NULL
  AND "retired" = 0
  AND "hasActiveDeal" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "Callback" cb
    WHERE cb."leadId" = "Lead"."id" AND cb."status" = 'PENDING'
  );
